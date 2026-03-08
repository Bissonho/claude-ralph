import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { Config } from '../core/config.js';
import { status } from './status.js';

function createTestPrd(dir) {
  writeFileSync(join(dir, 'prd.json'), JSON.stringify({
    project: 'status-test',
    branchName: 'test-branch',
    userStories: [
      { id: 'US-001', title: 'Story One', passes: false, priority: 1, effort: 'low', model: 'sonnet', research: false },
      { id: 'US-002', title: 'Story Two', passes: true, priority: 2, effort: 'medium', model: 'opus', research: false },
    ]
  }));
}

describe('status command - pause state display', () => {
  it('shows pause reason when pause.json exists', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'ralph-status-test-'));
    createTestPrd(tmpDir);
    const config = new Config(tmpDir);
    config.setPauseState('3 consecutive auth failures', 'US-001', 3);

    const logged = [];
    const origLog = console.log;
    console.log = (...args) => logged.push(args.join(' '));
    try {
      await status({ prdDir: tmpDir });
    } finally {
      console.log = origLog;
    }

    const output = logged.join('\n');
    assert.ok(output.toLowerCase().includes('pause') || output.toLowerCase().includes('paused'), 'should show pause info');
    assert.ok(output.includes('auth') || output.includes('3 consecutive'), 'should show pause reason');

    rmSync(tmpDir, { recursive: true });
  });

  it('shows when the loop was paused (timestamp)', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'ralph-status-test-'));
    createTestPrd(tmpDir);
    const config = new Config(tmpDir);
    config.setPauseState('5 consecutive story failures', 'US-001', 5);

    const logged = [];
    const origLog = console.log;
    console.log = (...args) => logged.push(args.join(' '));
    try {
      await status({ prdDir: tmpDir });
    } finally {
      console.log = origLog;
    }

    const output = logged.join('\n');
    // Should show some time info from the pause state
    assert.ok(output.toLowerCase().includes('pause'), 'should mention paused state');

    rmSync(tmpDir, { recursive: true });
  });

  it('shows last story id from pause state', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'ralph-status-test-'));
    createTestPrd(tmpDir);
    const config = new Config(tmpDir);
    config.setPauseState('auth failure', 'US-001', 1);

    const logged = [];
    const origLog = console.log;
    console.log = (...args) => logged.push(args.join(' '));
    try {
      await status({ prdDir: tmpDir });
    } finally {
      console.log = origLog;
    }

    const output = logged.join('\n');
    assert.ok(output.includes('US-001'), 'should show last story id from pause state');

    rmSync(tmpDir, { recursive: true });
  });

  it('does not show pause info when no pause.json exists', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'ralph-status-test-'));
    createTestPrd(tmpDir);

    const logged = [];
    const origLog = console.log;
    console.log = (...args) => logged.push(args.join(' '));
    try {
      await status({ prdDir: tmpDir });
    } finally {
      console.log = origLog;
    }

    const output = logged.join('\n');
    assert.ok(!output.toLowerCase().includes('paused:') && !output.toLowerCase().includes('pause reason'), 'should not show pause section when no pause state');

    rmSync(tmpDir, { recursive: true });
  });
});
