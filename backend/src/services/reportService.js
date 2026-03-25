import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = join(__dirname, '../../data/reports');

mkdirSync(REPORTS_DIR, { recursive: true });

function safeId() {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${Date.now()}-${rand}`;
}

function reportPath(id) {
  return join(REPORTS_DIR, `${id}.json`);
}

export function saveReport(report) {
  const id = safeId();
  const payload = {
    id,
    created_at: new Date().toISOString(),
    ...report,
  };

  writeFileSync(reportPath(id), JSON.stringify(payload, null, 2), 'utf8');
  return payload;
}

export function getReport(id) {
  const path = reportPath(id);
  if (!existsSync(path)) {
    return null;
  }

  return JSON.parse(readFileSync(path, 'utf8'));
}

export function listReports({ type, limit = 100 } = {}) {
  const files = readdirSync(REPORTS_DIR)
    .filter((name) => name.endsWith('.json'))
    .map((name) => join(REPORTS_DIR, name));

  const reports = files
    .map((path) => {
      try {
        return JSON.parse(readFileSync(path, 'utf8'));
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .filter((report) => !type || report.type === type)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, Math.max(1, Math.min(500, Number(limit) || 100)))
    .map((report) => ({
      id: report.id,
      type: report.type || 'unknown',
      subtype: report.subtype || '',
      source_type: report.source_type || '',
      source_id: report.source_id || '',
      created_at: report.created_at,
      summary: report.summary || {},
      title: report.title || '',
      artist: report.artist || '',
    }));

  return reports;
}