import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import CollectionsPage from './pages/CollectionsPage.jsx';
import DuplicatesPage from './pages/DuplicatesPage.jsx';
import ImportPage from './pages/ImportPage.jsx';
import JobsPage from './pages/JobsPage.jsx';
import Library from './pages/Library.jsx';
import LyricsRunPage from './pages/LyricsRunPage.jsx';
import ReportPage from './pages/ReportPage.jsx';
import ReportsPage from './pages/ReportsPage.jsx';
import SongbookPage from './pages/SongbookPage.jsx';
import SongPage from './pages/SongPage.jsx';

function App() {
  return (
    <BrowserRouter>
      <div style={shellStyle}>
        <nav style={navStyle}>
          <div style={brandWrap}>
            <Link to="/" style={brandLink}>
              Shir-On
            </Link>
            <span style={brandHint}>Personal songbook</span>
          </div>

          <div style={navLinks}>
            <Link to="/" style={navLink}>
              Library
            </Link>
            <Link to="/import" style={navLink}>
              Import Playlist
            </Link>
            <Link to="/lyrics-run" style={navLink}>
              Fetch Lyrics
            </Link>
            <Link to="/jobs" style={navLink}>
              Jobs
            </Link>
            <Link to="/duplicates" style={navLink}>
              Duplicates
            </Link>
            <Link to="/songbook" style={navLink}>
              Songbook
            </Link>
            <Link to="/collections" style={navLink}>
              Collections
            </Link>
            <Link to="/reports" style={navLink}>
              Reports
            </Link>
            <Link to="/songs/new" style={ctaLink}>
              Add Song
            </Link>
          </div>
        </nav>

        <Routes>
          <Route path="/" element={<Library />} />
          <Route path="/songs/:id" element={<SongPage />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/collections" element={<CollectionsPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/reports/:id" element={<ReportPage />} />
          <Route path="/lyrics-run" element={<LyricsRunPage />} />
          <Route path="/jobs" element={<JobsPage />} />
          <Route path="/duplicates" element={<DuplicatesPage />} />
          <Route path="/songbook" element={<SongbookPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

const shellStyle = {
  minHeight: '100vh',
  background:
    'linear-gradient(180deg, #f7f3ea 0%, #f3f0e8 220px, #fbfaf7 220px, #fbfaf7 100%)',
};

const navStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 16,
  padding: '20px 28px',
  background: 'rgba(250, 247, 240, 0.92)',
  borderBottom: '1px solid rgba(114, 98, 78, 0.18)',
  backdropFilter: 'blur(8px)',
  position: 'sticky',
  top: 0,
  zIndex: 100,
  flexWrap: 'wrap',
};

const brandWrap = {
  display: 'grid',
  gap: 2,
};

const brandLink = {
  color: '#2a241d',
  textDecoration: 'none',
  fontWeight: 800,
  fontSize: 28,
  letterSpacing: '0.02em',
  lineHeight: 1,
};

const brandHint = {
  color: '#7d6f60',
  fontSize: 13,
  textTransform: 'uppercase',
  letterSpacing: '0.16em',
};

const navLinks = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  flexWrap: 'wrap',
};

const navLink = {
  color: '#4c4338',
  textDecoration: 'none',
  fontWeight: 600,
  fontSize: 14,
  padding: '8px 10px',
  borderRadius: 999,
};

const ctaLink = {
  ...navLink,
  background: '#2f6b5f',
  color: '#fff',
  padding: '8px 14px',
};

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
