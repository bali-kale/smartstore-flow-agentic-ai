# smartstore-flow-agentic-ai

Agentic AI MVP for in-store traffic analysis — a prototype to perform live head/person detection from camera or uploaded media and stream processed frames to a web frontend.

This repository contains:
- `Client/smart-flow-client` — React front-end (UI, camera capture, preview, and integration with Socket.IO / HTTP endpoints).
- `Server` — Flask + Socket.IO server that wraps the detection logic and provides an HTTP upload endpoint and a WebSocket (Socket.IO) streaming endpoint.
- `Server/Detection` — detection code (Faster R-CNN wrapper) and model requirements. Detection logic is intentionally kept separate and is NOT modified by the server wrapper.

Quick links
- Server README: `Server/README.md`
- Client README: `Client/smart-flow-client/README.md`

Getting started (short)
1. Install server dependencies and detection requirements (see `Server/README.md`). Note: PyTorch installation should match your platform and desired CUDA version.
2. Start the Flask + Socket.IO server: `python Server/app.py` (server listens on port `5000` by default).
3. In a separate terminal, run the React client from `Client/smart-flow-client`:

```powershell
cd Client/smart-flow-client
npm install
npm start
```

Usage
- Live detection: the React UI can capture camera frames, send them to the server over Socket.IO, and display processed frames returned by the server.
- One-off uploads: POST an image file to `/upload-image` and receive a processed image (base64) along with detection metadata.

Notes
- The detection model may require GPU-appropriate PyTorch wheels for acceptable performance. See `Server/Detection/requirements.txt` and the PyTorch website for appropriate installation commands.
- The server intentionally creates a single `Detector` instance at startup to avoid repeatedly reloading model weights.

If you want, I can add a small demo page that automatically connects to the server and streams the webcam to the detection pipeline.