Server — Flask + Socket.IO

This folder contains a small Flask + Socket.IO server that wraps the detection logic found in `Server/Detection` and exposes two primary ways to interact:

- `POST /upload-image` — one-off image uploads using `multipart/form-data` (field name: `file`). Returns a JSON payload with a base64-encoded processed image and detection metadata.
- Socket.IO endpoint — clients can connect via Socket.IO and emit `frame` events with a base64 image payload; the server replies with `processed_frame` events containing the processed image and metadata.

Important note about detection
------------------------------
The detection code and model lives under `Server/Detection`. The server intentionally does not alter detection logic — it loads a `Detector` instance at startup and calls `Detector.detect()` for each image/frame.

Quick setup
-----------
1. Create and activate a Python virtual environment (PowerShell):

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

2. Install server dependencies and detection requirements. Note: PyTorch installation should be chosen to match your OS and CUDA (if using GPU). Example (CPU-only, replace with CUDA-specific wheel if needed):

```powershell
pip install -r requirements.txt
pip install -r Detection/requirements.txt
# For PyTorch, you may prefer the official install command from https://pytorch.org
```

Run server
----------

```powershell
# from the Server directory
python app.py
```

By default the server binds to `0.0.0.0:5000` and is CORS-enabled for development.

HTTP endpoint usage
-------------------
Upload an image (curl example):

```bash
curl -X POST "http://localhost:5000/upload-image" \
  -F "file=@/path/to/image.jpg" \
  -F "confidence=0.8"
```

Response example:

```json
{
  "image": "data:image/jpeg;base64,...",
  "count": 3,
  "inference_time": 0.123
}
```

Socket.IO usage
---------------
Install a Socket.IO client in the frontend (npm):

```bash
npm install socket.io-client
```

Example client flow (browser / React):

```javascript
import { io } from 'socket.io-client';
const socket = io('http://localhost:5000');

socket.on('connect', () => console.log('connected', socket.id));

socket.on('processed_frame', (data) => {
  // data.image is a data URL (base64 jpeg)
  document.getElementById('out').src = data.image;
  console.log('count', data.count, 'time', data.inference_time);
});

// Send a frame from a canvas or video capture
function sendFrame(dataUrl) {
  socket.emit('frame', { image: dataUrl, confidence: 0.8 });
}
```

Implementation notes & tips
--------------------------
- The server uses a single `Detector` instance to avoid repeated model load. The first startup may be slow due to model weight loading.
- For low-latency streaming, prefer sending reduced-size frames (resize the canvas) or reduce the send frequency. The detection model (Faster R-CNN) can be compute-heavy.
- If you plan to accept many concurrent clients or need horizontal scaling, consider extracting the inference to a dedicated microservice with a queue and workers.

Troubleshooting
---------------
- If `import torch` fails, install PyTorch from https://pytorch.org matching your platform and CUDA version.
- If Socket.IO connection fails from the browser, confirm the server is reachable and CORS is enabled; check browser console/network logs.

Security
--------
- This server is intended as a development prototype. Before deploying to production, add authentication/authorization, rate limiting, and input validation.

