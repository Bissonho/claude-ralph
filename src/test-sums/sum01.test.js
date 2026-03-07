import { test } from 'node:test';
import assert from 'node:assert';
import { sum } from './sum01.js';

test('sum(2,3) returns 5', () => {
  assert.strictEqual(sum(2, 3), 5);
});

test('sum(-1,1) returns 0', () => {
  assert.strictEqual(sum(-1, 1), 0);
});

test('sum(0,0) returns 0', () => {
  assert.strictEqual(sum(0, 0), 0);
});
