import axios from 'axios';
import { BaseLyricsProvider } from './base.js';
import { normalize, similarity } from '../../utils/normalize.js';

const BASE_URL = 'https://www.tab4u.com';

function stripHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/td>/gi, '\n')
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
  return `${BASE_URL}${href.startsWith('/') ? href : `/${href}`}`;
}

function extractCandidates(html) {
  const results = [];
  const regex = /<a[^>]+href="([^"]*(?:\/lyrics\/songs\/|\/tabs\/songs\/)[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;

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

function toLyricsUrl(url) {
  return String(url || '').replace('/tabs/songs/', '/lyrics/songs/');
}

function extractLyricsFromSongPage(html) {
  const patterns = [
    /<div[^>]+id="songContentTPL"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]+class="[^"]*songContentTPL[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]+class="[^"]*lyrics[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      const text = stripHtml(match[1]);
      if (text.length >= 40) {
        return text;
      }
    }
  }

  const text = stripHtml(html);
  const idx = text.indexOf('מילים לשיר');
  if (idx === -1) return null;

  let block = text.slice(idx);
  block = block.split(/אקורדים|תווים|אמנים מבצעים|שירים נוספים|Change Ton|הדפסה/i)[0];
  block = block.trim();

  if (block.length < 60) return null;
  return block;
}

async function runSearch(query) {
  const response = await axios.get(`${BASE_URL}/resultsSimple`, {
    params: {
      tab: 'songs',
      q: query,
    },
    timeout: 12000,
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Accept-Language': 'he,en;q=0.9',
      Referer: BASE_URL,
    },
    validateStatus: (status) => status >= 200 && status < 500,
  });

  if (response.status >= 400) {
    return [];
  }

  const html = String(response.data || '');
  if (!html) return [];

  return extractCandidates(html);
}

export class Tab4uProvider extends BaseLyricsProvider {
  get name() {
    return 'tab4u';
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
        const key = toLyricsUrl(candidate.url);
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push({
          ...candidate,
          url: key,
        });
      }

      console.log('[tab4u] title=', safeTitle);
      console.log('[tab4u] artist=', safeArtist);
      console.log('[tab4u] candidates=', deduped.length);
      console.log(
        '[tab4u] top candidates=',
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
              Referer: BASE_URL,
            },
            validateStatus: (status) => status >= 200 && status < 500,
          });

          if (res.status >= 400) continue;

          const lyrics = extractLyricsFromSongPage(String(res.data || ''));
          if (!lyrics) continue;

          return {
            lyrics_text: lyrics,
            source: this.name,
            confidence_score: Math.min(0.88, candidate.score),
          };
        } catch (err) {
          console.log('[tab4u] candidate failed:', candidate.url, err?.message || err);
        }
      }

      return null;
    } catch (err) {
      console.error('[tab4u] fetch failed:', err?.message || err);
      return null;
    }
  }
}