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
import { fetchLyricsWithReport } from '../providers/lyrics/index.js';
import { saveReport } from '../services/reportService.js';

const router = Router();

function cleanWhitespace(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function cleanTitleForLyrics(title = '') {
  let value = cleanWhitespace(title);

  value = value
    .replace(
      /\s*-\s*(remastered|remaster|live|edit|version|mono|stereo|acoustic|radio edit|deluxe version)\b.*$/i,
      ''
    )
    .replace(
      /\s*\((remastered|remaster|live|edit|version|mono|stereo|acoustic|radio edit|deluxe version)[^)]*\)\s*$/i,
      ''
    )
    .replace(
      /\s*\[(remastered|remaster|live|edit|version|mono|stereo|acoustic|radio edit|deluxe version)[^\]]*\]\s*$/i,
      ''
    )
    .replace(/\s*-\s*from\b.*$/i, '')
    .replace(/\s*-\s*feat\b.*$/i, '')
    .replace(/\s*\((feat|ft|featuring)\.?\s+[^)]*\)\s*$/i, '')
    .replace(/\s*\[(feat|ft|featuring)\.?\s+[^\]]*\]\s*$/i, '');

  return cleanWhitespace(value);
}

function cleanArtistForLyrics(artist = '') {
  let value = cleanWhitespace(artist);

  if (!value) return '';

  value = value
    .split(/\s*(?:,|&| x | X |\/| with | ו | and )\s*/i)[0]
    .trim();

  value = value
    .replace(/\s*\((feat|ft|featuring)\.?\s+[^)]*\)\s*$/i, '')
    .replace(/\s*\[(feat|ft|featuring)\.?\s+[^\]]*\]\s*$/i, '')
    .replace(/\s*-\s*(official|live|acoustic|remastered)\b.*$/i, '');

  return cleanWhitespace(value);
}

function buildLyricsQueryVariants(title, artist) {
  const originalTitle = cleanWhitespace(title);
  const originalArtist = cleanWhitespace(artist);
  const cleanTitle = cleanTitleForLyrics(originalTitle);
  const cleanArtist = cleanArtistForLyrics(originalArtist);

  const variants = [
    { title: cleanTitle, artist: cleanArtist, label: 'clean_title_clean_artist' },
    { title: cleanTitle, artist: '', label: 'clean_title_only' },
    { title: originalTitle, artist: cleanArtist, label: 'original_title_clean_artist' },
    { title: originalTitle, artist: '', label: 'original_title_only' },
    { title: cleanTitle, artist: originalArtist, label: 'clean_title_original_artist' },
    { title: originalTitle, artist: originalArtist, label: 'original_title_original_artist' },
  ];

  const seen = new Set();

  return variants.filter((variant) => {
    const t = cleanWhitespace(variant.title);
    const a = cleanWhitespace(variant.artist);
    if (!t) return false;

    const key = `${t}|||${a}`;
    if (seen.has(key)) return false;
    seen.add(key);

    variant.title = t;
    variant.artist = a;
    return true;
  });
}

async function fetchLyricsWithFallbacks(song) {
  const queryVariants = buildLyricsQueryVariants(song.title, song.artist_name);

  let bestResult = null;
  let mergedAttempts = [];
  let winnerVariant = null;

  for (const variant of queryVariants) {
    console.log(
      `[lyrics-route] trying query_variant=${variant.label} title="${variant.title}" artist="${variant.artist}"`
    );

    const { result, attempts } = await fetchLyricsWithReport(variant.title, variant.artist);

    mergedAttempts.push(
      {
        provider: `query:${variant.label}`,
        status: 'query_variant',
        source: variant.label,
      },
      ...(Array.isArray(attempts)
        ? attempts.map((attempt) => ({
            ...attempt,
            query_title: variant.title,
            query_artist: variant.artist,
            query_variant: variant.label,
          }))
        : [])
    );

    if (result?.lyrics_text) {
      winnerVariant = variant;
      return {
        result,
        attempts: mergedAttempts,
        winnerVariant,
        queryVariants,
      };
    }

    if (result?.confidence_score && (!bestResult || result.confidence_score > bestResult.confidence_score)) {
      bestResult = result;
      winnerVariant = variant;
    }
  }

  return {
    result: bestResult,
    attempts: mergedAttempts,
    winnerVariant,
    queryVariants,
  };
}

router.get('/', (req, res) => {
  try {
    const songs = getSongs({
      search: req.query.search,
      artist: req.query.artist,
      album: req.query.album,
      year: req.query.year,
      status: req.query.status,
      printReady:
        req.query.printReady === 'true'
          ? true
          : req.query.printReady === 'false'
            ? false
            : undefined,
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

router.post('/:id/fetch-lyrics', async (req, res) => {
  try {
    const song = getSongById(req.params.id);

    if (!song) {
      return res.status(404).json({ error: 'Song not found' });
    }

    const { result, attempts, winnerVariant, queryVariants } = await fetchLyricsWithFallbacks(song);

    let updatedSong = song;
    let fetched = false;

    if (result?.lyrics_text) {
      updatedSong = saveLyrics(req.params.id, {
        text: result.lyrics_text,
        source: result.source || 'auto',
        confidenceScore: result.confidence_score || 0,
        isVerified: 0,
      });
      fetched = true;
    }

    const saved = saveReport({
      type: 'lyrics_fetch',
      subtype: 'single_song',
      source_type: 'lyrics_fetch',
      source_id: req.params.id,
      title: song.title || '',
      artist: song.artist_name || '',
      summary: {
        fetched,
        provider: result?.source || '',
        confidence_score: Number(result?.confidence_score || 0),
        attempts_count: Array.isArray(attempts) ? attempts.length : 0,
        query_variant: winnerVariant?.label || '',
        query_title: winnerVariant?.title || '',
        query_artist: winnerVariant?.artist || '',
      },
      rows: Array.isArray(attempts)
        ? attempts.map((attempt) => ({
            title: song.title || '',
            artist: song.artist_name || '',
            album: song.album_title || '',
            action:
              attempt.status === 'ok'
                ? 'imported'
                : attempt.status === 'error'
                  ? 'error'
                  : 'skipped',
            reason: attempt.status,
            error: attempt.error || '',
            provider: attempt.provider,
            confidence_score: attempt.confidence_score || null,
            query_variant: attempt.query_variant || '',
            query_title: attempt.query_title || '',
            query_artist: attempt.query_artist || '',
          }))
        : [],
      report: {
        fetched,
        result: result || null,
        attempts: attempts || [],
        query_variants: queryVariants || [],
        winner_variant: winnerVariant || null,
      },
    });

    return res.json({
      fetched,
      song: updatedSong,
      report_id: saved.id,
      attempts: attempts || [],
      provider: result?.source || null,
      confidence_score: result?.confidence_score || null,
      query_variant: winnerVariant?.label || null,
      query_title: winnerVariant?.title || null,
      query_artist: winnerVariant?.artist || null,
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
