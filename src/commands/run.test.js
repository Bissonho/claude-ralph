import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Test parseRunArgs via cli.js by importing the module's internals
// Since parseRunArgs is not exported, we test it via the behavior of the run command
// by checking --dry-run flag parsing through a mock

// We test the dry-run logic directly in run.js by checking that:
// 1. dryRun mode prints stories without spawning agents
// 2. dryRun mode does not acquire lock

import { run } from './run.js';
import { Config } from '../core/config.js';
import { tmpdir } from 'os';
import { mkdtempSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

function createTestPrd(dir) {
  writeFileSync(join(dir, 'prd.json'), JSON.stringify({
    project: 'test-project',
    branchName: 'test-branch',
    userStories: [
      {
        id: 'US-001',
        title: 'Test Story',
        description: 'A test story',
        priority: 1,
        passes: false,
        effort: 'low',
        model: 'sonnet',
        research: false,
      },
      {
        id: 'US-002',
        title: 'Done Story',
        description: 'A done story',
        priority: 2,
        passes: true,
        effort: 'medium',
        model: 'opus',
        research: false,
      }
    ]
  }));
}

describe('--dry-run flag', () => {
  it('does not throw and completes without spawning agents', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'ralph-test-'));
    createTestPrd(tmpDir);

    const output = [];
    const origLog = console.log;
    console.log = (...args) => output.push(args.join(' '));

    try {
      await run({ prdDir: tmpDir, dryRun: true });
    } finally {
      console.log = origLog;
    }

    const joined = output.join('\n');
    // Should print pending story details
    assert.ok(joined.includes('US-001'), 'should print pending story id');
    assert.ok(joined.includes('Test Story'), 'should print pending story title');
    assert.ok(joined.includes('sonnet'), 'should print model');
    assert.ok(joined.includes('low'), 'should print effort');
    // Should NOT print done stories
    assert.ok(!joined.includes('US-002'), 'should not print completed stories');
  });

  it('does not acquire lock file in dry-run mode', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'ralph-test-'));
    createTestPrd(tmpDir);

    const origLog = console.log;
    console.log = () => {};
    try {
      await run({ prdDir: tmpDir, dryRun: true });
    } finally {
      console.log = origLog;
    }

    // Lock file should NOT exist after dry run
    const config = new Config(tmpDir);
    const { existsSync } = await import('fs');
    assert.ok(!existsSync(config.lockFile), 'lock file should not be created in dry-run mode');
  });
});
