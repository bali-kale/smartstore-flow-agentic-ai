import time
import cv2
import torch
from torchvision.transforms import functional as F
from torchvision.ops import nms as torchvision_nms

from torchvision.models.detection import (
    fasterrcnn_resnet50_fpn,
    FasterRCNN_ResNet50_FPN_Weights,
)


class Detector:
    """Faster R-CNN based detector for people / head-region highlighting.

    Usage:
        det = Detector()
        out_img, t, count = det.detect(image, confidence_threshold=0.8)
    """

    def __init__(self, device: str | None = None, weights=None, use_amp: bool = False):
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self.weights = weights or FasterRCNN_ResNet50_FPN_Weights.DEFAULT
        self.model = fasterrcnn_resnet50_fpn(weights=self.weights)
        self.model.to(self.device)
        self.model.eval()
        # mixed precision inference (uses torch.cuda.amp.autocast when True and GPU available)
        self.use_amp = use_amp

    def detect(
        self,
        image,
        confidence_threshold: float = 0.8,
        resize_long_edge: int | None = None,
        tta_hflip: bool = False,
        nms_iou: float = 0.5,
    ):
        """Run detection on a single BGR OpenCV image with optional improvements.

        Args:
            image: BGR numpy image
            confidence_threshold: score threshold for detections
            resize_long_edge: optional int to resize the longer image edge (keeps aspect ratio)
            tta_hflip: if True, run horizontal flip test-time augmentation and combine detections
            nms_iou: IoU threshold to use for NMS

        Returns: (output_image, inference_time, person_count)
        """
        orig_h, orig_w = image.shape[:2]
        proc_image = image
        scale_factor = 1.0
        if resize_long_edge and resize_long_edge > 0:
            long_edge = max(orig_w, orig_h)
            if long_edge != resize_long_edge:
                scale_factor = resize_long_edge / float(long_edge)
                new_w = int(orig_w * scale_factor)
                new_h = int(orig_h * scale_factor)
                proc_image = cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_LINEAR)

        def run_model(img):
            img_t = F.to_tensor(img).to(self.device).unsqueeze(0)
            start_time = time.time()
            with torch.no_grad():
                if self.use_amp and torch.cuda.is_available() and 'cuda' in str(self.device):
                    # use automatic mixed precision for GPU
                    with torch.cuda.amp.autocast():
                        out = self.model(img_t)[0]
                else:
                    out = self.model(img_t)[0]
            t = time.time() - start_time
            return {
                'boxes': out['boxes'].cpu(),
                'scores': out['scores'].cpu(),
                'labels': out['labels'].cpu(),
                'time': t,
            }

        boxes_list, scores_list, labels_list = [], [], []
        time_consumed = 0.0

        base = run_model(proc_image)
        boxes_list.append(base['boxes'])
        scores_list.append(base['scores'])
        labels_list.append(base['labels'])
        time_consumed += base['time']

        if tta_hflip:
            flipped = cv2.flip(proc_image, 1)
            f = run_model(flipped)
            fboxes = f['boxes']
            if fboxes.numel() > 0:
                W = proc_image.shape[1]
                x1 = W - fboxes[:, 2]
                x2 = W - fboxes[:, 0]
                fboxes[:, 0] = x1
                fboxes[:, 2] = x2
            boxes_list.append(fboxes)
            scores_list.append(f['scores'])
            labels_list.append(f['labels'])
            time_consumed += f['time']

        if len(boxes_list) > 1:
            boxes = torch.cat(boxes_list, dim=0)
            scores = torch.cat(scores_list, dim=0)
            labels = torch.cat(labels_list, dim=0)
        else:
            boxes = boxes_list[0]
            scores = scores_list[0]
            labels = labels_list[0]

        mask_person = labels == 1
        boxes = boxes[mask_person]
        scores = scores[mask_person]

        keep_inds = scores >= confidence_threshold
        boxes = boxes[keep_inds]
        scores = scores[keep_inds]

        if boxes.numel() == 0:
            return image.copy(), time_consumed, 0

        keep = torchvision_nms(boxes, scores, nms_iou)
        boxes = boxes[keep]
        scores = scores[keep]

        if scale_factor != 1.0:
            boxes = boxes / scale_factor

        output_image = image.copy()
        overlay = output_image.copy()
        detections = []
        for b, s in zip(boxes, scores):
            x1, y1, x2, y2 = map(int, b.tolist())
            head_height = int((y2 - y1) * 0.3)
            y2_head = y1 + head_height
            detections.append((x1, y1, x2, y2_head, float(s)))
            # filled translucent region will be applied by blending overlay later
            cv2.rectangle(overlay, (x1, y1), (x2, y2_head), (255, 255, 0), -1)

        # blend translucent fill (10% opacity)
        output_image = cv2.addWeighted(overlay, 0.10, output_image, 0.90, 0)

        # draw borders and proportional labels with background behind text
        for idx, (x1, y1, x2, y2_head, score) in enumerate(detections, start=1):
            rect_color = (255, 255, 0)
            border_thickness = 1
            cv2.rectangle(output_image, (x1, y1), (x2, y2_head), rect_color, border_thickness)

            # determine font scale relative to head region height, but shrink if label too wide
            region_h = max(8, y2_head - y1)
            font_scale = max(0.3, min(0.9, region_h / 60.0))
            font_thickness = 1  # thin font as requested
            font_face = cv2.FONT_HERSHEY_SIMPLEX

            label_text = f'Person {idx} ({score:.2f})'

            # box width available for label
            box_width = max(10, x2 - x1)

            # compute text size and reduce font_scale until it fits within box width (with padding)
            padding_x = max(4, int(6 * font_scale))
            padding_y = max(2, int(3 * font_scale))
            (text_w, text_h), _ = cv2.getTextSize(label_text, font_face, font_scale, font_thickness)
            min_scale = 0.2
            while text_w + padding_x * 2 > box_width and font_scale > min_scale:
                font_scale = font_scale * 0.9
                (text_w, text_h), _ = cv2.getTextSize(label_text, font_face, font_scale, font_thickness)

            # label background matches rectangle color
            label_bg = rect_color

            # place label above the box; if not enough space, place below
            label_x1 = x1
            label_x2 = x1 + text_w + padding_x * 2
            label_y2 = y1  # flush with the box (no gap)
            label_y1 = label_y2 - (text_h + padding_y * 2)
            if label_y1 < 0:
                # fallback: place below the head region
                label_y1 = y2_head
                label_y2 = label_y1 + (text_h + padding_y * 2)

            # clamp label_x2 to box right
            if label_x2 > x2:
                label_x2 = x2
                label_x1 = max(x1, label_x2 - (text_w + padding_x * 2))

            cv2.rectangle(output_image, (label_x1, label_y1), (label_x2, label_y2), label_bg, -1)
            text_org = (label_x1 + padding_x, label_y1 + text_h + padding_y - 1)
            # use black labels as requested
            cv2.putText(output_image, label_text, text_org, font_face, font_scale, (0, 0, 0), font_thickness, cv2.LINE_AA)

        person_count = len(detections)

        # Draw total people counter at top-left with responsive font size and background
        total_text = f"Total People: {person_count}"
        total_font_scale = max(0.8, min(2.0, output_image.shape[1] / 1000.0))
        total_thickness = max(1, int(round(total_font_scale * 2)))
        (t_w, t_h), _ = cv2.getTextSize(total_text, cv2.FONT_HERSHEY_DUPLEX, total_font_scale, total_thickness)
        box_x1, box_y1 = 10, 10
        box_x2, box_y2 = box_x1 + t_w + 20, box_y1 + t_h + 18
        # use the same yellow background for counter
        cv2.rectangle(output_image, (box_x1, box_y1), (box_x2, box_y2), (255, 255, 0), -1)
        # draw black text for counter
        cv2.putText(output_image, total_text, (box_x1 + 8, box_y1 + t_h + 4), cv2.FONT_HERSHEY_DUPLEX, total_font_scale, (0, 0, 0), total_thickness, cv2.LINE_AA)

        return output_image, time_consumed, person_count

        

    def process_video(
        self,
        source,
        output_path: str | None = None,
        confidence_threshold: float = 0.8,
        show: bool = False,
        max_width: int | None = 1000,
        skip_frames: int = 0,
        duration_seconds: float | None = None,
        show_progress: bool = True,
    ):
        """Process a video file or camera stream frame-by-frame.

        Args:
            source: path to video file or integer camera index (0, 1, ...).
            output_path: optional path to save processed video.
            confidence_threshold: detection score threshold.
            show: whether to display frames live.
            max_width: if set, resize display frames to this width for viewing.
            duration_seconds: if set, process only the first N seconds of video.
            show_progress: if True, print periodic progress updates to console.

        Returns:
            dict with summary: {'frames': int, 'avg_fps': float, 'processed_path': str|None}
        """
        # allow passing integer-like sources
        cap_source = int(source) if isinstance(source, str) and source.isdigit() else source
        cap = cv2.VideoCapture(cap_source)
        if not cap.isOpened():
            raise RuntimeError(f"Unable to open video source: {source}")

        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

        # determine frame limit when duration is requested
        frames_limit = None
        try:
            if duration_seconds is not None and duration_seconds > 0 and fps > 0:
                frames_limit = int(round(duration_seconds * fps))
        except Exception:
            frames_limit = None

        writer = None
        if output_path:
            # choose codec by extension
            ext = output_path.split('.')[-1].lower()
            fourcc = cv2.VideoWriter_fourcc(*('mp4v' if ext == 'mp4' else 'XVID'))
            writer = cv2.VideoWriter(output_path, fourcc, fps, (width, height))

        frame_count = 0
        processed_count = 0
        total_proc_time = 0.0
        last_out_frame = None
        start_wall = time.time()
        next_report = start_wall + 1.0
        progress_interval = 1.0

        try:
            while True:
                ret, frame = cap.read()
                if not ret:
                    break

                frame_count += 1

                # if duration limit by frames has been reached, stop
                if frames_limit is not None and frame_count > frames_limit:
                    break

                # decide whether to run detection on this frame (skip_frames support)
                do_process = True
                if skip_frames and skip_frames > 0:
                    # process every (skip_frames + 1)-th frame
                    do_process = (frame_count - 1) % (skip_frames + 1) == 0

                if do_process:
                    start = time.time()
                    out_frame, inf_time, person_count = self.detect(frame, confidence_threshold=confidence_threshold)
                    proc_time = time.time() - start
                    total_proc_time += proc_time
                    processed_count += 1
                    last_out_frame = out_frame
                else:
                    # reuse last processed frame for display/save if available, else use original
                    out_frame = last_out_frame if last_out_frame is not None else frame

                if writer:
                    # ensure we write the same size as original capture
                    writer.write(out_frame)

                if show:
                    disp = out_frame
                    if max_width and disp.shape[1] > max_width:
                        scale = max_width / disp.shape[1]
                        disp = cv2.resize(disp, (int(disp.shape[1] * scale), int(disp.shape[0] * scale)), interpolation=cv2.INTER_AREA)
                    cv2.imshow('Video - Head Detection', disp)
                    if cv2.waitKey(1) & 0xFF == ord('q'):
                        break

                # progress reporting (once per second)
                if show_progress and time.time() >= next_report:
                    elapsed = time.time() - start_wall
                    avg_proc_fps = processed_count / total_proc_time if total_proc_time > 0 else 0.0
                    if frames_limit:
                        pct = min(100.0, (frame_count / frames_limit) * 100.0)
                        print(f"Progress: {frame_count}/{frames_limit} frames ({pct:.1f}%) elapsed {elapsed:.1f}s processed {processed_count} model_fps {avg_proc_fps:.2f}")
                    elif duration_seconds:
                        pct = min(100.0, (elapsed / duration_seconds) * 100.0)
                        print(f"Progress: elapsed {elapsed:.1f}s / {duration_seconds:.1f}s ({pct:.1f}%) processed {processed_count} model_fps {avg_proc_fps:.2f}")
                    else:
                        print(f"Progress: read {frame_count} frames, processed {processed_count}, model_fps {avg_proc_fps:.2f}, elapsed {elapsed:.1f}s")
                    next_report = time.time() + progress_interval

                # wall-clock duration stop
                if duration_seconds is not None and (time.time() - start_wall) >= duration_seconds:
                    break

        finally:
            cap.release()
            if writer:
                writer.release()
            if show:
                cv2.destroyAllWindows()

        avg_fps = processed_count / total_proc_time if total_proc_time > 0 else 0.0
        return {'frames': frame_count, 'processed_frames': processed_count, 'avg_fps': avg_fps, 'processed_path': output_path}


# convenience wrapper

def detect_heads_frcnn(image, confidence_threshold: float = 0.8):
    det = Detector()
    return det.detect(image, confidence_threshold=confidence_threshold)