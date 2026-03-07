import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import os from 'os';

// Use a temp dir instead of real ~/.ralph for tests
const TEST_HOME = join(os.tmpdir(), 'ralph-registry-test-' + process.pid);
const TEST_REGISTRY = join(TEST_HOME, '.ralph', 'registry.json');

let GlobalRegistry;

before(async () => {
  // Patch os.homedir for the module
  process.env.RALPH_TEST_HOME = TEST_HOME;
  mkdirSync(join(TEST_HOME, '.ralph'), { recursive: true });
  const mod = await import('./registry.js');
  GlobalRegistry = mod.GlobalRegistry;
});

after(() => {
  rmSync(TEST_HOME, { recursive: true, force: true });
  delete process.env.RALPH_TEST_HOME;
});

beforeEach(() => {
  // Clear registry before each test
  const registryPath = join(TEST_HOME, '.ralph', 'registry.json');
  if (existsSync(registryPath)) rmSync(registryPath);
});

describe('GlobalRegistry', () => {
  it('creates registry dir if not exists', () => {
    const r = new GlobalRegistry(TEST_HOME);
    r.list(); // triggers read
    assert.ok(existsSync(join(TEST_HOME, '.ralph')));
  });

  it('register() adds entry to registry file', () => {
    const r = new GlobalRegistry(TEST_HOME);
    r.register({ project: 'test', branch: 'main', projectPath: '/tmp/test', prdDir: '/tmp/test/.ralph', pid: 99999, startedAt: new Date().toISOString() });
    const raw = JSON.parse(readFileSync(TEST_REGISTRY, 'utf8'));
    assert.equal(raw.length, 1);
    assert.equal(raw[0].project, 'test');
    assert.equal(raw[0].pid, 99999);
  });

  it('deregister() removes entry by pid', () => {
    const r = new GlobalRegistry(TEST_HOME);
    r.register({ project: 'a', branch: 'main', projectPath: '/tmp/a', prdDir: '/tmp/a/.ralph', pid: 11111, startedAt: new Date().toISOString() });
    r.register({ project: 'b', branch: 'main', projectPath: '/tmp/b', prdDir: '/tmp/b/.ralph', pid: 22222, startedAt: new Date().toISOString() });
    r.deregister(11111);
    const raw = JSON.parse(readFileSync(TEST_REGISTRY, 'utf8'));
    assert.equal(raw.length, 1);
    assert.equal(raw[0].pid, 22222);
  });

  it('list() filters out stale PIDs', () => {
    const r = new GlobalRegistry(TEST_HOME);
    const realPid = process.pid;
    r.register({ project: 'alive', branch: 'main', projectPath: '/tmp/a', prdDir: '/tmp/a/.ralph', pid: realPid, startedAt: new Date().toISOString() });
    r.register({ project: 'dead', branch: 'main', projectPath: '/tmp/d', prdDir: '/tmp/d/.ralph', pid: 99999999, startedAt: new Date().toISOString() });
    const entries = r.list();
    assert.equal(entries.length, 1);
    assert.equal(entries[0].project, 'alive');
  });

  it('prune() removes stale entries and saves', () => {
    const r = new GlobalRegistry(TEST_HOME);
    r.register({ project: 'dead', branch: 'main', projectPath: '/tmp/d', prdDir: '/tmp/d/.ralph', pid: 99999999, startedAt: new Date().toISOString() });
    r.prune();
    const raw = JSON.parse(readFileSync(TEST_REGISTRY, 'utf8'));
    assert.equal(raw.length, 0);
  });

  it('list() returns empty array when no registry file exists', () => {
    const r = new GlobalRegistry(TEST_HOME);
    const entries = r.list();
    assert.deepEqual(entries, []);
  });

  it('register() reads fresh before writing (concurrent safety)', () => {
    const r1 = new GlobalRegistry(TEST_HOME);
    const r2 = new GlobalRegistry(TEST_HOME);
    r1.register({ project: 'p1', branch: 'main', projectPath: '/tmp/p1', prdDir: '/tmp/p1/.ralph', pid: 11111, startedAt: new Date().toISOString() });
    r2.register({ project: 'p2', branch: 'main', projectPath: '/tmp/p2', prdDir: '/tmp/p2/.ralph', pid: 22222, startedAt: new Date().toISOString() });
    const raw = JSON.parse(readFileSync(TEST_REGISTRY, 'utf8'));
    assert.equal(raw.length, 2);
  });
});
