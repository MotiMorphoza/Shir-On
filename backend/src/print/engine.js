import puppeteer from 'puppeteer';
import { sanitizeText } from '../utils/sanitize.js';

const FONT_SIZE_PRESETS = {
  small: 11,
  medium: 13,
  large: 16,
};

const LINE_HEIGHT_PRESETS = {
  tight: 1.35,
  normal: 1.65,
  loose: 1.95,
};

const MARGIN_PRESETS = {
  narrow: '10mm',
  normal: '16mm',
  wide: '22mm',
};

function isHebrewText(text) {
  return /[\u0590-\u05FF]/.test(String(text || ''));
}

function songIsHebrew(song) {
  return (
    isHebrewText(song?.title) ||
    isHebrewText(song?.artist_name) ||
    isHebrewText(song?.album_title) ||
    isHebrewText(song?.lyrics?.text)
  );
}

function sortSongsForBook(songs = []) {
  return [...songs].sort((a, b) => {
    const artistCompare = String(a?.artist_name || '').localeCompare(String(b?.artist_name || ''));

    if (artistCompare !== 0) {
      return artistCompare;
    }

    return String(a?.title || '').localeCompare(String(b?.title || ''));
  });
}

function chunk(items, size) {
  const result = [];

  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }

  return result;
}

function normalizeSongsPerPage(config = {}) {
  if (config.breakMode === 'one-per-page') {
    return 1;
  }

  const requested = Number(config.songsPerPage);

  if (!Number.isFinite(requested) || requested <= 1) {
    return 1;
  }

  return Math.min(2, Math.round(requested));
}

function normalizeLyricsColumns(config = {}) {
  if (config.layout === 'fit-one-page-two-columns' || Number(config.columns) === 2) {
    return 2;
  }

  return 1;
}

function formatLyrics(text) {
  const safe = sanitizeText(text || '');

  return safe
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p class="verse">${block.replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function songCardHtml(song, { lyricsColumns = 1 } = {}) {
  const rtl = songIsHebrew(song);
  const metaParts = [song.album_title || 'Single', song.year ? String(song.year) : ''].filter(Boolean);

  return `
    <article id="song-${sanitizeText(song.id || '')}" class="song-card ${rtl ? 'rtl' : 'ltr'}">
      <header class="song-header">
        <div class="song-header-main">
          <h2 class="song-title">${sanitizeText(song.title || '')}</h2>
          <p class="song-artist">${sanitizeText(song.artist_name || 'Unknown Artist')}</p>
          <p class="song-meta">${sanitizeText(metaParts.join(' | '))}</p>
        </div>
      </header>

      <div class="song-lyrics lyrics-columns-${lyricsColumns}">
        ${
          song?.lyrics?.text
            ? formatLyrics(song.lyrics.text)
            : '<p class="missing">Lyrics not available.</p>'
        }
      </div>
    </article>
  `;
}

function groupedTocHtml(songs) {
  const groups = new Map();

  for (const song of songs) {
    const artist = song.artist_name || 'Unknown Artist';
    if (!groups.has(artist)) {
      groups.set(artist, []);
    }

    groups.get(artist).push(song);
  }

  const sections = [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(
      ([artist, artistSongs]) => `
        <section class="toc-group">
          <h3>${sanitizeText(artist)}</h3>
          ${artistSongs
            .map(
              (song) => `
                <a class="toc-link" href="#song-${sanitizeText(song.id || '')}">
                  ${sanitizeText(song.title || '')}
                </a>
              `
            )
            .join('')}
        </section>
      `
    )
    .join('');

  return `
    <section class="front-page toc-page">
      <h1>Table of Contents</h1>
      ${sections}
    </section>
  `;
}

function bookPagesHtml(songs, { songsPerPage, lyricsColumns }) {
  const pageClass = songsPerPage === 1 ? 'page-single' : 'page-spread';

  return chunk(songs, songsPerPage)
    .map(
      (pageSongs) => `
        <section class="${pageClass}">
          ${pageSongs
            .map((song) => songCardHtml(song, { lyricsColumns }))
            .join('')}
        </section>
      `
    )
    .join('');
}

function buildHtml(inputSongs, config) {
  const songs = sortSongsForBook(inputSongs);
  const format = config.format || 'A4';
  const margin = MARGIN_PRESETS[config.margins] || MARGIN_PRESETS.normal;
  const baseFontSize = FONT_SIZE_PRESETS[config.fontSize] || FONT_SIZE_PRESETS.medium;
  const lineHeight = LINE_HEIGHT_PRESETS[config.lineSpacing] || LINE_HEIGHT_PRESETS.normal;
  const includeToc = config.includeToc !== false;
  const songsPerPage = normalizeSongsPerPage(config);
  const lyricsColumns = songsPerPage === 1 ? normalizeLyricsColumns(config) : 1;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Songbook PDF</title>
<style>
  @page {
    size: ${format};
    margin: ${margin};
  }

  * {
    box-sizing: border-box;
  }

  html, body {
    margin: 0;
    padding: 0;
    background: #fff;
    color: #111;
    font-family: "Times New Roman", Georgia, serif;
  }

  body {
    font-size: ${baseFontSize}px;
    line-height: ${lineHeight};
  }

  .book {
    width: 100%;
  }

  .front-page,
  .page-single,
  .page-spread {
    page-break-after: always;
    break-after: page;
  }

  .page-single:last-child,
  .page-spread:last-child {
    page-break-after: auto;
    break-after: auto;
  }

  .front-page h1 {
    margin: 0 0 6mm 0;
  }

  .toc-group {
    margin-bottom: 5mm;
    break-inside: avoid;
  }

  .toc-group h3 {
    margin: 0 0 2mm 0;
    font-size: 1.05em;
  }

  .toc-link {
    display: block;
    color: #222;
    text-decoration: none;
    margin: 0 0 1.5mm 0;
  }

  .page-single {
    display: grid;
    gap: 8mm;
  }

  .page-spread {
    display: grid;
    grid-template-rows: 1fr 1fr;
    gap: 8mm;
    min-height: calc(297mm - (2 * ${margin}));
  }

  .song-card {
    border: 1px solid #d5d5d5;
    border-radius: 4mm;
    padding: 5mm 6mm;
    min-height: 0;
    break-inside: avoid;
  }

  .song-header {
    margin-bottom: 4mm;
    border-bottom: 1px solid #ececec;
    padding-bottom: 3mm;
  }

  .song-header-main {
    display: grid;
    gap: 1.5mm;
  }

  .song-title {
    margin: 0;
    font-size: 1.25em;
  }

  .song-artist {
    margin: 0;
    color: #333;
    font-size: 0.98em;
    font-weight: 700;
  }

  .song-meta {
    margin: 0;
    color: #555;
    font-size: 0.9em;
  }

  .song-lyrics {
    white-space: normal;
  }

  .lyrics-columns-2 {
    column-count: 2;
    column-gap: 6mm;
  }

  .verse {
    margin: 0 0 3mm 0;
    break-inside: avoid;
  }

  .missing {
    color: #777;
    font-style: italic;
  }

  .rtl {
    direction: rtl;
    text-align: right;
  }

  .ltr {
    direction: ltr;
    text-align: left;
  }
</style>
</head>
<body>
  <div class="book">
    ${includeToc ? groupedTocHtml(songs) : ''}
    ${bookPagesHtml(songs, { songsPerPage, lyricsColumns })}
  </div>
</body>
</html>`;
}

export async function generatePdf(songs, config = {}) {
  const html = buildHtml(songs, config);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    return await page.pdf({
      format: config.format || 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: false,
      margin: {
        top: '0mm',
        right: '0mm',
        bottom: '0mm',
        left: '0mm',
      },
    });
  } finally {
    await browser.close();
  }
}
