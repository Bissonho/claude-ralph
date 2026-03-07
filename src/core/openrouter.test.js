import { describe, it, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// We'll mock global fetch before importing the module
const mockFetch = mock.fn();
globalThis.fetch = mockFetch;

const { validateApiKey, fetchAvailableModels, fetchModelsWithCache } = await import('./openrouter.js');

const SAMPLE_MODELS_RESPONSE = {
  data: [
    { id: 'openai/gpt-4', name: 'GPT-4', context_length: 8192, pricing: { prompt: '0.03', completion: '0.06' } },
    { id: 'anthropic/claude-3', name: 'Claude 3', context_length: 200000, pricing: { prompt: '0.015', completion: '0.075' } },
    { id: 'meta-llama/llama-3', name: 'Llama 3', context_length: 8192, pricing: { prompt: '0', completion: '0' } },
  ],
};

describe('validateApiKey', () => {
  it('returns true when API responds with 200', async () => {
    mockFetch.mock.resetCalls();
    mockFetch.mock.mockImplementationOnce(async () => ({ ok: true }));
    const result = await validateApiKey('sk-test-valid');
    assert.equal(result, true);
    assert.equal(mockFetch.mock.calls.length, 1);
    assert.match(mockFetch.mock.calls[0].arguments[0], /openrouter\.ai/);
  });

  it('returns false when API responds with 401', async () => {
    mockFetch.mock.resetCalls();
    mockFetch.mock.mockImplementationOnce(async () => ({ ok: false }));
    const result = await validateApiKey('sk-invalid');
    assert.equal(result, false);
  });

  it('returns false when fetch throws', async () => {
    mockFetch.mock.resetCalls();
    mockFetch.mock.mockImplementationOnce(async () => { throw new Error('network error'); });
    const result = await validateApiKey('sk-test');
    assert.equal(result, false);
  });
});

describe('fetchAvailableModels', () => {
  it('returns sorted array of models', async () => {
    mockFetch.mock.resetCalls();
    mockFetch.mock.mockImplementationOnce(async () => ({
      ok: true,
      json: async () => SAMPLE_MODELS_RESPONSE,
    }));
    const models = await fetchAvailableModels('sk-test');
    assert.equal(Array.isArray(models), true);
    assert.equal(models.length, 3);
    // sorted alphabetically by id
    assert.equal(models[0].id, 'anthropic/claude-3');
    assert.equal(models[1].id, 'meta-llama/llama-3');
    assert.equal(models[2].id, 'openai/gpt-4');
    // shape
    assert.ok('id' in models[0]);
    assert.ok('name' in models[0]);
    assert.ok('contextLength' in models[0]);
    assert.ok('pricing' in models[0]);
  });

  it('throws on non-ok response', async () => {
    mockFetch.mock.resetCalls();
    mockFetch.mock.mockImplementationOnce(async () => ({ ok: false, status: 401 }));
    await assert.rejects(() => fetchAvailableModels('bad-key'), /401/);
  });
});

describe('fetchModelsWithCache', () => {
  let tmpDir;
  let cacheFile;

  before(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ralph-test-'));
    cacheFile = join(tmpDir, 'models-cache.json');
  });

  after(() => {
    rmSync(tmpDir, { recursive: true });
  });

  it('fetches and writes cache when no cache file exists', async () => {
    mockFetch.mock.resetCalls();
    mockFetch.mock.mockImplementationOnce(async () => ({
      ok: true,
      json: async () => SAMPLE_MODELS_RESPONSE,
    }));
    const models = await fetchModelsWithCache('sk-test', cacheFile);
    assert.equal(models.length, 3);
    assert.equal(mockFetch.mock.calls.length, 1);
    const cached = JSON.parse(readFileSync(cacheFile, 'utf8'));
    assert.ok(cached.timestamp);
    assert.equal(cached.models.length, 3);
  });

  it('uses cache when less than 1 hour old', async () => {
    mockFetch.mock.resetCalls();
    const freshCache = {
      timestamp: Date.now() - 1000 * 60 * 30, // 30 min ago
      models: [{ id: 'cached/model', name: 'Cached', contextLength: 4096, pricing: {} }],
    };
    writeFileSync(cacheFile, JSON.stringify(freshCache));
    const models = await fetchModelsWithCache('sk-test', cacheFile);
    assert.equal(models.length, 1);
    assert.equal(models[0].id, 'cached/model');
    assert.equal(mockFetch.mock.calls.length, 0);
  });

  it('refetches when cache is older than 1 hour', async () => {
    mockFetch.mock.resetCalls();
    const staleCache = {
      timestamp: Date.now() - 1000 * 60 * 90, // 90 min ago
      models: [{ id: 'old/model', name: 'Old', contextLength: 4096, pricing: {} }],
    };
    writeFileSync(cacheFile, JSON.stringify(staleCache));
    mockFetch.mock.mockImplementationOnce(async () => ({
      ok: true,
      json: async () => SAMPLE_MODELS_RESPONSE,
    }));
    const models = await fetchModelsWithCache('sk-test', cacheFile);
    assert.equal(models.length, 3);
    assert.equal(mockFetch.mock.calls.length, 1);
  });
});
