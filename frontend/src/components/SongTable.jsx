import React from 'react';

const STATUS_LABELS = {
  missing: 'No Lyrics',
  has_lyrics: 'Has Lyrics',
};

const STATUS_COLORS = {
  missing: '#c0392b',
  has_lyrics: '#2e8b57',
};

export default function SongTable({
  songs,
  selected,
  onSelect,
  onOpen,
  groupByArtist = false,
}) {
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
            <th style={{ ...styles.th, ...styles.spotifyCol }}>Spotify</th>
          </tr>
        </thead>

        <tbody>
          {songs.map((song, index) => {
            const previousArtist =
              index > 0 ? songs[index - 1].artist_name || 'Unknown Artist' : null;
            const currentArtist = song.artist_name || 'Unknown Artist';
            const status =
              song.lyrics_status && song.lyrics_status !== 'missing'
                ? 'has_lyrics'
                : 'missing';

            return (
              <React.Fragment key={song.id}>
                {groupByArtist && currentArtist !== previousArtist && (
                  <tr>
                    <td colSpan={8} style={styles.groupRow}>
                      {currentArtist}
                    </td>
                  </tr>
                )}

                <tr style={styles.row} onClick={() => onOpen(song.id)}>
                  <td
                    style={{ ...styles.td, ...styles.checkboxCol }}
                    onClick={(e) => e.stopPropagation()}
                  >
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

                  <td style={styles.td}>{song.artist_name || '-'}</td>

                  <td style={styles.td}>{song.album_title || '-'}</td>

                  <td style={{ ...styles.td, ...styles.yearCol }}>
                    {song.year || '-'}
                  </td>

                  <td style={styles.td}>
                    <span
                      style={{
                        ...styles.badge,
                        background: STATUS_COLORS[status] || '#999',
                      }}
                    >
                      {STATUS_LABELS[status] || status || '-'}
                    </span>
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
                      '-'
                    )}
                  </td>
                </tr>
              </React.Fragment>
            );
          })}
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
  groupRow: {
    padding: '12px 10px',
    background: '#f6f2ea',
    color: '#3b3126',
    fontWeight: 800,
    borderTop: '1px solid #e0d6c7',
    borderBottom: '1px solid #e0d6c7',
    letterSpacing: '0.02em',
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
