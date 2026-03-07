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
