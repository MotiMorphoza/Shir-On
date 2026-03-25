import { Router }     from 'express';
import { getSongById, getSongs } from '../services/songService.js';
import { getCollection }         from '../services/collectionsService.js';
import { generatePdf }           from '../print/engine.js';

const router = Router();

function parseSongIds(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return null;
  return ids.map(id => getSongById(id)).filter(Boolean);
}

// POST /print/pdf
// Body: { songIds?, collectionId?, filters?, config }
router.post('/pdf', async (req, res) => {
  try {
    const { songIds, collectionId, config = {} } = req.body;

    let songs = [];

    if (collectionId) {
      const col = getCollection(collectionId);
      songs = col?.songs?.map(s => getSongById(s.id)).filter(Boolean) || [];
    } else if (songIds?.length) {
      songs = parseSongIds(songIds) || [];
    } else {
      // print all print-ready songs
      songs = getSongs({ printReady: true, limit: 500 });
    }

    if (songs.length === 0)
      return res.status(400).json({ error: 'No songs to print' });

    const pdf = await generatePdf(songs, config);

    res.set({
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="songbook.pdf"`,
      'Content-Length':      pdf.length,
    });
    res.end(pdf);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
