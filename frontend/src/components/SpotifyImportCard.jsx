import React from 'react';

function SpotifyGlyph() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      style={styles.logo}
    >
      <circle cx="12" cy="12" r="12" fill="#1db954" />
      <path
        d="M7 9.3c3.7-1.1 7.9-.7 11.1 1"
        fill="none"
        stroke="#0b2418"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M7.8 12.2c2.9-.8 6-.5 8.5.8"
        fill="none"
        stroke="#0b2418"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M8.8 15c2.1-.5 4.2-.3 6 .6"
        fill="none"
        stroke="#0b2418"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function SpotifyImportCard({
  value,
  onChange,
  onSubmit,
  buttonLabel = 'Start Import',
  disabled = false,
  placeholder = 'Paste Spotify link, URI, or ID',
  subtitle = 'Paste a Spotify playlist, album, or song',
  headerAction = null,
  hideFooterButton = false,
  flat = false,
  children = null,
}) {
  const inputStyle =
    hideFooterButton && !children
      ? { ...styles.input, marginBottom: 0 }
      : styles.input;

  return (
    <section style={flat ? styles.flatCard : styles.card}>
      <div style={styles.titleRow}>
        <h2 style={styles.title}>Spotify</h2>
        <SpotifyGlyph />
        {headerAction ? <div style={styles.headerAction}>{headerAction}</div> : null}
      </div>
      {subtitle ? <p style={styles.subtitle}>{subtitle}</p> : null}
      <input
        style={inputStyle}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !disabled) {
            e.preventDefault();
            onSubmit?.();
          }
        }}
        placeholder={placeholder}
      />
      {!hideFooterButton ? (
        <button
          type="button"
          style={styles.button}
          disabled={disabled}
          onClick={onSubmit}
        >
          {buttonLabel}
        </button>
      ) : null}
      {children}
    </section>
  );
}

const styles = {
  card: {
    background: '#fffefb',
    border: '1px solid rgba(114, 98, 78, 0.18)',
    borderRadius: 18,
    padding: 20,
    boxShadow: '0 14px 30px rgba(77, 60, 35, 0.05)',
  },
  flatCard: {
    background: 'transparent',
    border: 'none',
    borderRadius: 0,
    padding: 0,
    boxShadow: 'none',
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  headerAction: {
    marginLeft: 'auto',
  },
  logo: {
    width: 24,
    height: 24,
    flex: '0 0 auto',
  },
  title: {
    margin: 0,
    color: '#2f261c',
    fontSize: 22,
    lineHeight: 1.1,
  },
  subtitle: {
    margin: '0 0 12px',
    color: '#7c6d5d',
    fontSize: 14,
    lineHeight: 1.45,
  },
  input: {
    width: '100%',
    padding: '8px 12px',
    borderRadius: 12,
    border: '1px solid #d2c7b7',
    background: '#fff',
    marginBottom: 12,
  },
  button: {
    padding: '10px 16px',
    borderRadius: 999,
    border: 'none',
    background: '#2f6b5f',
    color: '#fff',
    fontWeight: 700,
    cursor: 'pointer',
  },
};
