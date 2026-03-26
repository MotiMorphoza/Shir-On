import { normalize } from './normalize.js';

export function cleanWhitespace(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function cleanTitleForLyrics(title = '') {
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

export function cleanArtistForLyrics(artist = '') {
  let value = cleanWhitespace(artist);

  if (!value) {
    return '';
  }

  value = value
    .replace(/\s+\u05D5\s+/g, ',')
    .replace(/\s+\u00D7\s+/g, ',');

  value = value
    .split(/\s*(?:,|&| x | X |\/| with | and )\s*/i)[0]
    .trim();

  value = value
    .replace(/\s*\((feat|ft|featuring)\.?\s+[^)]*\)\s*$/i, '')
    .replace(/\s*\[(feat|ft|featuring)\.?\s+[^\]]*\]\s*$/i, '')
    .replace(/\s*-\s*(official|live|acoustic|remastered)\b.*$/i, '');

  return cleanWhitespace(value);
}

export function buildLyricsQueryVariants(title, artist) {
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
    const safeTitle = cleanWhitespace(variant.title);
    const safeArtist = cleanWhitespace(variant.artist);

    if (!safeTitle) {
      return false;
    }

    const key = `${safeTitle}|||${safeArtist}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    variant.title = safeTitle;
    variant.artist = safeArtist;
    variant.normalized_title = normalize(safeTitle);
    variant.normalized_artist = normalize(safeArtist);

    return true;
  });
}
