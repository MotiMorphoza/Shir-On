function normalizeMarkerLine(line) {
  return String(line || '')
    .trim()
    .replace(/^[\s\-–—:]+|[\s\-–—:]+$/g, '');
}

function isChordDefinitionLine(line) {
  const text = String(line || '').trim();
  return /^(?:[A-G](?:#|b)?(?:m|maj|min|sus|add|dim|aug)?\d*(?:\/[A-G](?:#|b)?)?(?:\s*,\s*[A-G](?:#|b)?(?:m|maj|min|sus|add|dim|aug)?\d*(?:\/[A-G](?:#|b)?)?)*)\s*:\s*[xX0-9][xX0-9\s-]{3,}$/.test(text);
}

export function cleanLyricsText(text = '') {
  const lines = String(text || '')
    .replace(/\r\n?/g, '\n')
    .split('\n');

  while (lines.length > 0) {
    const normalized = normalizeMarkerLine(lines[0]);

    if (!normalized) {
      lines.shift();
      continue;
    }

    if (normalized === 'פתיחה' || isChordDefinitionLine(lines[0])) {
      lines.shift();
      continue;
    }

    break;
  }

  while (lines.length > 0) {
    const normalized = normalizeMarkerLine(lines[lines.length - 1]);

    if (!normalized) {
      lines.pop();
      continue;
    }

    if (normalized === 'סיום') {
      lines.pop();
      continue;
    }

    break;
  }

  return lines
    .filter((line) => {
      const normalized = normalizeMarkerLine(line);
      return normalized !== 'מעבר' && normalized !== 'פזמון';
    })
    .join('\n');
}
