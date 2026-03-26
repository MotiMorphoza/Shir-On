import { randomUUID } from 'crypto';

const MAX_JOBS = 40;
const jobs = new Map();

function nowIso() {
  return new Date().toISOString();
}

function clampProgress(value) {
  return Math.max(0, Number(value) || 0);
}

function isActiveJob(job) {
  return job?.status === 'queued' || job?.status === 'running';
}

function normalizeMetaValue(value) {
  if (Array.isArray(value)) {
    return [...value].map((item) => String(item || '')).sort();
  }

  if (value === undefined || value === null) {
    return '';
  }

  return String(value);
}

function sameMetaValue(left, right) {
  const a = normalizeMetaValue(left);
  const b = normalizeMetaValue(right);

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      return false;
    }

    return a.every((value, index) => value === b[index]);
  }

  return a === b;
}

function toPublicJob(job, { includeEntries = false } = {}) {
  if (!job) {
    return null;
  }

  const payload = {
    id: job.id,
    type: job.type,
    label: job.label,
    status: job.status,
    phase: job.phase || '',
    created_at: job.created_at,
    started_at: job.started_at,
    finished_at: job.finished_at,
    current_label: job.current_label || '',
    error: job.error || '',
    report_id: job.report_id || '',
    meta: job.meta || {},
    progress: {
      total: clampProgress(job.progress.total),
      completed: clampProgress(job.progress.completed),
      succeeded: clampProgress(job.progress.succeeded),
      failed: clampProgress(job.progress.failed),
      skipped: clampProgress(job.progress.skipped),
    },
    summary: job.summary || {},
  };

  if (includeEntries) {
    payload.entries = Array.isArray(job.entries) ? job.entries : [];
    payload.result = job.result || null;
  }

  return payload;
}

function trimJobs() {
  const active = [...jobs.values()].filter((job) => isActiveJob(job));
  const completed = [...jobs.values()]
    .filter((job) => !isActiveJob(job))
    .sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  const maxCompletedJobs = Math.max(0, MAX_JOBS - active.length);

  for (const job of completed.slice(maxCompletedJobs)) {
    jobs.delete(job.id);
  }

  const all = [...jobs.values()].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  for (const job of all.slice(MAX_JOBS)) {
    if (!isActiveJob(job)) {
      jobs.delete(job.id);
    }
  }
}

export function listJobs() {
  return [...jobs.values()]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .map((job) => toPublicJob(job));
}

export function getJob(jobId) {
  return toPublicJob(jobs.get(jobId), { includeEntries: true });
}

export function findActiveJobByMeta(type, meta = {}, keys = []) {
  const match = [...jobs.values()].find((job) => {
    if (!isActiveJob(job) || job.type !== type) {
      return false;
    }

    return keys.every((key) => sameMetaValue(job.meta?.[key], meta?.[key]));
  });

  return match ? toPublicJob(match, { includeEntries: true }) : null;
}

export function createBackgroundJob({
  type,
  label,
  meta = {},
  total = 0,
  run,
}) {
  if (typeof run !== 'function') {
    throw new Error('Background job requires a run function');
  }

  const id = randomUUID();
  const job = {
    id,
    type: type || 'job',
    label: label || 'Background job',
    status: 'queued',
    phase: 'queued',
    created_at: nowIso(),
    started_at: '',
    finished_at: '',
    current_label: '',
    error: '',
    report_id: '',
    meta,
    progress: {
      total: clampProgress(total),
      completed: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
    },
    summary: {},
    result: null,
    entries: [],
  };

  jobs.set(id, job);
  trimJobs();

  const controls = {
    setPhase(phase, currentLabel = '') {
      job.phase = phase || job.phase;
      if (currentLabel !== undefined) {
        job.current_label = currentLabel || '';
      }
    },
    setTotal(totalValue) {
      job.progress.total = clampProgress(totalValue);
    },
    setCurrent(currentLabel) {
      job.current_label = currentLabel || '';
    },
    updateProgress(progressPatch = {}) {
      job.progress = {
        ...job.progress,
        ...Object.fromEntries(
          Object.entries(progressPatch).map(([key, value]) => [key, clampProgress(value)])
        ),
      };
    },
    addEntry(entry) {
      job.entries.push(entry);
    },
    complete({ summary = {}, result = null, report_id = '', entries } = {}) {
      if (Array.isArray(entries)) {
        job.entries = entries;
      }

      job.summary = summary || {};
      job.result = result;
      job.report_id = report_id || '';
      job.status = 'completed';
      job.phase = 'completed';
      job.current_label = '';
      job.finished_at = nowIso();
      trimJobs();
    },
    fail(error) {
      job.status = 'failed';
      job.phase = 'failed';
      job.error = error?.message || String(error || 'Background job failed');
      job.current_label = '';
      job.finished_at = nowIso();
      trimJobs();
    },
  };

  Promise.resolve().then(async () => {
    try {
      job.status = 'running';
      job.phase = 'running';
      job.started_at = nowIso();
      await run(controls);

      if (job.status === 'running') {
        controls.complete();
      }
    } catch (error) {
      controls.fail(error);
    }
  });

  return toPublicJob(job, { includeEntries: true });
}
