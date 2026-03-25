import puppeteer from 'puppeteer';
import { sanitizeText } from '../utils/sanitize.js';

/**
 * Supported config:
 * {
 *   format: 'A4' | 'A5',
 *   fontSize: 'small' | 'medium' | 'large',
 *   lineSpacing: 'tight' | 'normal' | 'loose',
 *   margins: 'narrow' | 'normal' | 'wide',
 *   cleanMode: boolean,
 *   performanceMode: boolean,
 *   includeToc: boolean,
 *   includeIndex: boolean,
 *   breakMode: 'one-per-page' | 'continuous',
 *   columns: 1 | 2,
 *   autoFontSize: boolean,
 *   titleSeparatePage: boolean
 * }
 */

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

function formatLyrics(text) {
  const safe = sanitizeText(text || '');

  return safe
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p class="verse">${block.replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function songHeaderHtml(song, rtl, cleanMode) {
  if (cleanMode) {
    return '';
  }

  return `
    <div class="song-header ${rtl ? 'rtl' : 'ltr'}">
      <h2 class="song-title">${sanitizeText(song.title || '')}</h2>
      <p class="song-meta">
        ${sanitizeText(song.artist_name || '')}${
          song.album_title ? ` · <em>${sanitizeText(song.album_title)}</em>` : ''
        }${song.year ? ` · ${sanitizeText(String(song.year))}` : ''}
      </p>
    </div>
  `;
}

function songBlockHtml(song, config) {
  const rtl = songIsHebrew(song);
  const lyrics = song?.lyrics?.text || '';

  const bodyHtml = lyrics
    ? `<div class="lyrics ${rtl ? 'rtl' : 'ltr'}">${formatLyrics(lyrics)}</div>`
    : `<p class="missing ${rtl ? 'rtl' : 'ltr'}">— lyrics not available —</p>`;

  return `
    <section class="song-page ${rtl ? 'rtl' : 'ltr'}">
      ${songHeaderHtml(song, rtl, Boolean(config.cleanMode))}
      ${bodyHtml}
    </section>
  `;
}

function tocHtml(songs) {
  const rows = songs
    .map(
      (song, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${sanitizeText(song.title || '')}</td>
          <td>${sanitizeText(song.artist_name || '')}</td>
        </tr>
      `
    )
    .join('');

  return `
    <section class="front-page toc-page">
      <h2>Table of Contents</h2>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Title</th>
            <th>Artist</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </section>
  `;
}

function indexHtml(songs) {
  const sorted = [...songs].sort((a, b) =>
    String(a.title || '').localeCompare(String(b.title || ''))
  );

  const rows = sorted
    .map(
      (song) => `
        <tr>
          <td>${sanitizeText(song.title || '')}</td>
          <td>${sanitizeText(song.artist_name || '')}</td>
        </tr>
      `
    )
    .join('');

  return `
    <section class="front-page index-page">
      <h2>Alphabetical Index</h2>
      <table>
        <thead>
          <tr>
            <th>Title</th>
            <th>Artist</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </section>
  `;
}

function buildHtml(songs, config) {
  const format = config.format || 'A4';
  const margin = MARGIN_PRESETS[config.margins] || MARGIN_PRESETS.normal;
  const baseFontSize = FONT_SIZE_PRESETS[config.fontSize] || FONT_SIZE_PRESETS.medium;
  const lineHeight = LINE_HEIGHT_PRESETS[config.lineSpacing] || LINE_HEIGHT_PRESETS.normal;
  const columns = config.performanceMode ? 1 : Math.max(1, Math.min(2, Number(config.columns) || 2));
  const autoFontSize = config.autoFontSize !== false;
  const includeToc = Boolean(config.includeToc);
  const includeIndex = Boolean(config.includeIndex);
  const pageMode = config.breakMode !== 'continuous';

  const frontMatter = [
    includeToc ? tocHtml(songs) : '',
    includeIndex ? indexHtml(songs) : '',
  ].join('\n');

  const songsHtml = songs.map((song) => songBlockHtml(song, config)).join('\n');

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
  .song-page {
    page-break-inside: avoid;
    break-inside: avoid-page;
  }

  .front-page {
    page-break-after: always;
    break-after: page;
  }

  .front-page:last-child {
    page-break-after: auto;
    break-after: auto;
  }

  .song-page {
    overflow: hidden;
    ${pageMode ? 'page-break-after: always; break-after: page;' : 'margin-bottom: 10mm;'}
  }

  .song-page:last-child {
    page-break-after: auto;
    break-after: auto;
  }

  .song-header {
    margin-bottom: 4mm;
    break-after: avoid;
    page-break-after: avoid;
  }

  .song-title {
    margin: 0 0 1.2mm 0;
    font-size: 1.25em;
    font-weight: 700;
  }

  .song-meta {
    margin: 0;
    font-size: 0.9em;
    color: #555;
  }

  .lyrics {
    column-count: ${columns};
    column-gap: 10mm;
    column-fill: auto;
    break-inside: avoid-page;
  }

  .verse {
    margin: 0 0 3mm 0;
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .missing {
    color: #888;
    font-style: italic;
    margin: 0;
  }

  .rtl {
    direction: rtl;
    text-align: right;
  }

  .ltr {
    direction: ltr;
    text-align: left;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.92em;
  }

  th, td {
    border-bottom: 1px solid #ccc;
    padding: 2.2mm 2.5mm;
    text-align: left;
    vertical-align: top;
  }

  th {
    background: #f5f5f5;
  }

  .toc-page h2,
  .index-page h2 {
    margin: 0 0 4mm 0;
  }
</style>
</head>
<body>
  <div class="book">
    ${frontMatter}
    ${songsHtml}
  </div>

  ${
    autoFontSize
      ? `
  <script>
    (function () {
      const MIN_FONT_SIZE = 8;
      const MIN_LINE_HEIGHT = 1.1;
      const SHRINK_STEP = 0.5;
      const LINE_STEP = 0.03;

      const pages = Array.from(document.querySelectorAll('.song-page'));

      function pxToNumber(value) {
        return Number(String(value || '').replace('px', '')) || 0;
      }

      function applyFit(page) {
        let loops = 0;

        while (page.scrollHeight > page.clientHeight && loops < 40) {
          const bodyStyle = window.getComputedStyle(document.body);
          const currentFontSize = pxToNumber(bodyStyle.fontSize);
          const currentLineHeightRaw = window.getComputedStyle(document.body).lineHeight;
          const currentLineHeightPx = pxToNumber(currentLineHeightRaw);
          const currentLineHeightRatio =
            currentFontSize > 0 && currentLineHeightPx > 0
              ? currentLineHeightPx / currentFontSize
              : ${lineHeight};

          if (currentFontSize <= MIN_FONT_SIZE) {
            break;
          }

          const nextFontSize = Math.max(MIN_FONT_SIZE, currentFontSize - SHRINK_STEP);
          const nextLineHeight = Math.max(MIN_LINE_HEIGHT, currentLineHeightRatio - LINE_STEP);

          document.body.style.fontSize = nextFontSize + 'px';
          document.body.style.lineHeight = String(nextLineHeight);

          loops += 1;
        }
      }

      for (const page of pages) {
        applyFit(page);
      }
    })();
  </script>
  `
      : ''
  }
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

    const pdf = await page.pdf({
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

    return pdf;
  } finally {
    await browser.close();
  }
}