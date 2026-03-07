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
exports.OpenRouterPanel = void 0;
const vscode = __importStar(require("vscode"));
class OpenRouterPanel {
    static instance;
    panel;
    config;
    constructor(panel, config) {
        this.panel = panel;
        this.config = config;
        this.panel.onDidDispose(() => {
            this.dispose();
        });
        this.panel.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'loadConfig':
                    this.sendConfig();
                    break;
                case 'saveApiKey':
                    this.saveApiKey(message.apiKey);
                    break;
                case 'validateApiKey':
                    await this.validateApiKey(message.apiKey);
                    break;
                case 'fetchModels':
                    await this.fetchModels();
                    break;
                case 'toggleModel':
                    this.toggleModel(message.modelId, message.enabled);
                    break;
                case 'setDefaultModel':
                    this.setModelSelection('defaultModel', message.modelId);
                    break;
                case 'setResearchModel':
                    this.setModelSelection('researchModel', message.modelId);
                    break;
            }
        });
    }
    static show(extensionUri, config) {
        if (OpenRouterPanel.instance) {
            OpenRouterPanel.instance.config = config;
            OpenRouterPanel.instance.panel.reveal(vscode.ViewColumn.One);
            OpenRouterPanel.instance.sendConfig();
            return;
        }
        const panel = vscode.window.createWebviewPanel('ralph.openRouterSettings', 'Ralph: OpenRouter Settings', vscode.ViewColumn.One, {
            enableScripts: true,
            retainContextWhenHidden: true,
        });
        OpenRouterPanel.instance = new OpenRouterPanel(panel, config);
        OpenRouterPanel.instance.panel.webview.html = OpenRouterPanel.instance.getHtml();
        OpenRouterPanel.instance.sendConfig();
    }
    dispose() {
        OpenRouterPanel.instance = undefined;
    }
    sendConfig() {
        const globalConfig = this.config.loadGlobalConfig();
        const orConfig = globalConfig.openrouter || {};
        this.panel.webview.postMessage({
            type: 'config',
            apiKey: orConfig.apiKey || '',
            defaultModel: orConfig.defaultModel || '',
            researchModel: orConfig.researchModel || '',
            models: orConfig.models || [],
        });
    }
    saveApiKey(apiKey) {
        const globalConfig = this.config.loadGlobalConfig();
        if (!globalConfig.openrouter) {
            globalConfig.openrouter = {};
        }
        globalConfig.openrouter.apiKey = apiKey;
        this.config.saveGlobalConfig(globalConfig);
        vscode.window.showInformationMessage('OpenRouter API key saved.');
        this.sendConfig();
    }
    async validateApiKey(apiKey) {
        if (!apiKey) {
            this.panel.webview.postMessage({ type: 'validation', valid: false, error: 'API key is empty' });
            return;
        }
        try {
            const response = await fetch('https://openrouter.ai/api/v1/models', {
                headers: { 'Authorization': `Bearer ${apiKey}` },
            });
            const valid = response.ok;
            this.panel.webview.postMessage({
                type: 'validation',
                valid,
                error: valid ? '' : `HTTP ${response.status}`,
            });
        }
        catch (err) {
            this.panel.webview.postMessage({
                type: 'validation',
                valid: false,
                error: err.message || 'Network error',
            });
        }
    }
    async fetchModels() {
        const globalConfig = this.config.loadGlobalConfig();
        const apiKey = globalConfig.openrouter?.apiKey;
        if (!apiKey) {
            this.panel.webview.postMessage({ type: 'fetchError', error: 'No API key configured. Save your API key first.' });
            return;
        }
        try {
            const response = await fetch('https://openrouter.ai/api/v1/models', {
                headers: { 'Authorization': `Bearer ${apiKey}` },
            });
            if (!response.ok) {
                this.panel.webview.postMessage({ type: 'fetchError', error: `HTTP ${response.status}` });
                return;
            }
            const body = await response.json();
            const models = (body.data || [])
                .map(m => ({
                id: m.id,
                name: m.name,
                contextLength: m.context_length,
                promptPrice: m.pricing?.prompt || '0',
                completionPrice: m.pricing?.completion || '0',
            }))
                .sort((a, b) => a.id.localeCompare(b.id));
            this.panel.webview.postMessage({ type: 'modelsList', models });
        }
        catch (err) {
            this.panel.webview.postMessage({ type: 'fetchError', error: err.message || 'Network error' });
        }
    }
    toggleModel(modelId, enabled) {
        const globalConfig = this.config.loadGlobalConfig();
        if (!globalConfig.openrouter) {
            globalConfig.openrouter = {};
        }
        if (!globalConfig.openrouter.models) {
            globalConfig.openrouter.models = [];
        }
        const existing = globalConfig.openrouter.models.find(m => m.id === modelId);
        if (existing) {
            existing.enabled = enabled;
        }
        else {
            globalConfig.openrouter.models.push({ id: modelId, enabled });
        }
        this.config.saveGlobalConfig(globalConfig);
        this.sendConfig();
    }
    setModelSelection(field, modelId) {
        const globalConfig = this.config.loadGlobalConfig();
        if (!globalConfig.openrouter) {
            globalConfig.openrouter = {};
        }
        globalConfig.openrouter[field] = modelId;
        this.config.saveGlobalConfig(globalConfig);
        this.sendConfig();
    }
    getHtml() {
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
    --red: var(--vscode-charts-red);
    --input-bg: var(--vscode-input-background);
    --input-fg: var(--vscode-input-foreground);
    --input-border: var(--vscode-input-border);
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: var(--vscode-font-family);
    background: var(--bg);
    color: var(--fg);
    padding: 24px;
    max-width: 700px;
    margin: 0 auto;
  }
  h1 {
    font-size: 18px;
    font-weight: 600;
    margin-bottom: 4px;
  }
  .subtitle {
    font-size: 12px;
    color: var(--muted);
    margin-bottom: 20px;
  }
  .section {
    background: var(--card);
    border-radius: 8px;
    padding: 20px;
    margin-bottom: 16px;
    border: 1px solid var(--border);
  }
  .section-title {
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--muted);
  }
  .field {
    margin-bottom: 12px;
  }
  .field label {
    display: block;
    font-size: 12px;
    color: var(--muted);
    margin-bottom: 4px;
  }
  .input-row {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  input[type="text"], input[type="password"], select {
    background: var(--input-bg);
    color: var(--input-fg);
    border: 1px solid var(--input-border);
    border-radius: 4px;
    padding: 6px 10px;
    font-size: 13px;
    font-family: var(--vscode-editor-font-family);
    flex: 1;
    outline: none;
  }
  input:focus, select:focus {
    border-color: var(--accent);
  }
  select {
    font-family: var(--vscode-font-family);
  }
  .btn {
    padding: 6px 14px;
    font-size: 12px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-family: var(--vscode-font-family);
    font-weight: 500;
    white-space: nowrap;
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
    padding: 6px 8px;
    border: 1px solid var(--border);
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
  }
  .btn-icon:hover { color: var(--fg); }
  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .status-msg {
    font-size: 12px;
    margin-top: 8px;
  }
  .status-msg.success { color: var(--green); }
  .status-msg.error { color: var(--red); }
  .models-list {
    max-height: 400px;
    overflow-y: auto;
    border: 1px solid var(--border);
    border-radius: 4px;
    margin-top: 8px;
  }
  .model-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border-bottom: 1px solid var(--border);
    font-size: 12px;
  }
  .model-item:last-child { border-bottom: none; }
  .model-item:hover { background: var(--vscode-list-hoverBackground); }
  .model-item input[type="checkbox"] {
    flex-shrink: 0;
  }
  .model-id {
    flex: 1;
    font-family: var(--vscode-editor-font-family);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .model-price {
    color: var(--muted);
    font-size: 11px;
    flex-shrink: 0;
  }
  .empty-msg {
    padding: 20px;
    text-align: center;
    color: var(--muted);
    font-size: 12px;
  }
  .spinner {
    display: inline-block;
    width: 12px;
    height: 12px;
    border: 2px solid var(--muted);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin-right: 6px;
    vertical-align: middle;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
</head>
<body>

<h1>OpenRouter Settings</h1>
<p class="subtitle">Configure OpenRouter API access and model selection for Ralph.</p>

<!-- API Key Section -->
<div class="section">
  <div class="section-title">API Key</div>
  <div class="field">
    <label>OpenRouter API Key</label>
    <div class="input-row">
      <input id="apiKeyInput" type="password" placeholder="sk-or-..." />
      <button class="btn-icon" id="toggleVisibility" title="Show/Hide">&#128065;</button>
    </div>
  </div>
  <div class="input-row">
    <button class="btn btn-secondary" id="validateBtn" onclick="validateKey()">Validate</button>
    <button class="btn btn-primary" id="saveKeyBtn" onclick="saveKey()">Save</button>
  </div>
  <div id="keyStatus" class="status-msg"></div>
</div>

<!-- Models Section -->
<div class="section">
  <div class="section-title">Models</div>
  <div class="input-row" style="margin-bottom: 12px;">
    <button class="btn btn-primary" id="fetchBtn" onclick="fetchModels()">Fetch Models</button>
    <span id="fetchStatus" class="status-msg"></span>
  </div>
  <div id="modelsContainer" class="models-list">
    <div class="empty-msg">Click "Fetch Models" to load available models from OpenRouter.</div>
  </div>
</div>

<!-- Model Selection Section -->
<div class="section">
  <div class="section-title">Model Selection</div>
  <div class="field">
    <label>Default Model</label>
    <select id="defaultModelSelect" onchange="setDefaultModel(this.value)">
      <option value="">-- Select --</option>
    </select>
  </div>
  <div class="field">
    <label>Research Model</label>
    <select id="researchModelSelect" onchange="setResearchModel(this.value)">
      <option value="">-- Select --</option>
    </select>
  </div>
</div>

<script>
  const vscode = acquireVsCodeApi();
  let allFetchedModels = [];
  let enabledModelIds = new Set();
  let currentConfig = {};

  // Toggle password visibility
  document.getElementById('toggleVisibility').addEventListener('click', () => {
    const input = document.getElementById('apiKeyInput');
    input.type = input.type === 'password' ? 'text' : 'password';
  });

  function validateKey() {
    const key = document.getElementById('apiKeyInput').value;
    document.getElementById('keyStatus').innerHTML = '<span class="spinner"></span>Validating...';
    document.getElementById('validateBtn').disabled = true;
    vscode.postMessage({ command: 'validateApiKey', apiKey: key });
  }

  function saveKey() {
    const key = document.getElementById('apiKeyInput').value;
    vscode.postMessage({ command: 'saveApiKey', apiKey: key });
  }

  function fetchModels() {
    document.getElementById('fetchStatus').innerHTML = '<span class="spinner"></span>Fetching...';
    document.getElementById('fetchBtn').disabled = true;
    vscode.postMessage({ command: 'fetchModels' });
  }

  function toggleModel(modelId, checked) {
    vscode.postMessage({ command: 'toggleModel', modelId, enabled: checked });
  }

  function setDefaultModel(modelId) {
    vscode.postMessage({ command: 'setDefaultModel', modelId });
  }

  function setResearchModel(modelId) {
    vscode.postMessage({ command: 'setResearchModel', modelId });
  }

  function renderModels() {
    const container = document.getElementById('modelsContainer');
    if (allFetchedModels.length === 0) {
      container.innerHTML = '<div class="empty-msg">Click "Fetch Models" to load available models from OpenRouter.</div>';
      return;
    }
    container.innerHTML = allFetchedModels.map(m => {
      const checked = enabledModelIds.has(m.id) ? 'checked' : '';
      const price = parseFloat(m.promptPrice) > 0
        ? '$' + (parseFloat(m.promptPrice) * 1000000).toFixed(2) + '/M'
        : 'free';
      return '<div class="model-item">' +
        '<input type="checkbox" ' + checked + ' onchange="toggleModel(\\''+escapeHtml(m.id)+'\\', this.checked)" />' +
        '<span class="model-id" title="'+escapeHtml(m.id)+'">' + escapeHtml(m.id) + '</span>' +
        '<span class="model-price">' + price + '</span>' +
        '</div>';
    }).join('');
  }

  function updateDropdowns() {
    const enabled = allFetchedModels.filter(m => enabledModelIds.has(m.id));
    // If no fetched models yet, use enabled IDs from config
    const options = enabled.length > 0
      ? enabled
      : Array.from(enabledModelIds).map(id => ({ id, name: id }));

    ['defaultModelSelect', 'researchModelSelect'].forEach(selId => {
      const sel = document.getElementById(selId);
      const currentVal = selId === 'defaultModelSelect'
        ? currentConfig.defaultModel || ''
        : currentConfig.researchModel || '';
      sel.innerHTML = '<option value="">-- Select --</option>' +
        options.map(m => {
          const selected = m.id === currentVal ? ' selected' : '';
          return '<option value="'+escapeHtml(m.id)+'"'+selected+'>'+escapeHtml(m.id)+'</option>';
        }).join('');
    });
  }

  function escapeHtml(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  window.addEventListener('message', event => {
    const msg = event.data;
    switch (msg.type) {
      case 'config':
        currentConfig = msg;
        document.getElementById('apiKeyInput').value = msg.apiKey || '';
        enabledModelIds = new Set((msg.models || []).filter(m => m.enabled).map(m => m.id));
        renderModels();
        updateDropdowns();
        break;
      case 'validation':
        document.getElementById('validateBtn').disabled = false;
        if (msg.valid) {
          document.getElementById('keyStatus').innerHTML = '<span class="success">Valid API key</span>';
        } else {
          document.getElementById('keyStatus').innerHTML = '<span class="error">Invalid: ' + escapeHtml(msg.error) + '</span>';
        }
        break;
      case 'modelsList':
        allFetchedModels = msg.models;
        document.getElementById('fetchStatus').innerHTML = '<span class="success">' + msg.models.length + ' models loaded</span>';
        document.getElementById('fetchBtn').disabled = false;
        renderModels();
        updateDropdowns();
        break;
      case 'fetchError':
        document.getElementById('fetchStatus').innerHTML = '<span class="error">' + escapeHtml(msg.error) + '</span>';
        document.getElementById('fetchBtn').disabled = false;
        break;
    }
  });

  // Request config on load
  vscode.postMessage({ command: 'loadConfig' });
</script>
</body>
</html>`;
    }
}
exports.OpenRouterPanel = OpenRouterPanel;
//# sourceMappingURL=openrouter-panel.js.map