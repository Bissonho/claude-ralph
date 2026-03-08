import { Config } from '../core/config.js';
import { c, progressBar, findPrdDir } from '../utils.js';

export async function status(opts = {}) {
  const prdDir = findPrdDir(opts.prdDir);
  const config = new Config(prdDir);

  let data;
  try {
    data = config.load();
  } catch (e) {
    console.log(`${c.dim}No Ralph project found. Run 'ralph init' first.${c.reset}`);
    return;
  }

  const { total, done, pending, pct } = config.getProgress(data);
  const lastStatus = config.readStatus();

  console.log('');
  console.log(`${c.bold}Ralph Status: ${data.project}${c.reset}`);
  console.log(`${c.dim}Branch: ${data.branchName}${c.reset}`);
  console.log(`Progress: ${progressBar(done, total)}`);
  console.log('');

  // Stories list
  for (const story of data.userStories) {
    const icon = story.passes ? `${c.green}[DONE]${c.reset}` : `${c.dim}[    ]${c.reset}`;
    const model = `${c.dim}${story.model || 'sonnet'}/${story.effort || 'medium'}${c.reset}`;
    console.log(`  ${icon} ${c.bold}${story.id}${c.reset} ${story.title} ${model}`);
  }

  console.log('');

  if (lastStatus) {
    const isRunning = lastStatus.includes('running');
    console.log(`${c.dim}Last: ${lastStatus}${c.reset}`);
    if (isRunning) {
      // Parse elapsed and ETA from extended status format
      const parts = lastStatus.split(' | ');
      const elapsedPart = parts[5]?.trim();
      const etaPart = parts[6]?.trim();
      if (elapsedPart && etaPart) {
        const elapsedMatch = elapsedPart.match(/^elapsed\s+(.+)$/);
        const etaMatch = etaPart.match(/^eta\s+(.+)$/);
        if (elapsedMatch && etaMatch) {
          console.log(`${c.dim}Elapsed: ${elapsedMatch[1]}  ETA: ${etaMatch[1]}${c.reset}`);
        }
      }
    }
  }

  // Pause state
  const pauseState = config.getPauseState();
  if (pauseState) {
    const pausedAt = new Date(pauseState.pausedAt).toLocaleString();
    console.log(`${c.yellow}${c.bold}Paused:${c.reset} ${pauseState.reason}`);
    console.log(`${c.dim}Paused at: ${pausedAt} | Last story: ${pauseState.lastStoryId}${c.reset}`);
    console.log(`${c.dim}Run 'ralph run' to resume.${c.reset}`);
    console.log('');
  }

  if (pending === 0) {
    console.log(`${c.green}${c.bold}All stories complete!${c.reset}`);
  }

  console.log('');
}

// Compact status for MCP (minimal tokens)
export function getCompactStatus(config) {
  const data = config.load();
  const { total, done, pending, pct } = config.getProgress(data);
  const next = config.getNextStory(data);

  return {
    project: data.project,
    branch: data.branchName,
    progress: `${done}/${total} (${pct}%)`,
    pending,
    next: next ? { id: next.id, title: next.title, model: next.model, effort: next.effort } : null,
    stories: data.userStories.map((s) => ({
      id: s.id,
      title: s.title,
      done: s.passes,
    })),
  };
}
