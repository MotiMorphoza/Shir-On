import axios from 'axios';

const BASE = 'https://api.spotify.com/v1';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';

export class SpotifyProvider {
  #token = null;
  #tokenExpiry = 0;

  constructor({ clientId, clientSecret }) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  async #getToken() {
    if (this.#token && Date.now() < this.#tokenExpiry) {
      return this.#token;
    }

    if (!this.clientId || !this.clientSecret) {
      throw new Error('Spotify clientId/clientSecret are missing');
    }

    const res = await axios.post(
      TOKEN_URL,
      new URLSearchParams({ grant_type: 'client_credentials' }).toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(
            `${this.clientId}:${this.clientSecret}`
          ).toString('base64')}`,
        },
      }
    );

    this.#token = res.data.access_token;
    this.#tokenExpiry =
      Date.now() + Number(res.data.expires_in || 3600) * 1000 - 5000;

    return this.#token;
  }

  async #get(pathOrUrl, params = {}) {
    const token = await this.#getToken();

    const url = pathOrUrl.startsWith('http')
      ? pathOrUrl
      : `${BASE}${pathOrUrl}`;

    const res = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      params,
    });

    return res.data;
  }

  async getPlaylistTracks(playlistId) {
    const tracks = [];
    let url = `${BASE}/playlists/${playlistId}/tracks?limit=100`;

    while (url) {
      const data = await this.#get(url);

      if (Array.isArray(data.items)) {
        for (const item of data.items) {
          const mapped = this.#mapTrack(item?.track);
          if (mapped) {
            tracks.push(mapped);
          }
        }
      }

      url = data.next || null;
    }

    return tracks;
  }

  async getAlbumTracks(albumId) {
    const album = await this.#get(`/albums/${albumId}`);
    const items = Array.isArray(album?.tracks?.items) ? album.tracks.items : [];

    return items
      .map((track) => this.#mapTrack(track, album))
      .filter(Boolean);
  }

  async getPlaylistMeta(playlistId) {
    return this.#get(`/playlists/${playlistId}`, {
      fields: 'id,name,description,images',
    });
  }

  #mapTrack(track, albumOverride = null) {
    if (!track || typeof track !== 'object') {
      return null;
    }

    if (!track.id || !track.name || !Array.isArray(track.artists) || track.artists.length === 0) {
      return null;
    }

    const album = albumOverride || track.album || {};
    const artist = track.artists
      .map((a) => a?.name)
      .filter(Boolean)
      .join(', ')
      .trim();

    const title = String(track.name || '').trim();

    if (!title || !artist) {
      return null;
    }

    const releaseDate =
      typeof album.release_date === 'string' ? album.release_date : '';
    const yearMatch = releaseDate.match(/^(\d{4})/);
    const year = yearMatch ? Number(yearMatch[1]) : null;

    return {
      spotify_id: track.id || null,
      spotify_url: track.external_urls?.spotify || null,
      title,
      artist,
      album: album.name ? String(album.name).trim() : '',
      album_spotify_id: album.id || null,
      track_number: Number.isFinite(track.track_number)
        ? track.track_number
        : null,
      year,
      cover_url:
        Array.isArray(album.images) && album.images[0]?.url
          ? album.images[0].url
          : null,
    };
  }
}