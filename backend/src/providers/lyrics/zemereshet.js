import axios from 'axios';
import { BaseLyricsProvider } from './base.js';
import { normalize, similarity } from '../../utils/normalize.js';

const SONG_SEARCH_URL = 'https://www.zemereshet.co.il/m/songs.asp';
const BASE_URL = 'https://www.zemereshet.co.il';

const ARTIST_ALIASES = {
  'yehudit ravitz': 'יהודית רביץ',
  'knesiyat hasechel': 'כנסיית השכל',
  'hatikva 6': 'התקווה 6',
  'ehud banai': 'אהוד בנאי',
  mashina: 'משינה',
  'berry sakharof': 'ברי סחרוף',
  'monica sex': 'מוניקה סקס',
  'shotei hanevuah': 'שוטי הנבואה',
  'maor cohen': 'מאור כהן',
  'hemi rudner': 'חמי רודנר',
  fortisakharof: 'פורטיסחרוף',
  'rami fortis': 'רמי פורטיס',
  'yehuda poliker': 'יהודה פוליקר',
  'arik einstein': 'אריק איינשטיין',
  'shalom hanoch': 'שלום חנוך',
  'aviv geffen': 'אביב גפן',
  girafot: "ג'ירפות",
  'the witches': 'המכשפות',
  avtipus: 'אבטיפוס',
  kavaret: 'כוורת',
  kaveret: 'כוורת',
};

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
  const decodedHref = String(href).replace(/&amp;/gi, '&').trim();

  if (/^https?:\/\//i.test(decodedHref)) return decodedHref;
  if (decodedHref.startsWith('/')) return `${BASE_URL}${decodedHref}`;

  return `${BASE_URL}/m/${decodedHref.replace(/^\.?\//, '')}`;
}

function extractCandidates(html) {
  const results = [];
  const regex = /<a[^>]+href="([^"]*song\.asp\?id=\d+[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;

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

function isHebrew(text) {
  return /[\u0590-\u05FF]/.test(String(text || ''));
}

function normalizeArtistAlias(artist) {
  const key = normalize(String(artist || '').trim());
  return ARTIST_ALIASES[key] || String(artist || '').trim();
}

function titleWordCoverage(label, title) {
  const safeLabel = normalize(label);
  const words = normalize(title)
    .split(' ')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((w) => w.length >= 2);

  if (!words.length) return 0;

  let hit = 0;
  for (const word of words) {
    if (safeLabel.includes(word)) {
      hit += 1;
    }
  }

  return hit / words.length;
}

function artistWordCoverage(label, artist) {
  const safeLabel = normalize(label);
  const words = normalize(artist)
    .split(' ')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((w) => w.length >= 2);

  if (!words.length) return 0;

  let hit = 0;
  for (const word of words) {
    if (safeLabel.includes(word)) {
      hit += 1;
    }
  }

  return hit / words.length;
}

function scoreCandidate(label, title, artist) {
  const safeLabel = normalize(label);
  const safeTitle = normalize(title);
  const safeArtist = normalize(artist);

  const byTitle = similarity(safeLabel, safeTitle);
  const byTitleArtist = safeArtist
    ? similarity(safeLabel, `${safeTitle} ${safeArtist}`.trim())
    : 0;

  const titleCoverage = titleWordCoverage(label, title);
  const artistCoverage = safeArtist ? artistWordCoverage(label, artist) : 0;

  let score = Math.max(byTitle, byTitleArtist);

  if (titleCoverage > 0) {
    score = Math.max(score, 0.35 + titleCoverage * 0.55);
  }

  if (!safeArtist) {
    return Math.min(0.95, score);
  }

  // Favor strong title matches even when the result label omits the artist.
  if (isHebrew(title) && !isHebrew(artist)) {
    if (titleCoverage >= 1) {
      score = Math.max(score, 0.78);
    } else if (titleCoverage >= 0.66) {
      score = Math.max(score, 0.64);
    } else if (titleCoverage >= 0.5) {
      score = Math.max(score, 0.52);
    }

    return Math.min(0.95, score);
  }

  if (titleCoverage >= 1 && artistCoverage === 0) {
    score = Math.max(score, 0.72);
  } else if (titleCoverage >= 0.66) {
    score = Math.max(score, 0.58);
  }

  return Math.min(0.95, score);
}

function extractLyricsFromSongPage(html) {
  const candidates = [
    /<div[^>]+id="?milim_content\d+"?[^>]*>([\s\S]*?)<\/td>/i,
    /<div[^>]+id="lyrics_div"[^>]*>[\s\S]*?<div[^>]+class="[^"]*lyrics_punctuated[^"]*"[^>]*>([\s\S]*?)<\/td>/i,
    /<div[^>]+id="songwords"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]+class="[^"]*songwords[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]+class="[^"]*lyrics[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<td[^>]+class="[^"]*songwords[^"]*"[^>]*>([\s\S]*?)<\/td>/i,
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

async function runSearch(query) {
  if (!query) return [];

  const response = await axios.post(
    SONG_SEARCH_URL,
    new URLSearchParams({ phrase: query }),
    {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  );

  const html = String(response.data || '');
  if (!html) return [];

  return extractCandidates(html);
}

export class ZemereshetProvider extends BaseLyricsProvider {
  get name() {
    return 'zemereshet';
  }

  async fetch(title, artist) {
    const safeTitle = String(title || '').trim();
    const safeArtist = String(artist || '').trim();
    const artistAlias = normalizeArtistAlias(safeArtist);

    if (!safeTitle) {
      return null;
    }

    try {
      const queryVariants = [
        safeTitle,
        [safeTitle, artistAlias].filter(Boolean).join(' '),
      ].filter(Boolean);

      const allCandidates = [];

      for (const query of queryVariants) {
        const results = await runSearch(query);

        for (const entry of results) {
          allCandidates.push({
            ...entry,
            score: scoreCandidate(entry.label, safeTitle, artistAlias),
          });
        }
      }

      const deduped = [];
      const seen = new Set();

      for (const candidate of allCandidates.sort((a, b) => b.score - a.score)) {
        const key = `${candidate.url}|${candidate.label}`;
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(candidate);
      }

      console.log('[zemereshet] title=', safeTitle);
      console.log('[zemereshet] artist=', safeArtist);
      console.log('[zemereshet] artistAlias=', artistAlias);
      console.log('[zemereshet] candidates=', deduped.length);
      console.log(
        '[zemereshet] top candidates=',
        deduped.slice(0, 5).map((c) => ({
          label: c.label,
          score: c.score,
          url: c.url,
        }))
      );

      if (deduped.length === 0) {
        return null;
      }

      const candidatesToTry = deduped.slice(0, 5);

      for (const candidate of candidatesToTry) {
        try {
          const songRes = await axios.get(candidate.url, {
            timeout: 10000,
            headers: {
              'User-Agent': 'Mozilla/5.0',
            },
          });

          const lyrics = extractLyricsFromSongPage(String(songRes.data || ''));
          if (!lyrics) {
            console.log('[zemereshet] lyrics block not found for:', candidate.url);
            continue;
          }

          return {
            lyrics_text: lyrics,
            source: this.name,
            confidence_score: Math.min(0.95, candidate.score),
          };
        } catch (err) {
          console.log('[zemereshet] candidate fetch failed:', candidate.url, err?.message || err);
        }
      }

      return null;
    } catch (err) {
      const message = err?.message || 'Zemereshet provider failed';
      console.error('[zemereshet] fetch failed:', message);
      throw new Error(message);
    }
  }
}
