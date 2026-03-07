// ralph dashboard — Real-time visual task board
// Zero dependencies: uses Node.js built-in http module + SSE for live updates
// Usage: ralph dashboard [--port 3741]

import { createServer } from 'http';
import { watch } from 'fs';
import { join } from 'path';
import { Config } from '../core/config.js';
import { findPrdDir, info, success, c } from '../utils.js';

const HTML = (initialData) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Ralph Dashboard</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    background: #0F1115;
    color: #EAEFF5;
    min-height: 100vh;
    padding: 24px;
  }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 32px;
    padding-bottom: 16px;
    border-bottom: 1px solid #1B222C;
  }
  .header h1 { font-size: 20px; font-weight: 600; }
  .header .branch { color: #5BA8C8; font-size: 13px; font-weight: 400; }
  .progress-container {
    background: #151A21;
    border-radius: 12px;
    padding: 20px;
    margin-bottom: 24px;
  }
  .progress-bar-track {
    background: #1B222C;
    border-radius: 8px;
    height: 12px;
    overflow: hidden;
    margin-top: 12px;
  }
  .progress-bar-fill {
    background: linear-gradient(90deg, #4A90D9, #5BA8C8);
    height: 100%;
    border-radius: 8px;
    transition: width 0.5s ease;
  }
  .progress-text {
    display: flex;
    justify-content: space-between;
    font-size: 14px;
    color: #9AA3AE;
  }
  .progress-pct { font-size: 28px; font-weight: 700; color: #EAEFF5; }
  .stories { display: flex; flex-direction: column; gap: 8px; }
  .story {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
    background: #151A21;
    border-radius: 10px;
    border-left: 3px solid transparent;
    transition: all 0.3s ease;
  }
  .story.done { border-left-color: #22C55E; opacity: 0.7; }
  .story.pending { border-left-color: #1B222C; }
  .story.running { border-left-color: #4A90D9; background: #1B222C; animation: pulse 2s infinite; }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.85; }
  }
  .story-icon {
    width: 24px;
    height: 24px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    flex-shrink: 0;
  }
  .story-icon.done { background: #22C55E22; color: #22C55E; }
  .story-icon.pending { background: #1B222C; color: #6B7280; }
  .story-icon.running { background: #4A90D922; color: #4A90D9; }
  .story-id { font-size: 12px; color: #6B7280; font-family: monospace; min-width: 56px; }
  .story-title { flex: 1; font-size: 14px; }
  .story-meta {
    display: flex; gap: 8px; font-size: 11px; color: #6B7280;
  }
  .story-meta span {
    background: #1B222C;
    padding: 2px 8px;
    border-radius: 4px;
  }
  .status-bar {
    margin-top: 24px;
    padding: 12px 16px;
    background: #151A21;
    border-radius: 10px;
    font-size: 12px;
    color: #6B7280;
    font-family: monospace;
  }
  .live-dot {
    display: inline-block;
    width: 6px; height: 6px;
    background: #22C55E;
    border-radius: 50%;
    margin-right: 6px;
    animation: blink 1.5s infinite;
  }
  @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
</style>
</head>
<body>
<div class="header">
  <div>
    <h1 id="project">Ralph Dashboard</h1>
    <div class="branch" id="branch"></div>
  </div>
  <div><span class="live-dot"></span><span style="color:#6B7280;font-size:12px">LIVE</span></div>
</div>

<div class="progress-container">
  <div style="display:flex;justify-content:space-between;align-items:flex-end">
    <div class="progress-pct" id="pct">0%</div>
    <div class="progress-text"><span id="counts">0/0</span></div>
  </div>
  <div class="progress-bar-track">
    <div class="progress-bar-fill" id="bar" style="width:0%"></div>
  </div>
</div>

<div class="stories" id="stories"></div>
<div class="status-bar" id="statusBar">Connecting...</div>

<script>
let currentRunning = null;

function render(data) {
  document.getElementById('project').textContent = data.project || 'Ralph';
  document.getElementById('branch').textContent = data.branch || '';
  document.getElementById('pct').textContent = data.pct + '%';
  document.getElementById('counts').textContent = data.done + '/' + data.total + ' stories';
  document.getElementById('bar').style.width = data.pct + '%';

  const container = document.getElementById('stories');
  container.innerHTML = data.stories.map(s => {
    const state = s.running ? 'running' : (s.done ? 'done' : 'pending');
    const icon = s.running ? '&#9654;' : (s.done ? '&#10003;' : '&#9675;');
    return '<div class="story ' + state + '">' +
      '<div class="story-icon ' + state + '">' + icon + '</div>' +
      '<span class="story-id">' + s.id + '</span>' +
      '<span class="story-title">' + s.title + '</span>' +
      '<div class="story-meta"><span>' + (s.model||'sonnet') + '</span><span>' + (s.effort||'medium') + '</span></div>' +
    '</div>';
  }).join('');

  if (data.status) {
    document.getElementById('statusBar').textContent = data.status;
  }
}

// SSE for live updates
const es = new EventSource('/events');
es.onmessage = (e) => {
  try { render(JSON.parse(e.data)); } catch {}
};
es.onerror = () => {
  document.getElementById('statusBar').textContent = 'Disconnected. Retrying...';
};

// Initial data
fetch('/api/status').then(r => r.json()).then(render);
</script>
</body>
</html>`;

export async function startDashboard(opts = {}) {
  const port = opts.port || 3741;
  const prdDir = findPrdDir(opts.prdDir);
  const config = new Config(prdDir);

  // SSE clients
  const clients = new Set();

  function getStatusData() {
    try {
      const data = config.load();
      const { total, done, pct } = config.getProgress(data);
      const statusLine = config.readStatus() || '';
      const runningId = extractRunningId(statusLine);

      return {
        project: data.project,
        branch: data.branchName,
        total,
        done,
        pct,
        stories: data.userStories.map((s) => ({
          id: s.id,
          title: s.title,
          done: s.passes,
          model: s.model,
          effort: s.effort,
          running: s.id === runningId,
        })),
        status: statusLine,
      };
    } catch (e) {
      return { project: 'Error', branch: '', total: 0, done: 0, pct: 0, stories: [], status: e.message };
    }
  }

  function broadcast() {
    const data = JSON.stringify(getStatusData());
    for (const res of clients) {
      try { res.write(`data: ${data}\n\n`); } catch { clients.delete(res); }
    }
  }

  // Watch for file changes
  const filesToWatch = [config.prdFile, config.statusFile];
  const watchers = [];

  for (const file of filesToWatch) {
    try {
      const w = watch(file, { persistent: false }, () => broadcast());
      watchers.push(w);
    } catch { /* file may not exist yet */ }
  }

  // Also watch the directory for new files
  try {
    const w = watch(prdDir, { persistent: false }, (_, filename) => {
      if (filename === 'prd.json' || filename === 'status.txt') broadcast();
    });
    watchers.push(w);
  } catch { /* ignore */ }

  // HTTP server
  const server = createServer((req, res) => {
    if (req.url === '/events') {
      // SSE
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });
      res.write(`data: ${JSON.stringify(getStatusData())}\n\n`);
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }

    if (req.url === '/api/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(getStatusData()));
      return;
    }

    // Serve HTML
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(HTML(getStatusData()));
  });

  server.listen(port, () => {
    success(`Dashboard running at ${c.cyan}http://localhost:${port}${c.reset}`);
    info('Watching .ralph/ for changes (live updates via SSE)');
  });

  // Periodic broadcast (fallback if file watching misses changes)
  const interval = setInterval(broadcast, 3000);

  // Cleanup
  process.on('SIGINT', () => {
    clearInterval(interval);
    watchers.forEach((w) => w.close());
    server.close();
    process.exit(0);
  });
}

function extractRunningId(statusLine) {
  if (!statusLine || !statusLine.includes('running')) return null;
  const match = statusLine.match(/\| (US-\d+) \|/);
  return match ? match[1] : null;
}
