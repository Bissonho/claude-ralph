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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const config_1 = require("./ralph/config");
const watcher_1 = require("./ralph/watcher");
const stories_tree_1 = require("./views/stories-tree");
const worktrees_tree_1 = require("./views/worktrees-tree");
const progress_panel_1 = require("./views/progress-panel");
const dashboard_panel_1 = require("./views/dashboard-panel");
const openrouter_panel_1 = require("./views/openrouter-panel");
const hub_panel_1 = require("./views/hub-panel");
const status_bar_1 = require("./views/status-bar");
const loop_1 = require("./commands/loop");
const stories_1 = require("./commands/stories");
let watcher;
function activate(context) {
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
        return;
    }
    const prdDir = (0, config_1.findPrdDir)(workspaceRoot);
    if (!prdDir) {
        // Register init command even without a project
        context.subscriptions.push(vscode.commands.registerCommand('ralph.init', () => {
            const terminal = vscode.window.createTerminal({ name: 'Ralph Init' });
            terminal.show();
            terminal.sendText('ralph init');
        }));
        return;
    }
    const config = new config_1.RalphConfig(prdDir);
    (0, loop_1.setConfig)(config);
    // Views
    const storiesTree = new stories_tree_1.StoriesTreeProvider(config);
    const worktreesTree = new worktrees_tree_1.WorktreesTreeProvider(config);
    const progressView = new progress_panel_1.ProgressViewProvider(context.extensionUri, config);
    const statusBar = new status_bar_1.RalphStatusBar(config);
    // Register views
    const storiesTreeView = vscode.window.createTreeView('ralph.stories', {
        treeDataProvider: storiesTree,
        dragAndDropController: storiesTree,
    });
    const worktreesTreeView = vscode.window.createTreeView('ralph.worktrees', {
        treeDataProvider: worktreesTree,
    });
    context.subscriptions.push(storiesTreeView, worktreesTreeView, vscode.window.registerWebviewViewProvider('ralph.progress', progressView), statusBar);
    // File watcher — auto-refresh on changes
    watcher = new watcher_1.RalphWatcher(prdDir);
    context.subscriptions.push(watcher);
    watcher.onDidChange(() => {
        storiesTree.refresh();
        worktreesTree.refresh();
        progressView.refresh();
        statusBar.refresh();
        dashboard_panel_1.DashboardPanel.refresh();
    });
    // Watch activity.jsonl for live updates to the progress panel
    const activityPattern = new vscode.RelativePattern(prdDir, 'activity.jsonl');
    const activityWatcher = vscode.workspace.createFileSystemWatcher(activityPattern);
    activityWatcher.onDidChange(() => progressView.refresh());
    activityWatcher.onDidCreate(() => progressView.refresh());
    context.subscriptions.push(activityWatcher);
    // Watch worktrees.json for changes
    const worktreesPattern = new vscode.RelativePattern(prdDir, 'worktrees.json');
    const worktreesWatcher = vscode.workspace.createFileSystemWatcher(worktreesPattern);
    worktreesWatcher.onDidChange(() => worktreesTree.refresh());
    worktreesWatcher.onDidCreate(() => worktreesTree.refresh());
    worktreesWatcher.onDidDelete(() => worktreesTree.refresh());
    context.subscriptions.push(worktreesWatcher);
    // Also poll for status.txt changes (file watcher may miss rapid updates)
    const pollInterval = setInterval(() => {
        statusBar.refresh();
        progressView.refresh();
        worktreesTree.refresh();
    }, vscode.workspace.getConfiguration('ralph').get('autoRefreshInterval', 3000));
    context.subscriptions.push({ dispose: () => clearInterval(pollInterval) });
    // Commands
    context.subscriptions.push(vscode.commands.registerCommand('ralph.startLoop', () => (0, loop_1.startLoop)()), vscode.commands.registerCommand('ralph.stopLoop', () => (0, loop_1.stopLoop)()), vscode.commands.registerCommand('ralph.pauseLoop', () => (0, loop_1.pauseLoop)()), vscode.commands.registerCommand('ralph.skipStory', () => (0, loop_1.skipStory)()), vscode.commands.registerCommand('ralph.openStoryLog', (storyId) => {
        const logFile = path.join(prdDir, 'logs', `${storyId}.log`);
        if (fs.existsSync(logFile)) {
            vscode.window.showTextDocument(vscode.Uri.file(logFile));
        }
        else {
            vscode.window.showWarningMessage(`No log file found for ${storyId}.`);
        }
    }), vscode.commands.registerCommand('ralph.showDashboard', () => {
        dashboard_panel_1.DashboardPanel.show(context.extensionUri, config);
    }), vscode.commands.registerCommand('ralph.refresh', () => {
        storiesTree.refresh();
        progressView.refresh();
        statusBar.refresh();
        dashboard_panel_1.DashboardPanel.refresh();
    }), vscode.commands.registerCommand('ralph.openPrd', () => {
        vscode.window.showTextDocument(vscode.Uri.file(config.prdFile));
    }), vscode.commands.registerCommand('ralph.openProgress', () => {
        vscode.window.showTextDocument(vscode.Uri.file(config.progressFile));
    }), vscode.commands.registerCommand('ralph.addStory', () => (0, stories_1.addStory)(config)), vscode.commands.registerCommand('ralph.markStoryDone', (item) => {
        (0, stories_1.markStoryDone)(config, item);
    }), vscode.commands.registerCommand('ralph.markStoryPending', (item) => {
        (0, stories_1.markStoryPending)(config, item);
    }), vscode.commands.registerCommand('ralph.removeStory', (item) => (0, stories_1.removeStory)(config, item)), vscode.commands.registerCommand('ralph.editStory', (item) => (0, stories_1.editStory)(config, item)), vscode.commands.registerCommand('ralph.showStoryDetail', (story) => (0, stories_1.showStoryDetail)(story)), vscode.commands.registerCommand('ralph.archivePrd', async () => {
        const state = config.getPrdState();
        if (state === 'empty') {
            vscode.window.showInformationMessage('No PRD to archive.');
            return;
        }
        const data = config.load();
        const label = data ? `"${data.project}"` : 'current PRD';
        const confirm = await vscode.window.showWarningMessage(`Archive ${label} and reset for a new PRD? Codebase patterns will be carried forward.`, { modal: true }, 'Archive');
        if (confirm === 'Archive') {
            const result = config.archiveCurrent();
            if (result) {
                vscode.window.showInformationMessage(`Archived to ${result.archivedTo}`);
                vscode.commands.executeCommand('ralph.refresh');
            }
        }
    }), vscode.commands.registerCommand('ralph.init', () => {
        const terminal = vscode.window.createTerminal({ name: 'Ralph Init' });
        terminal.show();
        terminal.sendText('ralph init');
    }), vscode.commands.registerCommand('ralph.openRouterSettings', () => {
        openrouter_panel_1.OpenRouterPanel.show(context.extensionUri, config);
    }), vscode.commands.registerCommand('ralph.showHub', () => {
        hub_panel_1.HubPanel.show(context.extensionUri);
    }), vscode.commands.registerCommand('ralph.createWorktree', async () => {
        const name = await vscode.window.showInputBox({
            prompt: 'Worktree name',
            placeHolder: 'e.g. feature-auth',
            validateInput: (v) => v.trim() ? null : 'Name is required',
        });
        if (!name) {
            return;
        }
        const branch = await vscode.window.showInputBox({
            prompt: 'Branch name',
            placeHolder: `e.g. ralph/${name}`,
            value: `ralph/${name}`,
            validateInput: (v) => v.trim() ? null : 'Branch is required',
        });
        if (!branch) {
            return;
        }
        const terminal = vscode.window.createTerminal({ name: `Ralph: Create ${name}` });
        terminal.show();
        terminal.sendText(`ralph worktree create ${name} --branch ${branch}`);
    }), vscode.commands.registerCommand('ralph.removeWorktree', async (item) => {
        if (!item?.worktree) {
            return;
        }
        const confirm = await vscode.window.showWarningMessage(`Remove worktree "${item.worktree.name}"? This will delete the worktree directory.`, { modal: true }, 'Remove');
        if (confirm === 'Remove') {
            const terminal = vscode.window.createTerminal({ name: `Ralph: Remove ${item.worktree.name}` });
            terminal.show();
            terminal.sendText(`ralph worktree remove ${item.worktree.name}`);
        }
    }), vscode.commands.registerCommand('ralph.startWorktreeLoop', (item) => {
        if (!item?.worktree) {
            return;
        }
        const terminal = vscode.window.createTerminal({ name: `Ralph: Run ${item.worktree.name}` });
        terminal.show();
        terminal.sendText(`ralph worktree run ${item.worktree.name}`);
    }), vscode.commands.registerCommand('ralph.stopWorktreeLoop', (item) => {
        if (!item?.worktree) {
            return;
        }
        vscode.window.showInformationMessage(`To stop the loop for "${item.worktree.name}", close its terminal or press Ctrl+C in the running terminal.`);
    }), vscode.commands.registerCommand('ralph.mergeWorktree', async (item) => {
        if (!item?.worktree) {
            return;
        }
        const confirm = await vscode.window.showWarningMessage(`Merge worktree "${item.worktree.name}" (branch: ${item.worktree.branch}) into current branch?`, { modal: true }, 'Merge');
        if (confirm === 'Merge') {
            const terminal = vscode.window.createTerminal({ name: `Ralph: Merge ${item.worktree.name}` });
            terminal.show();
            terminal.sendText(`ralph worktree merge ${item.worktree.name}`);
        }
    }), vscode.commands.registerCommand('ralph.openWorktreeFolder', (item) => {
        if (!item?.worktree) {
            return;
        }
        const uri = vscode.Uri.file(item.worktree.path);
        vscode.commands.executeCommand('vscode.openFolder', uri, { forceNewWindow: true });
    }));
    // Watch for workspace folder changes
    context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(() => {
        const newRoot = getWorkspaceRoot();
        if (!newRoot) {
            return;
        }
        const newPrdDir = (0, config_1.findPrdDir)(newRoot);
        if (newPrdDir && newPrdDir !== prdDir) {
            const newConfig = new config_1.RalphConfig(newPrdDir);
            storiesTree.updateConfig(newConfig);
            worktreesTree.updateConfig(newConfig);
            progressView.updateConfig(newConfig);
            statusBar.updateConfig(newConfig);
        }
    }));
}
function deactivate() {
    watcher?.dispose();
}
function getWorkspaceRoot() {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
        return undefined;
    }
    return folders[0].uri.fsPath;
}
//# sourceMappingURL=extension.js.map