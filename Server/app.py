# FLASK APP FOR SERVER-SIDE LOGIC

from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_socketio import SocketIO, emit
import base64
import cv2
import numpy as np
import time
import os

# import detector from Detection folder (do not modify detection logic)
from Detection.detect import Detector


app = Flask(__name__, static_folder='static')
CORS(app)

# Prefer eventlet/gevent when available and monkey-patch them; otherwise let
# flask-socketio choose the best available (threading fallback).
selected_async = 'auto'
try:
	import eventlet
	eventlet.monkey_patch()
	selected_async = 'eventlet'
except Exception:
	try:
		import gevent
		from gevent import monkey as gevent_monkey
		gevent_monkey.patch_all()
		selected_async = 'gevent'
	except Exception:
		selected_async = 'threading'

if selected_async in ('eventlet', 'gevent'):
	socketio = SocketIO(app, cors_allowed_origins="*", async_mode=selected_async)
else:
	# do not force async_mode; let flask-socketio/engineio pick the best available
	socketio = SocketIO(app, cors_allowed_origins="*")

print(f"[server] Flask-SocketIO selected async mode: {selected_async}")

# single Detector instance (warm model once)
detector = Detector()


def decode_base64_image(b64_str: str):
	# Accept either data URL (data:image/..;base64,...) or raw base64
	if ',' in b64_str:
		b64_str = b64_str.split(',', 1)[1]
	img_bytes = base64.b64decode(b64_str)
	arr = np.frombuffer(img_bytes, dtype=np.uint8)
	img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
	return img


def encode_image_to_base64(img) -> str:
	_, buf = cv2.imencode('.jpg', img, [int(cv2.IMWRITE_JPEG_QUALITY), 90])
	b64 = base64.b64encode(buf).decode('utf-8')
	return 'data:image/jpeg;base64,' + b64


# @app.route('/')
# def index():
# 	return jsonify({'message': 'Detection server running'})


@app.route('/upload-image', methods=['POST'])
def upload_image():
	# one-off image upload: returns processed image (base64) and metadata
	f = request.files.get('file')
	if not f:
		return jsonify({'error': 'no file provided'}), 400

	data = f.read()
	arr = np.frombuffer(data, dtype=np.uint8)
	img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
	if img is None:
		return jsonify({'error': 'invalid image file'}), 400

	confidence = float(request.form.get('confidence', 0.8))
	out_img, t, count = detector.detect(img, confidence_threshold=confidence)
	b64 = encode_image_to_base64(out_img)
	return jsonify({'image': b64, 'count': int(count), 'inference_time': float(t)})


@socketio.on('connect')
def handle_connect():
	emit('connected', {'message': 'connected to detection socket'})


@socketio.on('frame')
def handle_frame(data):
	"""Receive a single video frame as base64 from client, run detection, and emit processed frame.

	Client should emit 'frame' events with payload: { 'image': '<base64 data>', 'confidence': 0.8 }
	Server responds with 'processed_frame' event: { 'image': '<base64 data>', 'count': int, 'inference_time': float }
	"""
	try:
		b64 = data.get('image') if isinstance(data, dict) else None
		if not b64:
			emit('error', {'error': 'no image data'})
			return

		img = decode_base64_image(b64)
		if img is None:
			emit('error', {'error': 'unable to decode image'})
			return

		confidence = float(data.get('confidence', 0.8)) if isinstance(data, dict) else 0.8
		start = time.time()
		out_img, t, count = detector.detect(img, confidence_threshold=confidence)
		# prefer measured model time if available
		inf_time = float(t) if t is not None else (time.time() - start)
		out_b64 = encode_image_to_base64(out_img)
		emit('processed_frame', {'image': out_b64, 'count': int(count), 'inference_time': inf_time})
	except Exception as e:
		emit('error', {'error': str(e)})

from flask import send_from_directory
 
# Serve React build files
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_frontend(path):
    if path != "" and os.path.join(app.static_folder, path):
        return send_from_directory('static', path)
    # Always return index.html for React Router client-side routing
    return send_from_directory('static', 'index.html')

if __name__ == '__main__':
	# use eventlet for websocket support; install via `pip install eventlet`.
	socketio.run(app, host='0.0.0.0', port=5000, debug=True)

