import { existsSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { Config } from '../core/config.js';
import { generatePrompt } from '../core/prompt.js';
import { spawnAgent, classifyError } from '../core/runner.js';
import { ActivityLogger } from '../core/activity.js';
import { GlobalRegistry } from '../core/registry.js';
import { info, warn, error, success, c, progressBar, formatDuration, findPrdDir, calculateEta } from '../utils.js';

export const BACKOFF_DELAYS = [5000, 15000, 45000];

// Retry a spawn function with exponential backoff for transient errors.
// spawnFn: async () => {code, stderr, killed} — called on each attempt
// classifyFn: (code, stderr, killed) => {type, retryable, message}
// logFn: (msg) => void — for retry/countdown logging
// sleepFn: (ms) => Promise — injectable for testing
// maxRetries: max number of retries (default 3)
// Returns: {result, retries, exhausted?, skipped?}
export async function retryWithBackoff(spawnFn, classifyFn, logFn, sleepFn, maxRetries = 3) {
  let lastResult;
  let lastClassification;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = BACKOFF_DELAYS[attempt - 1];
      logFn(`Retry attempt ${attempt}/${maxRetries}: error type=${lastClassification.type}, waiting ${delay / 1000}s`);

      // Sleep in 5s chunks with countdown messages
      let remaining = delay;
      while (remaining > 0) {
        const chunk = Math.min(5000, remaining);
        await sleepFn(chunk);
        remaining -= chunk;
        if (remaining > 0) {
          logFn(`  Waiting... ${remaining / 1000}s remaining`);
        }
      }
    }

    lastResult = await spawnFn();

    if (lastResult.code === 0) {
      return { result: lastResult, retries: attempt };
    }

    lastClassification = classifyFn(lastResult.code, lastResult.stderr, lastResult.killed);

    if (!lastClassification.retryable) {
      return { result: lastResult, retries: attempt, skipped: true };
    }

    if (attempt >= maxRetries) {
      return { result: lastResult, retries: attempt, exhausted: true };
    }
  }

  return { result: lastResult, retries: maxRetries, exhausted: true };
}

// Check if the loop should auto-pause based on consecutive failure history.
// failures: array of {storyId, errorType, retryable} — current consecutive streak (reset on success)
// Returns null if no pause needed, or {reason, message} if loop should pause.
export function checkAutoPause(failures) {
  if (failures.length === 0) return null;

  // Rule 1: 3 consecutive same non-retryable error type
  if (failures.length >= 3) {
    const last3 = failures.slice(-3);
    const lastType = last3[last3.length - 1].errorType;
    if (last3.every((f) => f.errorType === lastType && !f.retryable)) {
      const reason = `3 consecutive ${lastType} failures`;
      const hint = lastType === 'auth'
        ? 'Check your API key and credentials.'
        : `Check your ${lastType} configuration.`;
      const message = `Loop paused: ${lastType} error failed 3 times consecutively. ${hint} Run 'ralph run' to resume.`;
      return { reason, message };
    }
  }

  // Rule 2: 5 consecutive failures of any type
  if (failures.length >= 5) {
    const reason = `5 consecutive story failures`;
    const message = `Loop paused: 5 consecutive story failures across different error types. Review recent errors and run 'ralph run' to resume.`;
    return { reason, message };
  }

  return null;
}

// Read .ralph/.feedback content and delete the file. Returns trimmed content or ''.
export function readAndClearFeedback(prdDir) {
  const feedbackPath = join(prdDir, '.feedback');
  if (!existsSync(feedbackPath)) return '';
  const content = readFileSync(feedbackPath, 'utf8').trim();
  unlinkSync(feedbackPath);
  return content;
}

export async function run(opts = {}) {
  let maxIterations = opts.maxIterations || 30;
  const tool = opts.tool || 'claude';
  const researchModel = opts.researchModel || 'perplexity/sonar-pro';
  const dryRun = opts.dryRun || false;
  const exitFn = opts.exitFn || ((code) => process.exit(code));

  const prdDir = findPrdDir(opts.prdDir);
  const config = new Config(prdDir);

  // Validate
  const data = config.load();
  info(`Project: ${c.bold}${data.project}${c.reset}`);
  info(`Branch: ${c.cyan}${data.branchName}${c.reset}`);

  // Check for pause state and log resume message
  const pauseState = config.getPauseState();
  if (pauseState) {
    info(`Resuming from pause (reason: ${pauseState.reason}). Last story: ${pauseState.lastStoryId}.`);
    config.clearPauseState();
  }

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

  // Global registry
  const registry = new GlobalRegistry();
  registry.register({
    project: data.project,
    branch: data.branchName,
    projectPath: prdDir.replace(/\/.ralph$/, ''),
    prdDir,
    pid: process.pid,
    startedAt: new Date().toISOString(),
  });

  // Activity logger
  const logger = new ActivityLogger(prdDir);

  // Ignore SIGHUP so the loop survives terminal/SSH disconnects
  process.on('SIGHUP', () => {});

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

    const loopStartedAt = Date.now();
    logger.emit({ type: 'loop_start', maxIterations, tool });


    let iteration = 0;
    let loopComplete = false;

    // Outer loop: re-checks for newly added stories after the inner loop finishes.
    // This ensures stories added to prd.json while the loop is running get processed.
    while (!stopped && !loopComplete) {
      const iterationsRemaining = maxIterations - iteration;
      if (iterationsRemaining <= 0) {
        // Check if there are still pending stories (may have been added mid-run)
        const checkData = config.load();
        const checkProgress = config.getProgress(checkData);
        if (checkProgress.pending > 0) {
          // Extend maxIterations to cover newly added stories plus buffer
          const needed = checkProgress.pending + 2;
          maxIterations += needed;
          info(`Detected ${checkProgress.pending} new pending stories — extending loop by ${needed} iterations (new max: ${maxIterations})`);
        } else {
          break;
        }
      }

      for (let i = iteration + 1; i <= maxIterations; i++) {
        if (stopped) break;
        iteration = i;

        // Reload prd.json each iteration (agent may have modified it)
        const currentData = config.load();
        const story = config.getNextStory(currentData);

        if (!story) {
          // No pending stories right now — but re-check once more outside the for loop
          // in case new stories were added between the last agent completing and this check
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
          formatStatus(config, currentData, i, maxIterations, story.id, `running: ${story.title}`, loopStartedAt)
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

        // Record startedAt on the story
        const storyStartedAt = new Date().toISOString();
        config.updateStory(story.id, { startedAt: storyStartedAt });

        // Open log stream for this story
        const logStream = logger.startStoryLog(story.id);
        const onData = (chunk) => logStream.write(chunk);

        // Spawn agent with retry logic for transient errors
        logger.emit({ type: 'agent_spawn', storyId: story.id, tool });
        const startTime = Date.now();
        const retryResult = await retryWithBackoff(
          () => spawnAgent(prompt, story, tool, onData),
          classifyError,
          (msg) => warn(msg),
          sleep,
        );
        const result = retryResult.result;
        const elapsed = Date.now() - startTime;

        // Record completedAt and durationMs on the story
        config.updateStory(story.id, { completedAt: new Date().toISOString(), durationMs: elapsed });

        // Close log stream
        await new Promise((resolve) => logStream.end(resolve));

        logger.emit({ type: 'agent_done', storyId: story.id, code: result.code, durationMs: elapsed });

        console.log('');
        info(`Iteration ${i} done in ${formatDuration(elapsed)} (exit code: ${result.code})`);

        // Handle exhausted retries — stop the loop (stories must complete in order)
        if (retryResult.exhausted) {
          const classification = classifyError(result.code, result.stderr, result.killed);
          error(`Story ${story.id}: all ${retryResult.retries} retries exhausted (${classification.type}). Stopping loop — stories must complete in order.`);
          config.updateStory(story.id, { failed: true });
          config.setPauseState(`Story ${story.id} failed after ${retryResult.retries} retries (${classification.type})`, story.id, 1);
          config.updateStatus(`paused: ${story.id} failed`);
          config.releaseLock();
          registry.deregister(process.pid);
          exitFn(2);
          return;
        }

        // Handle non-retryable errors — stop the loop (stories must complete in order)
        if (retryResult.skipped) {
          const classification = classifyError(result.code, result.stderr, result.killed);
          error(`Story ${story.id}: non-retryable error (${classification.type}). Stopping loop — stories must complete in order.`);
          config.setPauseState(`Story ${story.id} failed: non-retryable ${classification.type} error`, story.id, 1);
          config.updateStatus(`paused: ${story.id} failed`);
          config.releaseLock();
          registry.deregister(process.pid);
          exitFn(2);
          return;
        }

        // Check if story is now marked as passed
        const refreshedData = config.load();
        const refreshedStory = refreshedData.userStories.find((s) => s.id === story.id);
        if (refreshedStory && refreshedStory.passes) {
          logger.emit({ type: 'story_done', storyId: story.id });
        }

        config.updateStatus(
          formatStatus(config, refreshedData, i, maxIterations, story.id, 'done', loopStartedAt)
        );

        // Check for completion signal
        if (result.output && result.output.includes('<promise>COMPLETE</promise>')) {
          config.updateStatus(
            formatStatus(config, refreshedData, i, maxIterations, '-', 'COMPLETE', loopStartedAt)
          );
          console.log('');
          success(`All tasks complete! Finished at iteration ${i}/${maxIterations}`);
          loopComplete = true;
          break;
        }

        if (result.killed) {
          warn('Agent was killed. Stopping loop.');
          loopComplete = true;
          break;
        }

        // Brief pause between iterations
        if (i < maxIterations && !stopped) {
          await sleep(2000);
        }
      }

      // After the inner for loop exits, do a final re-check for newly added stories.
      // This catches stories added while the loop was running that weren't yet visible.
      if (!stopped && !loopComplete) {
        const recheckData = config.load();
        const recheckStory = config.getNextStory(recheckData);
        if (!recheckStory) {
          // Truly done — no pending stories remain
          success('All stories complete!');
          config.updateStatus(formatStatus(config, recheckData, iteration, maxIterations, '-', 'COMPLETE', loopStartedAt));
          loopComplete = true;
        }
        // If recheckStory exists, the while loop will continue and process it
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
    registry.deregister(process.pid);
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

function formatStatus(config, data, iteration, maxIterations, storyId, status, loopStartedAt) {
  const { done, total, pct } = config.getProgress(data);
  const time = new Date().toTimeString().split(' ')[0];
  let line = `${done}/${total} (${pct}%) | ${storyId} | ${status} | iter ${iteration}/${maxIterations} | ${time}`;
  if (loopStartedAt) {
    const { elapsedMs, etaMs, etaFormatted } = calculateEta(data, loopStartedAt);
    const elapsedMin = Math.round(elapsedMs / 60_000);
    line += ` | elapsed ${elapsedMin}m | eta ${etaFormatted}`;
  }
  return line;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
