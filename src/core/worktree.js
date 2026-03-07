import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { execSync, spawn } from 'child_process';
import { Config } from './config.js';

export class WorktreeManager {
  constructor(prdDir) {
    this.prdDir = prdDir;
    this.projectRoot = dirname(prdDir);
    this.worktreesDir = join(this.projectRoot, '.ralph-worktrees');
    this.registryFile = join(prdDir, 'worktrees.json');
  }

  loadRegistry() {
    if (!existsSync(this.registryFile)) return [];
    try {
      return JSON.parse(readFileSync(this.registryFile, 'utf-8'));
    } catch {
      return [];
    }
  }

  saveRegistry(entries) {
    writeFileSync(this.registryFile, JSON.stringify(entries, null, 2));
  }

  create(name, branch) {
    const registry = this.loadRegistry();
    if (registry.find(e => e.name === name)) {
      throw new Error(`Worktree "${name}" already exists`);
    }

    const wtPath = join(this.worktreesDir, name);
    mkdirSync(this.worktreesDir, { recursive: true });

    // git worktree add
    this._exec(`git worktree add -b ${branch} ${wtPath} HEAD`);

    // Init .ralph/ in worktree
    const wtRalphDir = join(wtPath, '.ralph');
    mkdirSync(wtRalphDir, { recursive: true });

    // Copy codebase patterns from main .ralph/progress.txt
    const mainConfig = new Config(this.prdDir);
    const patterns = mainConfig.readPatterns();
    writeFileSync(
      join(wtRalphDir, 'progress.txt'),
      `# Ralph Progress Log\nStarted: ${new Date().toISOString()}\n---\n\n## Codebase Patterns\n${patterns ? patterns + '\n' : ''}`
    );

    // Register
    registry.push({
      name,
      branch,
      path: wtPath,
      createdAt: new Date().toISOString(),
    });
    this.saveRegistry(registry);

    this.ensureGitignore();
    return registry[registry.length - 1];
  }

  remove(name) {
    const registry = this.loadRegistry();
    const entry = registry.find(e => e.name === name);
    if (!entry) throw new Error(`Worktree "${name}" not found`);

    // Check if running
    const lockFile = join(entry.path, '.ralph', '.lock');
    if (existsSync(lockFile)) {
      const pid = parseInt(readFileSync(lockFile, 'utf-8').trim(), 10);
      if (this._isProcessRunning(pid)) {
        throw new Error(`Worktree "${name}" is running (PID ${pid}). Stop it first.`);
      }
    }

    // git worktree remove
    try {
      this._exec(`git worktree remove ${entry.path} --force`);
    } catch {
      // If git worktree remove fails, try manual cleanup
      rmSync(entry.path, { recursive: true, force: true });
      try { this._exec('git worktree prune'); } catch { /* ignore */ }
    }

    // Deregister
    const updated = registry.filter(e => e.name !== name);
    this.saveRegistry(updated);
  }

  list() {
    const registry = this.loadRegistry();
    return registry.map(entry => ({
      ...entry,
      status: this._getWorktreeStatus(entry),
    }));
  }

  getConfig(name) {
    const registry = this.loadRegistry();
    const entry = registry.find(e => e.name === name);
    if (!entry) throw new Error(`Worktree "${name}" not found`);
    return new Config(join(entry.path, '.ralph'));
  }

  startRun(name, maxIterations, tool) {
    const registry = this.loadRegistry();
    const entry = registry.find(e => e.name === name);
    if (!entry) throw new Error(`Worktree "${name}" not found`);

    const args = ['run'];
    if (maxIterations) args.push('--max-iterations', String(maxIterations));
    if (tool) args.push('--tool', tool);

    const child = this._spawn('ralph', args, {
      cwd: entry.path,
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    return { name, pid: child.pid };
  }

  startAll(maxIterations, tool) {
    const entries = this.list();
    const results = [];
    for (const entry of entries) {
      if (entry.status === 'idle') {
        results.push(this.startRun(entry.name, maxIterations, tool));
      }
    }
    return results;
  }

  merge(name) {
    const registry = this.loadRegistry();
    const entry = registry.find(e => e.name === name);
    if (!entry) throw new Error(`Worktree "${name}" not found`);

    const status = this._getWorktreeStatus(entry);
    if (status !== 'complete') {
      throw new Error(`Worktree "${name}" is not complete (status: ${status})`);
    }

    // Merge the branch into current branch
    this._exec(`git merge ${entry.branch}`);

    // Remove worktree
    this.remove(name);
  }

  ensureGitignore() {
    const gitignorePath = join(this.projectRoot, '.gitignore');
    const entry = '.ralph-worktrees/';

    if (existsSync(gitignorePath)) {
      const content = readFileSync(gitignorePath, 'utf-8');
      if (content.includes(entry)) return;
      writeFileSync(gitignorePath, content.trimEnd() + '\n' + entry + '\n');
    } else {
      writeFileSync(gitignorePath, entry + '\n');
    }
  }

  // Internal: get live status of a worktree
  _getWorktreeStatus(entry) {
    const ralphDir = join(entry.path, '.ralph');

    // Check status file first
    const statusFile = join(ralphDir, 'status.txt');
    if (existsSync(statusFile)) {
      const status = readFileSync(statusFile, 'utf-8').trim();
      if (status === 'complete') return 'complete';
    }

    // Check lock file for running
    const lockFile = join(ralphDir, '.lock');
    if (existsSync(lockFile)) {
      const pid = parseInt(readFileSync(lockFile, 'utf-8').trim(), 10);
      if (this._isProcessRunning(pid)) return 'running';
    }

    return 'idle';
  }

  // Internal: check if a process is running
  _isProcessRunning(pid) {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  // Internal: execute shell command (mockable in tests)
  _exec(cmd) {
    return execSync(cmd, { cwd: this.projectRoot, encoding: 'utf-8', stdio: 'pipe' });
  }

  // Internal: spawn process (mockable in tests)
  _spawn(cmd, args, opts) {
    return spawn(cmd, args, opts);
  }
}
