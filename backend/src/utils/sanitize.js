import { JSDOM } from 'jsdom';
import DOMPurify from 'dompurify';

const { window } = new JSDOM('');
const purify = DOMPurify(window);

/**
 * Strip all HTML tags from user content.
 * Use before storing or rendering any user-supplied text.
 */
export function sanitizeText(str = '') {
  return purify.sanitize(str, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
}

/**
 * Allow a limited safe subset for lyrics display
 * (line breaks only — no scripts, no styles).
 */
export function sanitizeLyrics(str = '') {
  return purify.sanitize(str, {
    ALLOWED_TAGS: ['br'],
    ALLOWED_ATTR: [],
  });
}
