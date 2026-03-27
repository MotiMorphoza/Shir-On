import { JSDOM } from 'jsdom';
import DOMPurify from 'dompurify';

const { window } = new JSDOM('');
const purify = DOMPurify(window);

export function decodeHtmlEntities(str = '') {
  const value = String(str ?? '');

  if (!value.includes('&')) {
    return value;
  }

  const textarea = window.document.createElement('textarea');
  textarea.innerHTML = value;
  return textarea.value;
}

/**
 * Strip all HTML tags from user content.
 * Use before storing or rendering any user-supplied text.
 */
export function sanitizeText(str = '') {
  return purify.sanitize(decodeHtmlEntities(str), { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
}

/**
 * Allow a limited safe subset for lyrics display
 * (line breaks only — no scripts, no styles).
 */
export function sanitizeLyrics(str = '') {
  return purify.sanitize(decodeHtmlEntities(str), {
    ALLOWED_TAGS: ['br'],
    ALLOWED_ATTR: [],
  });
}
