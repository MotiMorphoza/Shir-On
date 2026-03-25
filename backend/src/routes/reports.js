import { Router } from 'express';
import { getReport, listReports } from '../services/reportService.js';

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