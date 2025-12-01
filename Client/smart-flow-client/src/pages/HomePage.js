// src/pages/HomePage.js
import React from 'react';
import { Link } from 'react-router-dom';
import './HomePage.css'; // Import CSS file for homepage styles

const HomePage = () => {
  return (
    <div className="homepage">
      <div className="welcome-message">
        <h1>Welcome to FluxAgents - SmartStore Flow</h1>
      </div>
      
      <div className="division-boxes">
        <div className="division-box showroom">
          <h2>Showroom</h2>
          <p>Explore the showroom with live displays and product information.</p>
          <Link to="/showroom" className="division-link">Go to Showroom</Link>
        </div>

        <div className="division-box markethall">
          <h2>Market Hall</h2>
          <p>Visit the market hall and discover available products for sale.</p>
          <Link to="/markethall" className="division-link">Go to Market Hall</Link>
        </div>

        <div className="division-box warehouse">
          <h2>Warehouse</h2>
          <p>View and manage the warehouse inventory and resources.</p>
          <Link to="/warehouse" className="division-link">Go to Warehouse</Link>
        </div>
      </div>
    </div>
  );
};

export default HomePage;
 