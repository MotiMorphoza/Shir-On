import React from 'react';

const STATUS_LABELS = {
  missing: 'Missing',
  auto: 'Auto',
  manual: 'Manual',
  reviewed: 'Reviewed',
};

const STATUS_COLORS = {
  missing: '#e74c3c',
  auto: '#f39c12',
  manual: '#3498db',
  reviewed: '#27ae60',
};

export default function SongTable({ songs, selected, onSelect, onOpen }) {
  const allSelected = songs.length > 0 && selected.size === songs.length;

  const toggleAll = () => {
    if (allSelected) {
      onSelect(new Set());
      return;
    }

    onSelect(new Set(songs.map((song) => song.id)));
  };

  const toggleOne = (songId) => {
    const next = new Set(selected);

    if (next.has(songId)) {
      next.delete(songId);
    } else {
      next.add(songId);
    }

    onSelect(next);
  };

  return (
    <div style={styles.wrap}>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={{ ...styles.th, ...styles.checkboxCol }}>
              <input type="checkbox" checked={allSelected} onChange={toggleAll} />
            </th>
            <th style={{ ...styles.th, ...styles.numCol }}>#</th>
            <th style={styles.th}>Title</th>
            <th style={styles.th}>Artist</th>
            <th style={styles.th}>Album</th>
            <th style={{ ...styles.th, ...styles.yearCol }}>Year</th>
            <th style={styles.th}>Lyrics</th>
            <th style={{ ...styles.th, ...styles.printCol }}>Print</th>
            <th style={{ ...styles.th, ...styles.spotifyCol }}>Spotify</th>
          </tr>
        </thead>

        <tbody>
          {songs.map((song, index) => (
            <tr
              key={song.id}
              style={styles.row}
              onClick={() => onOpen(song.id)}
            >
              <td style={{ ...styles.td, ...styles.checkboxCol }} onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={selected.has(song.id)}
                  onChange={() => toggleOne(song.id)}
                />
              </td>

              <td style={{ ...styles.td, ...styles.numCol }}>{index + 1}</td>

              <td style={styles.td}>
                <strong>{song.title}</strong>
              </td>

              <td style={styles.td}>{song.artist_name || '—'}</td>

              <td style={styles.td}>{song.album_title || '—'}</td>

              <td style={{ ...styles.td, ...styles.yearCol }}>
                {song.year || '—'}
              </td>

              <td style={styles.td}>
                <span
                  style={{
                    ...styles.badge,
                    background: STATUS_COLORS[song.lyrics_status] || '#999',
                  }}
                >
                  {STATUS_LABELS[song.lyrics_status] || song.lyrics_status || '—'}
                </span>
              </td>

              <td style={{ ...styles.td, ...styles.printCol }}>
                {song.is_print_ready ? '✓' : '—'}
              </td>

              <td
                style={{ ...styles.td, ...styles.spotifyCol }}
                onClick={(e) => e.stopPropagation()}
              >
                {song.spotify_url ? (
                  <a
                    href={song.spotify_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={styles.spotifyLink}
                  >
                    Open
                  </a>
                ) : (
                  '—'
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const styles = {
  wrap: {
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 14,
  },
  th: {
    textAlign: 'left',
    padding: '8px 10px',
    borderBottom: '2px solid #ddd',
    background: '#f9f9f9',
    whiteSpace: 'nowrap',
  },
  td: {
    padding: '7px 10px',
    borderBottom: '1px solid #eee',
    cursor: 'pointer',
    verticalAlign: 'middle',
  },
  row: {
    transition: 'background .1s',
  },
  badge: {
    padding: '2px 7px',
    borderRadius: 10,
    color: '#fff',
    fontSize: 11,
    fontWeight: 600,
    display: 'inline-block',
    minWidth: 56,
    textAlign: 'center',
  },
  checkboxCol: {
    width: 34,
  },
  numCol: {
    width: 46,
    color: '#666',
  },
  yearCol: {
    width: 70,
    whiteSpace: 'nowrap',
  },
  printCol: {
    width: 70,
    textAlign: 'center',
    whiteSpace: 'nowrap',
  },
  spotifyCol: {
    width: 84,
    whiteSpace: 'nowrap',
  },
  spotifyLink: {
    color: '#1db954',
    textDecoration: 'none',
    fontWeight: 600,
  },
};