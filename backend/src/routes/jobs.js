import { Router } from 'express';
import { getJob, listJobs } from '../services/jobService.js';

const router = Router();

router.get('/', (_req, res) => {
  try {
    res.json(listJobs());
  } catch (err) {
    res.status(500).json({ error: err?.message || 'Failed to load jobs' });
  }
});

router.get('/:id', (req, res) => {
  try {
    const job = getJob(req.params.id);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    return res.json(job);
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Failed to load job' });
  }
});

export default router;
