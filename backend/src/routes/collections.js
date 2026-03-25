import { Router } from 'express';
import {
  getCollections, getCollection, createCollection,
  addSongToCollection, removeSongFromCollection,
} from '../services/collectionsService.js';

const router = Router();

router.get('/',     (_req, res)  => res.json(getCollections()));
router.get('/:id',  (req, res)  => {
  const col = getCollection(req.params.id);
  if (!col) return res.status(404).json({ error: 'Not found' });
  res.json(col);
});

router.post('/', (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  res.status(201).json(createCollection(name, description));
});

router.post('/:id/songs', (req, res) => {
  addSongToCollection(req.params.id, req.body.songId);
  res.json({ ok: true });
});

router.delete('/:id/songs/:songId', (req, res) => {
  removeSongFromCollection(req.params.id, req.params.songId);
  res.status(204).end();
});

export default router;
