import { Router } from 'express';
import {
  analyzeLyricsProviderPerformance,
  createBatchReport,
  getReport,
  listReports,
  resetReports,
} from '../services/reportService.js';

const router = Router();

router.get('/', (req, res) => {
  try {
    const reports = listReports({
      type: typeof req.query.type === 'string' ? req.query.type : '',
      limit: typeof req.query.limit === 'string' ? Number(req.query.limit) : 100,
    });

    res.json(reports);
  } catch (err) {
    res.status(500).json({
      error: err?.message || 'Failed to list reports',
    });
  }
});

router.get('/provider-stats/lyrics', (_req, res) => {
  try {
    res.json(analyzeLyricsProviderPerformance());
  } catch (err) {
    res.status(500).json({
      error: err?.message || 'Failed to analyze lyrics provider stats',
    });
  }
});

router.post('/batch', (req, res) => {
  try {
    const entries = Array.isArray(req.body?.entries) ? req.body.entries : [];

    if (entries.length === 0) {
      return res.status(400).json({ error: 'Missing report entries' });
    }

    const report = createBatchReport({
      type: req.body?.type || 'lyrics_fetch',
      subtype: req.body?.subtype || 'batch_run',
      source_type: req.body?.source_type || req.body?.type || 'lyrics_fetch',
      source_id: req.body?.source_id || '',
      started_at: req.body?.started_at || new Date().toISOString(),
      finished_at: req.body?.finished_at || new Date().toISOString(),
      title: req.body?.title || '',
      artist: req.body?.artist || '',
      label: req.body?.label || '',
      summary: req.body?.summary || {},
      entries,
      meta: req.body?.meta || {},
    });

    return res.status(201).json(report);
  } catch (err) {
    return res.status(500).json({
      error: err?.message || 'Failed to create batch report',
    });
  }
});

router.post('/reset', (req, res) => {
  try {
    const result = resetReports({
      includeLegacy: req.body?.includeLegacy !== false,
    });

    return res.json({
      ok: true,
      ...result,
    });
  } catch (err) {
    return res.status(500).json({
      error: err?.message || 'Failed to reset reports',
    });
  }
});

router.get('/:id', (req, res) => {
  try {
    const report = getReport(req.params.id);

    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    return res.json(report);
  } catch (err) {
    return res.status(500).json({
      error: err?.message || 'Failed to load report',
    });
  }
});

export default router;
