import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  REPORTS_DIR,
  createBatchReport,
  moveReportToLegacy,
  normalizeReport,
} from '../backend/src/services/reportService.js';

const BUCKET_MS = 5 * 60 * 1000;

function readRootReports() {
  return readdirSync(REPORTS_DIR)
    .filter((name) => name.endsWith('.json'))
    .map((name) => {
      const path = join(REPORTS_DIR, name);

      try {
        const raw = JSON.parse(readFileSync(path, 'utf8'));
        return { raw, path };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function bucketStart(createdAt) {
  const time = new Date(createdAt || Date.now()).getTime();
  return new Date(Math.floor(time / BUCKET_MS) * BUCKET_MS).toISOString();
}

function groupLegacyReports(items) {
  const groups = new Map();

  for (const item of items) {
    const report = item.raw;

    if (Number(report.version || 0) >= 2) {
      continue;
    }

    const normalized = normalizeReport(report);
    if (!normalized) {
      continue;
    }

    const key =
      normalized.type === 'lyrics_fetch'
        ? [
            normalized.type,
            normalized.subtype || '',
            bucketStart(normalized.created_at),
          ].join('::')
        : [normalized.type, normalized.subtype || '', normalized.id].join('::');

    if (!groups.has(key)) {
      groups.set(key, {
        type: normalized.type,
        subtype:
          normalized.type === 'lyrics_fetch'
            ? 'batch_run'
            : normalized.subtype || 'batch_run',
        source_type: normalized.source_type || normalized.type,
        created_at: normalized.created_at,
        started_at: normalized.started_at || normalized.created_at,
        finished_at: normalized.finished_at || normalized.created_at,
        entries: [],
        source_ids: [],
        legacy_ids: [],
      });
    }

    const group = groups.get(key);
    group.entries.push(...(normalized.entries || []));
    group.source_ids.push(normalized.source_id || normalized.id);
    group.legacy_ids.push(normalized.id);

    if (String(normalized.created_at) < String(group.created_at)) {
      group.created_at = normalized.created_at;
      group.started_at = normalized.started_at || normalized.created_at;
    }

    if (String(normalized.created_at) > String(group.finished_at)) {
      group.finished_at = normalized.finished_at || normalized.created_at;
    }
  }

  return [...groups.values()];
}

function migrate() {
  const items = readRootReports();
  const groups = groupLegacyReports(items);

  let created = 0;
  let moved = 0;

  for (const group of groups) {
    if (group.legacy_ids.length === 0) {
      continue;
    }

    createBatchReport({
      type: group.type,
      subtype: group.subtype,
      source_type: group.source_type,
      source_id: group.source_ids.join(','),
      started_at: group.started_at,
      finished_at: group.finished_at,
      label: `Migrated ${group.type} batch`,
      entries: group.entries,
      meta: {
        migrated_from: group.legacy_ids,
      },
    });
    created += 1;

    for (const id of group.legacy_ids) {
      if (moveReportToLegacy(id)) {
        moved += 1;
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        groups_created: created,
        legacy_reports_moved: moved,
      },
      null,
      2
    )
  );
}

migrate();
