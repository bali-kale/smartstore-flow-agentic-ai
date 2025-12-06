// src/pages/DivisionPage.js
import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { useParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import './DivisionPage.css';

const DivisionPage = () => {
  const { division } = useParams();
  const [image, setImage] = useState(null);
  const [video, setVideo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [processedImage, setProcessedImage] = useState(null);
  const [liveCount, setLiveCount] = useState(0);
  const [detectionStarted, setDetectionStarted] = useState(false);
  const [detectionCompleted, setDetectionCompleted] = useState(false);
  const [avgPeople, setAvgPeople] = useState(0);
  const [threshold, setThreshold] = useState(10);
  const totalPeopleRef = useRef(0);

  const getCountColor = (count, threshold) => {
    const numericThreshold = Number(threshold) || 0;
    if (count >= numericThreshold) {
      return 'red';
    } else if (count >= numericThreshold / 2) {
      return 'yellow';
    } else {
      return 'green';
    }
  };
  const framesCountRef = useRef(0);
  const imageInputRef = useRef(null);
  const videoInputRef = useRef(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [sendIntervalMs, setSendIntervalMs] = useState(800); // ms between frames (adjustable)
  const [captureWidth, setCaptureWidth] = useState(480); // target width for frames sent to server
  const socketRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const processedCanvasRef = useRef(null);
  const streamIntervalRef = useRef(null);
  const inferenceTimesRef = useRef([]);
  const lastResponseAtRef = useRef(null);
  const lastSentAtRef = useRef(null);
  const sentFramesRef = useRef(0);
  const monitorRef = useRef(null);
  const IDLE_MS = 3000; // consider processing finished after 3s of no responses

  const clearIdleMonitor = () => {
    if (monitorRef.current) {
      clearInterval(monitorRef.current);
      monitorRef.current = null;
    }
  };

  const startIdleMonitor = () => {
    clearIdleMonitor();
    monitorRef.current = setInterval(() => {
      const now = Date.now();
      const lastResp = lastResponseAtRef.current || 0;
      // if we're not sending frames and the last response is older than IDLE_MS
      if (!streamIntervalRef.current && lastResp && (now - lastResp) > IDLE_MS) {
        clearIdleMonitor();
        setLoading(false);
        setDetectionCompleted(true);
      }
      // also if we haven't received any response for a while after last sent frame
      if (!streamIntervalRef.current && lastSentAtRef.current && (now - lastSentAtRef.current) > IDLE_MS && !lastResp) {
        clearIdleMonitor();
        setLoading(false);
        setDetectionCompleted(true);
      }

    }, 1000);
  };

  const handleFileChange = (e, type) => {
    const file = e.target.files[0];
    if (type === 'image') {
      setImage(file);
    } else {
      setVideo(file);
      // create a preview URL for the selected video so it can stay visible
      try {
        if (videoUrl) {
          try { URL.revokeObjectURL(videoUrl); } catch (_) { }
        }
      } catch (_) { }
      const url = file ? URL.createObjectURL(file) : null;
      setVideoUrl(url);
    }
  };

  const handleSubmit = async () => {
    if (!image && !video) {
      setError('Please upload either an image or a video');
      return;
    }

    // mark detection started and reset counters for a fresh session
    setDetectionStarted(true);
    totalPeopleRef.current = 0;
    framesCountRef.current = 0;
    setAvgPeople(0);

    setLoading(true);
    setError('');

    const formData = new FormData();
    // Server expects field name `file` for image uploads.
    if (image) {
      formData.append('file', image);
      formData.append('confidence', '0.8');
      try {
        const response = await axios.post('/upload-image', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        setProcessedImage(response.data.image);
        setResult({ totalPeople: response.data.count, inference_time: response.data.inference_time });
        // update avg counters with this image result
        totalPeopleRef.current += Number(response.data.count || 0);
        framesCountRef.current += 1;
        setAvgPeople((totalPeopleRef.current / framesCountRef.current) || 0);
        if (response.data.inference_time) inferenceTimesRef.current.push(Number(response.data.inference_time));
        // image detection is a single complete run
        setDetectionCompleted(true);
        setDetectionStarted(false);
      } catch (err) {
        setError('Failed to upload image. Please try again.');
      } finally {
        setLoading(false);
      }
      return;
    }

    // For video file, start streaming frames via Socket.IO
    if (video) {
      // mark detection started for video streaming
      setDetectionStarted(true);
      if (!socketRef.current) {
        socketRef.current = io();
        socketRef.current.on('processed_frame', (data) => {
          if (data && data.image) {
            // mark last response time so loader can wait until responses stop
            lastResponseAtRef.current = Date.now();
            // ensure loading stays true while responses come
            setLoading(true);
            // draw received image into processed canvas if available
            try {
              const img = new Image();
              img.onload = () => {
                const pc = processedCanvasRef.current;
                if (pc) {
                  const rect = pc.getBoundingClientRect();
                  const DPR = window.devicePixelRatio || 1;
                  pc.width = Math.round(rect.width * DPR);
                  pc.height = Math.round(rect.height * DPR);
                  pc.style.width = `${Math.round(rect.width)}px`;
                  pc.style.height = `${Math.round(rect.height)}px`;
                  const pctx = pc.getContext('2d');
                  pctx.setTransform(DPR, 0, 0, DPR, 0, 0);
                  pctx.clearRect(0, 0, rect.width, rect.height);
                  const ar = img.width / img.height;
                  let w = rect.width, h = Math.round(w / ar);
                  if (h > rect.height) { h = rect.height; w = Math.round(h * ar); }
                  const x = Math.round((rect.width - w) / 2);
                  const y = Math.round((rect.height - h) / 2);
                  pctx.drawImage(img, x, y, w, h);
                } else {
                  setProcessedImage(data.image);
                }
              };
              img.src = data.image;
            } catch (e) {
              setProcessedImage(data.image);
            }
            setLiveCount(data.count ?? 0);
            // update running average
            const c = Number(data.count ?? 0);
            totalPeopleRef.current += c;
            framesCountRef.current += 1;
            setAvgPeople(totalPeopleRef.current / framesCountRef.current);
            if (data.inference_time) inferenceTimesRef.current.push(Number(data.inference_time));
            console.log('[socket] received processed_frame, count=', data.count);
          }
        });
        socketRef.current.on('error', (d) => setError(d?.error || 'socket error'));
      }

      // create a hidden video element and canvas to capture frames
      const url = videoUrl || URL.createObjectURL(video);
      const v = document.createElement('video');
      v.src = url;
      v.muted = true;
      v.playbackRate = 1.0;
      v.crossOrigin = 'anonymous';

      v.onloadedmetadata = () => {
        const w = v.videoWidth || 640;
        const h = v.videoHeight || (w * 9) / 16;
        // Use configured capture width (do not exceed original width)
        const targetWidth = Math.min(captureWidth || 480, w);
        const canvas = document.createElement('canvas');
        canvas.width = targetWidth; // limit size for faster uploads
        canvas.height = Math.round((canvas.width * h) / w);
        const ctx = canvas.getContext('2d');

        // append hidden video to DOM to improve autoplay handling in some browsers
        v.playsInline = true;
        v.style.position = 'fixed';
        v.style.left = '-9999px';
        v.style.width = '1px';
        v.style.height = '1px';
        document.body.appendChild(v);

        // Try to play; if blocked by autoplay policy, signal user
        const tryPlay = v.play();
        Promise.resolve(tryPlay)
          .then(() => {
            // ensure the video has at least one frame available before drawing
            const startIntervalAndSendFirst = () => {
              try {
                // draw first frame
                ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
                const testDataUrl = canvas.toDataURL('image/jpeg', 0.8);
                // convert dataURL to blob and POST via fetch->then chain
                fetch(testDataUrl)
                  .then(res => res.blob())
                  .then(resBlob => {
                    const fd = new FormData();
                    fd.append('file', resBlob, 'frame.jpg');
                    fd.append('confidence', '0.8');
                    console.log('[debug] sending initial test frame to /upload-image');
                    axios.post('/upload-image', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
                      .then(r => { console.log('[debug] initial frame response', r.data); lastResponseAtRef.current = Date.now(); setLoading(true); sentFramesRef.current += 1; })
                      .catch(e => { console.warn('[debug] initial frame POST failed', e); });
                  })
                  .catch(e => { console.warn('[debug] initial frame fetch->blob failed', e); });

                // send frames at the configured rate to trade update speed vs server load
                streamIntervalRef.current = setInterval(() => {
                  try {
                    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
                    if (socketRef.current && socketRef.current.connected) {
                      lastSentAtRef.current = Date.now();
                      sentFramesRef.current += 1;
                      socketRef.current.emit('frame', { image: dataUrl, confidence: 0.8 });
                    }
                  } catch (err) {
                    // ignore drawing errors
                  }
                }, sendIntervalMs);
              } catch (err) {
                console.warn('[debug] startInterval error', err);
              }
            };

            if (v.readyState >= 2) {
              startIntervalAndSendFirst();
            } else {
              // wait for the video to be playing or canplay event
              const onReady = () => {
                startIntervalAndSendFirst();
                v.removeEventListener('playing', onReady);
                v.removeEventListener('canplay', onReady);
              };
              v.addEventListener('playing', onReady);
              v.addEventListener('canplay', onReady);
            }
          })
          .catch(() => {
            setError('Autoplay blocked by browser. Please click Play on the hidden video or allow autoplay.');
            setLoading(false);
          });
      };

      // cleanup when video ends
      // v.onended = () => {
      //   if (streamIntervalRef.current) {
      //     clearInterval(streamIntervalRef.current);
      //     streamIntervalRef.current = null;
      //   }
      //   // do NOT remove the video element here. Leave it in the DOM so user can view last frame.
      //   // Start idle monitor to wait for final responses from server, and mark detection stopped.
      //   setDetectionStarted(false);
      //   startIdleMonitor();
      // };
      v.onended = () => {
        if (streamIntervalRef.current) {
          clearInterval(streamIntervalRef.current);
          streamIntervalRef.current = null;
        }

        // video ended — stop sending
        setDetectionStarted(false);

        // FIX: mark immediately as completed
        setDetectionCompleted(true);
        setLoading(false);

        clearIdleMonitor();
      };


      // store refs so user can stop streaming later
      videoRef.current = v;
      canvasRef.current = null;
      // ensure loading remains true while processing; clear any previous monitor
      clearIdleMonitor();
      setLoading(true);
      return;
    }
  };

  // ensure streaming stops on unmount
  useEffect(() => {
    return () => {
      stopStreaming();
      clearIdleMonitor();
      // ensure full cleanup on unmount: remove preview URL and hidden video, disconnect socket
      try { if (videoRef.current) { try { videoRef.current.pause(); } catch (_) { }; try { if (videoRef.current.parentNode) videoRef.current.parentNode.removeChild(videoRef.current); } catch (_) { }; videoRef.current = null; } } catch (_) { }
      try { if (videoUrl) { URL.revokeObjectURL(videoUrl); } } catch (_) { }
      try { if (socketRef.current) { socketRef.current.disconnect(); socketRef.current = null; } } catch (_) { }
    };
  }, []);

  // when detection completes, ensure the loader is cleared and monitor stopped
  useEffect(() => {
    if (detectionCompleted) {
      setLoading(false);
      clearIdleMonitor();
    }
  }, [detectionCompleted]);

  const stopStreaming = () => {
    if (streamIntervalRef.current) {
      clearInterval(streamIntervalRef.current);
      streamIntervalRef.current = null;
    }
    if (videoRef.current) {
      try { videoRef.current.pause(); } catch (_) { }
      // do NOT remove the video element or revoke the object URL here; leave it so user can view last frame.
    }
    // keep socket connected so we can receive any final processed_frame responses from server
    // If there was any processed activity, start idle monitor and wait for final responses
    if (framesCountRef.current > 0) {
      setDetectionStarted(false);
      // don't immediately set detectionCompleted; wait for server to finish responding
      startIdleMonitor();
    } else {
      setDetectionStarted(false);
      totalPeopleRef.current = 0;
      framesCountRef.current = 0;
      inferenceTimesRef.current = [];
      setAvgPeople(0);
      setLiveCount(0);
      setProcessedImage(null);
      setResult(null);
      setDetectionCompleted(false);
      setLoading(false);
    }
  };

  const handleReset = () => {
    // fully clear detection/session state
    try { stopStreaming(); } catch (_) { }
    // remove video element, revoke URL and disconnect socket when doing a full reset
    try {
      if (videoRef.current) {
        try { videoRef.current.pause(); } catch (_) { }
        try { if (videoRef.current.parentNode) videoRef.current.parentNode.removeChild(videoRef.current); } catch (_) { }
        try { URL.revokeObjectURL(videoRef.current.src); } catch (_) { }
        videoRef.current = null;
      }
    } catch (_) { }
    try { if (socketRef.current) { socketRef.current.disconnect(); socketRef.current = null; } } catch (_) { }
    totalPeopleRef.current = 0;
    framesCountRef.current = 0;
    inferenceTimesRef.current = [];
    setAvgPeople(0);
    setLiveCount(0);
    setProcessedImage(null);
    setResult(null);
    setDetectionStarted(false);
    setDetectionCompleted(false);
    setError('');
    setLoading(false);
    // clear selected files and preview URL
    try { if (imageInputRef.current) imageInputRef.current.value = ''; } catch (_) { }
    try { if (videoInputRef.current) videoInputRef.current.value = ''; } catch (_) { }
    setImage(null);
    setVideo(null);
    sentFramesRef.current = 0;
    if (videoUrl) { try { URL.revokeObjectURL(videoUrl); } catch (_) { }; setVideoUrl(null); }
    // stop monitor
    clearIdleMonitor();
  };

  return (
    <div className="container">
      <h1 style={{textTransform: "uppercase"}}>{division}</h1>
      <h3>
        Crowd status in {division}:{' '}
        <span style={{ color: getCountColor(avgPeople, threshold) }}>
          {avgPeople >= threshold
            ? 'Crowded'
            : avgPeople >= threshold / 2
            ? 'Partially Crowded'
            : 'Normal'}
        </span>
      </h3>
      <div className="plasma-meter-container">
        <div className="plasma-readout">
          {avgPeople >= threshold
            ? 'Crowded'
            : avgPeople >= threshold / 2
            ? 'Partially Crowded'
            : 'Normal'}
        </div>
        <div className="plasma-bar-track">
          <div
            className={`plasma-bar-fill ${
              avgPeople >= threshold
                ? 'crowded'
                : avgPeople >= threshold / 2
                ? 'partially'
                : 'normal'
            }`}
            style={{ width: `${Math.min((avgPeople / threshold) * 100, 100)}%` }}
          ></div>
        </div>
      </div>
      <div className="division-page">

        <div className="division-left">
          <div className="upload-section">
            <div>
              <h3>Upload Image</h3>
              <input ref={imageInputRef} type="file" accept="image/*" onChange={(e) => handleFileChange(e, 'image')} />
            </div>
            <div>
              <h3>Upload Video</h3>
              <input ref={videoInputRef} type="file" accept="video/*" onChange={(e) => handleFileChange(e, 'video')} />
            </div>
            {/* <div>
              <h3>Live CCTV Footage</h3>
              <button onClick={() => {
                // start a socket session to receive live frames if not already started
                if (!socketRef.current) {
                  socketRef.current = io();
                  socketRef.current.on('processed_frame', (data) => {
                    if (data && data.image) {
                      try {
                        const img = new Image();
                        img.onload = () => {
                          const pc = processedCanvasRef.current;
                          if (pc) {
                            const rect = pc.getBoundingClientRect();
                            const DPR = window.devicePixelRatio || 1;
                            pc.width = Math.round(rect.width * DPR);
                            pc.height = Math.round(rect.height * DPR);
                            pc.style.width = `${Math.round(rect.width)}px`;
                            pc.style.height = `${Math.round(rect.height)}px`;
                            const pctx = pc.getContext('2d');
                            pctx.setTransform(DPR, 0, 0, DPR, 0, 0);
                            pctx.clearRect(0, 0, rect.width, rect.height);
                            const ar = img.width / img.height;
                            let w = rect.width, h = Math.round(w / ar);
                            if (h > rect.height) { h = rect.height; w = Math.round(h * ar); }
                            const x = Math.round((rect.width - w) / 2);
                            const y = Math.round((rect.height - h) / 2);
                            pctx.drawImage(img, x, y, w, h);
                          } else {
                            setProcessedImage(data.image);
                          }
                        };
                        img.src = data.image;
                      } catch (e) {
                        setProcessedImage(data.image);
                      }
                      setLiveCount(data.count ?? 0);
                    }
                  });
                }
                alert('For live CCTV, stream frames from your camera or supply a video file and press Submit.');
              }}>
                View Live
              </button>
            </div> */}
            <div style={{ marginTop: 12, marginBottom: 8 }}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>Threshold</label>
              <input type="number" value={threshold} onChange={(e) => setThreshold(e.target.value === '' ? '' : Number(e.target.value))} />
            </div>
            <div style={{ marginTop: 12, marginBottom: 8 }}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>Streaming Controls</label>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12 }}>Send interval: {(sendIntervalMs / 1000).toFixed(2)}s</div>
                  <input type="range" min={100} max={2000} step={100} value={sendIntervalMs} onChange={(e) => setSendIntervalMs(Number(e.target.value))} />
                </div>
                <div style={{ width: 140 }}>
                  <div style={{ fontSize: 12 }}>Capture width</div>
                  <select value={captureWidth} onChange={(e) => setCaptureWidth(Number(e.target.value))} style={{ width: '100%' }}>
                    <option value={320}>320</option>
                    <option value={480}>480</option>
                    <option value={640}>640</option>
                    <option value={800}>800</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="action-buttons">
              <button onClick={handleSubmit} className="btn" disabled={loading}>
                {loading ? 'Processing...' : 'Submit'}
              </button>
              <button onClick={stopStreaming} className="btn">
                Stop Streaming
              </button>
              <button onClick={handleReset} className="btn">
                Reset
              </button>
            </div>
          </div>

          {loading && <div className="loading-spinner"></div>}
          {error && <div className="error">{error}</div>}
          {result && (
            <div className="result" style={{ marginTop: 12 }}>
              <div className={result.totalPeople > 100 ? 'red' : 'green'}>
                Total People: {result.totalPeople}
              </div>
              <div className="muted">Inference time: {result.inference_time}s</div>
            </div>
          )}
        </div>

        {detectionStarted && !detectionCompleted && (
          <div className="division-right">
            <h3 style={{ margin: 0 }}>Processed Output</h3>
            <div style={{
              marginTop: 6,
              marginBottom: 8,
              fontWeight: 'bold',
              fontSize: '2rem',
              color: getCountColor(avgPeople, threshold)
            }}>
              Avg People: {Number.isFinite(avgPeople) ? avgPeople.toFixed(2) : '0.00'}
            </div>
            {liveCount > 0 && <div>Live detected people: {liveCount}</div>}
            <div className="processed-output-wrapper" style={{ position: 'relative' }}>
              <canvas ref={processedCanvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
              {(detectionStarted && !detectionCompleted) && (
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.35)', color: '#fff', zIndex: 20, borderRadius: 6 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div className="loading-spinner" style={{ width: 36, height: 36, marginBottom: 8 }}></div>
                    <div style={{ fontWeight: 600 }}>Processing video...</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {detectionCompleted && (
          <div className="division-right">
            <h3 style={{ margin: 0 }}>Detection Summary</h3>
            <div style={{ marginTop: 8 }}>
              {/* <div><strong>Total frames:</strong> {sentFramesRef.current}</div> */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <strong>Average people/frame:</strong>
                <span style={{
                  fontWeight: 'bold',
                  fontSize: '1.5rem',
                  color: getCountColor(avgPeople, threshold)
                }}>
                  {Number.isFinite(avgPeople) ? Math.round(avgPeople) : 0}
                </span>
              </div>
              <div><strong>Avg inference time (s):</strong> {inferenceTimesRef.current.length ? (inferenceTimesRef.current.reduce((a, b) => a + b, 0) / inferenceTimesRef.current.length).toFixed(2) : 'n/a'}</div>

              {/* Show processed image when the input was an image */}
              {image && processedImage && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontWeight: 600 }}>Processed Image</div>
                  <div style={{ marginTop: 8 }}>
                    <img src={processedImage} alt="processed" style={{ width: '100%', height: 'auto', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.12)' }} />
                  </div>
                </div>
              )}

              {/* Show original video when the input was a video (preview stays until Reset) */}
              {videoUrl && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontWeight: 600 }}>Original Video</div>
                  <div style={{ marginTop: 8 }}>
                    <video src={videoUrl} autoPlay muted loop style={{ width: '100%', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.12)' }} />
                  </div>
                </div>
              )}

              <div className="action-buttons" style={{ marginTop: 12 }}>
                <button onClick={handleReset} className="btn">Reset</button>
                <button onClick={() => {
                  // Close: hide summary and keep video preview available
                  setDetectionCompleted(false);
                  setProcessedImage(null);
                }} className="btn">Close</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DivisionPage;
