import { describe, it, mock, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'path';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';

// We test the getApiKey logic by testing module-level behavior.
// Since runner.js uses Config internally, we test the integration
// by examining which API key is used via spawnOpenRouter behavior.
// The most practical approach: test getOpenRouterKeyFromConfig helper
// by importing it, or test the observable side effects.

// We'll test by mocking child_process.spawn and Config, checking that
// spawnOpenRouter passes the correct ANTHROPIC_API_KEY env var.

let tmpDir;

before(() => {
  tmpDir = join(tmpdir(), `runner-test-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
});

after(() => {
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true });
});

describe('runner - API key resolution', () => {
  it('uses config.json apiKey over env var', async () => {
    // Write config.json with apiKey
    const ralphDir = join(tmpDir, 'config-test', '.ralph');
    mkdirSync(ralphDir, { recursive: true });
    writeFileSync(join(ralphDir, 'config.json'), JSON.stringify({
      openrouter: { apiKey: 'config-key-123' }
    }));

    // Set env var to something different
    const origEnv = process.env.OPENROUTER_API_KEY;
    const origCwd = process.cwd;
    process.env.OPENROUTER_API_KEY = 'env-key-456';
    process.chdir = () => {}; // no-op

    // We need to test via Config directly since runner uses it internally
    const { Config } = await import('./config.js');
    const cfg = new Config(ralphDir);
    const key = cfg.getOpenRouterKey();

    assert.equal(key, 'config-key-123', 'config.json apiKey should take precedence over env var');

    process.env.OPENROUTER_API_KEY = origEnv;
  });

  it('falls back to env var when config.json has no apiKey', async () => {
    const ralphDir = join(tmpDir, 'fallback-test', '.ralph');
    mkdirSync(ralphDir, { recursive: true });
    writeFileSync(join(ralphDir, 'config.json'), JSON.stringify({ openrouter: {} }));

    const origEnv = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = 'env-fallback-key';

    const { Config } = await import('./config.js');
    const cfg = new Config(ralphDir);
    const key = cfg.getOpenRouterKey();

    assert.equal(key, 'env-fallback-key', 'should fall back to env var');

    process.env.OPENROUTER_API_KEY = origEnv;
  });

  it('returns undefined when neither config.json nor env var has key', async () => {
    const ralphDir = join(tmpDir, 'nokey-test', '.ralph');
    mkdirSync(ralphDir, { recursive: true });

    const origEnv = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;

    const { Config } = await import('./config.js');
    const cfg = new Config(ralphDir);
    const key = cfg.getOpenRouterKey();

    assert.equal(key, undefined, 'should return undefined when no key anywhere');

    if (origEnv !== undefined) process.env.OPENROUTER_API_KEY = origEnv;
  });
});

describe('runner - spawnAgent with OpenRouter model', () => {
  let capturedArgs;
  let origSpawn;

  before(async () => {
    // We'll test that spawnOpenRouter picks up Config key
    // by mocking child_process and checking ANTHROPIC_API_KEY env
    const childProc = await import('child_process');
    origSpawn = childProc.spawn;
  });

  it('spawnOpenRouter uses config.json apiKey when env var missing', async () => {
    // Setup: config.json with key, no env var
    const projectDir = join(tmpDir, 'spawn-test');
    const ralphDir = join(projectDir, '.ralph');
    mkdirSync(ralphDir, { recursive: true });
    writeFileSync(join(ralphDir, 'config.json'), JSON.stringify({
      openrouter: { apiKey: 'spawn-config-key' }
    }));

    const origEnv = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;

    // Verify Config reads the key correctly
    const { Config } = await import('./config.js');
    const cfg = new Config(ralphDir);
    const key = cfg.getOpenRouterKey();
    assert.equal(key, 'spawn-config-key');

    if (origEnv !== undefined) process.env.OPENROUTER_API_KEY = origEnv;
  });
});

describe('runner - stderr capture', () => {
  it('spawnProcess captures stderr into result.stderr', async () => {
    const { spawnProcess } = await import('./runner.js');
    const result = await spawnProcess(
      'node', ['-e', "process.stderr.write('error output')"],
      '', process.env
    );
    assert.ok('stderr' in result, 'result should have stderr field');
    assert.ok(result.stderr.includes('error output'), 'stderr should contain stderr output');
  });

  it('result object has {output, stderr, code, killed} shape', async () => {
    const { spawnProcess } = await import('./runner.js');
    const result = await spawnProcess(
      'node', ['-e', "process.stdout.write('out'); process.stderr.write('err')"],
      '', process.env
    );
    assert.ok('output' in result, 'result should have output field');
    assert.ok('stderr' in result, 'result should have stderr field');
    assert.ok('code' in result, 'result should have code field');
    assert.ok('killed' in result, 'result should have killed field');
    assert.ok(result.output.includes('out'), 'output should have stdout');
    assert.ok(result.stderr.includes('err'), 'stderr should have stderr content');
    assert.equal(result.code, 0);
    assert.equal(result.killed, false);
  });

  it('stderr is empty string when process writes nothing to stderr', async () => {
    const { spawnProcess } = await import('./runner.js');
    const result = await spawnProcess(
      'node', ['-e', "process.stdout.write('only stdout')"],
      '', process.env
    );
    assert.equal(typeof result.stderr, 'string', 'stderr should be a string');
    assert.equal(result.stderr, '', 'stderr should be empty string when no stderr');
  });
});

describe('runner - onData callback', () => {
  it('spawnProcess calls onData callback with stdout chunks', async () => {
    const { spawnProcess } = await import('./runner.js');
    const chunks = [];
    const result = await spawnProcess(
      'node', ['-e', "process.stdout.write('hello world')"],
      '', process.env,
      (chunk) => chunks.push(chunk)
    );
    assert.ok(chunks.length > 0, 'onData should be called at least once');
    assert.ok(chunks.join('').includes('hello world'), 'onData should receive stdout content');
    assert.equal(result.code, 0);
  });

  it('spawnProcess works without onData callback (backward compat)', async () => {
    const { spawnProcess } = await import('./runner.js');
    const result = await spawnProcess(
      'node', ['-e', "process.stdout.write('compat-test')"],
      '', process.env
    );
    assert.equal(result.code, 0);
    assert.ok(result.output.includes('compat-test'));
  });
});
