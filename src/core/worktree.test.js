import { describe, it, before, after, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const TMP = join(tmpdir(), 'ralph-worktree-test-' + process.pid);
const PRD_DIR = join(TMP, '.ralph');
const WORKTREES_DIR = join(TMP, '.ralph-worktrees');

// We need to mock execSync and spawn since we can't do real git worktree ops in tests
let mockExecSync;
let mockSpawn;

// Dynamic import after mocking
let WorktreeManager;

before(async () => {
  mkdirSync(PRD_DIR, { recursive: true });

  // Create a minimal prd.json so Config works
  writeFileSync(join(PRD_DIR, 'prd.json'), JSON.stringify({
    project: 'test-project',
    branchName: 'main',
    userStories: [{ id: 'US-001', title: 'Test story', passes: false }],
  }, null, 2));

  // Create progress.txt with patterns section
  writeFileSync(join(PRD_DIR, 'progress.txt'),
    '# Ralph Progress Log\nStarted: 2026-01-01\n---\n\n## Codebase Patterns\n- Use ESM imports\n');

  const mod = await import('./worktree.js');
  WorktreeManager = mod.WorktreeManager;
});

after(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe('WorktreeManager - constructor', () => {
  it('derives projectRoot and worktreesDir from prdDir', () => {
    const wm = new WorktreeManager(PRD_DIR);
    assert.equal(wm.prdDir, PRD_DIR);
    assert.equal(wm.projectRoot, TMP);
    assert.equal(wm.worktreesDir, WORKTREES_DIR);
  });

  it('sets registryFile to .ralph/worktrees.json', () => {
    const wm = new WorktreeManager(PRD_DIR);
    assert.equal(wm.registryFile, join(PRD_DIR, 'worktrees.json'));
  });
});

describe('WorktreeManager - registry', () => {
  let wm;

  beforeEach(() => {
    wm = new WorktreeManager(PRD_DIR);
    // Clean up registry between tests
    rmSync(wm.registryFile, { force: true });
  });

  it('loadRegistry returns empty array when file missing', () => {
    const registry = wm.loadRegistry();
    assert.deepEqual(registry, []);
  });

  it('saveRegistry writes and loadRegistry reads back', () => {
    const entries = [
      { name: 'feature-a', branch: 'feat/a', path: '/tmp/wt-a', createdAt: '2026-01-01' },
    ];
    wm.saveRegistry(entries);
    assert.ok(existsSync(wm.registryFile));
    const loaded = wm.loadRegistry();
    assert.deepEqual(loaded, entries);
  });

  it('saveRegistry overwrites existing data', () => {
    wm.saveRegistry([{ name: 'old', branch: 'old', path: '/tmp/old', createdAt: '2026-01-01' }]);
    wm.saveRegistry([{ name: 'new', branch: 'new', path: '/tmp/new', createdAt: '2026-01-02' }]);
    const loaded = wm.loadRegistry();
    assert.equal(loaded.length, 1);
    assert.equal(loaded[0].name, 'new');
  });
});

describe('WorktreeManager - create', () => {
  let wm;

  beforeEach(() => {
    wm = new WorktreeManager(PRD_DIR);
    rmSync(wm.registryFile, { force: true });
    rmSync(WORKTREES_DIR, { recursive: true, force: true });
    // Mock execSync to avoid actual git commands
    wm._exec = mock.fn(() => '');
  });

  it('creates worktree directory and registers it', () => {
    wm.create('feature-a', 'feat/a');
    const registry = wm.loadRegistry();
    assert.equal(registry.length, 1);
    assert.equal(registry[0].name, 'feature-a');
    assert.equal(registry[0].branch, 'feat/a');
    assert.ok(registry[0].path.includes('feature-a'));
    assert.ok(registry[0].createdAt);
  });

  it('creates .ralph/ dir in worktree path', () => {
    wm.create('feature-b', 'feat/b');
    const registry = wm.loadRegistry();
    const wtRalphDir = join(registry[0].path, '.ralph');
    assert.ok(existsSync(wtRalphDir));
  });

  it('copies codebase patterns to worktree progress.txt', () => {
    wm.create('feature-c', 'feat/c');
    const registry = wm.loadRegistry();
    const wtProgress = join(registry[0].path, '.ralph', 'progress.txt');
    assert.ok(existsSync(wtProgress));
    const content = readFileSync(wtProgress, 'utf-8');
    assert.ok(content.includes('Codebase Patterns'));
    assert.ok(content.includes('Use ESM imports'));
  });

  it('throws if name already exists', () => {
    wm.create('dup', 'feat/dup');
    assert.throws(() => wm.create('dup', 'feat/dup2'), /already exists/);
  });

  it('calls git worktree add with correct args', () => {
    wm.create('feature-d', 'feat/d');
    const calls = wm._exec.mock.calls;
    assert.ok(calls.length > 0);
    const addCall = calls.find(c => c.arguments[0].includes('worktree add'));
    assert.ok(addCall, 'should call git worktree add');
    assert.ok(addCall.arguments[0].includes('feat/d'));
  });
});

describe('WorktreeManager - remove', () => {
  let wm;

  beforeEach(() => {
    wm = new WorktreeManager(PRD_DIR);
    rmSync(wm.registryFile, { force: true });
    rmSync(WORKTREES_DIR, { recursive: true, force: true });
    wm._exec = mock.fn(() => '');
    wm.create('to-remove', 'feat/remove');
  });

  it('removes worktree from registry', () => {
    wm.remove('to-remove');
    const registry = wm.loadRegistry();
    assert.equal(registry.length, 0);
  });

  it('calls git worktree remove', () => {
    wm.remove('to-remove');
    const calls = wm._exec.mock.calls;
    const removeCall = calls.find(c => c.arguments[0].includes('worktree remove'));
    assert.ok(removeCall, 'should call git worktree remove');
  });

  it('throws if worktree not found', () => {
    assert.throws(() => wm.remove('nonexistent'), /not found/);
  });

  it('throws if worktree is running', () => {
    const registry = wm.loadRegistry();
    const lockFile = join(registry[0].path, '.ralph', '.lock');
    writeFileSync(lockFile, '99999');
    // Mock process.kill to simulate running process — use a fake PID check
    wm._isProcessRunning = mock.fn(() => true);
    assert.throws(() => wm.remove('to-remove'), /running/);
  });
});

describe('WorktreeManager - list', () => {
  let wm;

  beforeEach(() => {
    wm = new WorktreeManager(PRD_DIR);
    rmSync(wm.registryFile, { force: true });
    rmSync(WORKTREES_DIR, { recursive: true, force: true });
    wm._exec = mock.fn(() => '');
    wm.create('wt-1', 'feat/1');
    wm.create('wt-2', 'feat/2');
  });

  it('returns all registered worktrees with status', () => {
    const entries = wm.list();
    assert.equal(entries.length, 2);
    assert.equal(entries[0].name, 'wt-1');
    assert.equal(entries[1].name, 'wt-2');
  });

  it('returns idle status by default', () => {
    const entries = wm.list();
    assert.equal(entries[0].status, 'idle');
    assert.equal(entries[1].status, 'idle');
  });

  it('returns running status when lock file exists with live PID', () => {
    const registry = wm.loadRegistry();
    writeFileSync(join(registry[0].path, '.ralph', '.lock'), '99999');
    wm._isProcessRunning = mock.fn(() => true);
    const entries = wm.list();
    assert.equal(entries[0].status, 'running');
  });

  it('returns complete status from status file', () => {
    const registry = wm.loadRegistry();
    writeFileSync(join(registry[0].path, '.ralph', 'status.txt'), 'complete\n');
    const entries = wm.list();
    assert.equal(entries[0].status, 'complete');
  });
});

describe('WorktreeManager - getConfig', () => {
  let wm;

  beforeEach(() => {
    wm = new WorktreeManager(PRD_DIR);
    rmSync(wm.registryFile, { force: true });
    rmSync(WORKTREES_DIR, { recursive: true, force: true });
    wm._exec = mock.fn(() => '');
    wm.create('cfg-wt', 'feat/cfg');
  });

  it('returns Config instance pointing to worktree .ralph/', () => {
    const config = wm.getConfig('cfg-wt');
    const registry = wm.loadRegistry();
    assert.equal(config.prdDir, join(registry[0].path, '.ralph'));
  });

  it('throws if worktree not found', () => {
    assert.throws(() => wm.getConfig('nonexistent'), /not found/);
  });
});

describe('WorktreeManager - merge', () => {
  let wm;

  beforeEach(() => {
    wm = new WorktreeManager(PRD_DIR);
    rmSync(wm.registryFile, { force: true });
    rmSync(WORKTREES_DIR, { recursive: true, force: true });
    wm._exec = mock.fn(() => '');
    wm.create('merge-wt', 'feat/merge');
    // Mark as complete
    const registry = wm.loadRegistry();
    writeFileSync(join(registry[0].path, '.ralph', 'status.txt'), 'complete\n');
  });

  it('calls git merge with correct branch', () => {
    wm.merge('merge-wt');
    const calls = wm._exec.mock.calls;
    const mergeCall = calls.find(c => c.arguments[0].includes('git merge'));
    assert.ok(mergeCall, 'should call git merge');
    assert.ok(mergeCall.arguments[0].includes('feat/merge'));
  });

  it('removes worktree after merge', () => {
    wm.merge('merge-wt');
    const registry = wm.loadRegistry();
    assert.equal(registry.length, 0);
  });

  it('throws if worktree is not complete', () => {
    const registry = wm.loadRegistry();
    writeFileSync(join(registry[0].path, '.ralph', 'status.txt'), 'running\n');
    assert.throws(() => wm.merge('merge-wt'), /not complete/);
  });
});

describe('WorktreeManager - startRun', () => {
  let wm;

  beforeEach(() => {
    wm = new WorktreeManager(PRD_DIR);
    rmSync(wm.registryFile, { force: true });
    rmSync(WORKTREES_DIR, { recursive: true, force: true });
    wm._exec = mock.fn(() => '');
    wm._spawn = mock.fn(() => ({ unref: mock.fn(), pid: 12345 }));
    wm.create('run-wt', 'feat/run');
  });

  it('spawns ralph run in worktree directory', () => {
    wm.startRun('run-wt', 5, 'claude');
    const calls = wm._spawn.mock.calls;
    assert.equal(calls.length, 1);
    const [cmd, args, opts] = calls[0].arguments;
    assert.equal(cmd, 'ralph');
    assert.ok(args.includes('run'));
    assert.ok(opts.cwd.includes('run-wt'));
    assert.ok(opts.detached);
  });

  it('throws if worktree not found', () => {
    assert.throws(() => wm.startRun('nonexistent'), /not found/);
  });
});

describe('WorktreeManager - startAll', () => {
  let wm;

  beforeEach(() => {
    wm = new WorktreeManager(PRD_DIR);
    rmSync(wm.registryFile, { force: true });
    rmSync(WORKTREES_DIR, { recursive: true, force: true });
    wm._exec = mock.fn(() => '');
    wm._spawn = mock.fn(() => ({ unref: mock.fn(), pid: 12345 }));
    wm.create('all-1', 'feat/all1');
    wm.create('all-2', 'feat/all2');
  });

  it('starts all pending worktrees', () => {
    const results = wm.startAll(3, 'claude');
    assert.equal(results.length, 2);
  });

  it('skips running worktrees', () => {
    const registry = wm.loadRegistry();
    writeFileSync(join(registry[0].path, '.ralph', '.lock'), '99999');
    wm._isProcessRunning = mock.fn(() => true);
    const results = wm.startAll(3, 'claude');
    assert.equal(results.length, 1);
  });

  it('skips complete worktrees', () => {
    const registry = wm.loadRegistry();
    writeFileSync(join(registry[0].path, '.ralph', 'status.txt'), 'complete\n');
    const results = wm.startAll(3, 'claude');
    assert.equal(results.length, 1);
  });
});

describe('WorktreeManager - gitignore', () => {
  it('ensureGitignore adds .ralph-worktrees/ to .gitignore', () => {
    const gitignorePath = join(TMP, '.gitignore');
    rmSync(gitignorePath, { force: true });
    const wm = new WorktreeManager(PRD_DIR);
    wm.ensureGitignore();
    assert.ok(existsSync(gitignorePath));
    const content = readFileSync(gitignorePath, 'utf-8');
    assert.ok(content.includes('.ralph-worktrees/'));
  });

  it('does not duplicate entry in .gitignore', () => {
    const gitignorePath = join(TMP, '.gitignore');
    writeFileSync(gitignorePath, '.ralph-worktrees/\n');
    const wm = new WorktreeManager(PRD_DIR);
    wm.ensureGitignore();
    const content = readFileSync(gitignorePath, 'utf-8');
    const matches = content.match(/\.ralph-worktrees\//g);
    assert.equal(matches.length, 1);
  });
});
