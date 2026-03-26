import { Router } from 'express';
import multer from 'multer';
import { importFromJSON } from '../services/importService.js';
import { createImportBatchReport } from '../services/reportService.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

function normalizeRecord(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  const artist = typeof raw.artist === 'string' ? raw.artist.trim() : '';
  const album = typeof raw.album === 'string' ? raw.album.trim() : '';

  let year = null;
  if (raw.year !== undefined && raw.year !== null && raw.year !== '') {
    const parsedYear = Number(raw.year);
    if (Number.isFinite(parsedYear)) {
      year = parsedYear;
    }
  }

  const language =
    typeof raw.language === 'string' && raw.language.trim()
      ? raw.language.trim()
      : 'unknown';

  if (!title || !artist) {
    return null;
  }

  return {
    ...raw,
    title,
    artist,
    album,
    year,
    language,
  };
}

function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  result.push(current);
  return result.map((value) => value.trim());
}

function parseCsv(text) {
  const lines = String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((line) => line.trim());

  if (lines.length === 0) {
    return [];
  }

  const headers = parseCsvLine(lines[0]).map((header) =>
    String(header || '').trim().toLowerCase()
  );

  const records = [];

  for (let i = 1; i < lines.length; i += 1) {
    const values = parseCsvLine(lines[i]);
    const row = {};

    headers.forEach((header, index) => {
      row[header] = values[index] ?? '';
    });

    records.push(row);
  }

  return records;
}

function persistImportReport(sourceType, sourceId, report) {
  return createImportBatchReport({
    subtype: sourceType,
    sourceId,
    rows: report.rows,
    found: report.found,
    summary: {
      found: Number(report.found || 0),
      imported: Number(report.imported || 0),
      linked_existing: Number(report.linked_existing || 0),
      passed: Number((report.imported || 0) + (report.linked_existing || 0)),
      blocked: Number(report.blocked || 0),
      skipped: Number(report.skipped || 0),
      invalid: Number(report.invalid || 0),
      errors: Number(report.errors || 0),
      ...(report.summary || {}),
    },
    errorsList: report.errors_list,
  });
}

router.post('/csv', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Missing CSV file' });
    }

    const csvText = req.file.buffer.toString('utf8');
    const parsedRows = parseCsv(csvText);
    const records = parsedRows.map((row) => normalizeRecord(row)).filter(Boolean);

    if (records.length === 0) {
      return res.status(400).json({
        error: 'No valid rows found in CSV',
      });
    }

    const report = importFromJSON(records);
    const saved = persistImportReport('csv', req.file.originalname || 'uploaded.csv', report);

    return res.json({
      source_type: 'csv',
      source_id: req.file.originalname || 'uploaded.csv',
      imported: report.imported,
      linked_existing: report.linked_existing,
      passed: report.imported + report.linked_existing,
      blocked: report.blocked,
      skipped: report.skipped,
      invalid: report.invalid,
      errors: report.errors,
      summary: report.summary,
      rows: report.rows,
      errors_list: report.errors_list,
      report,
      report_id: saved.id,
    });
  } catch (err) {
    console.error('CSV import failed:', err);
    return res.status(500).json({
      error: err?.message || 'CSV import failed',
    });
  }
});

router.post('/json', (req, res) => {
  try {
    const payload = req.body;

    if (!Array.isArray(payload)) {
      return res.status(400).json({
        error: 'JSON body must be an array of records',
      });
    }

    const records = payload.map((row) => normalizeRecord(row)).filter(Boolean);

    if (records.length === 0) {
      return res.status(400).json({
        error: 'No valid records found in JSON body',
      });
    }

    const report = importFromJSON(records);
    const saved = persistImportReport('json', 'request-body', report);

    return res.json({
      source_type: 'json',
      source_id: 'request-body',
      imported: report.imported,
      linked_existing: report.linked_existing,
      passed: report.imported + report.linked_existing,
      blocked: report.blocked,
      skipped: report.skipped,
      invalid: report.invalid,
      errors: report.errors,
      summary: report.summary,
      rows: report.rows,
      errors_list: report.errors_list,
      report,
      report_id: saved.id,
    });
  } catch (err) {
    console.error('JSON import failed:', err);
    return res.status(500).json({
      error: err?.message || 'JSON import failed',
    });
  }
});

export default router;
