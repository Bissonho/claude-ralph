import * as vscode from 'vscode';

const HUB_PORT = 3742;
const HUB_BASE = `http://localhost:${HUB_PORT}`;
const POLL_INTERVAL = 3000;

export class HubPanel {
  private static instance: HubPanel | undefined;
  private panel: vscode.WebviewPanel;
  private pollTimer: NodeJS.Timeout | undefined;
  private lastKnownStatuses: Map<string, string> = new Map();

  private constructor(panel: vscode.WebviewPanel) {
    this.panel = panel;

    this.panel.onDidDispose(() => {
      this.dispose();
    });

    this.panel.webview.onDidReceiveMessage(async message => {
      await this.handleWebviewMessage(message);
    });

    this.startPolling();
    this.loadContent();
  }

  static show(extensionUri: vscode.Uri): void {
    if (HubPanel.instance) {
      HubPanel.instance.panel.reveal(vscode.ViewColumn.One);
      HubPanel.instance.loadContent();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'ralph.hub',
      'Ralph Hub',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );

    HubPanel.instance = new HubPanel(panel);
  }

  private async loadContent(): Promise<void> {
    const running = await this.isHubRunning();
    if (running) {
      await this.loadHubDashboard();
    } else {
      this.panel.webview.html = this.getFallbackHtml();
    }
  }

  private async isHubRunning(): Promise<boolean> {
    try {
      const res = await fetch(`${HUB_BASE}/api/status`, { signal: AbortSignal.timeout(2000) });
      return res.ok;
    } catch {
      return false;
    }
  }

  private async loadHubDashboard(): Promise<void> {
    try {
      const res = await fetch(`${HUB_BASE}/`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) {
        this.panel.webview.html = this.getFallbackHtml(`Hub returned HTTP ${res.status}`);
        return;
      }
      let html = await res.text();
      // Inject VS Code webview bridge and patch resource URLs
      html = this.patchHubHtml(html);
      this.panel.webview.html = html;
    } catch (err: any) {
      this.panel.webview.html = this.getFallbackHtml(err?.message);
    }
  }

  private patchHubHtml(html: string): string {
    // Rewrite absolute URLs (href="/..." src="/...") to point at hub server
    html = html.replace(/(href|src)="\/([^"]*)"/g, `$1="${HUB_BASE}/$2"`);
    // Rewrite fetch('/...') calls in inline scripts
    html = html.replace(/fetch\('\/([^']*)'\)/g, `fetch('${HUB_BASE}/$1')`);
    html = html.replace(/fetch\("\/([^"]*)"\)/g, `fetch("${HUB_BASE}/$1")`);
    // Inject the VS Code postMessage bridge before </body>
    const bridge = `
<script>
  // VS Code webview bridge: forward control messages to extension
  (function() {
    const vscode = acquireVsCodeApi();
    window.__hubBridge = {
      sendFeedback: function(project, text) {
        vscode.postMessage({ command: 'feedback', project, text });
      },
      sendControl: function(project, action) {
        vscode.postMessage({ command: 'control', project, action });
      }
    };
  })();
</script>`;
    return html.replace('</body>', bridge + '\n</body>');
  }

  private async handleWebviewMessage(message: any): Promise<void> {
    switch (message.command) {
      case 'feedback': {
        try {
          await fetch(`${HUB_BASE}/api/feedback`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ project: message.project, text: message.text }),
          });
        } catch (err: any) {
          vscode.window.showErrorMessage(`Hub feedback error: ${err?.message}`);
        }
        break;
      }
      case 'control': {
        try {
          await fetch(`${HUB_BASE}/api/control`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ project: message.project, action: message.action }),
          });
        } catch (err: any) {
          vscode.window.showErrorMessage(`Hub control error: ${err?.message}`);
        }
        break;
      }
      case 'openInBrowser': {
        vscode.env.openExternal(vscode.Uri.parse(HUB_BASE));
        break;
      }
      case 'startHub': {
        const terminal = vscode.window.createTerminal({ name: 'Ralph Hub' });
        terminal.show();
        terminal.sendText('ralph hub');
        // Retry after a short delay
        setTimeout(() => this.loadContent(), 3000);
        break;
      }
    }
  }

  private startPolling(): void {
    this.pollTimer = setInterval(async () => {
      await this.pollStatus();
    }, POLL_INTERVAL);
  }

  private async pollStatus(): Promise<void> {
    try {
      const res = await fetch(`${HUB_BASE}/api/status`, { signal: AbortSignal.timeout(2000) });
      if (!res.ok) {
        // Hub stopped — show fallback and try to reconnect on next poll
        const current = this.panel.webview.html;
        if (!current.includes('id="fallback"')) {
          this.panel.webview.html = this.getFallbackHtml('Hub server stopped. Start it with `ralph hub`.');
        }
        return;
      }

      const statuses = await res.json() as Array<{ project: string; status: string; currentStory?: string }>;

      // Check if panel was showing fallback and hub is now up again
      if (this.panel.webview.html.includes('id="fallback"')) {
        await this.loadHubDashboard();
        return;
      }

      // Detect loop completions/failures and show notifications
      for (const entry of statuses) {
        const prev = this.lastKnownStatuses.get(entry.project);
        const curr = entry.status;
        if (prev && prev !== curr) {
          if (curr === 'idle' && prev === 'running') {
            vscode.window.showInformationMessage(`Ralph [${entry.project}]: loop completed.`);
          } else if (curr === 'error') {
            vscode.window.showWarningMessage(`Ralph [${entry.project}]: loop failed.`);
          }
        }
        this.lastKnownStatuses.set(entry.project, curr);
      }
    } catch {
      // Hub unreachable — silently skip (will show fallback on next load if needed)
    }
  }

  private dispose(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
    HubPanel.instance = undefined;
  }

  private getFallbackHtml(error?: string): string {
    const msg = error ? `<p class="error">${this.esc(error)}</p>` : '';
    return `<!DOCTYPE html>
<html lang="en" id="fallback">
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
    --red: var(--vscode-charts-red);
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: var(--vscode-font-family);
    background: var(--bg);
    color: var(--fg);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 40px;
    text-align: center;
  }
  h1 { font-size: 20px; font-weight: 600; margin-bottom: 8px; }
  .subtitle { font-size: 13px; color: var(--muted); margin-bottom: 24px; }
  .card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 32px 40px;
    max-width: 440px;
    width: 100%;
  }
  .error {
    color: var(--red);
    font-size: 12px;
    margin-bottom: 16px;
    font-family: var(--vscode-editor-font-family);
  }
  .btn {
    padding: 8px 20px;
    font-size: 13px;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    font-family: var(--vscode-font-family);
    font-weight: 500;
    margin: 4px;
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
  code {
    background: var(--vscode-textCodeBlock-background, rgba(128,128,128,0.15));
    padding: 2px 6px;
    border-radius: 3px;
    font-family: var(--vscode-editor-font-family);
    font-size: 12px;
  }
  .hint { font-size: 12px; color: var(--muted); margin-top: 16px; }
</style>
</head>
<body>
<div class="card">
  <h1>Ralph Hub</h1>
  <p class="subtitle">Unified dashboard for all active Ralph loops</p>
  ${msg}
  <p style="font-size:13px; margin-bottom:20px;">
    The Ralph Hub server is not running.<br>
    Start it to monitor all loops in one place.
  </p>
  <div>
    <button class="btn btn-primary" onclick="send('startHub')">Start Hub Server</button>
    <button class="btn btn-secondary" onclick="send('openInBrowser')">Open in Browser</button>
  </div>
  <p class="hint">Or run <code>ralph hub</code> in a terminal, then reopen this panel.</p>
</div>
<script>
  const vscode = acquireVsCodeApi();
  function send(command) { vscode.postMessage({ command }); }
</script>
</body>
</html>`;
  }

  private esc(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
