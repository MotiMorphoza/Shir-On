import axios from 'axios';
import { BaseLyricsProvider } from './base.js';
import { similarity } from '../../utils/normalize.js';

const BASE_URL = 'https://www.letras.com';
const REQUEST_HEADERS = {
  'User-Agent': 'Mozilla/5.0',
  'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
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
      urls.push(`${BASE_URL}/${artistSlug}/${titleSlug}/`);
    }
  }

  return unique(urls);
}

function stripHtml(html) {
  return decodeHtmlEntities(
    String(html || '')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function extractLyricsFromPage(html = '') {
  const match = String(html || '').match(
    /class="[^"]*lyric-original[^"]*"[^>]*>([\s\S]*?)<\/div>/i
  );

  if (!match?.[1]) {
    return '';
  }

  return stripHtml(match[1]);
}

function extractMeta(html = '') {
  const titleMatch = String(html || '').match(/<title>(.*?)<\/title>/i);
  const titleValue = decodeHtmlEntities(titleMatch?.[1] || '')
    .replace(/\s*-\s*LETRAS\.COM\s*$/i, '')
    .trim();

  const artistMatch = String(html || '').match(
    /"byArtist":\s*\{\s*"@type":"MusicGroup","name":"([^"]+)"/i
  );

  return {
    title: titleValue.split(/\s+-\s+/)[0]?.trim() || '',
    artist: decodeHtmlEntities(artistMatch?.[1] || ''),
  };
}

function scorePage(meta, requestedTitle, requestedArtist) {
  const titleScore = similarity(requestedTitle, meta?.title || '');
  const artistScore = similarity(requestedArtist, meta?.artist || '');
  return (titleScore + artistScore) / 2;
}

async function fetchPage(url) {
  const response = await axios.get(url, {
    timeout: 12000,
    headers: REQUEST_HEADERS,
    validateStatus: (status) => status >= 200 && status < 500,
  });

  if (response.status >= 400) {
    throw new Error(`Letras returned ${response.status}`);
  }

  return String(response.data || '');
}

export class LetrasProvider extends BaseLyricsProvider {
  get name() {
    return 'letras.com';
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
        const lyrics = extractLyricsFromPage(html);
        if (!lyrics || lyrics.length < 40) {
          continue;
        }

        const meta = extractMeta(html);
        const score = scorePage(meta, safeTitle, safeArtist);
        if (score < 0.45) {
          continue;
        }

        return {
          lyrics_text: lyrics,
          source: this.name,
          confidence_score: Math.min(0.9, score),
        };
      } catch (error) {
        lastError = error;
      }
    }

    if (lastError) {
      throw new Error(lastError.message || 'Letras provider failed');
    }

    return null;
  }
}
