import { Router } from 'express';
import { getPlaylist, getPlaylists } from '../services/playlistsService.js';

const router = Router();

router.get('/', (_req, res) => {
  try {
    res.json(getPlaylists());
  } catch (err) {
    res.status(500).json({ error: err?.message || 'Failed to load playlists' });
  }
});

router.get('/:id', (req, res) => {
  try {
    const playlist = getPlaylist(req.params.id);

    if (!playlist) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    return res.json(playlist);
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Failed to load playlist' });
  }
});

export default router;
