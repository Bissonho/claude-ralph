import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

// Test parseRunArgs via cli.js by importing the module's internals
// Since parseRunArgs is not exported, we test it via the behavior of the run command
// by checking --dry-run flag parsing through a mock

// We test the dry-run logic directly in run.js by checking that:
// 1. dryRun mode prints stories without spawning agents
// 2. dryRun mode does not acquire lock

import { run, readAndClearFeedback } from './run.js';
import { Config } from '../core/config.js';
import { tmpdir } from 'os';
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'fs';
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
    assert.ok(!existsSync(config.lockFile), 'lock file should not be created in dry-run mode');
  });
});

describe('feedback mechanism', () => {
  it('readAndClearFeedback returns content and deletes .feedback file', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'ralph-feedback-test-'));
    writeFileSync(join(tmpDir, '.feedback'), 'Fix the auth bug');
    const content = readAndClearFeedback(tmpDir);
    assert.equal(content, 'Fix the auth bug');
    assert.ok(!existsSync(join(tmpDir, '.feedback')), '.feedback file should be deleted after reading');
    rmSync(tmpDir, { recursive: true });
  });

  it('readAndClearFeedback returns empty string when no .feedback file', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'ralph-feedback-test-'));
    const content = readAndClearFeedback(tmpDir);
    assert.equal(content, '');
    rmSync(tmpDir, { recursive: true });
  });

  it('readAndClearFeedback returns empty string for whitespace-only .feedback file', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'ralph-feedback-test-'));
    writeFileSync(join(tmpDir, '.feedback'), '   \n  ');
    const content = readAndClearFeedback(tmpDir);
    assert.equal(content, '');
    rmSync(tmpDir, { recursive: true });
  });
});

describe('retryWithBackoff', () => {
  let retryWithBackoff;
  let classifyError;

  before(async () => {
    ({ retryWithBackoff } = await import('./run.js'));
    ({ classifyError } = await import('../core/runner.js'));
  });

  const noopLog = () => {};
  const instantSleep = async () => {};

  it('returns result immediately on success without retrying', async () => {
    let callCount = 0;
    const spawnFn = async () => { callCount++; return { code: 0, stderr: '', killed: false }; };
    const { result, retries } = await retryWithBackoff(spawnFn, classifyError, noopLog, instantSleep);
    assert.equal(callCount, 1);
    assert.equal(retries, 0);
    assert.equal(result.code, 0);
  });

  it('retries on retryable error and succeeds on second attempt', async () => {
    let callCount = 0;
    const spawnFn = async () => {
      callCount++;
      if (callCount === 1) return { code: 1, stderr: 'rate limit 429', killed: false };
      return { code: 0, stderr: '', killed: false };
    };
    const { result, retries } = await retryWithBackoff(spawnFn, classifyError, noopLog, instantSleep);
    assert.equal(callCount, 2);
    assert.equal(retries, 1);
    assert.equal(result.code, 0);
  });

  it('does not retry non-retryable errors (auth)', async () => {
    let callCount = 0;
    const spawnFn = async () => { callCount++; return { code: 1, stderr: '401 unauthorized', killed: false }; };
    const { result, skipped } = await retryWithBackoff(spawnFn, classifyError, noopLog, instantSleep);
    assert.equal(callCount, 1, 'should only call spawnFn once for non-retryable errors');
    assert.equal(skipped, true);
  });

  it('does not retry killed processes', async () => {
    let callCount = 0;
    const spawnFn = async () => { callCount++; return { code: -1, stderr: '', killed: true }; };
    const { skipped } = await retryWithBackoff(spawnFn, classifyError, noopLog, instantSleep);
    assert.equal(callCount, 1);
    assert.equal(skipped, true);
  });

  it('exhausts all 3 retries and returns exhausted=true', async () => {
    let callCount = 0;
    const spawnFn = async () => { callCount++; return { code: 1, stderr: 'ECONNREFUSED network error', killed: false }; };
    const { result, retries, exhausted } = await retryWithBackoff(spawnFn, classifyError, noopLog, instantSleep);
    assert.equal(callCount, 4, 'should call spawnFn 4 times: 1 initial + 3 retries');
    assert.equal(retries, 3);
    assert.equal(exhausted, true);
  });

  it('uses exponential backoff delays totaling 5s + 15s + 45s = 65s', async () => {
    const delays = [];
    const sleepFn = async (ms) => { delays.push(ms); };
    const spawnFn = async () => ({ code: 1, stderr: 'ECONNREFUSED', killed: false });
    await retryWithBackoff(spawnFn, classifyError, noopLog, sleepFn);
    const total = delays.reduce((a, b) => a + b, 0);
    assert.equal(total, 5000 + 15000 + 45000);
  });

  it('logs each retry with error type, attempt number, and wait duration', async () => {
    const logs = [];
    const logFn = (msg) => logs.push(msg);
    const sleepFn = async () => {};
    const spawnFn = async () => ({ code: 1, stderr: 'rate limit 429', killed: false });
    await retryWithBackoff(spawnFn, classifyError, logFn, sleepFn);
    const retryLogs = logs.filter(l => l.includes('Retry attempt'));
    assert.equal(retryLogs.length, 3, 'should log one message per retry attempt');
    assert.ok(retryLogs[0].includes('rate_limit'), 'should include error type');
    assert.ok(retryLogs[0].includes('1/3'), 'should include attempt 1 of 3');
    assert.ok(retryLogs[0].includes('5s'), 'should include 5s wait for first retry');
    assert.ok(retryLogs[1].includes('2/3'), 'should include attempt 2 of 3');
    assert.ok(retryLogs[1].includes('15s'), 'should include 15s wait for second retry');
    assert.ok(retryLogs[2].includes('3/3'), 'should include attempt 3 of 3');
    assert.ok(retryLogs[2].includes('45s'), 'should include 45s wait for third retry');
  });

  it('logs countdown messages during backoff wait (every 5s chunk)', async () => {
    const logs = [];
    const logFn = (msg) => logs.push(msg);
    const sleepFn = async () => {};
    const spawnFn = async () => ({ code: 1, stderr: 'ECONNREFUSED', killed: false });
    await retryWithBackoff(spawnFn, classifyError, logFn, sleepFn);
    // 15s wait (retry 2) → 2 countdown messages; 45s wait (retry 3) → 8 countdown messages
    const countdownLogs = logs.filter(l => l.includes('remaining'));
    assert.ok(countdownLogs.length > 0, 'should have countdown messages during long backoff waits');
  });

  it('BACKOFF_DELAYS export is [5000, 15000, 45000]', async () => {
    const { BACKOFF_DELAYS } = await import('./run.js');
    assert.deepEqual(BACKOFF_DELAYS, [5000, 15000, 45000]);
  });
});

describe('checkAutoPause', () => {
  let checkAutoPause;

  before(async () => {
    ({ checkAutoPause } = await import('./run.js'));
  });

  it('returns null for empty failures array', () => {
    assert.equal(checkAutoPause([]), null);
  });

  it('returns null for 2 consecutive same-type non-retryable failures', () => {
    const failures = [
      { storyId: 'US-001', errorType: 'auth', retryable: false },
      { storyId: 'US-002', errorType: 'auth', retryable: false },
    ];
    assert.equal(checkAutoPause(failures), null);
  });

  it('pauses after 3 consecutive same non-retryable error type (auth)', () => {
    const failures = [
      { storyId: 'US-001', errorType: 'auth', retryable: false },
      { storyId: 'US-002', errorType: 'auth', retryable: false },
      { storyId: 'US-003', errorType: 'auth', retryable: false },
    ];
    const result = checkAutoPause(failures);
    assert.ok(result, 'should return a pause object');
    assert.ok(result.reason, 'should have reason field');
    assert.ok(result.reason.includes('auth'), 'reason should mention error type');
    assert.ok(result.reason.includes('3'), 'reason should mention count');
  });

  it('does not pause after 3 consecutive same RETRYABLE error type', () => {
    const failures = [
      { storyId: 'US-001', errorType: 'network', retryable: true },
      { storyId: 'US-002', errorType: 'network', retryable: true },
      { storyId: 'US-003', errorType: 'network', retryable: true },
    ];
    assert.equal(checkAutoPause(failures), null);
  });

  it('pauses after 5 consecutive failures of any type', () => {
    const failures = [
      { storyId: 'US-001', errorType: 'network', retryable: true },
      { storyId: 'US-002', errorType: 'auth', retryable: false },
      { storyId: 'US-003', errorType: 'timeout', retryable: true },
      { storyId: 'US-004', errorType: 'network', retryable: true },
      { storyId: 'US-005', errorType: 'unknown', retryable: true },
    ];
    const result = checkAutoPause(failures);
    assert.ok(result, 'should return a pause object');
    assert.ok(result.reason.includes('5'), 'reason should mention count');
  });

  it('does not pause for 4 consecutive mixed-type failures', () => {
    const failures = [
      { storyId: 'US-001', errorType: 'network', retryable: true },
      { storyId: 'US-002', errorType: 'auth', retryable: false },
      { storyId: 'US-003', errorType: 'timeout', retryable: true },
      { storyId: 'US-004', errorType: 'network', retryable: true },
    ];
    assert.equal(checkAutoPause(failures), null);
  });

  it('includes a user-facing message with recovery instructions', () => {
    const failures = [
      { storyId: 'US-001', errorType: 'auth', retryable: false },
      { storyId: 'US-002', errorType: 'auth', retryable: false },
      { storyId: 'US-003', errorType: 'auth', retryable: false },
    ];
    const result = checkAutoPause(failures);
    assert.ok(result.message, 'should include user-facing message');
    assert.ok(result.message.includes('ralph run') || result.message.toLowerCase().includes('resume'), 'message should include recovery instructions');
  });

  it('pauses after exactly 5 failures when all are same retryable type', () => {
    const failures = [
      { storyId: 'US-001', errorType: 'network', retryable: true },
      { storyId: 'US-002', errorType: 'network', retryable: true },
      { storyId: 'US-003', errorType: 'network', retryable: true },
      { storyId: 'US-004', errorType: 'network', retryable: true },
      { storyId: 'US-005', errorType: 'network', retryable: true },
    ];
    const result = checkAutoPause(failures);
    assert.ok(result, 'should pause after 5 failures even if all same retryable type');
  });

  it('pauses after more than 5 failures', () => {
    const failures = Array.from({ length: 6 }, (_, i) => ({
      storyId: `US-00${i + 1}`,
      errorType: 'unknown',
      retryable: true,
    }));
    const result = checkAutoPause(failures);
    assert.ok(result, 'should pause for 6 failures');
  });
});

describe('resume from pause state', () => {
  it('run() logs resume message when pause.json exists', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'ralph-resume-test-'));
    writeFileSync(join(tmpDir, 'prd.json'), JSON.stringify({
      project: 'resume-test',
      branchName: 'test-branch',
      userStories: [
        { id: 'RES-001', title: 'Story One', passes: true, priority: 1, effort: 'low', model: 'sonnet', research: false },
        { id: 'RES-002', title: 'Story Two', passes: false, priority: 2, effort: 'low', model: 'sonnet', research: false },
      ]
    }));

    const config = new Config(tmpDir);
    config.setPauseState('3 consecutive auth failures', 'RES-001', 3);

    const logged = [];
    const origInfo = process.stderr.write.bind(process.stderr);
    const origLog = console.log;
    console.log = (...args) => logged.push(args.join(' '));

    try {
      await run({ prdDir: tmpDir, dryRun: true });
    } finally {
      console.log = origLog;
    }

    const allOutput = logged.join('\n');
    assert.ok(allOutput.includes('Resuming') || allOutput.includes('resume'), 'should log resume message');
    assert.ok(allOutput.includes('auth') || allOutput.includes('RES-001'), 'should include pause reason or last story');

    rmSync(tmpDir, { recursive: true });
  });

  it('run() deletes pause.json after detecting it', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'ralph-resume-test-'));
    writeFileSync(join(tmpDir, 'prd.json'), JSON.stringify({
      project: 'resume-test',
      branchName: 'test-branch',
      userStories: [
        { id: 'RES-001', title: 'Done Story', passes: true, priority: 1, effort: 'low', model: 'sonnet', research: false },
      ]
    }));

    const config = new Config(tmpDir);
    config.setPauseState('auth failure', 'RES-001', 1);
    assert.ok(existsSync(config.pauseFile), 'pause.json should exist before run');

    const origLog = console.log;
    console.log = () => {};
    try {
      await run({ prdDir: tmpDir, dryRun: true });
    } finally {
      console.log = origLog;
    }

    assert.ok(!existsSync(config.pauseFile), 'pause.json should be deleted after run detects it');

    rmSync(tmpDir, { recursive: true });
  });

  it('run() starts normally when no pause.json exists', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'ralph-no-pause-test-'));
    writeFileSync(join(tmpDir, 'prd.json'), JSON.stringify({
      project: 'no-pause-test',
      branchName: 'test-branch',
      userStories: [
        { id: 'US-001', title: 'Test Story', passes: false, priority: 1, effort: 'low', model: 'sonnet', research: false },
      ]
    }));

    const logged = [];
    const origLog = console.log;
    console.log = (...args) => logged.push(args.join(' '));
    try {
      await run({ prdDir: tmpDir, dryRun: true });
    } finally {
      console.log = origLog;
    }

    const allOutput = logged.join('\n');
    assert.ok(!allOutput.toLowerCase().includes('resuming'), 'should not show resume message when no pause state');

    rmSync(tmpDir, { recursive: true });
  });
});
