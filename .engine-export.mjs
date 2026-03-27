import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sourcePath = resolve('backend/src/print/engine.js');
const tempPath = resolve('backend/src/print/.engine-export-temp.mjs');

let source = readFileSync(sourcePath, 'utf8');
source = source.replace('export async function generatePdf', 'async function generatePdf');
source += '\nexport { prepareSongs, getPageMetrics, inferTocStartColumn, measurePageMetrics, measureAllSongs, paginateSongsDeterministically, resolveTocLayout, buildSongPageNumbers, buildTocRows, buildMeasurementHtml };';

writeFileSync(tempPath, source, 'utf8');
console.log(tempPath);
