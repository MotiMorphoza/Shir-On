/**
 * Normalize a string for matching:
 * lowercase, strip punctuation, collapse whitespace,
 * remove "feat.", "ft.", "featuring" credits.
 */
export function normalize(str = '') {
  return str
    .toLowerCase()
    .replace(/\(feat\..*?\)/gi, '')
    .replace(/\[feat\..*?\]/gi, '')
    .replace(/feat\..*?(?=\s|$)/gi, '')
    .replace(/\bft\..*?(?=\s|$)/gi, '')
    .replace(/\bfeaturing\b.*?(?=\s|$)/gi, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Similarity ratio between two normalized strings (0–1).
 * Simple Levenshtein-based ratio for confidence scoring.
 */
export function similarity(a, b) {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;
  const dist = levenshtein(na, nb);
  const maxLen = Math.max(na.length, nb.length);
  return maxLen === 0 ? 1 : 1 - dist / maxLen;
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}
