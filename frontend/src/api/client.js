const BASE = import.meta.env.VITE_API_URL?.trim() || 'http://127.0.0.1:3001/api';

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderPrintPreview(title, message, tone = 'loading') {
  const accent = tone === 'error' ? '#a53f2b' : '#2f6b5f';
  const soft = tone === 'error' ? '#f5dfd8' : '#dcebe6';
  const indicator =
    tone === 'error'
      ? `<div style="width:14px; height:14px; border-radius:999px; background:${accent}; box-shadow:0 0 0 6px ${soft};"></div>`
      : `<div style="width:24px; height:24px; border-radius:999px; border:3px solid ${soft}; border-top-color:${accent}; animation:spin 0.85s linear infinite;"></div>`;

  return `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(title)}</title>
        <style>
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        </style>
      </head>
      <body style="margin:0; min-height:100vh; font-family: Georgia, serif; background:
        radial-gradient(circle at top, #f8f0de 0%, #f4ecde 26%, #efe7da 55%, #ece6de 100%);
        color:#2f261c; display:flex; align-items:center; justify-content:center; padding:28px;">
        <div style="width:min(760px, 100%); background:rgba(255, 252, 246, 0.94); border:1px solid rgba(117, 97, 71, 0.18);
          border-radius:28px; box-shadow:0 32px 70px rgba(71, 53, 31, 0.14); padding:28px 30px 32px;">
          <div style="display:flex; align-items:center; gap:14px; margin-bottom:20px;">
            ${indicator}
            <div>
              <div style="font-size:12px; letter-spacing:0.18em; text-transform:uppercase; color:#8a775d; margin-bottom:6px;">Shir-On Print</div>
              <h1 style="margin:0; font-size:28px; line-height:1.1; color:#2c241b;">${escapeHtml(title)}</h1>
            </div>
          </div>
          <p style="margin:0; line-height:1.8; font-size:17px; color:#4a4033;">${escapeHtml(message)}</p>
        </div>
      </body>
    </html>`;
}

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

  startSpotifyImportJob: (spotifyInput) =>
    request('/spotify/import/background', {
      method: 'POST',
      keepalive: true,
      body: JSON.stringify({ spotifyInput }),
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
      renderPrintPreview(
        'Preparing PDF...',
        'Building the printable songbook. This can take a little while for larger libraries.',
        'loading'
      )
    );
    previewWindow.document.close();

    try {
      const response = await fetch(`${BASE}/print/pdf`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body || {}),
      });

      if (!response.ok) {
        const errorBody = await response
          .json()
          .catch(() => ({ error: response.statusText || 'Print failed' }));
        const errorMessage = errorBody?.error || `HTTP ${response.status}`;

        previewWindow.document.open();
        previewWindow.document.write(
          renderPrintPreview('Print Failed', errorMessage, 'error')
        );
        previewWindow.document.close();

        throw new Error(errorMessage);
      }

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      previewWindow.location.replace(blobUrl);
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);

      return { ok: true };
    } catch (error) {
      if (!previewWindow.closed) {
        previewWindow.document.open();
        previewWindow.document.write(
          renderPrintPreview(
            'Print Failed',
            error?.message || 'The PDF could not be prepared.',
            'error'
          )
        );
        previewWindow.document.close();
      }

      throw error;
    }
  },
};

export { BASE };
