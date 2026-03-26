import { Router }     from 'express';
import { getSongById, getSongs } from '../services/songService.js';
import { getCollection }         from '../services/collectionsService.js';
import { generatePdf }           from '../print/engine.js';

const router = Router();

function parseSongIds(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return null;
  return ids.map(id => getSongById(id)).filter(Boolean);
}

function sortSongsForBook(songs = []) {
  return [...songs].sort((a, b) => {
    const artistCompare = String(a?.artist_name || '').localeCompare(String(b?.artist_name || ''));

    if (artistCompare !== 0) {
      return artistCompare;
    }

    return String(a?.title || '').localeCompare(String(b?.title || ''));
  });
}

// POST /print/pdf
// Body: { songIds?, collectionId?, filters?, config }
router.post('/pdf', async (req, res) => {
  try {
    const payload =
      typeof req.body?.payload === 'string'
        ? JSON.parse(req.body.payload)
        : req.body;
    const { songIds, collectionId, config = {} } = payload || {};

    let songs = [];

    if (collectionId) {
      const col = getCollection(collectionId);
      songs = col?.songs?.map(s => getSongById(s.id)).filter(Boolean) || [];
    } else if (songIds?.length) {
      songs = parseSongIds(songIds) || [];
    } else {
      songs = getSongs({ limit: 2000, sort: 'artist' });
    }

    songs = sortSongsForBook(songs);

    if (songs.length === 0)
      return res.status(400).json({ error: 'No songs to print' });

    const pdf = await generatePdf(songs, config);

    res.set({
      'Content-Type':        'application/pdf',
      'Content-Disposition': `inline; filename="songbook.pdf"`,
      'Content-Length':      pdf.length,
    });
    res.end(pdf);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
