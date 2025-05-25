import React from 'react';
import { Link } from 'react-router-dom';
import { Sun, Cloud, LogOut } from 'lucide-react';

const Layout = ({ children, user, onLogout }) => {
  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <Sun />
          <span>WeatherApp</span>
        </div>
        
        <nav className="main-nav">
          <Link to="/">Dashboard</Link>
          <Link to="/records">Records</Link>
          {user ? (
            <button className="logout-btn" onClick={onLogout}>
              <LogOut size={18} /> Logout
            </button>
          ) : (
            <>
              <Link to="/login">Login</Link>
              <Link to="/register">Register</Link>
            </>
          )}
        </nav>
      </header>
      
      <main className="app-main">
        {children}
      </main>
      
      <footer className="app-footer">
        <p>© 2023 WeatherApp. All rights reserved.</p>
      </footer>
    </div>
  );
};

export default Layout;