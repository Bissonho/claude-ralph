import * as fs from 'fs';
import * as path from 'path';
import { PrdData, Progress, StatusInfo, UserStory, GlobalConfig, WorktreeEntry, WorktreeInfo } from './types';

export class RalphConfig {
  readonly prdDir: string;
  readonly prdFile: string;
  readonly statusFile: string;
  readonly progressFile: string;
  readonly lockFile: string;
  readonly configFile: string;
  readonly worktreesFile: string;

  constructor(prdDir: string) {
    this.prdDir = prdDir;
    this.prdFile = path.join(prdDir, 'prd.json');
    this.statusFile = path.join(prdDir, 'status.txt');
    this.progressFile = path.join(prdDir, 'progress.txt');
    this.lockFile = path.join(prdDir, '.lock');
    this.configFile = path.join(prdDir, 'config.json');
    this.worktreesFile = path.join(prdDir, 'worktrees.json');
  }

  exists(): boolean {
    return fs.existsSync(this.prdFile);
  }

  load(): PrdData | null {
    if (!this.exists()) {
      return null;
    }
    try {
      const raw = fs.readFileSync(this.prdFile, 'utf-8');
      return JSON.parse(raw) as PrdData;
    } catch {
      return null;
    }
  }

  save(data: PrdData): void {
    fs.writeFileSync(this.prdFile, JSON.stringify(data, null, 2) + '\n');
  }

  getProgress(data: PrdData): Progress {
    const total = data.userStories.length;
    const done = data.userStories.filter(s => s.passes).length;
    return {
      total,
      done,
      pending: total - done,
      pct: total > 0 ? Math.round((done / total) * 100) : 0,
    };
  }

  getNextStory(data: PrdData): UserStory | null {
    return data.userStories
      .filter(s => !s.passes)
      .sort((a, b) => (a.priority || 999) - (b.priority || 999))[0] || null;
  }

  isStatusFileStale(): boolean {
    if (!fs.existsSync(this.statusFile)) {
      return true;
    }
    try {
      const stat = fs.statSync(this.statusFile);
      const ageMs = Date.now() - stat.mtimeMs;
      // If status.txt hasn't been updated in 30s, the loop is likely dead
      return ageMs > 30_000;
    } catch {
      return true;
    }
  }

  isLockFilePresent(): boolean {
    return fs.existsSync(this.lockFile);
  }

  readStatus(): StatusInfo | null {
    if (!fs.existsSync(this.statusFile)) {
      return null;
    }
    try {
      const raw = fs.readFileSync(this.statusFile, 'utf-8').trim();
      const parsed = this.parseStatus(raw);

      // If status says "running" but evidence says it's dead, fix it permanently
      if (parsed.status.includes('running') && !this.isActuallyRunning()) {
        this.clearRunningStatus();
        parsed.status = 'stopped';
        parsed.raw = parsed.raw.replace(/running[^|]*/, 'stopped');
      }

      return parsed;
    } catch {
      return null;
    }
  }

  // Multiple heuristics to detect if the loop is truly running
  private isActuallyRunning(): boolean {
    // 1. Lock file must exist — Ralph always creates one while running
    if (!this.isLockFilePresent()) {
      return false;
    }

    // 2. If lock file exists, check if the PID is alive
    try {
      const pid = parseInt(fs.readFileSync(this.lockFile, 'utf-8').trim(), 10);
      if (isNaN(pid)) { return false; }
      process.kill(pid, 0); // throws if process doesn't exist
      return true;
    } catch {
      // Process is dead — clean up stale lock
      try { fs.unlinkSync(this.lockFile); } catch { /* ignore */ }
      return false;
    }
  }

  clearRunningStatus(): void {
    if (!fs.existsSync(this.statusFile)) {
      return;
    }
    try {
      const raw = fs.readFileSync(this.statusFile, 'utf-8').trim();
      if (raw.includes('running')) {
        const updated = raw.replace(/running[^|]*/, 'stopped');
        fs.writeFileSync(this.statusFile, updated + '\n');
      }
    } catch {
      // ignore
    }
  }

  readProgressLog(): string {
    if (!fs.existsSync(this.progressFile)) {
      return '';
    }
    return fs.readFileSync(this.progressFile, 'utf-8');
  }

  updateStory(storyId: string, updates: Partial<UserStory>): void {
    const data = this.load();
    if (!data) { return; }
    const story = data.userStories.find(s => s.id === storyId);
    if (!story) { return; }
    Object.assign(story, updates);
    this.save(data);
  }

  addStory(story: UserStory): void {
    const data = this.load();
    if (!data) { return; }
    if (data.userStories.find(s => s.id === story.id)) { return; }
    data.userStories.push(story);
    this.save(data);
  }

  reorderStory(storyId: string, newPriority: number): void {
    const data = this.load();
    if (!data) { return; }
    const story = data.userStories.find(s => s.id === storyId);
    if (!story) { return; }

    const oldPriority = story.priority;
    if (oldPriority === newPriority) { return; }

    // Shift other stories to make room
    for (const s of data.userStories) {
      if (s.id === storyId) { continue; }
      if (oldPriority < newPriority) {
        // Moving down: shift stories in between up
        if (s.priority > oldPriority && s.priority <= newPriority) {
          s.priority--;
        }
      } else {
        // Moving up: shift stories in between down
        if (s.priority >= newPriority && s.priority < oldPriority) {
          s.priority++;
        }
      }
    }
    story.priority = newPriority;
    this.save(data);
  }

  removeStory(storyId: string): void {
    const data = this.load();
    if (!data) { return; }
    data.userStories = data.userStories.filter(s => s.id !== storyId);
    this.save(data);
  }

  getPrdState(): 'empty' | 'pending' | 'complete' {
    if (!this.exists()) { return 'empty'; }
    const data = this.load();
    if (!data) { return 'empty'; }
    const progress = this.getProgress(data);
    return progress.pending === 0 ? 'complete' : 'pending';
  }

  archiveCurrent(): { archivedTo: string; project: string } | null {
    if (!this.exists()) { return null; }
    const data = this.load();
    if (!data) { return null; }

    const date = new Date().toISOString().split('T')[0];
    const folderName = (data.branchName || 'unknown').replace(/^ralph\//, '');
    const archiveDir = path.join(this.prdDir, 'archive');
    const archiveFolder = path.join(archiveDir, `${date}-${folderName}`);

    fs.mkdirSync(archiveFolder, { recursive: true });

    fs.copyFileSync(this.prdFile, path.join(archiveFolder, 'prd.json'));
    if (fs.existsSync(this.progressFile)) {
      fs.copyFileSync(this.progressFile, path.join(archiveFolder, 'progress.txt'));
    }
    if (fs.existsSync(this.statusFile)) {
      fs.copyFileSync(this.statusFile, path.join(archiveFolder, 'status.txt'));
    }

    // Extract patterns to carry forward
    const progressText = this.readProgressLog();
    const patternsMatch = progressText.match(/## Codebase Patterns\n([\s\S]*?)(?=\n## \d|$)/);
    const patterns = patternsMatch ? patternsMatch[1].trim() : '';

    // Reset
    fs.unlinkSync(this.prdFile);
    if (fs.existsSync(this.statusFile)) { fs.unlinkSync(this.statusFile); }
    fs.writeFileSync(
      this.progressFile,
      `# Ralph Progress Log\nStarted: ${new Date().toISOString()}\n---\n\n## Codebase Patterns\n${patterns ? patterns + '\n' : ''}`,
    );

    return { archivedTo: archiveFolder, project: data.project };
  }

  loadGlobalConfig(): GlobalConfig {
    try {
      if (fs.existsSync(this.configFile)) {
        const raw = fs.readFileSync(this.configFile, 'utf-8');
        return JSON.parse(raw) as GlobalConfig;
      }
    } catch {
      // ignore parse errors
    }
    return {};
  }

  saveGlobalConfig(data: GlobalConfig): void {
    fs.writeFileSync(this.configFile, JSON.stringify(data, null, 2) + '\n');
  }

  loadWorktrees(): WorktreeInfo[] {
    if (!fs.existsSync(this.worktreesFile)) {
      return [];
    }
    try {
      const entries: WorktreeEntry[] = JSON.parse(fs.readFileSync(this.worktreesFile, 'utf-8'));
      return entries.map(entry => this.enrichWorktreeEntry(entry));
    } catch {
      return [];
    }
  }

  private enrichWorktreeEntry(entry: WorktreeEntry): WorktreeInfo {
    const ralphDir = path.join(entry.path, '.ralph');
    let status: 'idle' | 'running' | 'complete' = 'idle';
    let progress: Progress | undefined;

    // Check status
    const statusFile = path.join(ralphDir, 'status.txt');
    if (fs.existsSync(statusFile)) {
      const raw = fs.readFileSync(statusFile, 'utf-8').trim();
      if (raw === 'complete') {
        status = 'complete';
      }
    }

    // Check lock file for running
    if (status !== 'complete') {
      const lockFile = path.join(ralphDir, '.lock');
      if (fs.existsSync(lockFile)) {
        try {
          const pid = parseInt(fs.readFileSync(lockFile, 'utf-8').trim(), 10);
          if (!isNaN(pid)) {
            process.kill(pid, 0);
            status = 'running';
          }
        } catch {
          // process not running
        }
      }
    }

    // Read progress from worktree's prd.json
    const prdFile = path.join(ralphDir, 'prd.json');
    if (fs.existsSync(prdFile)) {
      try {
        const data: PrdData = JSON.parse(fs.readFileSync(prdFile, 'utf-8'));
        const total = data.userStories.length;
        const done = data.userStories.filter(s => s.passes).length;
        progress = {
          total,
          done,
          pending: total - done,
          pct: total > 0 ? Math.round((done / total) * 100) : 0,
        };
      } catch {
        // ignore
      }
    }

    return { ...entry, status, progress };
  }

  private parseStatus(raw: string): StatusInfo {
    // Format: done/total (pct%) | story_id | status | iter x/y | time [| elapsed Xm | eta ~Ym]
    const parts = raw.split(' | ');
    const progressMatch = parts[0]?.match(/(\d+)\/(\d+)\s*\((\d+)%\)/);
    const iterMatch = parts[3]?.match(/iter (\d+)\/(\d+)/);

    // Parse optional elapsed/eta fields (parts[5] = "elapsed Xm", parts[6] = "eta ~Ym")
    let elapsed: string | undefined;
    let eta: string | undefined;
    if (parts[5]) {
      const elapsedMatch = parts[5].trim().match(/^elapsed\s+(.+)$/);
      if (elapsedMatch) { elapsed = elapsedMatch[1]; }
    }
    if (parts[6]) {
      const etaMatch = parts[6].trim().match(/^eta\s+(.+)$/);
      if (etaMatch) { eta = etaMatch[1]; }
    }

    return {
      done: progressMatch ? parseInt(progressMatch[1], 10) : 0,
      total: progressMatch ? parseInt(progressMatch[2], 10) : 0,
      pct: progressMatch ? parseInt(progressMatch[3], 10) : 0,
      storyId: parts[1]?.trim() || null,
      status: parts[2]?.trim() || '',
      iteration: iterMatch ? parseInt(iterMatch[1], 10) : 0,
      maxIterations: iterMatch ? parseInt(iterMatch[2], 10) : 0,
      time: parts[4]?.trim() || '',
      elapsed,
      eta,
      raw,
    };
  }
}

export function findPrdDir(workspaceRoot: string): string | null {
  const candidates = [
    path.join(workspaceRoot, '.ralph'),
    path.join(workspaceRoot, 'scripts', 'ralph'),
  ];

  // First check for prd.json
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'prd.json'))) {
      return dir;
    }
  }

  // Also accept .ralph/ dir even without prd.json (empty/archived state)
  for (const dir of candidates) {
    if (fs.existsSync(dir)) {
      return dir;
    }
  }

  return null;
}
