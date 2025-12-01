// src/pages/DivisionPage.js
import React, { useState } from 'react';
import axios from 'axios';
import { useParams } from 'react-router-dom';

const DivisionPage = () => {
  const { division } = useParams();
  const [image, setImage] = useState(null);
  const [video, setVideo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleFileChange = (e, type) => {
    const file = e.target.files[0];
    if (type === 'image') {
      setImage(file);
    } else {
      setVideo(file);
    }
  };

  const handleSubmit = async () => {
    if (!image && !video) {
      setError('Please upload either an image or a video');
      return;
    }

    setLoading(true);
    setError('');
    
    const formData = new FormData();
    if (image) formData.append('image', image);
    if (video) formData.append('video', video);

    try {
      const response = await axios.post(`http://localhost:5000/${division}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResult(response.data);
    } catch (error) {
      setError('Failed to fetch data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <h1>{division}</h1>
      <div className="upload-section">
        <div>
          <h3>Upload Image</h3>
          <input type="file" accept="image/*" onChange={(e) => handleFileChange(e, 'image')} />
        </div>
        <div>
          <h3>Upload Video</h3>
          <input type="file" accept="video/*" onChange={(e) => handleFileChange(e, 'video')} />
        </div>
        <div>
          <h3>Live CCTV Footage</h3>
          <button onClick={() => alert('Live CCTV footage not implemented yet.')}>
            View Live
          </button>
        </div>
        <button onClick={handleSubmit} disabled={loading}>
          {loading ? 'Processing...' : 'Submit'}
        </button>
      </div>

      {loading && <div className="loading-spinner"></div>}
      {error && <div className="error">{error}</div>}
      
      {result && (
        <div className="result">
          <div className={result.totalPeople > 100 ? 'red' : 'green'}>
            Total People: {result.totalPeople}
          </div>
        </div>
      )}
    </div>
  );
};

export default DivisionPage;

 