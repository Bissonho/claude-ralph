import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { RalphConfig } from '../ralph/config';

interface ActivityEvent {
  ts: string;
  type: string;
  storyId?: string;
  title?: string;
  model?: string;
  effort?: string;
  iteration?: number;
  tool?: string;
  code?: number;
  durationMs?: number;
  maxIterations?: number;
  [key: string]: unknown;
}

export class ProgressViewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private activityWatcher?: vscode.FileSystemWatcher;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private config: RalphConfig,
  ) {}

  updateConfig(config: RalphConfig): void {
    this.config = config;
    this.refresh();
  }

  refresh(): void {
    if (this._view) {
      this._view.webview.html = this.getHtml();
    }
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
    };

    webviewView.webview.html = this.getHtml();

    webviewView.webview.onDidReceiveMessage(message => {
      switch (message.command) {
        case 'startLoop':
          vscode.commands.executeCommand('ralph.startLoop');
          break;
        case 'stopLoop':
          vscode.commands.executeCommand('ralph.stopLoop');
          break;
        case 'pauseLoop':
          vscode.commands.executeCommand('ralph.pauseLoop');
          break;
        case 'skipStory':
          vscode.commands.executeCommand('ralph.skipStory');
          break;
        case 'showDashboard':
          vscode.commands.executeCommand('ralph.showDashboard');
          break;
        case 'sendFeedback':
          this.writeFeedback(message.text);
          break;
        case 'openLog':
          this.openStoryLog(message.storyId);
          break;
      }
    });

    // Watch activity.jsonl for changes
    const activityPattern = new vscode.RelativePattern(this.config.prdDir, 'activity.jsonl');
    this.activityWatcher = vscode.workspace.createFileSystemWatcher(activityPattern);
    this.activityWatcher.onDidChange(() => this.refresh());
    this.activityWatcher.onDidCreate(() => this.refresh());

    webviewView.onDidDispose(() => {
      this.activityWatcher?.dispose();
    });
  }

  private writeFeedback(text: string): void {
    if (!text.trim()) { return; }
    const feedbackFile = path.join(this.config.prdDir, '.feedback');
    try {
      fs.writeFileSync(feedbackFile, text.trim() + '\n', 'utf-8');
      vscode.window.showInformationMessage('Feedback sent to Ralph.');
    } catch {
      vscode.window.showErrorMessage('Failed to write feedback.');
    }
  }

  private openStoryLog(storyId: string): void {
    const logFile = path.join(this.config.prdDir, 'logs', `${storyId}.log`);
    if (fs.existsSync(logFile)) {
      vscode.window.showTextDocument(vscode.Uri.file(logFile));
    } else {
      vscode.window.showWarningMessage(`No log file found for ${storyId}.`);
    }
  }

  private readActivity(): ActivityEvent[] {
    const activityFile = path.join(this.config.prdDir, 'activity.jsonl');
    if (!fs.existsSync(activityFile)) { return []; }
    try {
      const content = fs.readFileSync(activityFile, 'utf-8');
      return content
        .split('\n')
        .filter(Boolean)
        .map(line => JSON.parse(line) as ActivityEvent);
    } catch {
      return [];
    }
  }

  private getCompletedStories(events: ActivityEvent[]): Array<{
    storyId: string;
    title: string;
    durationMs: number;
  }> {
    const completed: Array<{ storyId: string; title: string; durationMs: number }> = [];
    const storyStarts = new Map<string, { title: string; ts: number }>();

    for (const ev of events) {
      if (ev.type === 'story_start' && ev.storyId) {
        storyStarts.set(ev.storyId, {
          title: ev.title || ev.storyId,
          ts: new Date(ev.ts).getTime(),
        });
      }
      if (ev.type === 'story_done' && ev.storyId) {
        const start = storyStarts.get(ev.storyId);
        const durationMs = start ? new Date(ev.ts).getTime() - start.ts : 0;
        completed.push({
          storyId: ev.storyId,
          title: start?.title || ev.storyId,
          durationMs,
        });
      }
    }
    return completed;
  }

  private getCurrentStory(events: ActivityEvent[]): ActivityEvent | null {
    // Find the last story_start that doesn't have a corresponding story_done
    const starts = new Map<string, ActivityEvent>();
    const dones = new Set<string>();

    for (const ev of events) {
      if (ev.type === 'story_start' && ev.storyId) {
        starts.set(ev.storyId, ev);
      }
      if (ev.type === 'story_done' && ev.storyId) {
        dones.add(ev.storyId);
      }
    }

    let current: ActivityEvent | null = null;
    for (const [id, ev] of starts) {
      if (!dones.has(id)) {
        current = ev;
      }
    }
    return current;
  }

  private formatDuration(ms: number): string {
    if (ms <= 0) { return '0s'; }
    const secs = Math.floor(ms / 1000);
    if (secs < 60) { return `${secs}s`; }
    const mins = Math.floor(secs / 60);
    const remSecs = secs % 60;
    if (mins < 60) { return `${mins}m ${remSecs}s`; }
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hrs}h ${remMins}m`;
  }

  private getEventIcon(type: string, code?: number): string {
    switch (type) {
      case 'story_start': return '<span class="ev-icon ev-start">&#9679;</span>';
      case 'agent_spawn': return '<span class="ev-icon ev-spawn">&#8627;</span>';
      case 'agent_done':
        return code === 0
          ? '<span class="ev-icon ev-success">&#10003;</span>'
          : '<span class="ev-icon ev-fail">&#10007;</span>';
      case 'quality_check':
        return code === 0
          ? '<span class="ev-icon ev-success">&#10003;</span>'
          : '<span class="ev-icon ev-fail">&#10007;</span>';
      case 'story_done': return '<span class="ev-icon ev-success">&#10003;</span>';
      case 'feedback_received': return '<span class="ev-icon ev-feedback">&#128172;</span>';
      case 'loop_start': return '<span class="ev-icon ev-start">&#9654;</span>';
      case 'loop_end': return '<span class="ev-icon ev-start">&#9632;</span>';
      default: return '<span class="ev-icon ev-start">&#8226;</span>';
    }
  }

  private formatEventText(ev: ActivityEvent): string {
    switch (ev.type) {
      case 'loop_start':
        return `Loop started (max ${ev.maxIterations} iterations, tool: ${this.escapeHtml(String(ev.tool || 'claude'))})`;
      case 'loop_end':
        return 'Loop ended';
      case 'story_start':
        return `Story <b>${this.escapeHtml(ev.storyId || '')}</b> started — ${this.escapeHtml(ev.title || '')}`;
      case 'agent_spawn':
        return `Agent spawned for ${this.escapeHtml(ev.storyId || '')} (${this.escapeHtml(String(ev.tool || 'claude'))})`;
      case 'agent_done': {
        const dur = ev.durationMs ? ` in ${this.formatDuration(ev.durationMs)}` : '';
        const status = ev.code === 0 ? 'succeeded' : `failed (exit ${ev.code})`;
        return `Agent ${status} for ${this.escapeHtml(ev.storyId || '')}${dur}`;
      }
      case 'quality_check':
        return `Quality check ${ev.code === 0 ? 'passed' : 'failed'} for ${this.escapeHtml(ev.storyId || '')}`;
      case 'story_done':
        return `Story <b>${this.escapeHtml(ev.storyId || '')}</b> completed`;
      case 'feedback_received':
        return `User feedback received`;
      default:
        return `${this.escapeHtml(ev.type)}`;
    }
  }

  private formatTime(ts: string): string {
    try {
      const d = new Date(ts);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return '';
    }
  }

  private getHtml(): string {
    const data = this.config.load();
    const status = this.config.readStatus();

    if (!data) {
      return this.getEmptyHtml();
    }

    const progress = this.config.getProgress(data);
    const isRunning = status?.status.includes('running') ?? false;
    const events = this.readActivity();
    const currentStory = this.getCurrentStory(events);
    const completedStories = this.getCompletedStories(events);

    // Elapsed time for current story
    let elapsed = '';
    if (currentStory) {
      const startMs = new Date(currentStory.ts).getTime();
      const elapsedMs = Date.now() - startMs;
      elapsed = this.formatDuration(elapsedMs);
    }

    // Show last 50 events in the activity log
    const recentEvents = events.slice(-50);

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: var(--vscode-font-family);
    color: var(--vscode-foreground);
    background: transparent;
    padding: 10px;
    font-size: 12px;
  }
  .section-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--vscode-descriptionForeground);
    margin-bottom: 4px;
    font-weight: 600;
  }

  /* Progress bar */
  .progress-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
  }
  .progress-bar-wrapper {
    flex: 1;
    position: relative;
    height: 6px;
    border-radius: 3px;
    overflow: hidden;
  }
  .progress-bar-bg {
    position: absolute;
    inset: 0;
    background: var(--vscode-progressBar-background);
    opacity: 0.15;
    border-radius: 3px;
  }
  .progress-bar-fill {
    position: absolute;
    top: 0; left: 0; bottom: 0;
    background: var(--vscode-progressBar-background);
    border-radius: 3px;
    transition: width 0.5s ease;
  }
  .progress-text {
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    white-space: nowrap;
  }

  /* Current story card */
  .story-card {
    background: var(--vscode-editor-background);
    border-radius: 6px;
    padding: 10px;
    border: 1px solid var(--vscode-widget-border);
    margin-bottom: 10px;
  }
  .story-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
  }
  .story-card-id {
    font-size: 11px;
    font-family: var(--vscode-editor-font-family);
    color: var(--vscode-textLink-foreground);
    font-weight: 600;
  }
  .story-card-elapsed {
    font-size: 10px;
    color: var(--vscode-descriptionForeground);
    font-family: var(--vscode-editor-font-family);
  }
  .story-card-title {
    font-size: 12px;
    color: var(--vscode-foreground);
    margin-bottom: 6px;
  }
  .story-card-meta {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }
  .badge {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 3px;
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
  }
  .running-dot {
    display: inline-block;
    width: 6px;
    height: 6px;
    background: var(--vscode-charts-blue);
    border-radius: 50%;
    animation: pulse 1.5s infinite;
    vertical-align: middle;
    margin-right: 4px;
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }

  /* Activity log */
  .activity-log {
    background: var(--vscode-editor-background);
    border: 1px solid var(--vscode-widget-border);
    border-radius: 6px;
    max-height: 200px;
    overflow-y: auto;
    margin-bottom: 10px;
    font-size: 11px;
  }
  .activity-log::-webkit-scrollbar { width: 6px; }
  .activity-log::-webkit-scrollbar-thumb {
    background: var(--vscode-scrollbarSlider-background);
    border-radius: 3px;
  }
  .ev-row {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    padding: 3px 8px;
    border-bottom: 1px solid var(--vscode-widget-border);
    line-height: 1.4;
  }
  .ev-row:last-child { border-bottom: none; }
  .ev-row:hover { background: var(--vscode-list-hoverBackground); }
  .ev-time {
    color: var(--vscode-descriptionForeground);
    font-family: var(--vscode-editor-font-family);
    font-size: 10px;
    white-space: nowrap;
    flex-shrink: 0;
    padding-top: 1px;
  }
  .ev-icon {
    flex-shrink: 0;
    font-size: 12px;
  }
  .ev-start { color: var(--vscode-charts-blue); }
  .ev-spawn { color: var(--vscode-charts-yellow); }
  .ev-success { color: var(--vscode-charts-green); }
  .ev-fail { color: var(--vscode-charts-red); }
  .ev-feedback { font-size: 11px; }
  .ev-text {
    flex: 1;
    word-break: break-word;
  }
  .empty-log {
    padding: 16px;
    text-align: center;
    color: var(--vscode-descriptionForeground);
    font-size: 11px;
  }

  /* Controls */
  .controls {
    display: flex;
    gap: 4px;
    margin-bottom: 10px;
    flex-wrap: wrap;
  }
  .btn {
    flex: 1;
    padding: 5px 8px;
    font-size: 11px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-family: var(--vscode-font-family);
    min-width: 0;
  }
  .btn-primary {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
  }
  .btn-primary:hover { background: var(--vscode-button-hoverBackground); }
  .btn-secondary {
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
  }
  .btn-secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
  .btn-danger {
    background: var(--vscode-inputValidation-errorBackground);
    color: var(--vscode-foreground);
    border: 1px solid var(--vscode-charts-red);
  }
  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Feedback */
  .feedback-row {
    display: flex;
    gap: 4px;
    margin-bottom: 10px;
  }
  .feedback-input {
    flex: 1;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border);
    border-radius: 4px;
    padding: 5px 8px;
    font-size: 11px;
    font-family: var(--vscode-font-family);
    outline: none;
  }
  .feedback-input:focus {
    border-color: var(--vscode-focusBorder);
  }
  .feedback-input::placeholder {
    color: var(--vscode-input-placeholderForeground);
  }

  /* History */
  .history-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .history-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    background: var(--vscode-editor-background);
    border: 1px solid var(--vscode-widget-border);
    border-radius: 4px;
    font-size: 11px;
  }
  .history-item:hover { background: var(--vscode-list-hoverBackground); }
  .history-icon {
    color: var(--vscode-charts-green);
    flex-shrink: 0;
  }
  .history-id {
    font-family: var(--vscode-editor-font-family);
    color: var(--vscode-textLink-foreground);
    flex-shrink: 0;
  }
  .history-title {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--vscode-descriptionForeground);
  }
  .history-dur {
    color: var(--vscode-descriptionForeground);
    font-family: var(--vscode-editor-font-family);
    font-size: 10px;
    flex-shrink: 0;
  }
  .history-log-btn {
    background: transparent;
    color: var(--vscode-textLink-foreground);
    border: none;
    cursor: pointer;
    font-size: 10px;
    font-family: var(--vscode-font-family);
    padding: 1px 4px;
    border-radius: 2px;
    flex-shrink: 0;
  }
  .history-log-btn:hover {
    background: var(--vscode-button-secondaryBackground);
  }

  .no-data {
    text-align: center;
    color: var(--vscode-descriptionForeground);
    font-size: 11px;
    padding: 8px;
  }
</style>
</head>
<body>
  <!-- Progress -->
  <div class="progress-row">
    <div class="progress-bar-wrapper">
      <div class="progress-bar-bg"></div>
      <div class="progress-bar-fill" style="width: ${progress.pct}%"></div>
    </div>
    <span class="progress-text">${progress.done}/${progress.total} (${progress.pct}%)</span>
  </div>

  <!-- Current Story Card -->
  ${currentStory && isRunning ? `
  <div class="section-label"><span class="running-dot"></span>Current Story</div>
  <div class="story-card">
    <div class="story-card-header">
      <span class="story-card-id">${this.escapeHtml(currentStory.storyId || '')}</span>
      <span class="story-card-elapsed">${elapsed}</span>
    </div>
    <div class="story-card-title">${this.escapeHtml(currentStory.title || '')}</div>
    <div class="story-card-meta">
      <span class="badge">${this.escapeHtml(String(currentStory.model || 'sonnet'))}</span>
      <span class="badge">${this.escapeHtml(String(currentStory.effort || 'medium'))}</span>
      ${currentStory.iteration != null ? `<span class="badge">iter ${currentStory.iteration}</span>` : ''}
      ${status ? `<span class="badge">iter ${status.iteration}/${status.maxIterations}</span>` : ''}
    </div>
  </div>
  ` : !isRunning && progress.pending > 0 ? `
  <div class="no-data">Loop is idle. Start the loop to begin processing stories.</div>
  ` : progress.pending === 0 ? `
  <div class="no-data" style="color: var(--vscode-charts-green);">&#10003; All stories complete!</div>
  ` : ''}

  <!-- Controls -->
  <div class="controls">
    ${isRunning ? `
      <button class="btn btn-secondary" onclick="send('pauseLoop')" title="Pause (SIGTSTP)">Pause</button>
      <button class="btn btn-secondary" onclick="send('skipStory')" title="Skip current story">Skip</button>
      <button class="btn btn-danger" onclick="send('stopLoop')" title="Stop loop (SIGINT)">Stop</button>
    ` : `
      <button class="btn btn-primary" onclick="send('startLoop')" ${progress.pending === 0 ? 'disabled' : ''}>Start Loop</button>
    `}
    <button class="btn btn-secondary" onclick="send('showDashboard')">Dashboard</button>
  </div>

  <!-- Feedback -->
  ${isRunning ? `
  <div class="section-label">Feedback</div>
  <div class="feedback-row">
    <input class="feedback-input" id="feedbackInput" type="text" placeholder="Send feedback to Ralph..." onkeydown="if(event.key==='Enter')sendFeedback()" />
    <button class="btn btn-primary" onclick="sendFeedback()">Send</button>
  </div>
  ` : ''}

  <!-- Activity Log -->
  <div class="section-label">Activity</div>
  <div class="activity-log" id="activityLog">
    ${recentEvents.length > 0 ? recentEvents.map(ev => `
    <div class="ev-row">
      <span class="ev-time">${this.formatTime(ev.ts)}</span>
      ${this.getEventIcon(ev.type, ev.code as number | undefined)}
      <span class="ev-text">${this.formatEventText(ev)}</span>
    </div>`).join('') : `
    <div class="empty-log">No activity yet. Start the loop to see events.</div>
    `}
  </div>

  <!-- Completed Stories History -->
  ${completedStories.length > 0 ? `
  <div class="section-label">History (${completedStories.length})</div>
  <div class="history-list">
    ${completedStories.map(s => `
    <div class="history-item">
      <span class="history-icon">&#10003;</span>
      <span class="history-id">${this.escapeHtml(s.storyId)}</span>
      <span class="history-title" title="${this.escapeHtml(s.title)}">${this.escapeHtml(s.title)}</span>
      <span class="history-dur">${this.formatDuration(s.durationMs)}</span>
      <button class="history-log-btn" onclick="openLog('${this.escapeHtml(s.storyId)}')" title="View Log">View Log</button>
    </div>`).join('')}
  </div>
  ` : ''}

  <script>
    const vscode = acquireVsCodeApi();
    function send(command) {
      vscode.postMessage({ command });
    }
    function sendFeedback() {
      const input = document.getElementById('feedbackInput');
      if (input && input.value.trim()) {
        vscode.postMessage({ command: 'sendFeedback', text: input.value });
        input.value = '';
      }
    }
    function openLog(storyId) {
      vscode.postMessage({ command: 'openLog', storyId });
    }
    // Auto-scroll activity log to bottom, but allow user to scroll up
    const log = document.getElementById('activityLog');
    if (log) {
      const isNearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
      if (isNearBottom) {
        log.scrollTop = log.scrollHeight;
      }
    }
  </script>
</body>
</html>`;
  }

  private getEmptyHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  body {
    font-family: var(--vscode-font-family);
    color: var(--vscode-descriptionForeground);
    padding: 20px;
    text-align: center;
  }
  .icon { font-size: 32px; margin-bottom: 8px; }
  .title { font-size: 13px; margin-bottom: 4px; color: var(--vscode-foreground); }
  .desc { font-size: 11px; margin-bottom: 12px; }
</style>
</head>
<body>
  <div class="icon">R</div>
  <div class="title">No Ralph project found</div>
  <div class="desc">Run <code>ralph init</code> or open a project with <code>.ralph/prd.json</code></div>
</body>
</html>`;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
