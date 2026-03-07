import * as vscode from 'vscode';
import { RalphConfig } from '../ralph/config';

export class ProgressViewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;

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
        case 'showDashboard':
          vscode.commands.executeCommand('ralph.showDashboard');
          break;
      }
    });
  }

  private getHtml(): string {
    const data = this.config.load();
    const status = this.config.readStatus();

    if (!data) {
      return this.getEmptyHtml();
    }

    const progress = this.config.getProgress(data);
    const nextStory = this.config.getNextStory(data);
    const isRunning = status?.status.includes('running') ?? false;

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
    padding: 12px;
  }
  .project-name {
    font-size: 13px;
    font-weight: 600;
    color: var(--vscode-foreground);
    margin-bottom: 2px;
  }
  .branch {
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    margin-bottom: 12px;
    font-family: var(--vscode-editor-font-family);
  }
  .progress-container {
    background: var(--vscode-editor-background);
    border-radius: 6px;
    padding: 12px;
    margin-bottom: 12px;
    border: 1px solid var(--vscode-widget-border);
  }
  .progress-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    margin-bottom: 8px;
  }
  .progress-pct {
    font-size: 24px;
    font-weight: 700;
    color: var(--vscode-foreground);
    line-height: 1;
  }
  .progress-counts {
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
  }
  .progress-bar-track {
    background: var(--vscode-progressBar-background);
    opacity: 0.2;
    border-radius: 4px;
    height: 6px;
    overflow: hidden;
    position: relative;
  }
  .progress-bar-fill {
    background: var(--vscode-progressBar-background);
    height: 100%;
    border-radius: 4px;
    transition: width 0.5s ease;
    position: absolute;
    top: 0;
    left: 0;
    opacity: 1;
  }
  .progress-bar-wrapper {
    position: relative;
    height: 6px;
    border-radius: 4px;
    overflow: hidden;
  }
  .progress-bar-bg {
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    background: var(--vscode-progressBar-background);
    opacity: 0.15;
    border-radius: 4px;
  }
  .status-section {
    margin-bottom: 12px;
  }
  .status-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--vscode-descriptionForeground);
    margin-bottom: 4px;
  }
  .status-value {
    font-size: 12px;
    color: var(--vscode-foreground);
    font-family: var(--vscode-editor-font-family);
    padding: 6px 8px;
    background: var(--vscode-editor-background);
    border-radius: 4px;
    border: 1px solid var(--vscode-widget-border);
  }
  .next-story {
    background: var(--vscode-editor-background);
    border-radius: 6px;
    padding: 10px;
    border: 1px solid var(--vscode-widget-border);
    margin-bottom: 12px;
  }
  .next-story-id {
    font-size: 11px;
    font-family: var(--vscode-editor-font-family);
    color: var(--vscode-textLink-foreground);
    margin-bottom: 2px;
  }
  .next-story-title {
    font-size: 12px;
    color: var(--vscode-foreground);
  }
  .next-story-meta {
    margin-top: 6px;
    display: flex;
    gap: 6px;
  }
  .badge {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 3px;
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
  }
  .actions {
    display: flex;
    gap: 6px;
  }
  .btn {
    flex: 1;
    padding: 6px 12px;
    font-size: 12px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-family: var(--vscode-font-family);
  }
  .btn-primary {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
  }
  .btn-primary:hover {
    background: var(--vscode-button-hoverBackground);
  }
  .btn-secondary {
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
  }
  .btn-secondary:hover {
    background: var(--vscode-button-secondaryHoverBackground);
  }
  .running-indicator {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: var(--vscode-charts-blue);
  }
  .running-dot {
    width: 6px;
    height: 6px;
    background: var(--vscode-charts-blue);
    border-radius: 50%;
    animation: pulse 1.5s infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }
  .complete-banner {
    text-align: center;
    padding: 12px;
    background: var(--vscode-editor-background);
    border-radius: 6px;
    border: 1px solid var(--vscode-charts-green);
    margin-bottom: 12px;
  }
  .complete-banner .icon { font-size: 20px; }
  .complete-banner .text {
    font-size: 12px;
    color: var(--vscode-charts-green);
    margin-top: 4px;
  }
</style>
</head>
<body>
  <div class="project-name">${this.escapeHtml(data.project)}</div>
  <div class="branch">${this.escapeHtml(data.branchName)}</div>

  <div class="progress-container">
    <div class="progress-header">
      <span class="progress-pct">${progress.pct}%</span>
      <span class="progress-counts">${progress.done}/${progress.total} stories</span>
    </div>
    <div class="progress-bar-wrapper">
      <div class="progress-bar-bg"></div>
      <div class="progress-bar-fill" style="width: ${progress.pct}%"></div>
    </div>
  </div>

  ${progress.pending === 0 ? `
    <div class="complete-banner">
      <div class="icon">&#10003;</div>
      <div class="text">All stories complete!</div>
    </div>
  ` : ''}

  ${isRunning && status ? `
    <div class="status-section">
      <div class="status-label">
        <span class="running-indicator">
          <span class="running-dot"></span>
          Running
        </span>
      </div>
      <div class="status-value">
        ${this.escapeHtml(status.storyId || '')} | iter ${status.iteration}/${status.maxIterations}
      </div>
    </div>
  ` : ''}

  ${nextStory && !isRunning ? `
    <div class="status-section">
      <div class="status-label">Next Story</div>
      <div class="next-story">
        <div class="next-story-id">${this.escapeHtml(nextStory.id)}</div>
        <div class="next-story-title">${this.escapeHtml(nextStory.title)}</div>
        <div class="next-story-meta">
          <span class="badge">${nextStory.model || 'sonnet'}</span>
          <span class="badge">${nextStory.effort || 'medium'}</span>
        </div>
      </div>
    </div>
  ` : ''}

  <div class="actions">
    ${isRunning
      ? `<button class="btn btn-secondary" onclick="send('stopLoop')">Stop Loop</button>`
      : `<button class="btn btn-primary" onclick="send('startLoop')" ${progress.pending === 0 ? 'disabled' : ''}>Start Loop</button>`
    }
    <button class="btn btn-secondary" onclick="send('showDashboard')">Dashboard</button>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    function send(command) {
      vscode.postMessage({ command });
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
  .btn {
    padding: 6px 16px;
    font-size: 12px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    font-family: var(--vscode-font-family);
  }
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
      .replace(/"/g, '&quot;');
  }
}
