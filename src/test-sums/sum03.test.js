import { test } from 'node:test';
import assert from 'node:assert';
import { sumEvens } from './sum03.js';

test('sumEvens([1,2,3,4]) returns 6', () => {
  assert.strictEqual(sumEvens([1, 2, 3, 4]), 6);
});

test('sumEvens([1,3,5]) returns 0', () => {
  assert.strictEqual(sumEvens([1, 3, 5]), 0);
});

test('sumEvens([2,4,6]) returns 12', () => {
  assert.strictEqual(sumEvens([2, 4, 6]), 12);
});
