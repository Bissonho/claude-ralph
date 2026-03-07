"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DashboardPanel = void 0;
const vscode = __importStar(require("vscode"));
class DashboardPanel {
    static instance;
    panel;
    config;
    refreshInterval;
    constructor(panel, config) {
        this.panel = panel;
        this.config = config;
        this.panel.onDidDispose(() => {
            this.dispose();
        });
        this.panel.webview.onDidReceiveMessage(message => {
            switch (message.command) {
                case 'startLoop':
                    vscode.commands.executeCommand('ralph.startLoop');
                    break;
                case 'stopLoop':
                    vscode.commands.executeCommand('ralph.stopLoop');
                    break;
                case 'markDone':
                    vscode.commands.executeCommand('ralph.markStoryDone', { story: { id: message.storyId } });
                    break;
                case 'markPending':
                    vscode.commands.executeCommand('ralph.markStoryPending', { story: { id: message.storyId } });
                    break;
                case 'openPrd':
                    vscode.commands.executeCommand('ralph.openPrd');
                    break;
            }
        });
        // Auto-refresh
        const interval = vscode.workspace.getConfiguration('ralph').get('autoRefreshInterval', 3000);
        this.refreshInterval = setInterval(() => this.refresh(), interval);
    }
    static show(extensionUri, config) {
        if (DashboardPanel.instance) {
            DashboardPanel.instance.config = config;
            DashboardPanel.instance.panel.reveal(vscode.ViewColumn.One);
            DashboardPanel.instance.refresh();
            return;
        }
        const panel = vscode.window.createWebviewPanel('ralph.dashboard', 'Ralph Dashboard', vscode.ViewColumn.One, {
            enableScripts: true,
            retainContextWhenHidden: true,
        });
        DashboardPanel.instance = new DashboardPanel(panel, config);
        DashboardPanel.instance.refresh();
    }
    static refresh() {
        DashboardPanel.instance?.refresh();
    }
    updateConfig(config) {
        this.config = config;
        this.refresh();
    }
    refresh() {
        this.panel.webview.html = this.getHtml();
    }
    dispose() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }
        DashboardPanel.instance = undefined;
    }
    getHtml() {
        const data = this.config.load();
        if (!data) {
            return '<html><body><h2>No Ralph project found</h2></body></html>';
        }
        const progress = this.config.getProgress(data);
        const status = this.config.readStatus();
        const runningId = this.extractRunningId(status);
        const isRunning = !!runningId;
        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  :root {
    --bg: var(--vscode-editor-background);
    --fg: var(--vscode-foreground);
    --muted: var(--vscode-descriptionForeground);
    --card: var(--vscode-sideBar-background);
    --border: var(--vscode-widget-border);
    --accent: var(--vscode-textLink-foreground);
    --green: var(--vscode-charts-green);
    --blue: var(--vscode-charts-blue);
    --yellow: var(--vscode-charts-yellow);
    --red: var(--vscode-charts-red);
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: var(--vscode-font-family);
    background: var(--bg);
    color: var(--fg);
    padding: 24px;
    max-width: 900px;
    margin: 0 auto;
  }

  /* Header */
  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 24px;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--border);
  }
  .header-left h1 {
    font-size: 18px;
    font-weight: 600;
    margin-bottom: 2px;
  }
  .header-left .branch {
    font-size: 12px;
    color: var(--accent);
    font-family: var(--vscode-editor-font-family);
  }
  .header-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .live-badge {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: var(--muted);
  }
  .live-dot {
    width: 6px; height: 6px;
    background: var(--green);
    border-radius: 50%;
    animation: blink 1.5s infinite;
  }
  @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }

  /* Progress */
  .progress-card {
    background: var(--card);
    border-radius: 8px;
    padding: 20px;
    margin-bottom: 20px;
    border: 1px solid var(--border);
  }
  .progress-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    margin-bottom: 12px;
  }
  .progress-pct {
    font-size: 36px;
    font-weight: 700;
    line-height: 1;
  }
  .progress-counts {
    font-size: 13px;
    color: var(--muted);
  }
  .progress-bar-wrapper {
    position: relative;
    height: 8px;
    border-radius: 4px;
    overflow: hidden;
  }
  .progress-bar-bg {
    position: absolute;
    inset: 0;
    background: var(--fg);
    opacity: 0.08;
    border-radius: 4px;
  }
  .progress-bar-fill {
    position: absolute;
    top: 0; left: 0; bottom: 0;
    background: var(--blue);
    border-radius: 4px;
    transition: width 0.5s ease;
  }
  .progress-stats {
    display: flex;
    gap: 16px;
    margin-top: 12px;
  }
  .stat {
    font-size: 12px;
    color: var(--muted);
  }
  .stat-value {
    font-weight: 600;
    color: var(--fg);
  }

  /* Status bar */
  .status-bar {
    background: var(--card);
    border-radius: 8px;
    padding: 12px 16px;
    margin-bottom: 20px;
    border: 1px solid var(--border);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .status-text {
    font-size: 12px;
    font-family: var(--vscode-editor-font-family);
    color: var(--muted);
  }
  .status-actions {
    display: flex;
    gap: 8px;
  }
  .btn {
    padding: 5px 14px;
    font-size: 12px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-family: var(--vscode-font-family);
    font-weight: 500;
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
  .btn-icon {
    background: transparent;
    color: var(--muted);
    padding: 4px 6px;
    border: 1px solid var(--border);
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
  }
  .btn-icon:hover { color: var(--fg); }

  /* Stories */
  .stories-header {
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 8px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .stories {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .story {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    background: var(--card);
    border-radius: 6px;
    border: 1px solid var(--border);
    border-left: 3px solid transparent;
    transition: all 0.15s ease;
  }
  .story:hover { background: var(--vscode-list-hoverBackground); }
  .story.done {
    border-left-color: var(--green);
    opacity: 0.6;
  }
  .story.pending { border-left-color: transparent; }
  .story.running {
    border-left-color: var(--blue);
    animation: pulse 2s infinite;
    opacity: 1;
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.85; }
  }

  .story-icon {
    width: 20px;
    height: 20px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    flex-shrink: 0;
  }
  .story-icon.done { color: var(--green); }
  .story-icon.pending { color: var(--muted); }
  .story-icon.running { color: var(--blue); }

  .story-id {
    font-size: 11px;
    color: var(--muted);
    font-family: var(--vscode-editor-font-family);
    min-width: 50px;
    flex-shrink: 0;
  }
  .story-title {
    flex: 1;
    font-size: 13px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .story-meta {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
  }
  .tag {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 3px;
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
  }
  .story-action {
    opacity: 0;
    transition: opacity 0.15s;
  }
  .story:hover .story-action { opacity: 1; }
</style>
</head>
<body>

<div class="header">
  <div class="header-left">
    <h1>${this.esc(data.project)}</h1>
    <div class="branch">${this.esc(data.branchName)}</div>
  </div>
  <div class="header-right">
    ${isRunning ? '<div class="live-badge"><span class="live-dot"></span>RUNNING</div>' : ''}
    <button class="btn-icon" onclick="send('openPrd')" title="Open prd.json">{ }</button>
  </div>
</div>

<div class="progress-card">
  <div class="progress-top">
    <span class="progress-pct">${progress.pct}%</span>
    <span class="progress-counts">${progress.done}/${progress.total} stories</span>
  </div>
  <div class="progress-bar-wrapper">
    <div class="progress-bar-bg"></div>
    <div class="progress-bar-fill" style="width: ${progress.pct}%"></div>
  </div>
  <div class="progress-stats">
    <span class="stat"><span class="stat-value">${progress.done}</span> done</span>
    <span class="stat"><span class="stat-value">${progress.pending}</span> pending</span>
    ${status ? `<span class="stat">iter <span class="stat-value">${status.iteration}/${status.maxIterations}</span></span>` : ''}
  </div>
</div>

<div class="status-bar">
  <span class="status-text">${status ? this.esc(status.raw) : 'Idle'}</span>
  <div class="status-actions">
    ${isRunning
            ? `<button class="btn btn-secondary" onclick="send('stopLoop')">Stop</button>`
            : `<button class="btn btn-primary" onclick="send('startLoop')" ${progress.pending === 0 ? 'disabled' : ''}>Start Loop</button>`}
  </div>
</div>

<div class="stories-header">Stories</div>
<div class="stories">
  ${data.userStories.map(s => this.renderStory(s, s.id === runningId)).join('\n')}
</div>

<script>
  const vscode = acquireVsCodeApi();
  function send(command, data) {
    vscode.postMessage({ command, ...data });
  }
  function toggleStory(id, currentlyDone) {
    send(currentlyDone ? 'markPending' : 'markDone', { storyId: id });
  }
</script>
</body>
</html>`;
    }
    renderStory(story, isRunning) {
        const state = isRunning ? 'running' : (story.passes ? 'done' : 'pending');
        const icon = isRunning ? '&#9654;' : (story.passes ? '&#10003;' : '&#9675;');
        return `<div class="story ${state}">
      <div class="story-icon ${state}">${icon}</div>
      <span class="story-id">${this.esc(story.id)}</span>
      <span class="story-title" title="${this.esc(story.title)}">${this.esc(story.title)}</span>
      <div class="story-meta">
        <span class="tag">${story.model || 'sonnet'}</span>
        <span class="tag">${story.effort || 'medium'}</span>
      </div>
      <button class="btn-icon story-action" onclick="toggleStory('${story.id}', ${story.passes})" title="${story.passes ? 'Mark pending' : 'Mark done'}">
        ${story.passes ? '&#8635;' : '&#10003;'}
      </button>
    </div>`;
    }
    extractRunningId(status) {
        if (!status || !status.status.includes('running')) {
            return null;
        }
        return status.storyId;
    }
    esc(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
}
exports.DashboardPanel = DashboardPanel;
//# sourceMappingURL=dashboard-panel.js.map