import axios from 'axios';
import { BaseLyricsProvider } from './base.js';
import { normalize } from '../../utils/normalize.js';

const BASE_URL = 'https://sites.google.com/site/lyricsforsongs14';

function stripHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function slugifyPart(str) {
  return String(str || '')
    .trim()
    .replace(/[״"'`]/g, '')
    .replace(/\s+/g, '-');
}

function candidateUrls(title, artist) {
  const titlePart = slugifyPart(title);
  const artistPart = slugifyPart(artist);

  return [
    `${BASE_URL}/דף-הבית/${artistPart}/${titlePart}`,
    `${BASE_URL}/דף-הבית/${titlePart}`,
  ].filter(Boolean);
}

function extractLyricsFromPage(html, title, artist) {
  const text = stripHtml(html);
  const normText = normalize(text);
  const normTitle = normalize(title);
  const normArtist = normalize(artist);

  if (normTitle && !normText.includes(normTitle)) {
    return null;
  }

  if (normArtist && !normText.includes(normArtist)) {
    // לא נפסול, רק נוריד ביטחון אחר כך
  }

  let block = text;

  const idx = normTitle ? normText.indexOf(normTitle) : -1;
  if (idx >= 0) {
    block = text.slice(Math.max(0, idx));
  }

  block = block.split(/Google Sites|Report abuse|Page details|תוויות/i)[0].trim();

  const lines = block
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

  if (lines.length < 3) return null;

  return lines.join('\n');
}

export class GoogleSitesLyricsProvider extends BaseLyricsProvider {
  get name() {
    return 'google-sites';
  }

  async fetch(title, artist) {
    const safeTitle = String(title || '').trim();
    const safeArtist = String(artist || '').trim();

    if (!safeTitle) return null;

    try {
      const urls = candidateUrls(safeTitle, safeArtist);

      console.log('[google-sites] title=', safeTitle);
      console.log('[google-sites] artist=', safeArtist);
      console.log('[google-sites] candidate urls=', urls);

      for (const url of urls) {
        try {
          const res = await axios.get(url, {
            timeout: 12000,
            headers: {
              'User-Agent': 'Mozilla/5.0',
              'Accept-Language': 'he,en;q=0.9',
            },
            validateStatus: (status) => status >= 200 && status < 500,
          });

          if (res.status >= 400) continue;

          const lyrics = extractLyricsFromPage(String(res.data || ''), safeTitle, safeArtist);
          if (!lyrics) continue;

          return {
            lyrics_text: lyrics,
            source: this.name,
            confidence_score: 0.55,
          };
        } catch (err) {
          console.log('[google-sites] candidate failed:', url, err?.message || err);
        }
      }

      return null;
    } catch (err) {
      console.error('[google-sites] fetch failed:', err?.message || err);
      return null;
    }
  }
}