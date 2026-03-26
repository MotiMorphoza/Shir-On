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
  narrow: '7mm',
  normal: '10mm',
  wide: '14mm',
};

const PAGE_SIZE_PRESETS = {
  A4: { width: '210mm', height: '297mm' },
  Letter: { width: '216mm', height: '279mm' },
};

const FONT_VARIANTS = [
  { className: 'font-regular' },
  { className: 'font-compact-1' },
  { className: 'font-compact-2' },
  { className: 'font-compact-3' },
  { className: 'font-compact-4' },
  { className: 'font-compact-5' },
  { className: 'font-compact-6' },
  { className: 'font-compact-7' },
  { className: 'font-compact-8' },
];

function isHebrewText(text) {
  return /[\u0590-\u05FF]/.test(String(text || ''));
}

function songIsHebrew(song) {
  return (
    isHebrewText(song?.lyrics?.text) ||
    isHebrewText(song?.title)
  );
}

function textDirectionClass(text) {
  return isHebrewText(text) ? 'rtl' : 'ltr';
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

function buildLyricsTokens(text) {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line, index, lines) => {
      const empty = line.trim() === '';
      const previousEmpty = index > 0 ? lines[index - 1].trim() === '' : false;

      if (empty && previousEmpty) {
        return null;
      }

      return empty ? { type: 'spacer' } : { type: 'line', text: String(line) };
    })
    .filter(Boolean);
}

function normalizeTokens(tokens) {
  return tokens.length ? tokens : [{ type: 'missing', text: 'Lyrics not available.' }];
}

function prepareSongs(inputSongs) {
  return sortSongsForBook(inputSongs).map((song) => ({
    id: song.id,
    title: String(song?.title || ''),
    artist_name: String(song?.artist_name || 'Unknown Artist'),
    album_title: String(song?.album_title || ''),
    year: song?.year ? String(song.year) : '',
    isHebrew: songIsHebrew(song),
    tokens: normalizeTokens(buildLyricsTokens(song?.lyrics?.text || '')),
  }));
}

function getPageMetrics(config = {}) {
  const format = PAGE_SIZE_PRESETS[config.format] ? config.format : 'A4';

  return {
    format,
    pageSize: PAGE_SIZE_PRESETS[format],
    margin: MARGIN_PRESETS[config.margins] || MARGIN_PRESETS.normal,
    baseFontSize: FONT_SIZE_PRESETS[config.fontSize] || FONT_SIZE_PRESETS.medium,
    lineHeight: LINE_HEIGHT_PRESETS[config.lineSpacing] || LINE_HEIGHT_PRESETS.normal,
    includeToc: config.includeToc !== false,
    songsPerPage: Number(config.songsPerPage) === 1 ? 1 : 2,
  };
}

function buildStyles(metrics) {
  return `
    :root {
      --page-width: ${metrics.pageSize.width};
      --page-height: ${metrics.pageSize.height};
      --page-margin: ${metrics.margin};
      --content-width: calc(var(--page-width) - (2 * var(--page-margin)));
      --content-height: calc(var(--page-height) - (2 * var(--page-margin)));
      --footer-height: 2.8mm;
      --body-height: calc(var(--content-height) - var(--footer-height));
      --column-gap: 5.5mm;
      --column-width: calc((var(--content-width) - var(--column-gap)) / 2);
      --card-padding-y: 2.2mm;
      --card-padding-x: 3.2mm;
    }

    @page {
      size: ${metrics.format};
      margin: var(--page-margin);
    }

    * {
      box-sizing: border-box;
    }

    html,
    body {
      margin: 0;
      padding: 0;
      background: #fff;
      color: #111;
      font-family: "Times New Roman", Georgia, serif;
    }

    body {
      font-size: ${metrics.baseFontSize}px;
      line-height: ${metrics.lineHeight};
    }

    a {
      color: inherit;
      text-decoration: none;
    }

    .book {
      width: var(--content-width);
    }

    .book-page {
      position: relative;
      width: var(--content-width);
      height: var(--content-height);
      overflow: hidden;
      page-break-after: always;
      break-after: page;
    }

    .book-page:last-child {
      page-break-after: auto;
      break-after: auto;
    }

    .page-body {
      height: var(--body-height);
      min-height: 0;
    }

    .two-column {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      column-gap: var(--column-gap);
      align-items: start;
      height: 100%;
      min-height: 0;
    }

    .page-column,
    .flow-column,
    .toc-column {
      min-width: 0;
      height: 100%;
      overflow: hidden;
    }

    .page-column-right,
    .flow-column-right,
    .toc-column-right {
      grid-column: 2;
      grid-row: 1;
    }

    .page-column-left,
    .flow-column-left,
    .toc-column-left {
      grid-column: 1;
      grid-row: 1;
    }

    .toc-page-body {
      display: grid;
      grid-template-rows: auto 1fr;
      gap: 1.1mm;
    }

    .toc-page-body.continued {
      gap: 0.7mm;
    }

    .toc-page h1 {
      margin: 0;
      text-align: center;
      font-size: 1.3em;
      line-height: 1.05;
    }

    .toc-spacer {
      height: 2mm;
    }

    .toc-columns {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      column-gap: var(--column-gap);
      align-items: start;
      height: 100%;
      min-height: 0;
    }

    .toc-heading {
      margin: 0 0 0.45mm 0;
      font-size: 0.86em;
      line-height: 1.02;
      font-weight: 700;
      display: flex;
      width: 100%;
    }

    .toc-heading.rtl {
      direction: rtl;
      text-align: right;
      justify-content: flex-end;
    }

    .toc-heading.ltr {
      direction: ltr;
      text-align: left;
      justify-content: flex-start;
    }

    .toc-heading-text {
      display: inline-block;
      max-width: 100%;
    }

    .toc-row {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 2.4mm;
      margin: 0 0 0.28mm 0;
      font-size: 0.8em;
      line-height: 1.03;
    }

    .toc-text {
      flex: 1 1 auto;
      min-width: 0;
    }

    .toc-page-number {
      flex: 0 0 auto;
      min-width: 6mm;
      text-align: center;
      font-variant-numeric: tabular-nums;
    }

    .page-spread,
    .song-flow-page {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      column-gap: var(--column-gap);
      align-items: start;
      height: 100%;
      min-height: 0;
    }

    .song-card {
      border: 1px solid #d9d9d9;
      border-radius: 2.2mm;
      padding: var(--card-padding-y) var(--card-padding-x);
      background: #fff;
      min-width: 0;
    }

    .flow-pane {
      padding: 0 0.45mm;
      min-width: 0;
    }

    .song-header {
      margin: 0 0 1mm 0;
      padding-bottom: 0.85mm;
      border-bottom: 1px solid #ececec;
    }

    .song-header-main {
      display: grid;
      gap: 0.35mm;
    }

    .song-title {
      margin: 0;
      font-size: 1.08em;
      line-height: 1.1;
    }

    .song-artist {
      margin: 0;
      font-size: 0.9em;
      line-height: 1.05;
      color: #333;
      font-weight: 700;
    }

    .song-meta {
      margin: 0;
      font-size: 0.78em;
      line-height: 1.05;
      color: #555;
    }

    .song-lyrics {
      white-space: normal;
    }

    .song-card .song-lyrics,
    .flow-pane .song-lyrics {
      line-height: 1.52;
    }

    .font-compact-1 .song-lyrics {
      line-height: 1.46;
    }

    .font-compact-2 .song-lyrics {
      line-height: 1.4;
    }

    .font-compact-3 .song-lyrics {
      line-height: 1.34;
    }

    .font-compact-4 .song-lyrics {
      line-height: 1.28;
    }

    .font-compact-5 .song-lyrics {
      line-height: 1.22;
    }

    .font-compact-6 .song-lyrics {
      line-height: 1.17;
    }

    .font-compact-7 .song-lyrics {
      line-height: 1.12;
    }

    .font-compact-8 .song-lyrics {
      line-height: 1.08;
    }

    .lyrics-line {
      margin: 0 0 0.45mm 0;
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .lyrics-spacer {
      height: 0.8mm;
    }

    .missing {
      margin: 0;
      color: #777;
      font-style: italic;
    }

    .page-number {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0.3mm;
      text-align: center;
      font-size: 0.66em;
      line-height: 1;
      color: #555;
      font-variant-numeric: tabular-nums;
    }

    .page-back-link {
      position: absolute;
      left: 0.8mm;
      bottom: 0.3mm;
      font-size: 0.62em;
      line-height: 1;
      color: #5f5040;
      text-decoration: underline;
    }

    .rtl {
      direction: rtl;
      text-align: right;
    }

    .ltr {
      direction: ltr;
      text-align: left;
    }

    .font-regular {
      font-size: 1em;
      line-height: inherit;
    }

    .font-compact-1 {
      font-size: 0.93em;
      line-height: 1.56;
    }

    .font-compact-2 {
      font-size: 0.87em;
      line-height: 1.49;
    }

    .font-compact-3 {
      font-size: 0.81em;
      line-height: 1.42;
    }

    .font-compact-4 {
      font-size: 0.75em;
      line-height: 1.35;
    }

    .font-compact-5 {
      font-size: 0.69em;
      line-height: 1.28;
    }

    .font-compact-6 {
      font-size: 0.63em;
      line-height: 1.22;
    }

    .font-compact-7 {
      font-size: 0.57em;
      line-height: 1.16;
    }

    .font-compact-8 {
      font-size: 0.52em;
      line-height: 1.12;
    }

    .measure-stage {
      position: fixed;
      top: 0;
      left: -1000mm;
      visibility: hidden;
      pointer-events: none;
    }

    .measure-column {
      width: var(--column-width);
      min-width: 0;
      display: flow-root;
    }
  `;
}

function renderLyricsHtml(tokens = []) {
  return tokens
    .map((token) => {
      if (token.type === 'spacer') {
        return '<div class="lyrics-spacer"></div>';
      }

      if (token.type === 'missing') {
        return `<p class="missing">${sanitizeText(token.text || 'Lyrics not available.')}</p>`;
      }

      return `<div class="lyrics-line">${sanitizeText(token.text || '') || '&nbsp;'}</div>`;
    })
    .join('');
}

function songHeaderHtml(song) {
  const meta = [song.album_title || 'Single', song.year || ''].filter(Boolean).join(' | ');
  const blockDirectionClass = song.isHebrew ? 'rtl' : 'ltr';

  return `
    <header class="song-header">
      <div class="song-header-main ${blockDirectionClass}">
        <h2 class="song-title">${sanitizeText(song.title || '')}</h2>
        <p class="song-artist">${sanitizeText(song.artist_name || 'Unknown Artist')}</p>
        <p class="song-meta">${sanitizeText(meta)}</p>
      </div>
    </header>
  `;
}

function songCardHtml(songLayout) {
  return `
    <article id="song-${sanitizeText(songLayout.song.id || '')}" class="song-card ${songLayout.song.isHebrew ? 'rtl' : 'ltr'} ${songLayout.fontClass}">
      ${songHeaderHtml(songLayout.song)}
      <div class="song-lyrics">
        ${renderLyricsHtml(songLayout.tokens)}
      </div>
    </article>
  `;
}

function flowPaneHtml(song, fontClass, tokens, includeHeader) {
  return `
    <div class="flow-pane ${song.isHebrew ? 'rtl' : 'ltr'} ${fontClass}">
      ${includeHeader ? songHeaderHtml(song) : ''}
      <div class="song-lyrics">
        ${renderLyricsHtml(tokens)}
      </div>
    </div>
  `;
}

function songFlowPageHtml(songLayout) {
  const startClass = songLayout.startColumn === 'right' ? 'right' : 'left';
  const continueClass = startClass === 'right' ? 'left' : 'right';

  return `
    <div class="page-body">
      <article id="song-${sanitizeText(songLayout.song.id || '')}" class="song-flow-page">
        <div class="flow-column flow-column-${startClass}">
          ${flowPaneHtml(songLayout.song, songLayout.fontClass, songLayout.startTokens, true)}
        </div>
        <div class="flow-column flow-column-${continueClass}">
          ${flowPaneHtml(songLayout.song, songLayout.fontClass, songLayout.continueTokens, false)}
        </div>
      </article>
    </div>
  `;
}

function pairByStart(first, second) {
  const columns = { right: null, left: null };

  if (first.startColumn === second.startColumn) {
    columns[first.startColumn] = first;
    columns[first.startColumn === 'right' ? 'left' : 'right'] = second;
    return columns;
  }

  columns[first.startColumn] = first;
  columns[second.startColumn] = second;
  return columns;
}

function paginateSongsDeterministically(songLayouts, metrics) {
  const pages = [];
  let pending = null;

  for (const layout of songLayouts) {
    if (layout.mode === 'flow') {
      pages.push({
        layout: 'single',
        song: layout,
      });
      continue;
    }

    if (metrics.songsPerPage === 2) {
      if (!pending) {
        pending = layout;
        continue;
      }

      pages.push({
        layout: 'spread',
        columns: pairByStart(pending, layout),
      });
      pending = null;
      continue;
    }

    pages.push({
      layout: 'spread',
      columns: {
        right: layout.startColumn === 'right' ? layout : null,
        left: layout.startColumn === 'left' ? layout : null,
      },
    });
  }

  if (pending) {
    pages.push({
      layout: 'spread',
      columns: {
        right: pending.startColumn === 'right' ? pending : null,
        left: pending.startColumn === 'left' ? pending : null,
      },
    });
  }

  return pages;
}

function buildSongPageNumbers(songPages, tocPagesCount) {
  const pageNumbers = new Map();

  songPages.forEach((page, index) => {
    const pageNumber = tocPagesCount + index + 1;

    if (page.layout === 'single') {
      pageNumbers.set(page.song.song.id, pageNumber);
      return;
    }

    if (page.columns.right) {
      pageNumbers.set(page.columns.right.song.id, pageNumber);
    }

    if (page.columns.left) {
      pageNumbers.set(page.columns.left.song.id, pageNumber);
    }
  });

  return pageNumbers;
}

function buildTocRows(songs, pageNumbers) {
  const artistGroups = new Map();

  for (const song of songs) {
    const artist = song.artist_name || 'Unknown Artist';

    if (!artistGroups.has(artist)) {
      artistGroups.set(artist, []);
    }

    artistGroups.get(artist).push(song);
  }

  const rows = [];

  for (const [artist, artistSongs] of [...artistGroups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    rows.push({
      type: 'heading',
      text: artist,
      direction: textDirectionClass(artist),
    });

    for (const song of artistSongs) {
      rows.push({
        type: 'song',
        id: song.id,
        title: song.title || '',
        direction: textDirectionClass(song.title),
        pageNumber: String(pageNumbers.get(song.id) || ''),
      });
    }
  }

  return rows;
}

function tocRowHtml(row) {
  if (row.type === 'heading') {
    return `<div class="toc-heading ${row.direction}"><span class="toc-heading-text">${sanitizeText(row.text)}</span></div>`;
  }

  return `
    <a class="toc-row ${row.direction}" href="#song-${sanitizeText(row.id || '')}">
      <span class="toc-text">${sanitizeText(row.title || '')}</span>
      <span class="toc-page-number">${sanitizeText(row.pageNumber || '')}</span>
    </a>
  `;
}

function groupedTocHtml(tocPages) {
  return tocPages
    .map(
      (columns, pageIndex) => `
        <section class="book-page toc-page" ${pageIndex === 0 ? 'id="songbook-toc"' : ''}>
          <div class="page-body toc-page-body ${pageIndex === 0 ? 'first' : 'continued'}">
            ${pageIndex === 0 ? '<h1>Table of Contents</h1>' : '<div class="toc-spacer"></div>'}
            <div class="toc-columns">
              <div class="toc-column toc-column-right">
                ${columns.right.map((row) => tocRowHtml(row)).join('')}
              </div>
              <div class="toc-column toc-column-left">
                ${columns.left.map((row) => tocRowHtml(row)).join('')}
              </div>
            </div>
          </div>
          <footer class="page-number">${pageIndex + 1}</footer>
        </section>
      `
    )
    .join('');
}

function bookPagesHtml(songPages, tocPagesCount) {
  return songPages
    .map((page, index) => {
      const pageNumber = tocPagesCount + index + 1;
      const backToTocLink =
        tocPagesCount > 0
          ? '<a class="page-back-link" href="#songbook-toc">Back to Contents</a>'
          : '';

      if (page.layout === 'single') {
        return `
          <section class="book-page song-book-page">
            ${songFlowPageHtml(page.song)}
            ${backToTocLink}
            <footer class="page-number">${pageNumber}</footer>
          </section>
        `;
      }

      return `
        <section class="book-page song-book-page">
          <div class="page-body page-spread">
            <div class="page-column page-column-right">
              ${page.columns.right ? songCardHtml(page.columns.right) : ''}
            </div>
            <div class="page-column page-column-left">
              ${page.columns.left ? songCardHtml(page.columns.left) : ''}
            </div>
          </div>
          ${backToTocLink}
          <footer class="page-number">${pageNumber}</footer>
        </section>
      `;
    })
    .join('');
}

function buildMeasurementHtml(metrics) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Songbook Measurement</title>
  <style>${buildStyles(metrics)}</style>
</head>
<body>
  <div class="measure-stage">
    <section class="book-page song-book-page">
      <div id="probe-page-body" class="page-body page-spread">
        <div id="probe-column" class="page-column page-column-right"></div>
        <div class="page-column page-column-left"></div>
      </div>
      <footer class="page-number">1</footer>
    </section>
    <section class="book-page toc-page">
      <div class="page-body toc-page-body first">
        <h1>Table of Contents</h1>
        <div class="toc-columns">
          <div id="probe-toc-first-column" class="toc-column toc-column-right"></div>
          <div class="toc-column toc-column-left"></div>
        </div>
      </div>
      <footer class="page-number">1</footer>
    </section>
    <section class="book-page toc-page">
      <div class="page-body toc-page-body continued">
        <div class="toc-spacer"></div>
        <div class="toc-columns">
          <div id="probe-toc-continued-column" class="toc-column toc-column-right"></div>
          <div class="toc-column toc-column-left"></div>
        </div>
      </div>
      <footer class="page-number">2</footer>
    </section>
    <div id="measure-sandbox" class="measure-column"></div>
  </div>
</body>
</html>`;
}

async function measurePageMetrics(page, metrics) {
  const values = await page.evaluate(() => {
    const body = document.getElementById('probe-page-body');
    const column = document.getElementById('probe-column');
    const tocFirst = document.getElementById('probe-toc-first-column');
    const tocContinued = document.getElementById('probe-toc-continued-column');

    return {
      bodyHeightPx: body ? Math.floor(body.clientHeight) : 0,
      columnWidthPx: column ? Math.floor(column.clientWidth) : 0,
      tocFirstColumnHeightPx: tocFirst ? Math.floor(tocFirst.clientHeight) : 0,
      tocContinuedColumnHeightPx: tocContinued ? Math.floor(tocContinued.clientHeight) : 0,
    };
  });

  if (!values.bodyHeightPx || !values.columnWidthPx || !values.tocFirstColumnHeightPx || !values.tocContinuedColumnHeightPx) {
    throw new Error('Failed to measure print page geometry');
  }

  return Object.assign(metrics, values, { safetyPx: 2 });
}

async function measureSandboxHeight(page, html, sandboxClass = 'measure-column') {
  return page.evaluate(
    ({ html: innerHtml, sandboxClassName }) => {
      const sandbox = document.getElementById('measure-sandbox');
      sandbox.className = sandboxClassName;
      sandbox.innerHTML = innerHtml;
      const height = Math.ceil(sandbox.scrollHeight);
      sandbox.innerHTML = '';
      sandbox.className = 'measure-column';
      return height;
    },
    {
      html,
      sandboxClassName: sandboxClass,
    }
  );
}

async function measureTocRowHeights(page, tocRows) {
  const rowsHtml = tocRows.map((row) => tocRowHtml(row));
  const heights = await page.evaluate((serializedRows) => {
    const sandbox = document.getElementById('measure-sandbox');
    sandbox.className = 'measure-column';

    return serializedRows.map((html) => {
      sandbox.innerHTML = html;
      const height = Math.ceil(sandbox.scrollHeight);
      sandbox.innerHTML = '';
      return height;
    });
  }, rowsHtml);

  return tocRows.map((row, index) => ({
    ...row,
    height: heights[index],
  }));
}

function paginateTocRowsDeterministically(rows, metrics) {
  const pages = [];
  let current = { right: [], left: [] };
  let pageIndex = 0;
  let side = 'right';
  let used = 0;

  function currentLimit() {
    return (pageIndex === 0 ? metrics.tocFirstColumnHeightPx : metrics.tocContinuedColumnHeightPx) - metrics.safetyPx;
  }

  for (const row of rows) {
    const limit = currentLimit();
    const rowHeight = Math.max(1, row.height || 0);

    if (used + rowHeight > limit) {
      if (side === 'right') {
        side = 'left';
        used = 0;
      } else {
        pages.push(current);
        current = { right: [], left: [] };
        pageIndex += 1;
        side = 'right';
        used = 0;
      }
    }

    current[side].push(row);
    used += rowHeight;
  }

  if (current.right.length || current.left.length || pages.length === 0) {
    pages.push(current);
  }

  return pages;
}

async function measureCompactSong(page, song, fontClass) {
  return measureSandboxHeight(
    page,
    songCardHtml({
      song,
      tokens: song.tokens,
      fontClass,
    })
  );
}

function splitSongTokensByMeasuredHeights(tokens, heights, firstLimit, secondLimit) {
  let firstHeight = 0;
  let index = 0;

  for (; index < tokens.length; index += 1) {
    if (firstHeight + heights[index] > firstLimit) {
      break;
    }

    firstHeight += heights[index];
  }

  const startTokens = tokens.slice(0, index);
  const continueTokens = tokens.slice(index);
  const continueHeight = heights.slice(index).reduce((sum, height) => sum + height, 0);

  return {
    startTokens,
    continueTokens,
    fits: startTokens.length > 0 && continueHeight <= secondLimit,
  };
}

async function measureFlowPaneHeight(page, song, fontClass, tokens, includeHeader) {
  return measureSandboxHeight(
    page,
    flowPaneHtml(song, fontClass, tokens, includeHeader)
  );
}

async function refineFlowSplitToFit(page, song, fontClass, split, metrics) {
  const limit = Math.max(0, metrics.bodyHeightPx - metrics.safetyPx);
  const startTokens = [...split.startTokens];
  const continueTokens = [...split.continueTokens];

  while (startTokens.length > 0) {
    const startHeight = await measureFlowPaneHeight(page, song, fontClass, startTokens, true);

    if (startHeight <= limit) {
      break;
    }

    continueTokens.unshift(startTokens.pop());
  }

  const startHeight = startTokens.length
    ? await measureFlowPaneHeight(page, song, fontClass, startTokens, true)
    : Infinity;
  const continueHeight = continueTokens.length
    ? await measureFlowPaneHeight(page, song, fontClass, continueTokens, false)
    : 0;

  return {
    startTokens,
    continueTokens,
    startHeight,
    continueHeight,
    fits: startTokens.length > 0 && startHeight <= limit && continueHeight <= limit,
  };
}

async function measureFlowSong(page, song, fontClass, metrics) {
  const directionClass = song.isHebrew ? 'rtl' : 'ltr';
  const headerHtml = `
    <div class="flow-pane ${directionClass} ${fontClass}">
      ${songHeaderHtml(song)}
      <div class="song-lyrics"></div>
    </div>
  `;
  const tokenHtmls = song.tokens.map((token) => `
    <div class="flow-pane ${directionClass} ${fontClass}">
      <div class="song-lyrics">
        ${renderLyricsHtml([token])}
      </div>
    </div>
  `);

  const { headerHeight, tokenHeights } = await page.evaluate(
    ({ serializedHeaderHtml, serializedTokenHtmls }) => {
      const sandbox = document.getElementById('measure-sandbox');
      sandbox.className = 'measure-column';

      function measure(innerHtml) {
        sandbox.innerHTML = innerHtml;
        const height = Math.ceil(sandbox.scrollHeight);
        sandbox.innerHTML = '';
        return height;
      }

      return {
        headerHeight: measure(serializedHeaderHtml),
        tokenHeights: serializedTokenHtmls.map((html) => measure(html)),
      };
    },
    {
      serializedHeaderHtml: headerHtml,
      serializedTokenHtmls: tokenHtmls,
    }
  );

  const firstLimit = Math.max(0, metrics.bodyHeightPx - headerHeight - metrics.safetyPx);
  const secondLimit = Math.max(0, metrics.bodyHeightPx - metrics.safetyPx);
  const split = splitSongTokensByMeasuredHeights(song.tokens, tokenHeights, firstLimit, secondLimit);
  const refined = await refineFlowSplitToFit(page, song, fontClass, split, metrics);

  return {
    headerHeight,
    ...refined,
  };
}

async function measureAllSongs(page, songs, metrics) {
  const layouts = [];

  for (const song of songs) {
    const startColumn = song.isHebrew ? 'right' : 'left';
    let selectedLayout = null;
    let fallbackFlowLayout = null;

    for (const variant of FONT_VARIANTS) {
      const compactHeight = await measureCompactSong(page, song, variant.className);

      if (compactHeight <= metrics.bodyHeightPx - metrics.safetyPx) {
        selectedLayout = {
          mode: 'compact',
          song,
          fontClass: variant.className,
          startColumn,
          tokens: song.tokens,
        };
        break;
      }

      const flowLayout = await measureFlowSong(page, song, variant.className, metrics);
      fallbackFlowLayout = {
        mode: 'flow',
        song,
        fontClass: variant.className,
        startColumn,
        startTokens: flowLayout.startTokens,
        continueTokens: flowLayout.continueTokens,
      };

      if (flowLayout.fits) {
        selectedLayout = fallbackFlowLayout;
        break;
      }
    }

    layouts.push(
      selectedLayout ||
        fallbackFlowLayout || {
          mode: 'flow',
          song,
          fontClass: FONT_VARIANTS[FONT_VARIANTS.length - 1].className,
          startColumn,
          startTokens: song.tokens,
          continueTokens: [],
        }
    );
  }

  return layouts;
}

async function resolveTocLayout(page, songs, songPages, metrics) {
  let tocPages = [];
  let tocPageCount = 0;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const pageNumbers = buildSongPageNumbers(songPages, tocPageCount);
    const tocRows = buildTocRows(songs, pageNumbers);
    const measuredRows = await measureTocRowHeights(page, tocRows);
    const nextPages = paginateTocRowsDeterministically(measuredRows, metrics);

    tocPages = nextPages;

    if (nextPages.length === tocPageCount) {
      break;
    }

    tocPageCount = nextPages.length;
  }

  const finalPageNumbers = buildSongPageNumbers(songPages, tocPages.length);
  const finalRows = buildTocRows(songs, finalPageNumbers);
  const finalMeasuredRows = await measureTocRowHeights(page, finalRows);
  return paginateTocRowsDeterministically(finalMeasuredRows, metrics);
}

function buildHtml(songPages, tocPages, metrics) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Songbook PDF</title>
  <style>${buildStyles(metrics)}</style>
</head>
<body>
  <div class="book">
    ${metrics.includeToc ? groupedTocHtml(tocPages) : ''}
    ${bookPagesHtml(songPages, tocPages.length)}
  </div>
</body>
</html>`;
}

export async function generatePdf(inputSongs, config = {}) {
  const songs = prepareSongs(inputSongs);
  const metrics = getPageMetrics(config);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.emulateMediaType('print');
    await page.setContent(buildMeasurementHtml(metrics), { waitUntil: 'domcontentloaded' });

    await measurePageMetrics(page, metrics);

    const songLayouts = await measureAllSongs(page, songs, metrics);
    const songPages = paginateSongsDeterministically(songLayouts, metrics);
    const tocPages = metrics.includeToc ? await resolveTocLayout(page, songs, songPages, metrics) : [];

    await page.setContent(buildHtml(songPages, tocPages, metrics), { waitUntil: 'networkidle0' });

    return await page.pdf({
      format: metrics.format,
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
