import { join } from 'path';
import { WorktreeManager } from '../core/worktree.js';
import { c, progressBar, findPrdDir } from '../utils.js';
import { Config } from '../core/config.js';

function statusColor(status) {
  switch (status) {
    case 'running': return `${c.green}running${c.reset}`;
    case 'complete': return `${c.cyan}complete${c.reset}`;
    case 'idle': return `${c.dim}idle${c.reset}`;
    default: return `${c.dim}${status}${c.reset}`;
  }
}

function printWorktreeList(worktrees) {
  if (worktrees.length === 0) {
    console.log(`${c.dim}No worktrees registered. Use 'ralph worktree create <name> --branch <branch>' to add one.${c.reset}`);
    return;
  }

  console.log('');
  console.log(`${c.bold}Worktrees:${c.reset}`);
  for (const wt of worktrees) {
    const status = statusColor(wt.status);
    console.log(`  ${c.bold}${wt.name}${c.reset}  branch: ${c.cyan}${wt.branch}${c.reset}  status: ${status}`);
    console.log(`    ${c.dim}${wt.path}${c.reset}`);
  }
  console.log('');
}

function printWorktreeStatus(worktrees, prdDir) {
  if (worktrees.length === 0) {
    console.log(`${c.dim}No worktrees registered.${c.reset}`);
    return;
  }

  console.log('');
  console.log(`${c.bold}Worktree Status:${c.reset}`);
  console.log('');

  for (const wt of worktrees) {
    const status = statusColor(wt.status);
    console.log(`  ${c.bold}${wt.name}${c.reset}  [${status}]  ${c.dim}${wt.branch}${c.reset}`);

    // Try to load PRD progress for this worktree
    try {
      const wtConfig = new Config(join(wt.path, '.ralph'));
      const data = wtConfig.load();
      const { total, done } = wtConfig.getProgress(data);
      console.log(`    Progress: ${progressBar(done, total)}`);
    } catch {
      console.log(`    ${c.dim}No PRD found${c.reset}`);
    }

    console.log('');
  }
}

function printRunAllStatus(results) {
  console.log('');
  console.log(`${c.bold}Started ${results.length} worktree loop(s):${c.reset}`);
  console.log('');
  for (const r of results) {
    console.log(`  ${c.green}started${c.reset}  ${c.bold}${r.name}${c.reset}  PID: ${c.dim}${r.pid}${c.reset}`);
  }
  console.log('');
}

export async function worktreeCommand(args) {
  const subcommand = args[0];
  const subArgs = args.slice(1);
  const prdDir = findPrdDir();
  const manager = new WorktreeManager(prdDir);

  switch (subcommand) {
    case 'create': {
      const name = subArgs[0];
      if (!name) {
        console.error(`${c.red}error${c.reset} Usage: ralph worktree create <name> --branch <branch>`);
        process.exit(1);
      }

      let branch = null;
      for (let i = 1; i < subArgs.length; i++) {
        if (subArgs[i] === '--branch' || subArgs[i] === '-b') {
          branch = subArgs[++i];
        }
      }

      if (!branch) {
        console.error(`${c.red}error${c.reset} --branch <branch> is required`);
        process.exit(1);
      }

      try {
        const entry = manager.create(name, branch);
        console.log(`${c.green}created${c.reset} worktree ${c.bold}${entry.name}${c.reset} on branch ${c.cyan}${entry.branch}${c.reset}`);
        console.log(`${c.dim}Path: ${entry.path}${c.reset}`);
      } catch (e) {
        console.error(`${c.red}error${c.reset} ${e.message}`);
        process.exit(1);
      }
      break;
    }

    case 'remove':
    case 'rm': {
      const name = subArgs[0];
      if (!name) {
        console.error(`${c.red}error${c.reset} Usage: ralph worktree remove <name>`);
        process.exit(1);
      }

      try {
        manager.remove(name);
        console.log(`${c.green}removed${c.reset} worktree ${c.bold}${name}${c.reset}`);
      } catch (e) {
        console.error(`${c.red}error${c.reset} ${e.message}`);
        process.exit(1);
      }
      break;
    }

    case 'list':
    case 'ls': {
      const worktrees = manager.list();
      printWorktreeList(worktrees);
      break;
    }

    case 'status': {
      const worktrees = manager.list();
      printWorktreeStatus(worktrees, prdDir);
      break;
    }

    case 'run': {
      const name = subArgs[0];
      if (!name) {
        console.error(`${c.red}error${c.reset} Usage: ralph worktree run <name> [--max-iterations N]`);
        process.exit(1);
      }

      let maxIterations = null;
      for (let i = 1; i < subArgs.length; i++) {
        if (subArgs[i] === '--max-iterations' || subArgs[i] === '-n') {
          maxIterations = parseInt(subArgs[++i], 10);
        }
      }

      try {
        const result = manager.startRun(name, maxIterations);
        console.log(`${c.green}started${c.reset} loop for worktree ${c.bold}${result.name}${c.reset}  PID: ${c.dim}${result.pid}${c.reset}`);
      } catch (e) {
        console.error(`${c.red}error${c.reset} ${e.message}`);
        process.exit(1);
      }
      break;
    }

    case 'run-all': {
      let maxIterations = null;
      for (let i = 0; i < subArgs.length; i++) {
        if (subArgs[i] === '--max-iterations' || subArgs[i] === '-n') {
          maxIterations = parseInt(subArgs[++i], 10);
        }
      }

      try {
        const results = manager.startAll(maxIterations);
        if (results.length === 0) {
          console.log(`${c.yellow}warn${c.reset} No idle worktrees to start`);
        } else {
          printRunAllStatus(results);
        }
      } catch (e) {
        console.error(`${c.red}error${c.reset} ${e.message}`);
        process.exit(1);
      }
      break;
    }

    case 'merge': {
      const name = subArgs[0];
      if (!name) {
        console.error(`${c.red}error${c.reset} Usage: ralph worktree merge <name>`);
        process.exit(1);
      }

      try {
        manager.merge(name);
        console.log(`${c.green}merged${c.reset} worktree ${c.bold}${name}${c.reset} into current branch`);
      } catch (e) {
        console.error(`${c.red}error${c.reset} ${e.message}`);
        process.exit(1);
      }
      break;
    }

    default: {
      console.log(`
${c.bold}ralph worktree${c.reset} — Manage git worktrees for parallel agent runs

${c.bold}Usage:${c.reset}
  ralph worktree create <name> --branch <branch>   Create a new worktree
  ralph worktree remove <name>                      Remove a worktree
  ralph worktree list                               List all worktrees
  ralph worktree status                             Show detailed status with PRD progress
  ralph worktree run <name> [--max-iterations N]    Start agent loop in a worktree
  ralph worktree run-all [--max-iterations N]       Start all idle worktrees in parallel
  ralph worktree merge <name>                       Merge a completed worktree branch
`);
      if (subcommand && subcommand !== '--help' && subcommand !== '-h' && subcommand !== 'help') {
        console.error(`${c.red}error${c.reset} Unknown subcommand: ${subcommand}`);
        process.exit(1);
      }
    }
  }
}
