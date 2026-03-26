import axios from 'axios';
import { BaseLyricsProvider } from './base.js';
import { normalize, similarity } from '../../utils/normalize.js';

const BASE_URL = 'https://www.musixmatch.com';
const REQUEST_HEADERS = {
  'User-Agent': 'Mozilla/5.0',
  'Accept-Language': 'en-US,en;q=0.9',
};

function decodeHtmlEntities(value = '') {
  return String(value || '')
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) =>
      String.fromCodePoint(parseInt(code, 16))
    )
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function slugify(value = '') {
  return String(value || '')
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function buildSlugVariants(value = '') {
  const safeValue = String(value || '').trim();
  if (!safeValue) {
    return [];
  }

  const withoutParens = safeValue.replace(/\([^)]*\)/g, ' ').replace(/\[[^\]]*\]/g, ' ').trim();
  const beforeDash = safeValue.split(/\s+-\s+/)[0].trim();

  return unique([
    slugify(safeValue),
    slugify(withoutParens),
    slugify(beforeDash),
  ]);
}

function buildCandidateUrls(title, artist) {
  const artistSlugs = buildSlugVariants(artist);
  const titleSlugs = buildSlugVariants(title);
  const urls = [];

  for (const artistSlug of artistSlugs) {
    for (const titleSlug of titleSlugs) {
      urls.push(`${BASE_URL}/lyrics/${artistSlug}/${titleSlug}`);
    }
  }

  return unique(urls);
}

function extractNextData(html = '') {
  const match = String(html || '').match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/i
  );

  if (!match?.[1]) {
    return null;
  }

  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function extractTrackInfo(nextData) {
  return nextData?.props?.pageProps?.data?.trackInfo?.data || null;
}

function cleanLyrics(text = '') {
  return decodeHtmlEntities(String(text || ''))
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function scoreTrack(trackInfo, requestedTitle, requestedArtist) {
  const titleScore = similarity(requestedTitle, trackInfo?.track?.name || '');
  const artistScore = similarity(requestedArtist, trackInfo?.track?.artistName || '');
  return (titleScore + artistScore) / 2;
}

async function fetchPage(url) {
  const response = await axios.get(url, {
    timeout: 12000,
    headers: REQUEST_HEADERS,
    validateStatus: (status) => status >= 200 && status < 500,
  });

  if (response.status >= 400) {
    throw new Error(`Musixmatch returned ${response.status}`);
  }

  return String(response.data || '');
}

export class MusixmatchProvider extends BaseLyricsProvider {
  get name() {
    return 'musixmatch';
  }

  async fetch(title, artist) {
    const safeTitle = String(title || '').trim();
    const safeArtist = String(artist || '').trim();

    if (!safeTitle || !safeArtist) {
      return null;
    }

    const candidateUrls = buildCandidateUrls(safeTitle, safeArtist);
    let lastError = null;

    for (const url of candidateUrls) {
      try {
        const html = await fetchPage(url);
        const nextData = extractNextData(html);
        const trackInfo = extractTrackInfo(nextData);
        const lyricsBody = cleanLyrics(trackInfo?.lyrics?.body || '');

        if (!lyricsBody || lyricsBody.length < 40) {
          continue;
        }

        const score = scoreTrack(trackInfo, safeTitle, safeArtist);
        if (score < 0.45) {
          continue;
        }

        return {
          lyrics_text: lyricsBody,
          source: this.name,
          confidence_score: Math.min(0.93, score),
        };
      } catch (error) {
        lastError = error;
      }
    }

    if (lastError) {
      throw new Error(lastError.message || 'Musixmatch provider failed');
    }

    return null;
  }
}
