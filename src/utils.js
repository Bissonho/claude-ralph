import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

// ANSI colors (no dependencies)
export const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

export function log(msg) {
  console.log(msg);
}

export function info(msg) {
  console.log(`${c.cyan}info${c.reset} ${msg}`);
}

export function warn(msg) {
  console.log(`${c.yellow}warn${c.reset} ${msg}`);
}

export function error(msg) {
  console.error(`${c.red}error${c.reset} ${msg}`);
}

export function success(msg) {
  console.log(`${c.green}done${c.reset} ${msg}`);
}

// Model name resolution
const MODEL_MAP = {
  opus: 'claude-opus-4-6',
  sonnet: 'claude-sonnet-4-6',
  haiku: 'claude-haiku-4-5-20251001',
};

export function resolveModel(shortName) {
  if (!shortName || shortName === 'null') return MODEL_MAP.sonnet;
  if (shortName.startsWith('openrouter:')) return shortName;
  return MODEL_MAP[shortName] || MODEL_MAP.sonnet;
}

export function isOpenRouterModel(model) {
  return model.startsWith('openrouter:');
}

export function getOpenRouterModelName(model) {
  return model.replace('openrouter:', '');
}

// Find prd directory — tries multiple locations
export function findPrdDir(explicitDir) {
  if (explicitDir) {
    if (!existsSync(join(explicitDir, 'prd.json'))) {
      throw new Error(`prd.json not found in ${explicitDir}`);
    }
    return explicitDir;
  }

  const candidates = [
    join(process.cwd(), '.ralph'),
    join(process.cwd(), 'scripts', 'ralph'),
  ];

  for (const dir of candidates) {
    if (existsSync(join(dir, 'prd.json'))) return dir;
  }

  // Default to .ralph/ even if it doesn't exist yet (for init)
  return join(process.cwd(), '.ralph');
}

// Detect project type by looking at common config files
export function detectProjectType() {
  const cwd = process.cwd();
  const checks = [];

  // Node.js / TypeScript
  if (existsSync(join(cwd, 'package.json'))) {
    try {
      const pkg = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf-8'));
      const scripts = pkg.scripts || {};
      if (scripts.lint) checks.push({ name: 'lint', command: 'npm run lint' });
      if (scripts.typecheck) checks.push({ name: 'typecheck', command: 'npm run typecheck' });
      if (scripts.test) checks.push({ name: 'test', command: 'npm test' });
      if (scripts.build) checks.push({ name: 'build', command: 'npm run build' });
      if (!scripts.lint && !scripts.test && !scripts.build) {
        // Detect TypeScript
        if (existsSync(join(cwd, 'tsconfig.json'))) {
          checks.push({ name: 'typecheck', command: 'npx tsc --noEmit' });
        }
      }
    } catch { /* ignore */ }
  }

  // Flutter / Dart
  if (existsSync(join(cwd, 'pubspec.yaml'))) {
    checks.push({ name: 'analyze', command: 'flutter analyze' });
    checks.push({ name: 'test', command: 'flutter test' });
  }

  // Go
  if (existsSync(join(cwd, 'go.mod'))) {
    checks.push({ name: 'vet', command: 'go vet ./...' });
    checks.push({ name: 'test', command: 'go test ./...' });
  }

  // Rust
  if (existsSync(join(cwd, 'Cargo.toml'))) {
    checks.push({ name: 'clippy', command: 'cargo clippy' });
    checks.push({ name: 'test', command: 'cargo test' });
  }

  // Python
  if (existsSync(join(cwd, 'pyproject.toml')) || existsSync(join(cwd, 'requirements.txt'))) {
    checks.push({ name: 'lint', command: 'ruff check .' });
    checks.push({ name: 'test', command: 'pytest' });
  }

  return checks;
}

// Progress bar
export function progressBar(done, total, width = 20) {
  const pct = total > 0 ? done / total : 0;
  const filled = Math.round(pct * width);
  const empty = width - filled;
  const bar = `${'█'.repeat(filled)}${'░'.repeat(empty)}`;
  return `${bar} ${done}/${total} (${Math.round(pct * 100)}%)`;
}

// Format duration
export function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const min = Math.floor(ms / 60_000);
  const sec = Math.round((ms % 60_000) / 1000);
  return `${min}m${sec}s`;
}

// Fallback defaults (ms) when no completed story history exists for a category
const ETA_DEFAULTS = {
  'low/sonnet':    2 * 60_000,
  'low/opus':      4 * 60_000,
  'medium/sonnet': 5 * 60_000,
  'medium/opus':  10 * 60_000,
  'high/sonnet':  10 * 60_000,
  'high/opus':    20 * 60_000,
};

/**
 * Calculate ETA for remaining stories based on completed story durations.
 * @param {object} data - PRD data (with userStories array)
 * @param {number} loopStartedAt - timestamp (ms) when the loop started
 * @returns {{ elapsedMs, etaMs, etaFormatted, avgPerCategory }}
 */
export function calculateEta(data, loopStartedAt) {
  const elapsedMs = Date.now() - loopStartedAt;
  const stories = data.userStories || [];

  // Group completed story durations by 'effort/model' category
  const categoryDurations = {};
  for (const story of stories) {
    if (story.passes && typeof story.durationMs === 'number') {
      const model = (story.model || 'sonnet').replace(/^openrouter:.*$/, 'sonnet');
      const key = `${story.effort || 'medium'}/${model}`;
      if (!categoryDurations[key]) categoryDurations[key] = [];
      categoryDurations[key].push(story.durationMs);
    }
  }

  // Calculate averages per category
  const avgPerCategory = {};
  for (const [key, durations] of Object.entries(categoryDurations)) {
    avgPerCategory[key] = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
  }

  // Estimate remaining time for pending stories
  const pendingStories = stories.filter((s) => !s.passes);
  let etaMs = 0;
  for (const story of pendingStories) {
    const model = (story.model || 'sonnet').replace(/^openrouter:.*$/, 'sonnet');
    const key = `${story.effort || 'medium'}/${model}`;
    const estimate = avgPerCategory[key] ?? ETA_DEFAULTS[key] ?? ETA_DEFAULTS['medium/sonnet'];
    etaMs += estimate;
  }

  const etaFormatted = `~${Math.round(etaMs / 60_000)}m`;

  return { elapsedMs, etaMs, etaFormatted, avgPerCategory };
}
