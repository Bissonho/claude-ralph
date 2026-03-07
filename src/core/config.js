import { readFileSync, writeFileSync, existsSync, unlinkSync, appendFileSync, mkdirSync, copyFileSync } from 'fs';
import { join } from 'path';

export class Config {
  constructor(prdDir) {
    this.prdDir = prdDir;
    this.prdFile = join(prdDir, 'prd.json');
    this.progressFile = join(prdDir, 'progress.txt');
    this.statusFile = join(prdDir, 'status.txt');
    this.lockFile = join(prdDir, '.lock');
    this.lastBranchFile = join(prdDir, '.last-branch');
    this.archiveDir = join(prdDir, 'archive');
    this.researchContextFile = join(prdDir, '.research_context.md');
  }

  load() {
    if (!existsSync(this.prdFile)) {
      throw new Error(`prd.json not found at ${this.prdFile}\nRun 'ralph init' first.`);
    }
    const raw = readFileSync(this.prdFile, 'utf-8');
    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      throw new Error(`Invalid JSON in ${this.prdFile}: ${e.message}`);
    }
    this._validate(data);
    return data;
  }

  save(data) {
    writeFileSync(this.prdFile, JSON.stringify(data, null, 2) + '\n');
  }

  getNextStory(data) {
    return data.userStories
      .filter((s) => !s.passes)
      .sort((a, b) => (a.priority || 999) - (b.priority || 999))[0] || null;
  }

  getProgress(data) {
    const total = data.userStories.length;
    const done = data.userStories.filter((s) => s.passes).length;
    return { total, done, pending: total - done, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
  }

  markStoryPassed(storyId) {
    const data = this.load();
    const story = data.userStories.find((s) => s.id === storyId);
    if (!story) throw new Error(`Story ${storyId} not found`);
    story.passes = true;
    this.save(data);
    return story;
  }

  addStory(story) {
    const data = this.load();
    if (data.userStories.find((s) => s.id === story.id)) {
      throw new Error(`Story ${story.id} already exists`);
    }
    data.userStories.push({
      id: story.id,
      title: story.title,
      description: story.description || '',
      acceptanceCriteria: story.acceptanceCriteria || [],
      priority: story.priority || data.userStories.length + 1,
      passes: false,
      tddType: story.tddType || 'frontend',
      effort: story.effort || 'medium',
      model: story.model || 'sonnet',
      research: story.research || false,
      research_query: story.research_query || '',
      research_model: story.research_model || 'perplexity/sonar-pro',
      notes: story.notes || '',
    });
    this.save(data);
    return data;
  }

  updateStory(storyId, updates) {
    const data = this.load();
    const story = data.userStories.find((s) => s.id === storyId);
    if (!story) throw new Error(`Story ${storyId} not found`);
    Object.assign(story, updates);
    this.save(data);
    return story;
  }

  removeStory(storyId) {
    const data = this.load();
    const idx = data.userStories.findIndex((s) => s.id === storyId);
    if (idx === -1) throw new Error(`Story ${storyId} not found`);
    data.userStories.splice(idx, 1);
    this.save(data);
    return data;
  }

  // Extract only the Codebase Patterns section (token-efficient)
  readPatterns() {
    if (!existsSync(this.progressFile)) return null;
    const text = readFileSync(this.progressFile, 'utf-8');
    const match = text.match(/## Codebase Patterns\n([\s\S]*?)(?=\n## \d|$)/);
    return match ? match[1].trim() : null;
  }

  readProgress() {
    if (!existsSync(this.progressFile)) return '';
    return readFileSync(this.progressFile, 'utf-8');
  }

  appendProgress(entry) {
    appendFileSync(this.progressFile, '\n' + entry + '\n');
  }

  updateStatus(statusLine) {
    writeFileSync(this.statusFile, statusLine + '\n');
  }

  readStatus() {
    if (!existsSync(this.statusFile)) return null;
    return readFileSync(this.statusFile, 'utf-8').trim();
  }

  // Returns the current PRD state: 'empty' | 'pending' | 'complete'
  getPrdState() {
    if (!existsSync(this.prdFile)) return 'empty';
    try {
      const data = this.load();
      const { pending } = this.getProgress(data);
      return pending === 0 ? 'complete' : 'pending';
    } catch {
      return 'empty';
    }
  }

  // Get a compact summary of the current PRD (for MCP responses)
  getPrdSummary() {
    if (!existsSync(this.prdFile)) return null;
    try {
      const data = this.load();
      const { total, done, pending, pct } = this.getProgress(data);
      return {
        project: data.project,
        branch: data.branchName,
        total,
        done,
        pending,
        pct,
        state: pending === 0 ? 'complete' : 'pending',
      };
    } catch {
      return null;
    }
  }

  // Archive current prd.json + progress.txt and reset for a new PRD
  archiveCurrent() {
    if (!existsSync(this.prdFile)) return null;

    const data = this.load();
    const date = new Date().toISOString().split('T')[0];
    const folderName = (data.branchName || 'unknown').replace(/^ralph\//, '');
    const archiveFolder = join(this.archiveDir, `${date}-${folderName}`);

    mkdirSync(archiveFolder, { recursive: true });

    // Copy current files to archive
    copyFileSync(this.prdFile, join(archiveFolder, 'prd.json'));
    if (existsSync(this.progressFile)) {
      copyFileSync(this.progressFile, join(archiveFolder, 'progress.txt'));
    }
    if (existsSync(this.statusFile)) {
      copyFileSync(this.statusFile, join(archiveFolder, 'status.txt'));
    }

    // Extract codebase patterns to carry forward
    const patterns = this.readPatterns();

    // Reset files
    unlinkSync(this.prdFile);
    if (existsSync(this.statusFile)) unlinkSync(this.statusFile);
    writeFileSync(
      this.progressFile,
      `# Ralph Progress Log\nStarted: ${new Date().toISOString()}\n---\n\n## Codebase Patterns\n${patterns ? patterns + '\n' : ''}`
    );

    return {
      archivedTo: archiveFolder,
      project: data.project,
      branch: data.branchName,
      patternsCarried: !!patterns,
    };
  }

  // Create a fresh PRD (used after archive or on empty state)
  createPrd(prdData) {
    this.save(prdData);
    if (!existsSync(this.progressFile)) {
      writeFileSync(
        this.progressFile,
        `# Ralph Progress Log\nStarted: ${new Date().toISOString()}\n---\n\n## Codebase Patterns\n`
      );
    }
    return { ok: true, project: prdData.project, stories: prdData.userStories.length };
  }

  // Lock: prevent concurrent runs
  acquireLock() {
    if (existsSync(this.lockFile)) {
      const pid = parseInt(readFileSync(this.lockFile, 'utf-8').trim(), 10);
      try {
        process.kill(pid, 0); // check if alive
        throw new Error(`Ralph already running (PID ${pid}). Delete ${this.lockFile} if stale.`);
      } catch (e) {
        if (e.code !== 'ESRCH') throw e;
        // ESRCH = process dead, stale lock — safe to overwrite
      }
    }
    writeFileSync(this.lockFile, String(process.pid));
  }

  releaseLock() {
    try { unlinkSync(this.lockFile); } catch { /* ignore */ }
  }

  _validate(data) {
    if (!data.project) throw new Error('prd.json: missing "project"');
    if (!data.branchName) throw new Error('prd.json: missing "branchName"');
    if (!Array.isArray(data.userStories) || data.userStories.length === 0) {
      throw new Error('prd.json: "userStories" must be a non-empty array');
    }
    for (const s of data.userStories) {
      if (!s.id) throw new Error('prd.json: story missing "id"');
      if (!s.title) throw new Error(`prd.json: ${s.id} missing "title"`);
    }
  }
}
