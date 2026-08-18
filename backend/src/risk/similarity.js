/** Maximum supported length of a normalized mark. */
export const MAX_MARK_LENGTH = 200;

function assertString(value, name) {
  if (typeof value !== 'string') throw new TypeError(`${name} must be a string.`);
}

/**
 * Normalize a mark for deterministic comparison.
 *
 * NFD decomposes diacritics; combining marks are removed, text is uppercased,
 * punctuation/symbols become spaces, and
 * whitespace is collapsed. The normalized value is limited to 200 characters.
 */
export function normalizeMarkText(value) {
  assertString(value, 'Mark');
  const normalized = value
    .normalize('NFD')
    .replace(/\p{Mark}/gu, '')
    .toUpperCase()
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();

  if (!normalized) throw new RangeError('Mark must not be empty after normalization.');
  if (normalized.length > MAX_MARK_LENGTH) {
    throw new RangeError(`Mark must not exceed ${MAX_MARK_LENGTH} normalized characters.`);
  }
  return normalized;
}

/**
 * Calculate Levenshtein edit distance for two already-normalized strings.
 * This uses one row of dynamic-programming state, so memory is O(min(n, m)).
 */
export function levenshteinDistance(left, right) {
  assertString(left, 'Left value');
  assertString(right, 'Right value');
  if (left === right) return 0;
  if (left.length === 0) return right.length;
  if (right.length === 0) return left.length;

  let shorter = left;
  let longer = right;
  if (shorter.length > longer.length) [shorter, longer] = [longer, shorter];
  let row = Array.from({ length: shorter.length + 1 }, (_, index) => index);

  for (let longerIndex = 1; longerIndex <= longer.length; longerIndex += 1) {
    const nextRow = [longerIndex];
    for (let shorterIndex = 1; shorterIndex <= shorter.length; shorterIndex += 1) {
      const insertion = nextRow[shorterIndex - 1] + 1;
      const deletion = row[shorterIndex] + 1;
      const substitution = row[shorterIndex - 1]
        + (longer[longerIndex - 1] === shorter[shorterIndex - 1] ? 0 : 1);
      nextRow.push(Math.min(insertion, deletion, substitution));
    }
    row = nextRow;
  }
  return row[shorter.length];
}

function percentage(numerator, denominator) {
  return denominator === 0 ? 0 : Math.round((numerator / denominator) * 100);
}

/**
 * Compare normalized mark text using 1 - distance / maximum length.
 * Scores are rounded to the nearest integer with Math.round and bounded 0-100.
 */
export function visualSimilarity(leftMark, rightMark) {
  const left = normalizeMarkText(leftMark);
  const right = normalizeMarkText(rightMark);
  const maximumLength = Math.max(left.length, right.length);
  return Math.max(0, Math.min(100, 100 - Math.round(
    (levenshteinDistance(left, right) / maximumLength) * 100,
  )));
}

// Standard American Soundex groups: BFPV=1, CGJKQSXZ=2, DT=3, L=4,
// MN=5, R=6. Vowels and H/W/Y do not emit digits; vowels reset adjacency,
// while H/W preserve adjacency as in the traditional American variant.
const SOUNDEX_GROUPS = new Map([
  ...'BFPV'.split('').map((letter) => [letter, '1']),
  ...'CGJKQSXZ'.split('').map((letter) => [letter, '2']),
  ...'DT'.split('').map((letter) => [letter, '3']),
  ['L', '4'],
  ...'MN'.split('').map((letter) => [letter, '5']),
  ['R', '6'],
]);

/**
 * Encode one meaningful normalized token using Standard American Soundex.
 * Multiword marks are intentionally tokenized by phoneticSimilarity instead
 * of being joined into one artificial name. The result is always four chars.
 */
export function soundex(value) {
  const normalized = normalizeMarkText(value);
  if (normalized.includes(' ')) throw new TypeError('Soundex expects one token.');
  const first = normalized[0];
  let code = '';
  let previous = SOUNDEX_GROUPS.get(first) ?? '';

  for (const letter of normalized.slice(1)) {
    const digit = SOUNDEX_GROUPS.get(letter);
    if (digit) {
      if (digit !== previous) code += digit;
      previous = digit;
    } else if (letter === 'H' || letter === 'W') {
      // H and W do not break an adjacent Soundex group.
      continue;
    } else {
      previous = '';
    }
    if (code.length >= 4) break;
  }
  return (first + code).padEnd(4, '0').slice(0, 4);
}

function phoneticTokens(normalized) {
  return normalized.split(' ').filter((token) => /[A-Z]/u.test(token));
}

/**
 * Compare Soundex code multisets order-independently. Each code can match
 * once, preserving repeated-token behavior; score is matched tokens divided
 * by the larger token count, rounded with Math.round.
 */
export function phoneticSimilarity(leftMark, rightMark) {
  const left = normalizeMarkText(leftMark);
  const right = normalizeMarkText(rightMark);
  if (left === right) return 100;
  const leftCodes = phoneticTokens(left).map(soundex);
  const rightCodes = phoneticTokens(right).map(soundex);
  const remaining = new Map();
  rightCodes.forEach((code) => remaining.set(code, (remaining.get(code) ?? 0) + 1));
  let matched = 0;
  for (const code of leftCodes) {
    const count = remaining.get(code) ?? 0;
    if (count > 0) {
      matched += 1;
      remaining.set(code, count - 1);
    }
  }
  return percentage(matched, Math.max(leftCodes.length, rightCodes.length));
}

function normalizedClasses(value, name) {
  if (!Array.isArray(value)) throw new TypeError(`${name} must be an array.`);
  const classes = new Set();
  for (const niceClass of value) {
    if (!Number.isInteger(niceClass) || niceClass < 1 || niceClass > 45) {
      throw new RangeError(`${name} must contain integers from 1 through 45.`);
    }
    classes.add(niceClass);
  }
  return [...classes].sort((left, right) => left - right);
}

/**
 * Return deduplicated Nice-class intersection/union and Jaccard overlap.
 * overlapScore is intersection size / union size * 100, rounded with Math.round.
 */
export function niceClassOverlap(leftClasses, rightClasses) {
  const left = normalizedClasses(leftClasses, 'Left classes');
  const right = normalizedClasses(rightClasses, 'Right classes');
  const rightSet = new Set(right);
  const intersection = left.filter((niceClass) => rightSet.has(niceClass));
  const union = [...new Set([...left, ...right])].sort((a, b) => a - b);
  return {
    hasOverlap: intersection.length > 0,
    intersection,
    union,
    overlapScore: percentage(intersection.length, union.length),
  };
}
