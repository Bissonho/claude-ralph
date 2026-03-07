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
exports.HubPanel = void 0;
const vscode = __importStar(require("vscode"));
const HUB_PORT = 3742;
const HUB_BASE = `http://localhost:${HUB_PORT}`;
const POLL_INTERVAL = 3000;
class HubPanel {
    static instance;
    panel;
    pollTimer;
    lastKnownStatuses = new Map();
    constructor(panel) {
        this.panel = panel;
        this.panel.onDidDispose(() => {
            this.dispose();
        });
        this.panel.webview.onDidReceiveMessage(async (message) => {
            await this.handleWebviewMessage(message);
        });
        this.startPolling();
        this.loadContent();
    }
    static show(extensionUri) {
        if (HubPanel.instance) {
            HubPanel.instance.panel.reveal(vscode.ViewColumn.One);
            HubPanel.instance.loadContent();
            return;
        }
        const panel = vscode.window.createWebviewPanel('ralph.hub', 'Ralph Hub', vscode.ViewColumn.One, {
            enableScripts: true,
            retainContextWhenHidden: true,
        });
        HubPanel.instance = new HubPanel(panel);
    }
    async loadContent() {
        const running = await this.isHubRunning();
        if (running) {
            await this.loadHubDashboard();
        }
        else {
            this.panel.webview.html = this.getFallbackHtml();
        }
    }
    async isHubRunning() {
        try {
            const res = await fetch(`${HUB_BASE}/api/status`, { signal: AbortSignal.timeout(2000) });
            return res.ok;
        }
        catch {
            return false;
        }
    }
    async loadHubDashboard() {
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
        }
        catch (err) {
            this.panel.webview.html = this.getFallbackHtml(err?.message);
        }
    }
    patchHubHtml(html) {
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
    async handleWebviewMessage(message) {
        switch (message.command) {
            case 'feedback': {
                try {
                    await fetch(`${HUB_BASE}/api/feedback`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ project: message.project, text: message.text }),
                    });
                }
                catch (err) {
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
                }
                catch (err) {
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
    startPolling() {
        this.pollTimer = setInterval(async () => {
            await this.pollStatus();
        }, POLL_INTERVAL);
    }
    async pollStatus() {
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
            const statuses = await res.json();
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
                    }
                    else if (curr === 'error') {
                        vscode.window.showWarningMessage(`Ralph [${entry.project}]: loop failed.`);
                    }
                }
                this.lastKnownStatuses.set(entry.project, curr);
            }
        }
        catch {
            // Hub unreachable — silently skip (will show fallback on next load if needed)
        }
    }
    dispose() {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = undefined;
        }
        HubPanel.instance = undefined;
    }
    getFallbackHtml(error) {
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
    esc(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
}
exports.HubPanel = HubPanel;
//# sourceMappingURL=hub-panel.js.map