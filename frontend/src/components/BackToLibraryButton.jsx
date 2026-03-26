import React from 'react';
import { Link } from 'react-router-dom';

export const backToLibraryButtonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '10px 14px',
  borderRadius: 999,
  border: '1px solid rgba(114, 98, 78, 0.22)',
  background: '#fff',
  color: '#3b332a',
  fontWeight: 700,
  textDecoration: 'none',
  whiteSpace: 'nowrap',
};

export default function BackToLibraryButton({ style = {} }) {
  return (
    <Link to="/" style={{ ...backToLibraryButtonStyle, ...style }}>
      Back to Library
    </Link>
  );
}
