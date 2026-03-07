import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { ActivityLogger } from './activity.js';

const TMP = join(tmpdir(), 'ralph-activity-test-' + process.pid);

describe('ActivityLogger', () => {
  let logger;

  before(() => {
    mkdirSync(TMP, { recursive: true });
    logger = new ActivityLogger(TMP);
  });

  after(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  it('creates .ralph/logs/ directory on construction', () => {
    assert.ok(existsSync(join(TMP, 'logs')));
  });

  it('emit() appends a JSONL line to activity.jsonl', () => {
    logger.emit({ type: 'loop_start', run: 1 });
    const content = readFileSync(join(TMP, 'activity.jsonl'), 'utf8');
    const lines = content.trim().split('\n').filter(Boolean);
    assert.equal(lines.length, 1);
    const obj = JSON.parse(lines[0]);
    assert.equal(obj.type, 'loop_start');
    assert.ok(obj.ts);
    assert.equal(obj.run, 1);
  });

  it('emit() accumulates multiple events', () => {
    logger.emit({ type: 'story_start', storyId: 'US-001' });
    logger.emit({ type: 'agent_done', storyId: 'US-001' });
    const content = readFileSync(join(TMP, 'activity.jsonl'), 'utf8');
    const lines = content.trim().split('\n').filter(Boolean);
    assert.equal(lines.length, 3); // including previous test's line
  });

  it('readActivity(limit) returns last N events in order', () => {
    const events = logger.readActivity(2);
    assert.equal(events.length, 2);
    assert.equal(events[0].type, 'story_start');
    assert.equal(events[1].type, 'agent_done');
  });

  it('clear() truncates activity.jsonl', () => {
    logger.clear();
    const content = readFileSync(join(TMP, 'activity.jsonl'), 'utf8');
    assert.equal(content, '');
  });

  it('startStoryLog() returns a writable stream and creates log file', async () => {
    const stream = logger.startStoryLog('US-001');
    assert.ok(stream);
    assert.equal(typeof stream.write, 'function');
    await new Promise((resolve, reject) => {
      stream.end('hello\n', (err) => err ? reject(err) : resolve());
    });
    assert.ok(existsSync(join(TMP, 'logs', 'US-001.log')));
  });

  it('appendStoryLog() appends text to story log', async () => {
    await logger.appendStoryLog('US-001', 'world\n');
    const content = readFileSync(join(TMP, 'logs', 'US-001.log'), 'utf8');
    assert.ok(content.includes('world'));
  });

  it('readStoryLog() returns full log content', () => {
    const content = logger.readStoryLog('US-001');
    assert.ok(content.includes('world'));
  });

  it('readStoryLog() returns empty string for missing log', () => {
    const content = logger.readStoryLog('nonexistent');
    assert.equal(content, '');
  });

  it('startStoryLog() truncates existing log', async () => {
    logger.startStoryLog('US-002');
    const stream = logger.startStoryLog('US-002');
    await new Promise((resolve, reject) => {
      stream.end('fresh\n', (err) => err ? reject(err) : resolve());
    });
    const content = logger.readStoryLog('US-002');
    assert.equal(content, 'fresh\n');
  });
});
