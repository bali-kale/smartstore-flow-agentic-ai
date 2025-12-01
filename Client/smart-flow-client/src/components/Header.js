// src/components/Header.js
import React from 'react';
import './Header.css';  // Importing the CSS for header styles

const Header = () => {
  return (
    <header className="header">
      <div className="header-left">
        <h1>FluxAgents - SmartStore Flow</h1>
      </div>
      <div className="header-right">
        <span>V1</span>
      </div>
    </header>
  );
};

export default Header;

 