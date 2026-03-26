import axios from 'axios';
import { BaseLyricsProvider } from './base.js';
import { normalize } from '../../utils/normalize.js';

const BASE_URL = 'https://sites.google.com/site/lyricsforsongs14';
const HOME_PATH = '/דף-הבית';
const HOME_URL = `${BASE_URL}${HOME_PATH}`;
const REQUEST_HEADERS = {
  'User-Agent': 'Mozilla/5.0',
  'Accept-Language': 'he,en;q=0.9',
};
const BOILERPLATE_PATTERNS = [
  /^google sites$/i,
  /^report abuse$/i,
  /^page details$/i,
  /^page updated$/i,
  /^open search bar$/i,
];

let cachedSiteIndex = {
  html: '',
  fetchedAt: 0,
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

function stripHtml(html) {
  return decodeHtmlEntities(
    String(html || '')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function absoluteSiteUrl(href = '') {
  if (!href) {
    return '';
  }

  if (href.startsWith('http://') || href.startsWith('https://')) {
    return href;
  }

  if (href.startsWith('/')) {
    return `https://sites.google.com${href}`;
  }

  return `${BASE_URL}/${href.replace(/^\/+/, '')}`;
}

function extractSiteLinks(html) {
  const matches = String(html || '').matchAll(
    /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
  );
  const links = [];

  for (const match of matches) {
    const href = absoluteSiteUrl(match[1] || '');
    const text = stripHtml(match[2] || '');

    if (!href.includes('/site/lyricsforsongs14/')) {
      continue;
    }

    if (!text || text.length < 2) {
      continue;
    }

    links.push({ href, text });
  }

  return links;
}

function extractMetaDescription(html) {
  const metaDescriptionMatch = String(html || '').match(
    /<meta\s+(?:property|itemprop)="(?:og:description|description)"\s+content="([^"]+)"/i
  );

  return stripHtml(metaDescriptionMatch?.[1] || '');
}

function scoreCandidate(link, normalizedTitle, normalizedArtist) {
  const normalizedText = normalize(link.text || '');
  const normalizedHref = normalize(decodeURIComponent(link.href || ''));

  if (!normalizedText) {
    return 0;
  }

  let score = 0;

  if (normalizedText === normalizedTitle) {
    score += 100;
  } else if (normalizedText.includes(normalizedTitle)) {
    score += 60;
  }

  if (normalizedArtist && normalizedHref.includes(normalizedArtist)) {
    score += 10;
  }

  if (/\/site\/lyricsforsongs14\/[^/]+\/[^/]+\/[^/]+$/i.test(link.href)) {
    score += 5;
  }

  return score;
}

async function fetchPage(url) {
  const response = await axios.get(encodeURI(url), {
    timeout: 12000,
    headers: REQUEST_HEADERS,
    validateStatus: (status) => status >= 200 && status < 500,
  });

  if (response.status >= 400) {
    throw new Error(`Google Sites returned ${response.status}`);
  }

  return String(response.data || '');
}

async function getSiteIndexHtml() {
  const freshForMs = 10 * 60 * 1000;
  const now = Date.now();

  if (cachedSiteIndex.html && now - cachedSiteIndex.fetchedAt < freshForMs) {
    return cachedSiteIndex.html;
  }

  const html = await fetchPage(HOME_URL);
  cachedSiteIndex = {
    html,
    fetchedAt: now,
  };
  return html;
}

async function discoverSongUrls(title, artist) {
  const normalizedTitle = normalize(title);
  const normalizedArtist = normalize(artist);
  const candidates = new Map();

  const siteIndexHtml = await getSiteIndexHtml();
  const links = extractSiteLinks(siteIndexHtml);

  for (const link of links) {
    const score = scoreCandidate(link, normalizedTitle, normalizedArtist);
    if (score <= 0) {
      continue;
    }

    const current = candidates.get(link.href);
    if (!current || score > current.score) {
      candidates.set(link.href, {
        href: link.href,
        score,
      });
    }
  }

  return [...candidates.values()]
    .sort((left, right) => right.score - left.score)
    .slice(0, 20)
    .map((candidate) => candidate.href);
}

function extractLyricsFromPage(html, title, artist) {
  const normalizedTitle = normalize(title);
  const normalizedArtist = normalize(artist);

  const titleMatch = String(html || '').match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  const pageTitle = stripHtml(titleMatch?.[1] || '');
  const normalizedPageTitle = normalize(pageTitle);

  if (normalizedTitle && normalizedPageTitle && normalizedPageTitle !== normalizedTitle) {
    return null;
  }

  const metaDescription = extractMetaDescription(html);

  if (
    metaDescription &&
    normalize(metaDescription).includes(normalizedTitle) &&
    (!normalizedArtist || normalize(metaDescription).includes(normalizedArtist))
  ) {
    return metaDescription;
  }

  const contentAfterTitle = titleMatch
    ? String(html || '').slice(
        String(html || '').indexOf(titleMatch[0]) + titleMatch[0].length
      )
    : String(html || '');

  const paragraphMatches = [...contentAfterTitle.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)];
  const blocks = [];
  let currentBlock = [];

  for (const match of paragraphMatches) {
    const innerHtml = match[1] || '';

    if (/<a\b/i.test(innerHtml)) {
      if (currentBlock.length > 0) {
        blocks.push(currentBlock);
        currentBlock = [];
      }
      continue;
    }

    const line = stripHtml(innerHtml).replace(/\u00a0/g, ' ').trim();
    if (!line) {
      continue;
    }

    if (BOILERPLATE_PATTERNS.some((pattern) => pattern.test(line))) {
      continue;
    }

    if (normalize(line) === normalizedTitle) {
      continue;
    }

    currentBlock.push(line);
  }

  if (currentBlock.length > 0) {
    blocks.push(currentBlock);
  }

  const bestLines =
    blocks.find((lines) => {
      if (!normalizedArtist) {
        return false;
      }

      return (
        lines.join('\n').length >= 40 &&
        normalize(lines.join(' ')).includes(normalizedArtist)
      );
    }) ||
    blocks.find((lines) => lines.join('\n').length >= 60) ||
    [];

  if (bestLines.length === 0) {
    if (!metaDescription || !normalize(metaDescription).includes(normalizedTitle)) {
      return null;
    }

    return metaDescription;
  }

  const lyricsLines = [];

  for (const paragraph of bestLines) {
    const normalizedParagraph = normalize(paragraph);

    if (!normalizedParagraph) {
      continue;
    }

    if (
      normalizedArtist &&
      normalizedParagraph.includes(normalizedArtist) &&
      normalizedParagraph.length < 24
    ) {
      continue;
    }

    if (/^(ויקיפדיה|youtube|עוד|home)$/i.test(paragraph)) {
      continue;
    }

    lyricsLines.push(paragraph);
  }

  if (lyricsLines.length < 2) {
    if (!metaDescription || !normalize(metaDescription).includes(normalizedTitle)) {
      return null;
    }

    return metaDescription;
  }

  return lyricsLines.join('\n');
}

export class GoogleSitesLyricsProvider extends BaseLyricsProvider {
  get name() {
    return 'google-sites';
  }

  async fetch(title, artist) {
    const safeTitle = String(title || '').trim();
    const safeArtist = String(artist || '').trim();

    if (!safeTitle) {
      return null;
    }

    const candidateUrls = await discoverSongUrls(safeTitle, safeArtist);

    if (candidateUrls.length === 0) {
      return null;
    }

    let lastError = null;
    let fallbackResult = null;
    const normalizedArtist = normalize(safeArtist);

    for (const url of candidateUrls) {
      try {
        const html = await fetchPage(url);
        const lyrics = extractLyricsFromPage(html, safeTitle, safeArtist);

        if (!lyrics) {
          continue;
        }

        const result = {
          lyrics_text: lyrics,
          source: this.name,
          confidence_score: 0.58,
        };

        if (
          normalizedArtist &&
          normalize(lyrics).includes(normalizedArtist)
        ) {
          return result;
        }

        if (!fallbackResult) {
          fallbackResult = result;
        }
      } catch (error) {
        lastError = error;
      }
    }

    if (fallbackResult) {
      return fallbackResult;
    }

    if (lastError) {
      throw new Error(lastError.message || 'Google Sites provider failed');
    }

    return null;
  }
}
