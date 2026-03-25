const BASE = import.meta.env.VITE_API_URL?.trim() || 'http://127.0.0.1:3001/api';

async function request(path, options = {}) {
  const isFormData =
    typeof FormData !== 'undefined' && options.body instanceof FormData;

  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    ...options,
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  if (res.status === 204) {
    return null;
  }

  return res.json();
}

export const api = {
  getSongs: (params = {}) =>
    request(
      '/songs?' +
        new URLSearchParams(
          Object.fromEntries(
            Object.entries(params).filter(
              ([, value]) => value !== undefined && value !== ''
            )
          )
        ).toString()
    ),

  getSong: (id) => request(`/songs/${id}`),

  createSong: (data) =>
    request('/songs', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateSong: (id, data) =>
    request(`/songs/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteSong: (id) =>
    request(`/songs/${id}`, {
      method: 'DELETE',
    }),

  saveLyrics: (id, data) =>
    request(`/songs/${id}/lyrics`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  fetchLyrics: (id) =>
    request(`/songs/${id}/fetch-lyrics`, {
      method: 'POST',
    }),

  setTags: (id, tags) =>
    request(`/songs/${id}/tags`, {
      method: 'PUT',
      body: JSON.stringify({ tags }),
    }),

  bulkUpdate: (ids, data) =>
    request('/songs/bulk', {
      method: 'POST',
      body: JSON.stringify({ ids, data }),
    }),

  getDuplicates: () => request('/songs/duplicates'),

  mergeSongs: (data) =>
    request('/songs/merge', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  importPlaylist: (playlistId) =>
    request('/spotify/import/playlist', {
      method: 'POST',
      body: JSON.stringify({ playlistId }),
    }),

  importAlbum: (albumId) =>
    request('/spotify/import/album', {
      method: 'POST',
      body: JSON.stringify({ albumId }),
    }),

  getSpotifySession: () => request('/spotify/session'),

  getSpotifyMe: () => request('/spotify/me'),

  logoutSpotify: () =>
    request('/spotify/logout', {
      method: 'POST',
    }),

  getCollections: () => request('/collections'),

  getCollection: (id) => request(`/collections/${id}`),

  createCollection: (name, description) =>
    request('/collections', {
      method: 'POST',
      body: JSON.stringify({ name, description }),
    }),

  addToCollection: (collectionId, songId) =>
    request(`/collections/${collectionId}/songs`, {
      method: 'POST',
      body: JSON.stringify({ songId }),
    }),

  removeFromCollection: (collectionId, songId) =>
    request(`/collections/${collectionId}/songs/${songId}`, {
      method: 'DELETE',
    }),

  importCsv: (file) => {
    const form = new FormData();
    form.append('file', file);

    return request('/import/csv', {
      method: 'POST',
      body: form,
    });
  },

  importJson: (records) =>
    request('/import/json', {
      method: 'POST',
      body: JSON.stringify(records),
    }),

  getReports: (params = {}) =>
    request(
      '/reports?' +
        new URLSearchParams(
          Object.fromEntries(
            Object.entries(params).filter(
              ([, value]) => value !== undefined && value !== ''
            )
          )
        ).toString()
    ),

  getReport: (id) => request(`/reports/${id}`),

  printPdf: async (body) => {
    const res = await fetch(`${BASE}/print/pdf`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || 'PDF generation failed');
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);

    window.open(url, '_blank', 'noopener,noreferrer');

    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 60000);

    return { ok: true };
  },
};

export { BASE };