import { test } from 'node:test';
import assert from 'node:assert';
import { sumOdds } from './sum04.js';

test('sumOdds([1,2,3,4]) returns 4', () => {
  assert.strictEqual(sumOdds([1, 2, 3, 4]), 4);
});

test('sumOdds([2,4,6]) returns 0', () => {
  assert.strictEqual(sumOdds([2, 4, 6]), 0);
});

test('sumOdds([1,3,5]) returns 9', () => {
  assert.strictEqual(sumOdds([1, 3, 5]), 9);
});
