import { Router } from 'express';
import {
  getSongs,
  getSongById,
  createSong,
  updateSong,
  deleteSong,
  saveLyrics,
  setTags,
  bulkUpdate,
  findDuplicates,
  mergeSongs,
} from '../services/songService.js';
import {
  fetchLyricsForSongId,
  fetchLyricsForSongs,
} from '../services/lyricsRunService.js';
import { createBatchReport } from '../services/reportService.js';
import {
  createBackgroundJob,
  findActiveJobByMeta,
} from '../services/jobService.js';

const router = Router();

function buildLyricsRunLabel(entries = []) {
  if (entries.length === 1) {
    const entry = entries[0];
    return `${entry.original_artist || ''} - ${entry.original_title || ''}`.trim();
  }

  return `Lyrics fetch run (${entries.length} songs)`;
}

router.get('/', (req, res) => {
  try {
    const ids =
      typeof req.query.ids === 'string' && req.query.ids.trim()
        ? req.query.ids
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean)
        : [];

    const songs = getSongs({
      ids,
      search: req.query.search,
      artist: req.query.artist,
      album: req.query.album,
      year: req.query.year,
      status: req.query.status,
      playlistId: req.query.playlistId,
      sort: req.query.sort,
      page: req.query.page,
      limit: req.query.limit,
    });

    res.json(songs);
  } catch (err) {
    res.status(500).json({ error: err?.message || 'Failed to load songs' });
  }
});

router.get('/duplicates', (_req, res) => {
  try {
    res.json(findDuplicates());
  } catch (err) {
    res.status(500).json({ error: err?.message || 'Failed to find duplicates' });
  }
});

router.post('/fetch-lyrics-run', async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids)
      ? req.body.ids.map((id) => String(id || '').trim()).filter(Boolean)
      : [];

    if (ids.length === 0) {
      return res.status(400).json({ error: 'Missing song IDs' });
    }

    const run = await fetchLyricsForSongs(ids, { persist: true });
    const report = createBatchReport({
      type: 'lyrics_fetch',
      subtype: 'batch_run',
      source_type: 'lyrics_fetch',
      source_id: ids.join(','),
      started_at: run.started_at,
      finished_at: run.finished_at,
      label: buildLyricsRunLabel(run.entries),
      entries: run.entries,
      meta: {
        requested_song_ids: ids,
      },
    });

    return res.json({
      ok: true,
      report_id: report.id,
      report,
      summary: report.summary,
      entries: report.entries,
    });
  } catch (err) {
    return res.status(500).json({
      error: err?.message || 'Lyrics fetch run failed',
    });
  }
});

router.post('/fetch-lyrics-run/background', async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids)
      ? req.body.ids.map((id) => String(id || '').trim()).filter(Boolean)
      : [];
    const normalizedIds = [...ids].sort();

    if (ids.length === 0) {
      return res.status(400).json({ error: 'Missing song IDs' });
    }

    const existingJob = findActiveJobByMeta(
      'lyrics_fetch_run',
      {
        requested_song_ids: normalizedIds,
      },
      ['requested_song_ids']
    );

    if (existingJob) {
      return res.status(200).json({
        ...existingJob,
        reused: true,
      });
    }

    const job = createBackgroundJob({
      type: 'lyrics_fetch_run',
      label: `Lyrics fetch run (${ids.length} songs)`,
      meta: {
        requested_song_ids: normalizedIds,
      },
      total: ids.length,
      run: async (controls) => {
        controls.setPhase('fetching_lyrics', `Fetching lyrics for ${ids.length} songs`);

        const run = await fetchLyricsForSongs(ids, {
          persist: true,
          onEntry(entry, state) {
            controls.setCurrent(
              `${entry.original_artist || ''} - ${entry.original_title || ''}`.trim()
            );
            controls.addEntry(entry);
            controls.updateProgress({
              total: ids.length,
              completed: state.entries.length,
              succeeded: state.entries.filter((item) => item.result === 'success').length,
              failed: state.entries.filter((item) => item.result === 'fail').length,
            });
          },
        });

        const report = createBatchReport({
          type: 'lyrics_fetch',
          subtype: 'batch_run',
          source_type: 'lyrics_fetch',
          source_id: ids.join(','),
          started_at: run.started_at,
          finished_at: run.finished_at,
          label: buildLyricsRunLabel(run.entries),
          entries: run.entries,
          meta: {
            requested_song_ids: ids,
          },
        });

        controls.complete({
          summary: report.summary || {},
          report_id: report.id,
          entries: run.entries,
          result: {
            ok: true,
            report_id: report.id,
            report,
            summary: report.summary,
            entries: run.entries,
          },
        });
      },
    });

    return res.status(202).json(job);
  } catch (err) {
    return res.status(500).json({
      error: err?.message || 'Background lyrics fetch run failed',
    });
  }
});

router.get('/:id', (req, res) => {
  try {
    const song = getSongById(req.params.id);

    if (!song) {
      return res.status(404).json({ error: 'Song not found' });
    }

    return res.json(song);
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Failed to load song' });
  }
});

router.post('/', (req, res) => {
  try {
    const song = createSong(req.body || {});
    res.status(201).json(song);
  } catch (err) {
    res.status(400).json({ error: err?.message || 'Failed to create song' });
  }
});

router.patch('/:id', (req, res) => {
  try {
    const song = updateSong(req.params.id, req.body || {});
    res.json(song);
  } catch (err) {
    res.status(400).json({ error: err?.message || 'Failed to update song' });
  }
});

router.delete('/:id', (req, res) => {
  try {
    deleteSong(req.params.id);
    res.status(204).end();
  } catch (err) {
    res.status(400).json({ error: err?.message || 'Failed to delete song' });
  }
});

router.put('/:id/lyrics', (req, res) => {
  try {
    const song = saveLyrics(req.params.id, req.body || {});
    res.json(song);
  } catch (err) {
    res.status(400).json({ error: err?.message || 'Failed to save lyrics' });
  }
});

router.post('/:id/fetch-lyrics-preview', async (req, res) => {
  try {
    const result = await fetchLyricsForSongId(req.params.id, { persist: false });

    return res.json({
      fetched: result.fetched,
      song: result.song,
      entry: result.entry,
      provider: result.provider,
      confidence_score: result.confidence_score,
      query_variant: result.query_variant,
      query_title: result.query_title,
      query_artist: result.query_artist,
    });
  } catch (err) {
    return res.status(500).json({
      error: err?.message || 'Lyrics fetch failed',
    });
  }
});

router.post('/:id/fetch-lyrics', async (req, res) => {
  try {
    const result = await fetchLyricsForSongId(req.params.id, { persist: true });

    const report = createBatchReport({
      type: 'lyrics_fetch',
      subtype: 'single_song_run',
      source_type: 'lyrics_fetch',
      source_id: req.params.id,
      started_at: result.started_at,
      finished_at: result.finished_at,
      title: result.entry.original_title,
      artist: result.entry.original_artist,
      label: buildLyricsRunLabel([result.entry]),
      entries: [result.entry],
      meta: {
        requested_song_ids: [req.params.id],
      },
    });

    return res.json({
      fetched: result.fetched,
      song: result.song,
      report_id: report.id,
      report,
      provider: result.provider,
      confidence_score: result.confidence_score,
      duration_ms: result.entry.duration_ms,
      query_variant: result.query_variant,
      query_title: result.query_title,
      query_artist: result.query_artist,
      entry: result.entry,
    });
  } catch (err) {
    return res.status(500).json({
      error: err?.message || 'Lyrics fetch failed',
    });
  }
});

router.put('/:id/tags', (req, res) => {
  try {
    setTags(req.params.id, req.body?.tags || []);
    const song = getSongById(req.params.id);
    res.json(song);
  } catch (err) {
    res.status(400).json({ error: err?.message || 'Failed to save tags' });
  }
});

router.post('/bulk', (req, res) => {
  try {
    bulkUpdate(req.body?.ids || [], req.body?.data || {});
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err?.message || 'Bulk update failed' });
  }
});

router.post('/merge', (req, res) => {
  try {
    const merged = mergeSongs(
      req.body?.keepId,
      req.body?.mergeIds || [],
      {
        useMetadataFrom: req.body?.useMetadataFrom,
        useLyricsFrom: req.body?.useLyricsFrom,
      }
    );

    res.json(merged);
  } catch (err) {
    res.status(400).json({ error: err?.message || 'Merge failed' });
  }
});

export default router;
