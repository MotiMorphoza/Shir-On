import axios from 'axios';
import { BaseLyricsProvider } from './base.js';

export class LyricsOvhProvider extends BaseLyricsProvider {
  get name() {
    return 'lyrics.ovh';
  }

  async fetch(title, artist) {
    try {
      const safeTitle = String(title || '').trim();
      const safeArtist = String(artist || '').trim();

      if (!safeTitle || !safeArtist) {
        return null;
      }

      const res = await axios.get(
        `https://api.lyrics.ovh/v1/${encodeURIComponent(safeArtist)}/${encodeURIComponent(safeTitle)}`,
        { timeout: 8000 }
      );

      const text = typeof res.data?.lyrics === 'string' ? res.data.lyrics.trim() : '';
      if (!text || text.length < 20) {
        return null;
      }

      return {
        lyrics_text: text,
        source: this.name,
        confidence_score: 0.55,
      };
    } catch {
      return null;
    }
  }
}