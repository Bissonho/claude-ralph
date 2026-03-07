// ralph hub — Unified web dashboard for all Ralph loops across projects
// Zero dependencies: uses Node.js built-in http module + SSE for live updates
// Usage: ralph hub [--port 3742] [--token <token>]

import { createServer } from 'http';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { GlobalRegistry } from '../core/registry.js';
import { Config } from '../core/config.js';
import { success, info, c } from '../utils.js';

function getLoopStatus(entry) {
  try {
    const config = new Config(entry.prdDir);
    const data = config.load();
    const { total, done, pct } = config.getProgress(data);
    const statusLine = config.readStatus() || '';
    const runningId = extractRunningId(statusLine);

    let elapsed = null;
    let eta = null;
    const elapsedMatch = statusLine.match(/elapsed (\S+)/);
    const etaMatch = statusLine.match(/eta (\S+)/);
    if (elapsedMatch) elapsed = elapsedMatch[1];
    if (etaMatch) eta = etaMatch[1];

    const currentStory = runningId
      ? data.userStories.find((s) => s.id === runningId) || null
      : null;

    return {
      project: data.project || entry.project,
      branch: data.branchName || entry.branch,
      projectPath: entry.projectPath,
      prdDir: entry.prdDir,
      pid: entry.pid,
      startedAt: entry.startedAt,
      total,
      done,
      pct,
      elapsed,
      eta,
      status: statusLine,
      currentStory: currentStory ? {
        id: currentStory.id,
        title: currentStory.title,
        model: currentStory.model,
        effort: currentStory.effort,
      } : null,
      stories: data.userStories.map((s) => ({
        id: s.id,
        title: s.title,
        done: !!s.passes,
        model: s.model,
        effort: s.effort,
        running: s.id === runningId,
      })),
    };
  } catch (e) {
    return {
      project: entry.project,
      branch: entry.branch,
      projectPath: entry.projectPath,
      prdDir: entry.prdDir,
      pid: entry.pid,
      startedAt: entry.startedAt,
      total: 0,
      done: 0,
      pct: 0,
      elapsed: null,
      eta: null,
      status: `Error: ${e.message}`,
      currentStory: null,
      stories: [],
    };
  }
}

function extractRunningId(statusLine) {
  if (!statusLine || !statusLine.includes('running')) return null;
  const match = statusLine.match(/\| (US-\d+) \|/);
  return match ? match[1] : null;
}

function getAllLoopsStatus(registry) {
  const entries = registry.list();
  return entries.map((entry) => getLoopStatus(entry));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function checkAuth(req, token) {
  if (!token) return true;
  const authHeader = req.headers.authorization || '';
  return authHeader === `Bearer ${token}`;
}

function jsonResponse(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(body);
}

const HUB_HTML = (initialData) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Ralph Hub</title>
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
    margin-bottom: 24px;
    padding-bottom: 16px;
    border-bottom: 1px solid #1B222C;
  }
  .header h1 { font-size: 22px; font-weight: 600; }
  .header .subtitle { color: #6B7280; font-size: 13px; margin-top: 4px; }
  .live-dot {
    display: inline-block;
    width: 6px; height: 6px;
    background: #22C55E;
    border-radius: 50%;
    margin-right: 6px;
    animation: blink 1.5s infinite;
  }
  @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
  .no-loops {
    text-align: center;
    padding: 60px 20px;
    color: #6B7280;
  }
  .no-loops h2 { font-size: 18px; margin-bottom: 8px; color: #9AA3AE; }
  .no-loops p { font-size: 14px; }
  .projects { display: flex; flex-direction: column; gap: 20px; }
  .project-card {
    background: #151A21;
    border-radius: 12px;
    padding: 20px;
    border: 1px solid #1B222C;
  }
  .project-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 16px;
  }
  .project-name { font-size: 16px; font-weight: 600; }
  .project-branch { color: #5BA8C8; font-size: 12px; margin-top: 2px; }
  .project-path { color: #6B7280; font-size: 11px; margin-top: 2px; font-family: monospace; }
  .project-pid { color: #6B7280; font-size: 11px; }
  .progress-row {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
  }
  .progress-pct { font-size: 24px; font-weight: 700; min-width: 60px; }
  .progress-bar-track {
    flex: 1;
    background: #1B222C;
    border-radius: 8px;
    height: 10px;
    overflow: hidden;
  }
  .progress-bar-fill {
    background: linear-gradient(90deg, #4A90D9, #5BA8C8);
    height: 100%;
    border-radius: 8px;
    transition: width 0.5s ease;
  }
  .progress-counts { color: #9AA3AE; font-size: 13px; min-width: 70px; text-align: right; }
  .timing-row {
    display: flex;
    gap: 12px;
    margin-bottom: 16px;
    font-size: 12px;
  }
  .timing-badge {
    background: #1B222C;
    padding: 4px 10px;
    border-radius: 6px;
    color: #9AA3AE;
  }
  .timing-badge span { color: #EAEFF5; font-weight: 500; }
  .current-story {
    background: #1B222C;
    border-radius: 8px;
    padding: 12px 14px;
    margin-bottom: 16px;
    border-left: 3px solid #4A90D9;
    animation: pulse 2s infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.85; }
  }
  .current-story .cs-label { font-size: 10px; text-transform: uppercase; color: #6B7280; letter-spacing: 0.5px; margin-bottom: 4px; }
  .current-story .cs-id { font-family: monospace; color: #5BA8C8; font-size: 12px; }
  .current-story .cs-title { font-size: 14px; margin-top: 2px; }
  .current-story .cs-meta { display: flex; gap: 8px; margin-top: 6px; }
  .current-story .cs-meta span { font-size: 11px; color: #6B7280; background: #151A21; padding: 2px 6px; border-radius: 4px; }
  .stories-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 16px;
    max-height: 200px;
    overflow-y: auto;
  }
  .stories-list::-webkit-scrollbar { width: 4px; }
  .stories-list::-webkit-scrollbar-track { background: transparent; }
  .stories-list::-webkit-scrollbar-thumb { background: #1B222C; border-radius: 4px; }
  .story-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border-radius: 6px;
    font-size: 13px;
  }
  .story-row.done { opacity: 0.6; }
  .story-row.running { background: #1B222C; }
  .story-icon { width: 16px; text-align: center; font-size: 11px; }
  .story-icon.done { color: #22C55E; }
  .story-icon.running { color: #4A90D9; }
  .story-icon.pending { color: #6B7280; }
  .story-sid { font-family: monospace; color: #6B7280; font-size: 11px; min-width: 52px; }
  .story-stitle { flex: 1; }
  .story-smeta { font-size: 11px; color: #6B7280; }
  .controls {
    display: flex;
    gap: 8px;
    margin-bottom: 12px;
  }
  .controls button {
    background: #1B222C;
    border: 1px solid #2A3140;
    color: #EAEFF5;
    padding: 6px 14px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 12px;
    transition: background 0.2s;
  }
  .controls button:hover { background: #2A3140; }
  .controls button.danger { border-color: #7F1D1D; }
  .controls button.danger:hover { background: #7F1D1D; }
  .feedback-row {
    display: flex;
    gap: 8px;
  }
  .feedback-row input {
    flex: 1;
    background: #1B222C;
    border: 1px solid #2A3140;
    color: #EAEFF5;
    padding: 6px 10px;
    border-radius: 6px;
    font-size: 13px;
    outline: none;
  }
  .feedback-row input:focus { border-color: #4A90D9; }
  .feedback-row button {
    background: #4A90D9;
    border: none;
    color: #fff;
    padding: 6px 14px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 12px;
  }
  .feedback-row button:hover { background: #3A7BC0; }
  .status-bar {
    margin-top: 24px;
    padding: 10px 14px;
    background: #151A21;
    border-radius: 8px;
    font-size: 12px;
    color: #6B7280;
    font-family: monospace;
    text-align: center;
  }
</style>
</head>
<body>
<div class="header">
  <div>
    <h1>Ralph Hub</h1>
    <div class="subtitle" id="subtitle">Unified dashboard for all active loops</div>
  </div>
  <div><span class="live-dot"></span><span style="color:#6B7280;font-size:12px">LIVE</span></div>
</div>
<div id="content"></div>
<div class="status-bar" id="statusBar">Connecting...</div>

<script>
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function render(loops) {
  const container = document.getElementById('content');
  const subtitle = document.getElementById('subtitle');
  const statusBar = document.getElementById('statusBar');

  if (!loops || loops.length === 0) {
    container.innerHTML = '<div class="no-loops"><h2>No active loops</h2><p>Start a Ralph loop in any project to see it here.<br><code style="color:#5BA8C8">ralph run</code></p></div>';
    subtitle.textContent = 'No active loops';
    statusBar.textContent = 'Waiting for loops... (polling every 2s)';
    return;
  }

  subtitle.textContent = loops.length + ' active loop' + (loops.length !== 1 ? 's' : '');
  statusBar.textContent = 'Updated: ' + new Date().toLocaleTimeString() + ' | ' + loops.length + ' loop(s) active';

  container.innerHTML = '<div class="projects">' + loops.map(function(loop, idx) {
    var storiesHtml = loop.stories.map(function(s) {
      var state = s.running ? 'running' : (s.done ? 'done' : 'pending');
      var icon = s.running ? '&#9654;' : (s.done ? '&#10003;' : '&#9675;');
      return '<div class="story-row ' + state + '">' +
        '<span class="story-icon ' + state + '">' + icon + '</span>' +
        '<span class="story-sid">' + escapeHtml(s.id) + '</span>' +
        '<span class="story-stitle">' + escapeHtml(s.title) + '</span>' +
        '<span class="story-smeta">' + escapeHtml(s.model || 'sonnet') + '</span>' +
      '</div>';
    }).join('');

    var currentStoryHtml = '';
    if (loop.currentStory) {
      currentStoryHtml = '<div class="current-story">' +
        '<div class="cs-label">Currently Running</div>' +
        '<div class="cs-id">' + escapeHtml(loop.currentStory.id) + '</div>' +
        '<div class="cs-title">' + escapeHtml(loop.currentStory.title) + '</div>' +
        '<div class="cs-meta">' +
          '<span>' + escapeHtml(loop.currentStory.model || 'sonnet') + '</span>' +
          '<span>' + escapeHtml(loop.currentStory.effort || 'medium') + '</span>' +
        '</div>' +
      '</div>';
    }

    var timingHtml = '';
    if (loop.elapsed || loop.eta) {
      timingHtml = '<div class="timing-row">';
      if (loop.elapsed) timingHtml += '<div class="timing-badge">Elapsed: <span>' + escapeHtml(loop.elapsed) + '</span></div>';
      if (loop.eta) timingHtml += '<div class="timing-badge">ETA: <span>' + escapeHtml(loop.eta) + '</span></div>';
      timingHtml += '</div>';
    }

    return '<div class="project-card" data-idx="' + idx + '">' +
      '<div class="project-header">' +
        '<div>' +
          '<div class="project-name">' + escapeHtml(loop.project) + '</div>' +
          '<div class="project-branch">' + escapeHtml(loop.branch) + '</div>' +
          '<div class="project-path">' + escapeHtml(loop.projectPath) + '</div>' +
        '</div>' +
        '<div class="project-pid">PID ' + loop.pid + '</div>' +
      '</div>' +
      '<div class="progress-row">' +
        '<div class="progress-pct">' + loop.pct + '%</div>' +
        '<div class="progress-bar-track"><div class="progress-bar-fill" style="width:' + loop.pct + '%"></div></div>' +
        '<div class="progress-counts">' + loop.done + '/' + loop.total + '</div>' +
      '</div>' +
      timingHtml +
      currentStoryHtml +
      '<div class="stories-list">' + storiesHtml + '</div>' +
      '<div class="controls">' +
        '<button onclick="sendControl(' + idx + ',\'pause\')">Pause</button>' +
        '<button onclick="sendControl(' + idx + ',\'skip\')">Skip Story</button>' +
        '<button class="danger" onclick="sendControl(' + idx + ',\'stop\')">Stop</button>' +
      '</div>' +
      '<div class="feedback-row">' +
        '<input type="text" id="fb-' + idx + '" placeholder="Send feedback to this loop..." onkeydown="if(event.key===\'Enter\')sendFeedback(' + idx + ')">' +
        '<button onclick="sendFeedback(' + idx + ')">Send</button>' +
      '</div>' +
    '</div>';
  }).join('') + '</div>';
}

var _loops = [];

function sendControl(idx, action) {
  var loop = _loops[idx];
  if (!loop) return;
  fetch('/api/control', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pid: loop.pid, action: action, prdDir: loop.prdDir })
  }).then(function(r) { return r.json(); }).then(function(data) {
    if (data.error) alert('Error: ' + data.error);
  }).catch(function(err) { alert('Failed: ' + err.message); });
}

function sendFeedback(idx) {
  var loop = _loops[idx];
  if (!loop) return;
  var input = document.getElementById('fb-' + idx);
  var text = input.value.trim();
  if (!text) return;
  fetch('/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prdDir: loop.prdDir, feedback: text })
  }).then(function(r) { return r.json(); }).then(function(data) {
    if (data.ok) { input.value = ''; input.placeholder = 'Feedback sent!'; setTimeout(function() { input.placeholder = 'Send feedback to this loop...'; }, 2000); }
    else if (data.error) alert('Error: ' + data.error);
  }).catch(function(err) { alert('Failed: ' + err.message); });
}

// SSE for live updates
var es = new EventSource('/events');
es.onmessage = function(e) {
  try {
    _loops = JSON.parse(e.data);
    render(_loops);
  } catch(err) {}
};
es.onerror = function() {
  document.getElementById('statusBar').textContent = 'Disconnected. Retrying...';
};

// Initial fetch
fetch('/api/status').then(function(r) { return r.json(); }).then(function(data) {
  _loops = data;
  render(_loops);
});
</script>
</body>
</html>`;

export async function startHub(opts = {}) {
  const port = opts.port || 3742;
  const token = opts.token || process.env.RALPH_HUB_TOKEN || null;
  const registry = new GlobalRegistry();

  const clients = new Set();

  function broadcast() {
    const loops = getAllLoopsStatus(registry);
    const data = JSON.stringify(loops);
    for (const res of clients) {
      try { res.write(`data: ${data}\n\n`); } catch { clients.delete(res); }
    }
  }

  // Poll registry every 2 seconds for SSE
  const interval = setInterval(broadcast, 2000);

  const server = createServer(async (req, res) => {
    // CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      });
      res.end();
      return;
    }

    // Auth check
    if (token && !checkAuth(req, token)) {
      jsonResponse(res, 401, { error: 'Unauthorized' });
      return;
    }

    const url = req.url;

    // SSE stream
    if (url === '/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });
      const loops = getAllLoopsStatus(registry);
      res.write(`data: ${JSON.stringify(loops)}\n\n`);
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }

    // API: status
    if (url === '/api/status' && req.method === 'GET') {
      const loops = getAllLoopsStatus(registry);
      jsonResponse(res, 200, loops);
      return;
    }

    // API: logs
    const logsMatch = url.match(/^\/api\/logs\/([^/]+)\/([^/]+)$/);
    if (logsMatch && req.method === 'GET') {
      const projectName = decodeURIComponent(logsMatch[1]);
      const storyId = decodeURIComponent(logsMatch[2]);

      // Find matching loop by project name
      const entries = registry.list();
      const entry = entries.find((e) => e.project === projectName);
      if (!entry) {
        jsonResponse(res, 404, { error: `Project "${projectName}" not found in registry` });
        return;
      }
      const logPath = join(entry.prdDir, 'logs', `${storyId}.log`);
      if (!existsSync(logPath)) {
        jsonResponse(res, 404, { error: `Log not found: ${storyId}.log` });
        return;
      }
      try {
        const content = readFileSync(logPath, 'utf-8');
        res.writeHead(200, {
          'Content-Type': 'text/plain',
          'Access-Control-Allow-Origin': '*',
        });
        res.end(content);
      } catch (e) {
        jsonResponse(res, 500, { error: e.message });
      }
      return;
    }

    // API: feedback
    if (url === '/api/feedback' && req.method === 'POST') {
      try {
        const body = await readBody(req);
        if (!body.prdDir || !body.feedback) {
          jsonResponse(res, 400, { error: 'Missing prdDir or feedback' });
          return;
        }
        const feedbackFile = join(body.prdDir, '.feedback');
        let existing = '';
        if (existsSync(feedbackFile)) {
          existing = readFileSync(feedbackFile, 'utf-8');
        }
        writeFileSync(feedbackFile, existing + body.feedback + '\n');
        jsonResponse(res, 200, { ok: true });
      } catch (e) {
        jsonResponse(res, 400, { error: e.message });
      }
      return;
    }

    // API: control
    if (url === '/api/control' && req.method === 'POST') {
      try {
        const body = await readBody(req);
        if (!body.pid || !body.action) {
          jsonResponse(res, 400, { error: 'Missing pid or action' });
          return;
        }
        const pid = Number(body.pid);
        const action = body.action;

        switch (action) {
          case 'stop':
            try { process.kill(pid, 'SIGINT'); } catch { /* process may be gone */ }
            jsonResponse(res, 200, { ok: true, action: 'stop', pid });
            break;
          case 'pause':
            try { process.kill(pid, 'SIGTSTP'); } catch { /* process may be gone */ }
            jsonResponse(res, 200, { ok: true, action: 'pause', pid });
            break;
          case 'resume':
            try { process.kill(pid, 'SIGCONT'); } catch { /* process may be gone */ }
            jsonResponse(res, 200, { ok: true, action: 'resume', pid });
            break;
          case 'skip':
            // Skip = kill current agent child. Send SIGINT which the loop catches to skip.
            try { process.kill(pid, 'SIGUSR1'); } catch { /* process may be gone */ }
            jsonResponse(res, 200, { ok: true, action: 'skip', pid });
            break;
          default:
            jsonResponse(res, 400, { error: `Unknown action: ${action}` });
        }
      } catch (e) {
        jsonResponse(res, 400, { error: e.message });
      }
      return;
    }

    // Serve dashboard HTML
    if (url === '/' || url === '/index.html') {
      const loops = getAllLoopsStatus(registry);
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(HUB_HTML(loops));
      return;
    }

    // 404
    jsonResponse(res, 404, { error: 'Not found' });
  });

  server.listen(port, () => {
    success(`Hub running at ${c.cyan}http://localhost:${port}${c.reset}`);
    info('Monitoring all active Ralph loops (SSE updates every 2s)');
    if (token) {
      info(`Auth enabled — use Authorization: Bearer <token>`);
    }
  });

  process.on('SIGINT', () => {
    clearInterval(interval);
    server.close();
    process.exit(0);
  });
}
