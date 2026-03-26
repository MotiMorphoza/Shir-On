import {
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
  existsSync,
} from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPORTS_DIR = join(__dirname, '../../data/reports');
export const LEGACY_REPORTS_DIR = join(REPORTS_DIR, 'legacy');
const REPORT_VERSION = 2;

mkdirSync(REPORTS_DIR, { recursive: true });

function safeId(prefix = '') {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}${Date.now()}-${rand}`;
}

function reportPath(id) {
  return join(REPORTS_DIR, `${id}.json`);
}

function safeReadJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function numberOrZero(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function average(numbers) {
  const safe = numbers.filter((value) => Number.isFinite(value));

  if (safe.length === 0) {
    return 0;
  }

  return Math.round(safe.reduce((sum, value) => sum + value, 0) / safe.length);
}

function providerDistribution(entries) {
  const distribution = {};

  for (const entry of entries) {
    const key = entry.provider_used || entry.provider || '';
    if (!key) {
      continue;
    }

    distribution[key] = numberOrZero(distribution[key]) + 1;
  }

  return distribution;
}

function incrementCounter(target, key, amount = 1) {
  target[key] = numberOrZero(target[key]) + amount;
}

function ensureProviderStatsRow(stats, provider) {
  if (!stats[provider]) {
    stats[provider] = {
      provider,
      attempts: 0,
      successes: 0,
      wins: 0,
      errors: 0,
      no_result: 0,
      total_duration_ms: 0,
      failure_reasons: {},
    };
  }

  return stats[provider];
}

function finalizeProviderStats(stats) {
  return Object.values(stats)
    .map((row) => ({
      provider: row.provider,
      attempts: row.attempts,
      successes: row.successes,
      wins: row.wins,
      errors: row.errors,
      no_result: row.no_result,
      success_rate: row.attempts > 0 ? Number((row.successes / row.attempts).toFixed(3)) : 0,
      avg_duration_ms: row.attempts > 0 ? Math.round(row.total_duration_ms / row.attempts) : 0,
      failure_reasons: row.failure_reasons,
    }))
    .sort((a, b) => {
      if (b.wins !== a.wins) {
        return b.wins - a.wins;
      }

      if (b.success_rate !== a.success_rate) {
        return b.success_rate - a.success_rate;
      }

      if (b.attempts !== a.attempts) {
        return b.attempts - a.attempts;
      }

      return a.avg_duration_ms - b.avg_duration_ms;
    });
}

export function analyzeProviderStatsForEntries(entries = []) {
  const stats = {};

  for (const entry of entries) {
    const attempts = Array.isArray(entry?.attempts) ? entry.attempts : [];
    const winner = entry?.provider_used || '';
    let sawProviderAttempt = false;
    let winnerRecordedAsSuccess = false;

    for (const attempt of attempts) {
      const provider = attempt?.provider || '';
      if (!provider || provider.startsWith('query:')) {
        continue;
      }

      sawProviderAttempt = true;
      const row = ensureProviderStatsRow(stats, provider);
      row.attempts += 1;
      row.total_duration_ms += numberOrZero(attempt.duration_ms);

      if (attempt.status === 'ok') {
        row.successes += 1;
        if (winner && winner === provider) {
          winnerRecordedAsSuccess = true;
        }
      } else if (attempt.status === 'error') {
        row.errors += 1;
        incrementCounter(row.failure_reasons, attempt.error || 'error');
      } else {
        row.no_result += 1;
        incrementCounter(row.failure_reasons, attempt.status || 'no_result');
      }
    }

    if (winner) {
      const row = ensureProviderStatsRow(stats, winner);
      row.wins += 1;

      // Older migrated reports may know the winning provider but not expose a successful
      // attempt entry. Add a synthetic success so all-time stats stay historically accurate.
      if (entry.result === 'success' && (!sawProviderAttempt || !winnerRecordedAsSuccess)) {
        row.attempts += 1;
        row.successes += 1;
        row.total_duration_ms += numberOrZero(entry.duration_ms);
      }
    }
  }

  return finalizeProviderStats(stats);
}

function normalizeEntry(raw = {}) {
  const rawResult = raw.result || raw.action || 'unknown';
  const failureReason = raw.failure_reason || raw.reason || raw.error || '';
  const normalizedImportResult =
    rawResult === 'skipped' &&
    (failureReason === 'existing_spotify_id' || failureReason === 'existing_title_artist')
      ? 'linked_existing'
      : rawResult;

  return {
    song_id: raw.song_id || raw.source_id || null,
    original_title: raw.original_title || raw.title || '',
    original_artist: raw.original_artist || raw.artist || '',
    normalized_title: raw.normalized_title || '',
    normalized_artist: raw.normalized_artist || '',
    matched_existing: Boolean(
      raw.matched_existing ||
        raw.matched_existing_id ||
        raw.matched_song_id
    ),
    matched_existing_id:
      raw.matched_existing_id || raw.matched_song_id || null,
    query_variants: Array.isArray(raw.query_variants) ? raw.query_variants : [],
    provider_plan: Array.isArray(raw.provider_plan)
      ? raw.provider_plan
      : typeof raw.provider_plan === 'string' && raw.provider_plan.trim()
        ? raw.provider_plan.split(',').map((value) => value.trim()).filter(Boolean)
        : [],
    provider_used: raw.provider_used || raw.provider || '',
    result: normalizedImportResult,
    failure_reason: failureReason,
    duration_ms: numberOrZero(raw.duration_ms),
    confidence_score:
      raw.confidence_score === null || raw.confidence_score === undefined
        ? null
        : Number(raw.confidence_score),
    attempts: Array.isArray(raw.attempts) ? raw.attempts : [],
    meta: raw.meta && typeof raw.meta === 'object' ? raw.meta : {},
  };
}

function buildLyricsSummary(entries) {
  const total = entries.length;
  const succeeded = entries.filter((entry) => entry.result === 'success').length;
  const failed = entries.filter((entry) => entry.result === 'fail').length;
  const skipped = entries.filter((entry) => entry.result === 'skipped').length;

  return {
    total,
    fetched: succeeded,
    failed,
    skipped,
    success_rate: total > 0 ? Number((succeeded / total).toFixed(3)) : 0,
    avg_duration_ms: average(entries.map((entry) => entry.duration_ms)),
    provider_distribution: providerDistribution(entries),
  };
}

function buildImportSummary(entries) {
  const total = entries.length;
  const imported = entries.filter((entry) => entry.result === 'imported').length;
  const linked_existing = entries.filter((entry) => entry.result === 'linked_existing').length;
  const invalid = entries.filter((entry) => entry.result === 'invalid').length;
  const errors = entries.filter((entry) => entry.result === 'error').length;
  const skipped = entries.filter((entry) => entry.result === 'skipped').length;
  const blocked = invalid + errors + skipped;
  const passed = imported + linked_existing;

  return {
    found: total,
    imported,
    linked_existing,
    passed,
    blocked,
    skipped,
    invalid,
    errors,
    success_rate: total > 0 ? Number((passed / total).toFixed(3)) : 0,
    avg_duration_ms: average(entries.map((entry) => entry.duration_ms)),
    provider_distribution: providerDistribution(entries),
  };
}

function buildSummary(type, entries, summary = {}) {
  const base =
    type === 'lyrics_fetch'
      ? buildLyricsSummary(entries)
      : type === 'import'
        ? buildImportSummary(entries)
        : {
            total: entries.length,
            avg_duration_ms: average(entries.map((entry) => entry.duration_ms)),
            provider_distribution: providerDistribution(entries),
          };

  return {
    ...(summary || {}),
    ...base,
  };
}

function normalizeLegacyImportReport(report) {
  const rows = Array.isArray(report.rows) ? report.rows : [];
  const entries = rows.map((row) =>
    normalizeEntry({
      song_id: row.song_id || row.matched_song_id || null,
      original_title: row.title || '',
      original_artist: row.artist || '',
      normalized_title: row.normalized_title || '',
      normalized_artist: row.normalized_artist || '',
      matched_existing: Boolean(row.matched_song_id),
      matched_existing_id: row.matched_song_id || null,
      provider_plan: [],
      provider_used: '',
      result: row.action || 'unknown',
      failure_reason: row.reason || row.error || '',
      duration_ms: row.duration_ms || 0,
      attempts: [],
      meta: {
        album: row.album || '',
        year: row.year ?? null,
        track_number: row.track_number ?? null,
        spotify_id: row.spotify_id || null,
        spotify_url: row.spotify_url || null,
        album_spotify_id: row.album_spotify_id || null,
      },
    })
  );

  return {
    ...report,
    version: REPORT_VERSION,
    started_at: report.created_at,
    finished_at: report.created_at,
    entries,
    summary: buildSummary('import', entries, report.summary),
  };
}

function normalizeLegacyLyricsReport(report) {
  const attempts = Array.isArray(report.report?.attempts) ? report.report.attempts : [];
  const queryVariants = Array.isArray(report.report?.query_variants)
    ? report.report.query_variants
    : [];
  const winnerVariant = report.report?.winner_variant || null;
  const fetched = Boolean(report.summary?.fetched);

  const entry = normalizeEntry({
    song_id: report.source_id || null,
    original_title: report.title || '',
    original_artist: report.artist || '',
    normalized_title: report.report?.normalized_title || '',
    normalized_artist: report.report?.normalized_artist || '',
    matched_existing: false,
    matched_existing_id: null,
    query_variants: queryVariants,
    provider_plan: attempts
      .map((attempt) => attempt.provider)
      .filter(Boolean)
      .filter((value, index, all) => all.indexOf(value) === index),
    provider_used: report.summary?.provider || '',
    result: fetched ? 'success' : 'fail',
    failure_reason:
      fetched
        ? ''
        : attempts.find((attempt) => attempt.status === 'error')?.error ||
          attempts.find((attempt) => attempt.status === 'no_result')?.status ||
          'no_result',
    duration_ms: report.summary?.duration_ms || report.report?.duration_ms || 0,
    confidence_score: report.summary?.confidence_score ?? null,
    attempts,
    meta: {
      winner_variant: winnerVariant,
    },
  });

  return {
    ...report,
    version: REPORT_VERSION,
    started_at: report.created_at,
    finished_at: report.created_at,
    entries: [entry],
    summary: buildSummary('lyrics_fetch', [entry], report.summary),
  };
}

export function buildImportReportEntries(rows = []) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    song_id: row.song_id || row.matched_song_id || null,
    original_title: row.title || '',
    original_artist: row.artist || '',
    normalized_title: row.normalized_title || '',
    normalized_artist: row.normalized_artist || '',
    matched_existing: Boolean(row.matched_song_id),
    matched_existing_id: row.matched_song_id || null,
    query_variants: [],
    provider_plan: [],
    provider_used: '',
    result: row.action || 'unknown',
    failure_reason: row.reason || row.error || '',
    duration_ms: row.duration_ms || 0,
    attempts: [],
    meta: {
      album: row.album || '',
      year: row.year ?? null,
      track_number: row.track_number ?? null,
      spotify_id: row.spotify_id || null,
      spotify_url: row.spotify_url || null,
      album_spotify_id: row.album_spotify_id || null,
      matched_title: row.matched_title || '',
      matched_artist: row.matched_artist || '',
      matched_album: row.matched_album || '',
      matched_spotify_id: row.matched_spotify_id || null,
    },
  }));
}

export function createImportBatchReport({
  subtype,
  sourceId,
  rows = [],
  found = 0,
  summary = {},
  errorsList = [],
  meta = {},
  started_at = new Date().toISOString(),
  finished_at = new Date().toISOString(),
}) {
  return createBatchReport({
    type: 'import',
    subtype,
    source_type: subtype,
    source_id: sourceId,
    started_at,
    finished_at,
    summary: {
      found: Number(found || 0),
      imported: Number(summary.imported || 0),
      linked_existing: Number(summary.linked_existing || 0),
      passed: Number(summary.passed || 0),
      blocked: Number(summary.blocked || 0),
      skipped: Number(summary.skipped || 0),
      invalid: Number(summary.invalid || 0),
      errors: Number(summary.errors || 0),
      ...summary,
    },
    entries: buildImportReportEntries(rows),
    meta: {
      ...(meta && typeof meta === 'object' ? meta : {}),
      errors_list: Array.isArray(errorsList) ? errorsList : [],
    },
  });
}

export function normalizeReport(report) {
  if (!report || typeof report !== 'object') {
    return null;
  }

  if (Number(report.version) >= REPORT_VERSION && Array.isArray(report.entries)) {
    const entries = report.entries.map((entry) => normalizeEntry(entry));
    const provider_stats_current =
      report.type === 'lyrics_fetch' ? analyzeProviderStatsForEntries(entries) : [];

    return {
      ...report,
      version: REPORT_VERSION,
      entries,
      summary: buildSummary(report.type, entries, report.summary),
      provider_stats_current,
    };
  }

  if (report.type === 'lyrics_fetch') {
    return normalizeLegacyLyricsReport(report);
  }

  if (report.type === 'import') {
    return normalizeLegacyImportReport(report);
  }

  const entries = Array.isArray(report.rows)
    ? report.rows.map((row) => normalizeEntry(row))
    : [];

  return {
    ...report,
    version: REPORT_VERSION,
    started_at: report.created_at,
    finished_at: report.created_at,
    entries,
    summary: buildSummary(report.type, entries, report.summary),
    provider_stats_current:
      report.type === 'lyrics_fetch' ? analyzeProviderStatsForEntries(entries) : [],
  };
}

export function createBatchReport({
  type,
  subtype = '',
  source_type = '',
  source_id = '',
  started_at = new Date().toISOString(),
  finished_at = new Date().toISOString(),
  title = '',
  artist = '',
  label = '',
  summary = {},
  entries = [],
  meta = {},
}) {
  const id = safeId();
  const normalizedEntries = (Array.isArray(entries) ? entries : []).map((entry) =>
    normalizeEntry(entry)
  );

  const payload = {
    id,
    version: REPORT_VERSION,
    created_at: finished_at || new Date().toISOString(),
    started_at,
    finished_at,
    type,
    subtype,
    source_type,
    source_id,
    title,
    artist,
    label,
    summary: buildSummary(type, normalizedEntries, summary),
    entries: normalizedEntries,
    meta: meta && typeof meta === 'object' ? meta : {},
  };

  writeFileSync(reportPath(id), JSON.stringify(payload, null, 2), 'utf8');
  return payload;
}

export function saveReport(report) {
  return createBatchReport(report);
}

export function getReport(id) {
  const path = reportPath(id);
  if (!existsSync(path)) {
    return null;
  }

  return normalizeReport(safeReadJson(path));
}

export function listReports({ type, limit = 100 } = {}) {
  const files = readdirSync(REPORTS_DIR)
    .filter((name) => name.endsWith('.json'))
    .map((name) => join(REPORTS_DIR, name));

  return files
    .map((path) => normalizeReport(safeReadJson(path)))
    .filter(Boolean)
    .filter((report) => !type || report.type === type)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, Math.max(1, Math.min(500, Number(limit) || 100)))
    .map((report) => ({
      id: report.id,
      version: report.version || REPORT_VERSION,
      type: report.type || 'unknown',
      subtype: report.subtype || '',
      source_type: report.source_type || '',
      source_id: report.source_id || '',
      created_at: report.created_at,
      started_at: report.started_at || report.created_at,
      finished_at: report.finished_at || report.created_at,
      summary: report.summary || {},
      title: report.title || '',
      artist: report.artist || '',
      label: report.label || '',
      entries_count: Array.isArray(report.entries) ? report.entries.length : 0,
    }));
}

export function getAllReports({ type } = {}) {
  const files = readdirSync(REPORTS_DIR)
    .filter((name) => name.endsWith('.json'))
    .map((name) => join(REPORTS_DIR, name));

  return files
    .map((path) => normalizeReport(safeReadJson(path)))
    .filter(Boolean)
    .filter((report) => !type || report.type === type)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}

export function analyzeLyricsProviderPerformance() {
  const reports = getAllReports({ type: 'lyrics_fetch' });
  const entries = reports.flatMap((report) => report.entries || []);
  return analyzeProviderStatsForEntries(entries);
}

export function resetReports({ includeLegacy = true } = {}) {
  const activeFiles = readdirSync(REPORTS_DIR)
    .filter((name) => name.endsWith('.json'))
    .map((name) => join(REPORTS_DIR, name));

  let removedLegacy = 0;
  const legacyFiles =
    includeLegacy && existsSync(LEGACY_REPORTS_DIR)
      ? readdirSync(LEGACY_REPORTS_DIR)
          .filter((name) => name.endsWith('.json'))
          .map((name) => join(LEGACY_REPORTS_DIR, name))
      : [];

  for (const path of activeFiles) {
    unlinkSync(path);
  }

  for (const path of legacyFiles) {
    unlinkSync(path);
    removedLegacy += 1;
  }

  return {
    removed_active: activeFiles.length,
    removed_legacy: removedLegacy,
  };
}

export function moveReportToLegacy(id) {
  const from = reportPath(id);

  if (!existsSync(from)) {
    return false;
  }

  mkdirSync(LEGACY_REPORTS_DIR, { recursive: true });
  renameSync(from, join(LEGACY_REPORTS_DIR, `${id}.json`));
  return true;
}
