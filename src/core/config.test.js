import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { Config } from './config.js';

const TMP = join(tmpdir(), 'ralph-config-test-' + process.pid);

describe('Config - OpenRouter config', () => {
  let cfg;

  before(() => {
    mkdirSync(TMP, { recursive: true });
    cfg = new Config(TMP);
  });

  after(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  it('has configFile property pointing to config.json in prdDir', () => {
    assert.equal(cfg.configFile, join(TMP, 'config.json'));
  });

  it('loadGlobalConfig returns {} when config.json is missing', () => {
    rmSync(join(TMP, 'config.json'), { force: true });
    const result = cfg.loadGlobalConfig();
    assert.deepEqual(result, {});
  });

  it('saveGlobalConfig writes config.json with 2-space indentation', () => {
    const data = { openrouter: { apiKey: 'test-key', models: [] } };
    cfg.saveGlobalConfig(data);
    assert.ok(existsSync(cfg.configFile));
    const raw = readFileSync(cfg.configFile, 'utf-8');
    assert.equal(raw, JSON.stringify(data, null, 2));
  });

  it('loadGlobalConfig reads existing config.json', () => {
    const data = { openrouter: { apiKey: 'my-key', models: [{ id: 'gpt-4', enabled: true }] } };
    cfg.saveGlobalConfig(data);
    const loaded = cfg.loadGlobalConfig();
    assert.deepEqual(loaded, data);
  });

  it('getOpenRouterKey returns key from config.json', () => {
    cfg.saveGlobalConfig({ openrouter: { apiKey: 'key-from-file' } });
    assert.equal(cfg.getOpenRouterKey(), 'key-from-file');
  });

  it('getOpenRouterKey falls back to process.env.OPENROUTER_API_KEY', () => {
    cfg.saveGlobalConfig({ openrouter: {} });
    process.env.OPENROUTER_API_KEY = 'env-key';
    assert.equal(cfg.getOpenRouterKey(), 'env-key');
    delete process.env.OPENROUTER_API_KEY;
  });

  it('getOpenRouterKey returns undefined when no key anywhere', () => {
    cfg.saveGlobalConfig({ openrouter: {} });
    delete process.env.OPENROUTER_API_KEY;
    assert.equal(cfg.getOpenRouterKey(), undefined);
  });

  it('getEnabledModels returns only enabled models', () => {
    cfg.saveGlobalConfig({
      openrouter: {
        models: [
          { id: 'gpt-4', enabled: true },
          { id: 'claude-3', enabled: false },
          { id: 'llama', enabled: true },
        ],
      },
    });
    const models = cfg.getEnabledModels();
    assert.equal(models.length, 2);
    assert.equal(models[0].id, 'gpt-4');
    assert.equal(models[1].id, 'llama');
  });

  it('getEnabledModels returns [] when no models in config', () => {
    cfg.saveGlobalConfig({ openrouter: {} });
    assert.deepEqual(cfg.getEnabledModels(), []);
  });

  it('getEnabledModels returns [] when config.json missing', () => {
    rmSync(cfg.configFile, { force: true });
    assert.deepEqual(cfg.getEnabledModels(), []);
  });
});
