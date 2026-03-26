import axios from 'axios';
import { BaseLyricsProvider } from './base.js';
import { normalize, similarity } from '../../utils/normalize.js';

const SEARCH_URL = 'https://shironet.mako.co.il/m/search.asp';
const BASE_URL = 'https://shironet.mako.co.il';

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

function buildAbsoluteUrl(href) {
  if (!href) {
    return '';
  }

  if (/^https?:\/\//i.test(href)) {
    return href;
  }

  if (href.startsWith('/')) {
    return `${BASE_URL}${href}`;
  }

  return `${BASE_URL}/${href.replace(/^\.?\//, '')}`;
}

function extractCandidates(html) {
  const results = [];

  const patterns = [
    /<a[^>]+href="([^"]*song\.asp\?id=[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,
    /<a[^>]+href="([^"]*lyrics[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,
    /<a[^>]+href="([^"]*song[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,
  ];

  for (const regex of patterns) {
    let match;
    while ((match = regex.exec(html))) {
      const href = match[1];
      const label = stripHtml(match[2]);

      if (!href || !label) {
        continue;
      }

      results.push({
        url: buildAbsoluteUrl(href),
        label,
      });
    }

    if (results.length > 0) {
      break;
    }
  }

  return results;
}

function scoreCandidate(label, title, artist) {
  const safeLabel = normalize(label);
  const safeTitle = normalize(title);
  const safeArtist = normalize(artist);

  const titleScore = similarity(safeLabel, safeTitle);
  const titleArtistScore = similarity(
    safeLabel,
    `${safeTitle} ${safeArtist}`.trim()
  );

  return Math.max(titleScore, titleArtistScore);
}

function extractLyricsFromSongPage(html) {
  const candidates = [
    /<div[^>]+id="songwords"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]+class="[^"]*songwords[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]+class="[^"]*lyrics[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<td[^>]+class="[^"]*songwords[^"]*"[^>]*>([\s\S]*?)<\/td>/i,
    /<div[^>]+id="lyrics"[^>]*>([\s\S]*?)<\/div>/i,
    /<section[^>]+class="[^"]*lyrics[^"]*"[^>]*>([\s\S]*?)<\/section>/i,
  ];

  for (const pattern of candidates) {
    const match = html.match(pattern);
    if (match?.[1]) {
      const text = stripHtml(match[1]);
      if (text.length >= 20) {
        return text;
      }
    }
  }

  return null;
}

export class ShironetProvider extends BaseLyricsProvider {
  get name() {
    return 'shironet';
  }

  async fetch(title, artist) {
    const safeTitle = String(title || '').trim();
    const safeArtist = String(artist || '').trim();

    if (!safeTitle) {
      return null;
    }

    try {
      const searchRes = await axios.get(SEARCH_URL, {
        params: { q: safeTitle },
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0',
        },
      });

      const html = String(searchRes.data || '');
      if (!html) {
        console.log('[shironet] empty search response');
        return null;
      }

      const candidates = extractCandidates(html)
        .map((entry) => ({
          ...entry,
          score: scoreCandidate(entry.label, safeTitle, safeArtist),
        }))
        .sort((a, b) => b.score - a.score);

      console.log('[shironet] candidates found:', candidates.length);
      console.log(
        '[shironet] top candidates:',
        candidates.slice(0, 5).map((c) => ({
          label: c.label,
          url: c.url,
          score: c.score,
        }))
      );

      if (candidates.length === 0 || candidates[0].score < 0.45) {
        return null;
      }

      const songRes = await axios.get(candidates[0].url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0',
        },
      });

      const lyrics = extractLyricsFromSongPage(String(songRes.data || ''));
      if (!lyrics) {
        console.log('[shironet] lyrics block not found for:', candidates[0].url);
        return null;
      }

      return {
        lyrics_text: lyrics,
        source: this.name,
        confidence_score: Math.min(0.95, candidates[0].score),
      };
    } catch (err) {
      const message = err?.message || 'Shironet provider failed';
      console.error('[shironet] fetch failed:', message);
      throw new Error(message);
    }
  }
}
