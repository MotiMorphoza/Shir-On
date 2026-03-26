import axios from 'axios';
import { BaseLyricsProvider } from './base.js';
import { normalize, similarity } from '../../utils/normalize.js';

const BASE_URL = 'https://www.nli.org.il';
const SEARCH_URL = `${BASE_URL}/he/search`;

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
  if (!href) return '';
  if (/^https?:\/\//i.test(href)) return href;
  return `${BASE_URL}${href}`;
}

function extractCandidates(html) {
  const results = [];
  const regex = /<a[^>]+href="([^"]*\/items\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;

  let match;
  while ((match = regex.exec(html))) {
    const href = match[1];
    const label = stripHtml(match[2]);

    if (!label) continue;

    results.push({
      url: buildAbsoluteUrl(href),
      label,
    });
  }

  return results;
}

function scoreCandidate(label, title, artist) {
  const safeLabel = normalize(label);
  const safeTitle = normalize(title);
  const safeArtist = normalize(artist);

  const titleScore = similarity(safeLabel, safeTitle);
  const titleArtistScore = safeArtist
    ? similarity(safeLabel, `${safeTitle} ${safeArtist}`.trim())
    : 0;

  let score = Math.max(titleScore, titleArtistScore);

  if (safeTitle && safeLabel.includes(safeTitle)) {
    score = Math.max(score, 0.8);
  }

  return Math.min(0.95, score);
}

function extractLyricsFromItemPage(html) {
  const text = stripHtml(html);

  const idx = text.indexOf('מילות השיר');
  if (idx === -1) return null;

  let block = text.slice(idx + 'מילות השיר'.length);

  block = block.split(/זכויות יוצרים|פריטים דומים|מידע נוסף|להאזנה|תווים|ביבליוגרפיה/i)[0];
  block = block.trim();

  if (block.length < 40) return null;

  const lines = block
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

  if (lines.length < 2) return null;

  return lines.join('\n').trim();
}

async function runSearch(query) {
  const response = await axios.get(SEARCH_URL, {
    params: { query },
    timeout: 12000,
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Accept-Language': 'he,en;q=0.9',
    },
  });

  const html = String(response.data || '');
  if (!html) return [];

  return extractCandidates(html);
}

export class NliProvider extends BaseLyricsProvider {
  get name() {
    return 'nli';
  }

  async fetch(title, artist) {
    const safeTitle = String(title || '').trim();
    const safeArtist = String(artist || '').trim();

    if (!safeTitle) return null;

    try {
      const queryVariants = [
        [safeTitle, safeArtist].filter(Boolean).join(' '),
        safeTitle,
      ].filter(Boolean);

      const allCandidates = [];

      for (const query of queryVariants) {
        const results = await runSearch(query);
        for (const entry of results) {
          allCandidates.push({
            ...entry,
            score: scoreCandidate(entry.label, safeTitle, safeArtist),
          });
        }
      }

      const deduped = [];
      const seen = new Set();

      for (const candidate of allCandidates.sort((a, b) => b.score - a.score)) {
        const key = candidate.url;
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(candidate);
      }

      console.log('[nli] title=', safeTitle);
      console.log('[nli] artist=', safeArtist);
      console.log('[nli] candidates=', deduped.length);
      console.log(
        '[nli] top candidates=',
        deduped.slice(0, 5).map((c) => ({
          label: c.label,
          score: c.score,
          url: c.url,
        }))
      );

      for (const candidate of deduped.slice(0, 5)) {
        try {
          const res = await axios.get(candidate.url, {
            timeout: 12000,
            headers: {
              'User-Agent': 'Mozilla/5.0',
              'Accept-Language': 'he,en;q=0.9',
            },
          });

          const lyrics = extractLyricsFromItemPage(String(res.data || ''));
          if (!lyrics) continue;

          return {
            lyrics_text: lyrics,
            source: this.name,
            confidence_score: Math.min(0.9, candidate.score),
          };
        } catch (err) {
          console.log('[nli] candidate failed:', candidate.url, err?.message || err);
        }
      }

      return null;
    } catch (err) {
      const message = err?.message || 'NLI provider failed';
      console.error('[nli] fetch failed:', message);
      throw new Error(message);
    }
  }
}
