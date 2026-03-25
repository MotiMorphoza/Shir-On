import React from 'react';

const STATUS_OPTIONS = [
  { value: '', label: 'All Lyrics Statuses' },
  { value: 'missing', label: 'Missing Lyrics' },
  { value: 'auto', label: 'Auto Fetched' },
  { value: 'manual', label: 'Manual Lyrics' },
];

const PRINT_OPTIONS = [
  { value: '', label: 'All Print States' },
  { value: 'true', label: 'Print Ready Only' },
  { value: 'false', label: 'Not Print Ready' },
];

export default function FilterBar({ filters, onChange }) {
  const set = (key, value) => {
    onChange({
      ...filters,
      [key]: value,
    });
  };

  const clearAll = () => {
    onChange({
      search: '',
      status: '',
      artist: '',
      year: '',
      printReady: '',
      sort: 'title',
    });
  };

  return (
    <div style={styles.wrap}>
      <div style={styles.bar}>
        <input
          style={{ ...styles.input, ...styles.search }}
          placeholder="Search title or artist…"
          value={filters.search || ''}
          onChange={(e) => set('search', e.target.value)}
        />

        <select
          value={filters.status || ''}
          onChange={(e) => set('status', e.target.value)}
          style={styles.select}
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <input
          style={styles.input}
          placeholder="Artist"
          value={filters.artist || ''}
          onChange={(e) => set('artist', e.target.value)}
        />

        <input
          style={styles.input}
          placeholder="Year"
          type="number"
          value={filters.year || ''}
          onChange={(e) => set('year', e.target.value)}
        />

        <select
          value={filters.printReady || ''}
          onChange={(e) => set('printReady', e.target.value)}
          style={styles.select}
        >
          {PRINT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <select
          value={filters.sort || 'title'}
          onChange={(e) => set('sort', e.target.value)}
          style={styles.select}
        >
          <option value="title">Sort: Title A–Z</option>
          <option value="artist">Sort: Artist A–Z</option>
          <option value="year">Sort: Year</option>
        </select>

        <button type="button" style={styles.clearBtn} onClick={clearAll}>
          Clear
        </button>
      </div>
    </div>
  );
}

const styles = {
  wrap: {
    marginBottom: 12,
  },
  bar: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    padding: '10px 0',
    alignItems: 'center',
  },
  search: {
    flex: '2 1 260px',
  },
  input: {
    flex: '1 1 120px',
    minWidth: 110,
    padding: '6px 10px',
    border: '1px solid #ccc',
    borderRadius: 4,
    fontFamily: 'inherit',
  },
  select: {
    padding: '6px 8px',
    border: '1px solid #ccc',
    borderRadius: 4,
    background: '#fff',
    fontFamily: 'inherit',
  },
  clearBtn: {
    padding: '6px 12px',
    border: '1px solid #ccc',
    borderRadius: 4,
    background: '#f7f7f7',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
};