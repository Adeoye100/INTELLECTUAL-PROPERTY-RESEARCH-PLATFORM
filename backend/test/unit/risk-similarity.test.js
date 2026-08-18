import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  levenshteinDistance,
  niceClassOverlap,
  normalizeMarkText,
  phoneticSimilarity,
  soundex,
  visualSimilarity,
} from '../../src/risk/similarity.js';

describe('BE-10A deterministic similarity primitives', () => {
  it('normalizes case, whitespace, punctuation, symbols, and diacritics', () => {
    assert.equal(normalizeMarkText('  Fórge+Labs™  '), 'FORGE LABS');
    assert.equal(normalizeMarkText('Forge---Global'), 'FORGE GLOBAL');
    assert.throws(() => normalizeMarkText(null), /must be a string/);
    assert.throws(() => normalizeMarkText('---'), /empty/);
    assert.throws(() => normalizeMarkText('a'.repeat(201)), /200/);
  });

  it('calculates known iterative Levenshtein distances without mutation', () => {
    for (const [left, right, expected] of [['kitten', 'sitting', 3], ['flaw', 'lawn', 2], ['', 'abc', 3], ['same', 'same', 0]]) {
      assert.equal(levenshteinDistance(left, right), expected);
      assert.equal(levenshteinDistance(right, left), expected);
    }
  });

  it('calculates bounded symmetric visual similarity', () => {
    assert.equal(visualSimilarity('FORGE', 'FORGE'), 100);
    assert.equal(visualSimilarity('FORGE', 'FORG'), 80);
    assert.equal(visualSimilarity('Fórge', 'forge'), 100);
    assert.equal(visualSimilarity('FORG', 'FORGE'), visualSimilarity('FORGE', 'FORG'));
    for (const score of [visualSimilarity('A', 'B'), visualSimilarity('A', 'A')]) {
      assert.ok(score >= 0 && score <= 100);
    }
  });

  it('produces deterministic four-character Standard American Soundex codes', () => {
    for (const [value, expected] of [['Robert', 'R163'], ['Rupert', 'R163'], ['Ashcraft', 'A261'], ['Tymczak', 'T522']]) {
      assert.equal(soundex(value), expected);
      assert.equal(soundex(value), soundex(value));
      assert.equal(soundex(value).length, 4);
    }
    assert.notEqual(soundex('Robert'), soundex('Smith'));
    assert.throws(() => soundex('Robert Smith'), /one token/);
  });

  it('compares multiword phonetic tokens order-independently with multiplicity', () => {
    assert.equal(phoneticSimilarity('Robert Smith', 'Smith Robert'), 100);
    assert.equal(phoneticSimilarity('Robert Robert Smith', 'Smith Robert Jones'), 67);
    assert.equal(phoneticSimilarity('Robert', 'Smith'), 0);
    assert.equal(phoneticSimilarity('Robert', 'Rupert'), 100);
    for (const [left, right] of [['Robert', 'Smith'], ['Robert Smith', 'Rupert Jones'], ['Robert', 'Robert']]) {
      const score = phoneticSimilarity(left, right);
      assert.ok(score >= 0 && score <= 100);
      assert.equal(score, phoneticSimilarity(left, right));
    }
  });

  it('calculates deduplicated, numerically sorted Nice-class overlap', () => {
    assert.deepEqual(niceClassOverlap([42, 9, 9], [35, 42]), {
      hasOverlap: true, intersection: [42], union: [9, 35, 42], overlapScore: 33,
    });
    assert.deepEqual(niceClassOverlap([1], [2, 3]), {
      hasOverlap: false, intersection: [], union: [1, 2, 3], overlapScore: 0,
    });
    assert.deepEqual(niceClassOverlap([], []), {
      hasOverlap: false, intersection: [], union: [], overlapScore: 0,
    });
    for (const invalid of [null, '9', [0], [46], [1.5], [{}]]) {
      assert.throws(() => niceClassOverlap(invalid, []));
      assert.throws(() => niceClassOverlap([], invalid));
    }
  });

  it('does not mutate string or class-array inputs', () => {
    const left = [42, 9, 9];
    const right = [35, 42];
    const originalLeft = [...left];
    const originalRight = [...right];
    normalizeMarkText(' forge ');
    visualSimilarity('forge', 'forg');
    phoneticSimilarity('Robert Smith', 'Smith Robert');
    niceClassOverlap(left, right);
    assert.deepEqual(left, originalLeft);
    assert.deepEqual(right, originalRight);
  });
});
