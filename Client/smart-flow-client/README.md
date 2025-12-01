# smart-flow-client

React front-end for the Agentic AI demo. The client provides a simple UI to preview camera/video, capture frames to send to the detection server, and display processed frames.

Features
- Modern AI-themed UI (glass cards, neon accents).
- Socket.IO integration to stream frames to server and receive processed frames back.
- One-off image upload to `/upload-image` endpoint.

Quick start
1. Install dependencies and run dev server:

```powershell
cd Client/smart-flow-client
npm install
npm start
```

2. By default the frontend expects the detection server at `http://localhost:5000`. If your server runs elsewhere, update the client Socket.IO connection URL inside the relevant component (search for `io('http://localhost:5000')` or the `socket` initialization).

Testing endpoints
- One-off image upload (from browser code): POST a `FormData` with field `file` to `http://localhost:5000/upload-image` and display the returned `image` data URL.
- Live streaming: capture a canvas frame and emit a Socket.IO `frame` event with payload `{ image: dataUrl, confidence: 0.8 }`.

Notes
- The client includes updated CSS in `src/index.css`, `src/App.css`, `src/components/Header.css`, and `src/pages/HomePage.css` to provide a modern look-and-feel tuned for the demo.

Want help wiring a demo page that automatically connects to the server and streams webcam frames? I can add a small component and demo route to the app.
