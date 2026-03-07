import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const OPENROUTER_API_BASE = 'https://openrouter.ai/api/v1';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Validate an OpenRouter API key by hitting GET /models.
 * @param {string} apiKey
 * @returns {Promise<boolean>}
 */
export async function validateApiKey(apiKey) {
  try {
    const res = await fetch(`${OPENROUTER_API_BASE}/models`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Fetch available models from OpenRouter API.
 * @param {string} apiKey
 * @returns {Promise<Array<{id: string, name: string, contextLength: number, pricing: object}>>}
 */
export async function fetchAvailableModels(apiKey) {
  const res = await fetch(`${OPENROUTER_API_BASE}/models`, {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    throw new Error(`OpenRouter API error: ${res.status}`);
  }
  const { data } = await res.json();
  return data
    .map(m => ({
      id: m.id,
      name: m.name,
      contextLength: m.context_length,
      pricing: m.pricing,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Fetch models with local file cache (< 1h TTL).
 * @param {string} apiKey
 * @param {string} cacheFile - path to cache JSON file
 * @returns {Promise<Array<{id: string, name: string, contextLength: number, pricing: object}>>}
 */
export async function fetchModelsWithCache(apiKey, cacheFile) {
  if (existsSync(cacheFile)) {
    try {
      const cached = JSON.parse(readFileSync(cacheFile, 'utf8'));
      if (Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return cached.models;
      }
    } catch {
      // corrupted cache — fall through to fetch
    }
  }

  const models = await fetchAvailableModels(apiKey);
  writeFileSync(cacheFile, JSON.stringify({ timestamp: Date.now(), models }));
  return models;
}
