import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculateEta } from './utils.js';

describe('calculateEta', () => {
  it('returns object with expected shape', () => {
    const result = calculateEta({ userStories: [] }, Date.now());
    assert.ok('elapsedMs' in result, 'should have elapsedMs');
    assert.ok('etaMs' in result, 'should have etaMs');
    assert.ok('etaFormatted' in result, 'should have etaFormatted');
    assert.ok('avgPerCategory' in result, 'should have avgPerCategory');
  });

  it('uses fallback defaults when no completed stories', () => {
    const stories = [
      { id: 'US-001', effort: 'low', model: 'sonnet', passes: false },
      { id: 'US-002', effort: 'medium', model: 'sonnet', passes: false },
    ];
    const loopStart = Date.now() - 30000; // 30s ago
    const result = calculateEta({ userStories: stories }, loopStart);

    // With 2 pending stories (low/sonnet=2m, medium/sonnet=5m) => 7 min ETA
    assert.ok(result.etaMs > 0, 'etaMs should be positive');
    assert.ok(typeof result.etaFormatted === 'string', 'etaFormatted should be string');
    assert.ok(result.etaFormatted.includes('~'), 'etaFormatted should include ~');
  });

  it('groups completed story durations by effort+model category', () => {
    const stories = [
      { id: 'US-001', effort: 'low', model: 'sonnet', passes: true, durationMs: 60000 },  // 1m
      { id: 'US-002', effort: 'low', model: 'sonnet', passes: true, durationMs: 180000 }, // 3m
      { id: 'US-003', effort: 'medium', model: 'opus', passes: false },
    ];
    const loopStart = Date.now() - 60000;
    const result = calculateEta({ userStories: stories }, loopStart);

    // avg for low/sonnet = (60000+180000)/2 = 120000 = 2m
    assert.ok(result.avgPerCategory['low/sonnet'] === 120000, 'should average durations by category');
    // 1 pending story (medium/opus) => fallback 10m
    assert.ok(result.etaMs > 0);
  });

  it('uses category average for matching pending stories', () => {
    const stories = [
      { id: 'US-001', effort: 'high', model: 'sonnet', passes: true, durationMs: 300000 }, // 5m
      { id: 'US-002', effort: 'high', model: 'sonnet', passes: true, durationMs: 900000 }, // 15m
      { id: 'US-003', effort: 'high', model: 'sonnet', passes: false },
    ];
    const loopStart = Date.now() - 120000; // 2m ago
    const result = calculateEta({ userStories: stories }, loopStart);

    // avg for high/sonnet = (300000+900000)/2 = 600000 = 10m
    // pending: 1 story => eta = 600000ms = 10m
    assert.ok(result.avgPerCategory['high/sonnet'] === 600000);
    // ETA should be around 10m (minus elapsed)
    assert.ok(result.etaMs >= 0);
  });

  it('uses fallback defaults for categories with no history', () => {
    const stories = [
      { id: 'US-001', effort: 'low', model: 'sonnet', passes: true, durationMs: 60000 },
      { id: 'US-002', effort: 'high', model: 'opus', passes: false },  // no history, fallback=20m
    ];
    const loopStart = Date.now() - 30000;
    const result = calculateEta({ userStories: stories }, loopStart);

    // low/sonnet avg = 60000, high/opus fallback = 1200000 (20m)
    // pending: 1 high/opus story => estimated 20m (1200000ms)
    assert.ok(result.etaMs >= 0);
    assert.ok(result.avgPerCategory['low/sonnet'] === 60000);
  });

  it('returns etaMs of 0 when all stories complete', () => {
    const stories = [
      { id: 'US-001', effort: 'low', model: 'sonnet', passes: true, durationMs: 60000 },
    ];
    const result = calculateEta({ userStories: stories }, Date.now() - 1000);
    assert.equal(result.etaMs, 0, 'etaMs should be 0 when no pending stories');
  });

  it('fallback defaults: low/sonnet=2m, low/opus=4m, medium/sonnet=5m, medium/opus=10m, high/sonnet=10m, high/opus=20m', () => {
    const stories = [
      { id: 'S1', effort: 'low', model: 'sonnet', passes: false },
      { id: 'S2', effort: 'low', model: 'opus', passes: false },
      { id: 'S3', effort: 'medium', model: 'sonnet', passes: false },
      { id: 'S4', effort: 'medium', model: 'opus', passes: false },
      { id: 'S5', effort: 'high', model: 'sonnet', passes: false },
      { id: 'S6', effort: 'high', model: 'opus', passes: false },
    ];
    const loopStart = Date.now();
    const result = calculateEta({ userStories: stories }, loopStart);
    // 2+4+5+10+10+20 = 51 min = 3060000ms
    const expected = (2 + 4 + 5 + 10 + 10 + 20) * 60000;
    assert.ok(Math.abs(result.etaMs - expected) < 1000, `expected ~${expected}ms but got ${result.etaMs}ms`);
  });

  it('formats etaFormatted with ~ prefix and minutes', () => {
    const stories = [
      { id: 'US-001', effort: 'low', model: 'sonnet', passes: false },
    ];
    const loopStart = Date.now();
    const result = calculateEta({ userStories: stories }, loopStart);
    // low/sonnet = 2m fallback
    assert.ok(result.etaFormatted.startsWith('~'), 'should start with ~');
    assert.ok(result.etaFormatted.includes('m'), 'should include minutes');
  });

  it('elapsedMs reflects time since loopStart', () => {
    const loopStart = Date.now() - 90000; // 90s ago
    const result = calculateEta({ userStories: [] }, loopStart);
    assert.ok(result.elapsedMs >= 90000, 'elapsedMs should be at least 90000');
    assert.ok(result.elapsedMs < 95000, 'elapsedMs should be close to 90000');
  });
});
