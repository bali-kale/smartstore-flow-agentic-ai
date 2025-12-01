// src/App.js
import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import HomePage from './pages/HomePage';
import DivisionPage from './pages/DivisionPage';

import Header from './components/Header';  // Import Header component



const App = () => {
  return (
    <Router>
      <Header /> {/* Add the Header component here */}
      <div className="container">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/:division" element={<DivisionPage />} />
        </Routes>
      </div>
    </Router>
  );
};

export default App;

 