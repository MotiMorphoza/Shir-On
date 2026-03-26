import { normalize } from '../utils/normalize.js';
import { buildLyricsQueryVariants } from '../utils/lyricsQuery.js';
import { fetchLyricsWithReport } from '../providers/lyrics/index.js';
import { getSongById, saveLyrics } from './songService.js';

function makeFailureReason(result, attempts) {
  if (result?.lyrics_text) {
    return '';
  }

  const list = Array.isArray(attempts) ? attempts : [];
  const firstError = list.find((attempt) => attempt.status === 'error');

  if (firstError?.error) {
    return firstError.error;
  }

  if (list.some((attempt) => attempt.status === 'no_result')) {
    return 'no_result';
  }

  return 'not_fetched';
}

async function fetchLyricsWithFallbacks(song) {
  const queryVariants = buildLyricsQueryVariants(song.title, song.artist_name);
  const startedAt = Date.now();

  let bestResult = null;
  let mergedAttempts = [];
  let winnerVariant = null;

  for (const [index, variant] of queryVariants.entries()) {
    const variantStartedAt = Date.now();

    const { result, attempts, providerPlan = [] } = await fetchLyricsWithReport(
      variant.title,
      variant.artist
    );

    const variantDuration = Math.max(0, Date.now() - variantStartedAt);

    mergedAttempts.push(
      {
        provider: `query:${variant.label}`,
        status: 'query_variant',
        source: variant.label,
        provider_order: index + 1,
        duration_ms: variantDuration,
      },
      ...(Array.isArray(attempts)
        ? attempts.map((attempt) => ({
            ...attempt,
            query_title: variant.title,
            query_artist: variant.artist,
            query_variant: variant.label,
            provider_plan: providerPlan.join(', '),
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
        providerPlan,
        duration_ms: Math.max(0, Date.now() - startedAt),
      };
    }

    if (
      result?.confidence_score &&
      (!bestResult || result.confidence_score > bestResult.confidence_score)
    ) {
      bestResult = result;
      winnerVariant = variant;
    }
  }

  return {
    result: bestResult,
    attempts: mergedAttempts,
    winnerVariant,
    queryVariants,
    duration_ms: Math.max(0, Date.now() - startedAt),
  };
}

export async function fetchLyricsForSongId(songId, { persist = true } = {}) {
  const song = getSongById(songId);

  if (!song) {
    throw new Error('Song not found');
  }

  const startedAt = new Date().toISOString();
  const { result, attempts, winnerVariant, queryVariants, duration_ms = 0 } =
    await fetchLyricsWithFallbacks(song);

  let updatedSong = song;
  let fetched = false;

  if (persist && result?.lyrics_text) {
    updatedSong = saveLyrics(songId, {
      text: result.lyrics_text,
      source: result.source || 'auto',
      confidenceScore: result.confidence_score || 0,
      isVerified: 0,
    });
    fetched = true;
  } else if (!persist && result?.lyrics_text) {
    fetched = true;
  }

  const entry = {
    song_id: song.id,
    original_title: song.title || '',
    original_artist: song.artist_name || '',
    normalized_title: normalize(song.title || ''),
    normalized_artist: normalize(song.artist_name || ''),
    matched_existing: false,
    matched_existing_id: song.id,
    query_variants: queryVariants,
    provider_plan: (attempts || [])
      .map((attempt) => attempt.provider)
      .filter(Boolean)
      .filter((value, index, all) => all.indexOf(value) === index),
    provider_used: result?.source || '',
    result: fetched ? 'success' : 'fail',
    failure_reason: makeFailureReason(result, attempts),
    duration_ms: Number(duration_ms || 0),
    confidence_score: result?.confidence_score ?? null,
    attempts: attempts || [],
    meta: {
      winner_variant: winnerVariant || null,
      album: song.album_title || '',
    },
  };

  return {
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    fetched,
    song: persist ? updatedSong : song,
    entry,
    provider: result?.source || null,
    confidence_score: result?.confidence_score || null,
    query_variant: winnerVariant?.label || null,
    query_title: winnerVariant?.title || null,
    query_artist: winnerVariant?.artist || null,
  };
}

export async function fetchLyricsForSongs(
  songIds = [],
  { persist = true, onEntry } = {}
) {
  const ids = Array.isArray(songIds) ? songIds.filter(Boolean) : [];
  const startedAt = new Date().toISOString();
  const entries = [];
  const updatedSongs = [];

  for (const songId of ids) {
    try {
      const result = await fetchLyricsForSongId(songId, { persist });
      entries.push(result.entry);
      updatedSongs.push(result.song);

      if (typeof onEntry === 'function') {
        onEntry(result.entry, {
          entries,
          songs: updatedSongs,
        });
      }
    } catch (error) {
      const song = getSongById(songId);

      const failedEntry = {
        song_id: songId,
        original_title: song?.title || '',
        original_artist: song?.artist_name || '',
        normalized_title: normalize(song?.title || ''),
        normalized_artist: normalize(song?.artist_name || ''),
        matched_existing: false,
        matched_existing_id: song?.id || null,
        query_variants: buildLyricsQueryVariants(song?.title || '', song?.artist_name || ''),
        provider_plan: [],
        provider_used: '',
        result: 'fail',
        failure_reason: error?.message || 'Lyrics fetch failed',
        duration_ms: 0,
        confidence_score: null,
        attempts: [],
        meta: {
          album: song?.album_title || '',
        },
      };

      entries.push(failedEntry);

      if (typeof onEntry === 'function') {
        onEntry(failedEntry, {
          entries,
          songs: updatedSongs,
        });
      }
    }
  }

  return {
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    entries,
    songs: updatedSongs,
  };
}
