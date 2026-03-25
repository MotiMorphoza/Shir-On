import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import Library from './pages/Library.jsx';
import SongPage from './pages/SongPage.jsx';
import ImportPage from './pages/ImportPage.jsx';
import ReportsPage from './pages/ReportsPage.jsx';
import ReportPage from './pages/ReportPage.jsx';

function App() {
  return (
    <BrowserRouter>
      <nav style={navStyle}>
        <Link to="/" style={navLink}>
          📚 Songbook
        </Link>
        <Link to="/import" style={{ ...navLink, fontSize: 14, opacity: 0.85 }}>
          Import
        </Link>
        <Link to="/reports" style={{ ...navLink, fontSize: 14, opacity: 0.85 }}>
          Reports
        </Link>
        <Link to="/songs/new" style={{ ...navLink, fontSize: 14, opacity: 0.85 }}>
          + Add Song
        </Link>
      </nav>

      <Routes>
        <Route path="/" element={<Library />} />
        <Route path="/songs/:id" element={<SongPage />} />
        <Route path="/import" element={<ImportPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/reports/:id" element={<ReportPage />} />
      </Routes>
    </BrowserRouter>
  );
}

const navStyle = {
  display: 'flex',
  gap: 24,
  alignItems: 'center',
  padding: '12px 24px',
  background: '#2c3e50',
  position: 'sticky',
  top: 0,
  zIndex: 100,
};

const navLink = {
  color: '#fff',
  textDecoration: 'none',
  fontWeight: 700,
  fontSize: 18,
};

ReactDOM.createRoot(document.getElementById('root')).render(<App />);