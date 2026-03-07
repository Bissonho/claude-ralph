import { spawn } from 'child_process';
import { resolveModel, isOpenRouterModel, getOpenRouterModelName, warn } from '../utils.js';

// Spawn a Claude/Amp agent and return its output
// Streams output to stderr so user can watch in real-time
export function spawnAgent(prompt, story, tool = 'claude') {
  const model = story.model || 'sonnet';
  const effort = story.effort || 'medium';

  if (tool === 'amp') {
    const ampEnv = { ...process.env };
    delete ampEnv.CLAUDECODE;
    delete ampEnv.CLAUDE_CODE_SSE_PORT;
    delete ampEnv.CLAUDE_CODE_ENTRYPOINT;
    return spawnProcess('amp', ['--dangerously-allow-all'], prompt, ampEnv);
  }

  if (isOpenRouterModel(model)) {
    return spawnOpenRouter(prompt, model, effort);
  }

  const resolvedModel = resolveModel(model);
  const args = [
    '--model', resolvedModel,
    '--effort', effort,
    '--dangerously-skip-permissions',
    '--print',
  ];

  const env = { ...process.env };
  delete env.CLAUDECODE;
  delete env.CLAUDE_CODE_SSE_PORT;
  delete env.CLAUDE_CODE_ENTRYPOINT;

  return spawnProcess('claude', args, prompt, env);
}

function spawnOpenRouter(prompt, model, effort) {
  const orModel = getOpenRouterModelName(model);
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    warn('OPENROUTER_API_KEY not set. Falling back to claude-sonnet-4-6');
    const env = { ...process.env };
    delete env.CLAUDECODE;
    delete env.CLAUDE_CODE_SSE_PORT;
    delete env.CLAUDE_CODE_ENTRYPOINT;
    return spawnProcess('claude', [
      '--model', 'claude-sonnet-4-6',
      '--effort', effort,
      '--dangerously-skip-permissions',
      '--print',
    ], prompt, env);
  }

  const env = {
    ...process.env,
    ANTHROPIC_BASE_URL: 'https://openrouter.ai/api/v1',
    ANTHROPIC_API_KEY: apiKey,
  };
  delete env.CLAUDECODE;
  delete env.CLAUDE_CODE_SSE_PORT;
  delete env.CLAUDE_CODE_ENTRYPOINT;

  return spawnProcess('claude', [
    '--model', orModel,
    '--effort', effort,
    '--dangerously-skip-permissions',
    '--print',
  ], prompt, env);
}

function spawnProcess(command, args, stdin, env) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      env,
      stdio: ['pipe', 'pipe', 'inherit'],
    });

    let output = '';
    let killed = false;

    proc.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      output += text;
      process.stderr.write(text); // tee to terminal
    });

    proc.stdin.on('error', () => {
      // Ignore broken pipe if process exits before we finish writing
    });

    proc.on('error', (err) => {
      if (err.code === 'ENOENT') {
        reject(new Error(`Command '${command}' not found. Is it installed and in PATH?`));
      } else {
        reject(err);
      }
    });

    proc.on('close', (code) => {
      if (killed) {
        resolve({ output, code: -1, killed: true });
      } else {
        resolve({ output, code, killed: false });
      }
    });

    // Write prompt to stdin
    proc.stdin.write(stdin);
    proc.stdin.end();

    // Graceful shutdown handler
    const cleanup = () => {
      killed = true;
      proc.kill('SIGTERM');
      setTimeout(() => {
        try { proc.kill('SIGKILL'); } catch { /* ignore */ }
      }, 5000);
    };

    process.once('SIGINT', cleanup);
    process.once('SIGTERM', cleanup);

    proc.on('close', () => {
      process.removeListener('SIGINT', cleanup);
      process.removeListener('SIGTERM', cleanup);
    });
  });
}

// Research via OpenRouter API (no shell deps, pure Node.js)
export async function runResearch(query, model = 'perplexity/sonar-pro') {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    warn('OPENROUTER_API_KEY not set — skipping research');
    return null;
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/heimo/claude-ralph',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: query }],
      }),
    });

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;

    if (!content) {
      const errMsg = data?.error?.message || 'No response content';
      warn(`Research failed: ${errMsg}`);
      return null;
    }

    return content;
  } catch (e) {
    warn(`Research error: ${e.message}`);
    return null;
  }
}
