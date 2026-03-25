import axios from 'axios';
import { BaseLyricsProvider } from './base.js';
import { similarity } from '../../utils/normalize.js';

export class LrclibProvider extends BaseLyricsProvider {
  get name() {
    return 'lrclib.net';
  }

  async fetch(title, artist) {
    try {
      const safeTitle = String(title || '').trim();
      const safeArtist = String(artist || '').trim();

      if (!safeTitle || !safeArtist) {
        return null;
      }

      const res = await axios.get('https://lrclib.net/api/search', {
        params: {
          track_name: safeTitle,
          artist_name: safeArtist,
        },
        timeout: 8000,
      });

      const results = Array.isArray(res.data) ? res.data : [];
      if (results.length === 0) {
        return null;
      }

      const scored = results
        .filter((row) => typeof row?.plainLyrics === 'string' && row.plainLyrics.trim().length > 20)
        .map((row) => ({
          row,
          score:
            (similarity(safeTitle, row.trackName || '') +
              similarity(safeArtist, row.artistName || '')) / 2,
        }))
        .sort((a, b) => b.score - a.score);

      if (scored.length === 0 || scored[0].score < 0.4) {
        return null;
      }

      return {
        lyrics_text: scored[0].row.plainLyrics.trim(),
        source: this.name,
        confidence_score: scored[0].score,
      };
    } catch {
      return null;
    }
  }
}