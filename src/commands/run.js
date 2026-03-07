import { existsSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { Config } from '../core/config.js';
import { generatePrompt } from '../core/prompt.js';
import { spawnAgent } from '../core/runner.js';
import { ActivityLogger } from '../core/activity.js';
import { info, warn, error, success, c, progressBar, formatDuration, findPrdDir } from '../utils.js';

// Read .ralph/.feedback content and delete the file. Returns trimmed content or ''.
export function readAndClearFeedback(prdDir) {
  const feedbackPath = join(prdDir, '.feedback');
  if (!existsSync(feedbackPath)) return '';
  const content = readFileSync(feedbackPath, 'utf8').trim();
  unlinkSync(feedbackPath);
  return content;
}

export async function run(opts = {}) {
  const maxIterations = opts.maxIterations || 30;
  const tool = opts.tool || 'claude';
  const researchModel = opts.researchModel || 'perplexity/sonar-pro';
  const dryRun = opts.dryRun || false;

  const prdDir = findPrdDir(opts.prdDir);
  const config = new Config(prdDir);

  // Validate
  const data = config.load();
  info(`Project: ${c.bold}${data.project}${c.reset}`);
  info(`Branch: ${c.cyan}${data.branchName}${c.reset}`);

  const { total, done, pending } = config.getProgress(data);
  info(`Progress: ${progressBar(done, total)}`);

  if (pending === 0) {
    success('All stories already complete!');
    return;
  }

  // Dry run: print what would happen without spawning agents or acquiring lock
  if (dryRun) {
    console.log('');
    console.log(`${c.bold}Dry run — no agents will be spawned${c.reset}`);
    console.log('');
    const pendingStories = data.userStories.filter((s) => !s.passes);
    for (const story of pendingStories) {
      const storyModel = story.model || 'sonnet';
      const storyEffort = story.effort || 'medium';
      console.log(`${c.bold}${story.id}${c.reset}: ${story.title}`);
      console.log(`  Model: ${c.magenta}${storyModel}${c.reset} | Effort: ${storyEffort} | Tool: ${tool}`);
      console.log('');
    }
    return;
  }

  // Lock
  config.acquireLock();

  // Activity logger
  const logger = new ActivityLogger(prdDir);

  // Graceful shutdown
  let stopped = false;
  const shutdown = () => {
    if (stopped) return;
    stopped = true;
    warn('Shutting down gracefully...');
    config.releaseLock();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  try {
    // Archive if branch changed
    archiveIfNeeded(config, data);

    // Track current branch
    writeFileSync(config.lastBranchFile, data.branchName);

    // Init progress file if missing
    if (!existsSync(config.progressFile)) {
      writeFileSync(
        config.progressFile,
        `# Ralph Progress Log\nStarted: ${new Date().toISOString()}\n---\n`
      );
    }

    info(`Starting loop: ${c.bold}${maxIterations}${c.reset} max iterations, tool: ${c.bold}${tool}${c.reset}`);
    console.log('');

    logger.emit({ type: 'loop_start', maxIterations, tool });

    for (let i = 1; i <= maxIterations; i++) {
      if (stopped) break;

      // Reload prd.json each iteration (agent may have modified it)
      const currentData = config.load();
      const story = config.getNextStory(currentData);

      if (!story) {
        success('All stories complete!');
        config.updateStatus(formatStatus(config, currentData, i, maxIterations, '-', 'COMPLETE'));
        break;
      }

      const { done: currentDone, total: currentTotal } = config.getProgress(currentData);
      const storyModel = story.model || 'sonnet';
      const storyEffort = story.effort || 'medium';

      console.log(`${c.bold}═══════════════════════════════════════════════════${c.reset}`);
      console.log(`  ${c.cyan}Iteration ${i}/${maxIterations}${c.reset} | ${progressBar(currentDone, currentTotal)}`);
      console.log(`  ${c.bold}${story.id}${c.reset}: ${story.title}`);
      console.log(`  Model: ${c.magenta}${storyModel}${c.reset} | Effort: ${storyEffort} | Tool: ${tool}`);
      console.log(`${c.bold}═══════════════════════════════════════════════════${c.reset}`);
      console.log('');

      logger.emit({ type: 'story_start', storyId: story.id, title: story.title, model: storyModel, effort: storyEffort, iteration: i });

      config.updateStatus(
        formatStatus(config, currentData, i, maxIterations, story.id, `running: ${story.title}`)
      );

      // Research phase
      let researchContext = null;
      if (story.research && story.research_query) {
        info(`Running research: ${story.research_query}`);
        const rModel = story.research_model || researchModel;
        const { runResearch } = await import('../core/runner.js');
        researchContext = await runResearch(story.research_query, rModel);
        if (researchContext) {
          info(`Research complete (${researchContext.length} chars)`);
        }
      }

      // Generate prompt
      const patterns = config.readPatterns();
      let prompt = generatePrompt(currentData, story, patterns);

      // Prepend research context if available
      if (researchContext) {
        prompt = `# Research Context (for ${story.id})\n\n${researchContext}\n\n---\n\n${prompt}`;
      }

      // Prepend user feedback if available
      const feedback = readAndClearFeedback(prdDir);
      if (feedback) {
        prompt = `## User Feedback\n\n${feedback}\n\n---\n\n${prompt}`;
      }

      // Open log stream for this story
      const logStream = logger.startStoryLog(story.id);
      const onData = (chunk) => logStream.write(chunk);

      // Spawn agent
      logger.emit({ type: 'agent_spawn', storyId: story.id, tool });
      const startTime = Date.now();
      const result = await spawnAgent(prompt, story, tool, onData);
      const elapsed = Date.now() - startTime;

      // Close log stream
      await new Promise((resolve) => logStream.end(resolve));

      logger.emit({ type: 'agent_done', storyId: story.id, code: result.code, durationMs: elapsed });

      console.log('');
      info(`Iteration ${i} done in ${formatDuration(elapsed)} (exit code: ${result.code})`);

      // Check if story is now marked as passed
      const refreshedData = config.load();
      const refreshedStory = refreshedData.userStories.find((s) => s.id === story.id);
      if (refreshedStory && refreshedStory.passes) {
        logger.emit({ type: 'story_done', storyId: story.id });
      }

      config.updateStatus(
        formatStatus(config, refreshedData, i, maxIterations, story.id, 'done')
      );

      // Check for completion signal
      if (result.output && result.output.includes('<promise>COMPLETE</promise>')) {
        config.updateStatus(
          formatStatus(config, refreshedData, i, maxIterations, '-', 'COMPLETE')
        );
        console.log('');
        success(`All tasks complete! Finished at iteration ${i}/${maxIterations}`);
        break;
      }

      if (result.killed) {
        warn('Agent was killed. Stopping loop.');
        break;
      }

      // Brief pause between iterations
      if (i < maxIterations && !stopped) {
        await sleep(2000);
      }
    }

    logger.emit({ type: 'loop_end' });

    // Check final state
    const finalData = config.load();
    const finalProgress = config.getProgress(finalData);
    if (finalProgress.pending > 0) {
      warn(`Reached max iterations. ${finalProgress.pending}/${finalProgress.total} stories remaining.`);
    }
  } finally {
    config.releaseLock();
    process.removeListener('SIGINT', shutdown);
    process.removeListener('SIGTERM', shutdown);
  }
}

function archiveIfNeeded(config, data) {
  if (!existsSync(config.lastBranchFile)) return;

  const lastBranch = readFileSync(config.lastBranchFile, 'utf-8').trim();
  const currentBranch = data.branchName;

  if (lastBranch && currentBranch && lastBranch !== currentBranch) {
    const date = new Date().toISOString().split('T')[0];
    const folderName = lastBranch.replace(/^ralph\//, '');
    const archiveFolder = join(config.archiveDir, `${date}-${folderName}`);

    info(`Archiving previous run: ${lastBranch}`);
    mkdirSync(archiveFolder, { recursive: true });

    if (existsSync(config.prdFile)) copyFileSync(config.prdFile, join(archiveFolder, 'prd.json'));
    if (existsSync(config.progressFile)) copyFileSync(config.progressFile, join(archiveFolder, 'progress.txt'));

    // Reset progress
    writeFileSync(
      config.progressFile,
      `# Ralph Progress Log\nStarted: ${new Date().toISOString()}\n---\n\n## Codebase Patterns\n`
    );

    success(`Archived to ${archiveFolder}`);
  }
}

function formatStatus(config, data, iteration, maxIterations, storyId, status) {
  const { done, total, pct } = config.getProgress(data);
  const time = new Date().toTimeString().split(' ')[0];
  return `${done}/${total} (${pct}%) | ${storyId} | ${status} | iter ${iteration}/${maxIterations} | ${time}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
