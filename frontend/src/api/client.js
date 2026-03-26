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

  getSongsByIds: (ids) =>
    request(
      '/songs?' +
        new URLSearchParams({
          ids: (Array.isArray(ids) ? ids : []).filter(Boolean).join(','),
          limit: String((Array.isArray(ids) ? ids.length : 0) || 1),
        }).toString()
    ),

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

  startLyricsRunJob: (ids) =>
    request('/songs/fetch-lyrics-run/background', {
      method: 'POST',
      keepalive: true,
      body: JSON.stringify({ ids }),
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

  startPlaylistImportJob: (playlistId) =>
    request('/spotify/import/playlist/background', {
      method: 'POST',
      keepalive: true,
      body: JSON.stringify({ playlistId }),
    }),

  startAlbumImportJob: (albumId) =>
    request('/spotify/import/album/background', {
      method: 'POST',
      keepalive: true,
      body: JSON.stringify({ albumId }),
    }),
  getSpotifyStatus: () => request('/spotify/status'),

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

  deleteCollection: (id) =>
    request(`/collections/${id}`, {
      method: 'DELETE',
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

  getPlaylists: () => request('/playlists'),

  getPlaylist: (id) => request(`/playlists/${id}`),

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

  resetReports: (body = { includeLegacy: true }) =>
    request('/reports/reset', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  getLyricsProviderStats: () => request('/reports/provider-stats/lyrics'),

  getJobs: () => request('/jobs'),

  getJob: (id) => request(`/jobs/${id}`),

  printPdf: async (body) => {
    const targetName = `shir_on_print_${Date.now()}`;
    const previewWindow =
      typeof window !== 'undefined'
        ? window.open('', targetName)
        : null;

    if (!previewWindow) {
      throw new Error('Popup blocked. Please allow a new tab for printing.');
    }

    previewWindow.document.open();
    previewWindow.document.write(
      '<!doctype html><html><head><title>Preparing PDF...</title></head><body style="font-family: sans-serif; padding: 24px;">Preparing PDF...</body></html>'
    );
    previewWindow.document.close();

    const form = document.createElement('form');
    form.method = 'POST';
    form.action = `${BASE}/print/pdf`;
    form.target = targetName;
    form.style.display = 'none';

    const payload = document.createElement('input');
    payload.type = 'hidden';
    payload.name = 'payload';
    payload.value = JSON.stringify(body || {});
    form.appendChild(payload);

    document.body.appendChild(form);

    try {
      form.submit();
      return { ok: true };
    } finally {
      document.body.removeChild(form);
    }
  },
};

export { BASE };
