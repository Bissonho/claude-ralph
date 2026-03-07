import { test } from 'node:test';
import assert from 'node:assert';
import { sumArray } from './sum02.js';

test('sumArray([1,2,3]) returns 6', () => {
  assert.strictEqual(sumArray([1, 2, 3]), 6);
});

test('sumArray([]) returns 0', () => {
  assert.strictEqual(sumArray([]), 0);
});

test('sumArray([-1,5,3]) returns 7', () => {
  assert.strictEqual(sumArray([-1, 5, 3]), 7);
});
