import cv2
from detect import Detector


class HeadDetect:
    """Simple wrapper that runs the Detector on an image path and handles display/save.

    Example:
        hd = HeadDetect(confidence=0.85)
        hd.run_on_image('./assets/people.jpg')
    """
 
    def __init__(self, confidence: float = 0.8, device: str | None = None, use_amp: bool = False):
        self.detector = Detector(device=device, use_amp=use_amp)
        self.confidence = confidence

    def run_on_image(
        self,
        image_path: str,
        show: bool = True,
        save_path: str = r"./assets/head_detection_result.jpg",
        resize_long_edge: int | None = None,
        tta_hflip: bool = False,
        nms_iou: float = 0.5,
    ):
        image = cv2.imread(image_path)
        if image is None:
            raise FileNotFoundError(f"Image not found at {image_path}")

        # configure detector optional improvements
        self.detector.resize_long_edge = resize_long_edge
        self.detector.tta_hflip = tta_hflip
        self.detector.nms_iou = nms_iou

        result_image, inference_time, total_people = self.detector.detect(image, confidence_threshold=self.confidence)

        print(f"Inference Time: {inference_time:.3f} seconds")
        print(f"Total People Detected: {total_people}")

        max_width = 1000
        h, w = result_image.shape[:2]
        if w > max_width:
            scale = max_width / w
            result_image = cv2.resize(result_image, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)

        if show:
            cv2.imshow("Head Detection - Faster R-CNN", result_image)
            cv2.waitKey(0)
            cv2.destroyAllWindows()

        cv2.imwrite(save_path, result_image)
        print(f"Result saved at: {save_path}")

    def run_on_video(
        self,
        source,
        show: bool = True,
        save_path: str | None = None,
        resize_long_edge: int | None = None,
        tta_hflip: bool = False,
        nms_iou: float = 0.5,
        skip_frames: int = 0,
        duration_seconds: float | None = None,
        show_progress: bool = True,
    ):
        """Run head detection on a video file or camera index.

        Args:
            source: path to video file or camera index (int or str digits).
            show: whether to display frames during processing.
            save_path: optional path to save processed video.
        """
        # configure detector optional improvements
        self.detector.resize_long_edge = resize_long_edge
        self.detector.tta_hflip = tta_hflip
        self.detector.nms_iou = nms_iou

        summary = self.detector.process_video(
            source,
            output_path=save_path,
            confidence_threshold=self.confidence,
            show=show,
            skip_frames=skip_frames,
            duration_seconds=duration_seconds,
            show_progress=show_progress,
        )
        print(f"Processed {summary['frames']} frames at ~{summary['avg_fps']:.2f} FPS")
        if summary.get('processed_path'):
            print(f"Saved processed video to: {summary['processed_path']}")
        return summary


if __name__ == "__main__":
    hd = HeadDetect()
    # example: run on file
    # hd.run_on_image(r"./assets/people.jpg")
    hd.run_on_video(r"./assets/videoplayback.mp4")
    # hd.run_on_video(0) 

