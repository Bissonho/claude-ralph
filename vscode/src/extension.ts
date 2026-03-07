import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { RalphConfig, findPrdDir } from './ralph/config';
import { RalphWatcher } from './ralph/watcher';
import { StoriesTreeProvider, StoryItem } from './views/stories-tree';
import { WorktreesTreeProvider, WorktreeItem } from './views/worktrees-tree';
import { ProgressViewProvider } from './views/progress-panel';
import { DashboardPanel } from './views/dashboard-panel';
import { OpenRouterPanel } from './views/openrouter-panel';
import { HubPanel } from './views/hub-panel';
import { RalphStatusBar } from './views/status-bar';
import { startLoop, stopLoop, pauseLoop, skipStory, setConfig as setLoopConfig } from './commands/loop';
import { addStory, markStoryDone, markStoryPending, removeStory, editStory, showStoryDetail } from './commands/stories';

let watcher: RalphWatcher | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    return;
  }

  const prdDir = findPrdDir(workspaceRoot);
  if (!prdDir) {
    // Register init command even without a project
    context.subscriptions.push(
      vscode.commands.registerCommand('ralph.init', () => {
        const terminal = vscode.window.createTerminal({ name: 'Ralph Init' });
        terminal.show();
        terminal.sendText('ralph init');
      }),
    );
    return;
  }

  const config = new RalphConfig(prdDir);
  setLoopConfig(config);

  // Views
  const storiesTree = new StoriesTreeProvider(config);
  const worktreesTree = new WorktreesTreeProvider(config);
  const progressView = new ProgressViewProvider(context.extensionUri, config);
  const statusBar = new RalphStatusBar(config);

  // Register views
  const storiesTreeView = vscode.window.createTreeView('ralph.stories', {
    treeDataProvider: storiesTree,
    dragAndDropController: storiesTree,
  });
  const worktreesTreeView = vscode.window.createTreeView('ralph.worktrees', {
    treeDataProvider: worktreesTree,
  });
  context.subscriptions.push(
    storiesTreeView,
    worktreesTreeView,
    vscode.window.registerWebviewViewProvider('ralph.progress', progressView),
    statusBar,
  );

  // File watcher — auto-refresh on changes
  watcher = new RalphWatcher(prdDir);
  context.subscriptions.push(watcher);

  watcher.onDidChange(() => {
    storiesTree.refresh();
    worktreesTree.refresh();
    progressView.refresh();
    statusBar.refresh();
    DashboardPanel.refresh();
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
  }, vscode.workspace.getConfiguration('ralph').get<number>('autoRefreshInterval', 3000));
  context.subscriptions.push({ dispose: () => clearInterval(pollInterval) });

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('ralph.startLoop', () => startLoop()),
    vscode.commands.registerCommand('ralph.stopLoop', () => stopLoop()),
    vscode.commands.registerCommand('ralph.pauseLoop', () => pauseLoop()),
    vscode.commands.registerCommand('ralph.skipStory', () => skipStory()),
    vscode.commands.registerCommand('ralph.openStoryLog', (storyId: string) => {
      const logFile = path.join(prdDir, 'logs', `${storyId}.log`);
      if (fs.existsSync(logFile)) {
        vscode.window.showTextDocument(vscode.Uri.file(logFile));
      } else {
        vscode.window.showWarningMessage(`No log file found for ${storyId}.`);
      }
    }),
    vscode.commands.registerCommand('ralph.showDashboard', () => {
      DashboardPanel.show(context.extensionUri, config);
    }),
    vscode.commands.registerCommand('ralph.refresh', () => {
      storiesTree.refresh();
      progressView.refresh();
      statusBar.refresh();
      DashboardPanel.refresh();
    }),
    vscode.commands.registerCommand('ralph.openPrd', () => {
      vscode.window.showTextDocument(vscode.Uri.file(config.prdFile));
    }),
    vscode.commands.registerCommand('ralph.openProgress', () => {
      vscode.window.showTextDocument(vscode.Uri.file(config.progressFile));
    }),
    vscode.commands.registerCommand('ralph.addStory', () => addStory(config)),
    vscode.commands.registerCommand('ralph.markStoryDone', (item: StoryItem | { story: { id: string } }) => {
      markStoryDone(config, item);
    }),
    vscode.commands.registerCommand('ralph.markStoryPending', (item: StoryItem | { story: { id: string } }) => {
      markStoryPending(config, item);
    }),
    vscode.commands.registerCommand('ralph.removeStory', (item: StoryItem) => removeStory(config, item)),
    vscode.commands.registerCommand('ralph.editStory', (item: StoryItem) => editStory(config, item)),
    vscode.commands.registerCommand('ralph.showStoryDetail', (story) => showStoryDetail(story)),
    vscode.commands.registerCommand('ralph.archivePrd', async () => {
      const state = config.getPrdState();
      if (state === 'empty') {
        vscode.window.showInformationMessage('No PRD to archive.');
        return;
      }
      const data = config.load();
      const label = data ? `"${data.project}"` : 'current PRD';
      const confirm = await vscode.window.showWarningMessage(
        `Archive ${label} and reset for a new PRD? Codebase patterns will be carried forward.`,
        { modal: true },
        'Archive',
      );
      if (confirm === 'Archive') {
        const result = config.archiveCurrent();
        if (result) {
          vscode.window.showInformationMessage(`Archived to ${result.archivedTo}`);
          vscode.commands.executeCommand('ralph.refresh');
        }
      }
    }),
    vscode.commands.registerCommand('ralph.init', () => {
      const terminal = vscode.window.createTerminal({ name: 'Ralph Init' });
      terminal.show();
      terminal.sendText('ralph init');
    }),
    vscode.commands.registerCommand('ralph.openRouterSettings', () => {
      OpenRouterPanel.show(context.extensionUri, config);
    }),
    vscode.commands.registerCommand('ralph.showHub', () => {
      HubPanel.show(context.extensionUri);
    }),
    vscode.commands.registerCommand('ralph.createWorktree', async () => {
      const name = await vscode.window.showInputBox({
        prompt: 'Worktree name',
        placeHolder: 'e.g. feature-auth',
        validateInput: (v) => v.trim() ? null : 'Name is required',
      });
      if (!name) { return; }
      const branch = await vscode.window.showInputBox({
        prompt: 'Branch name',
        placeHolder: `e.g. ralph/${name}`,
        value: `ralph/${name}`,
        validateInput: (v) => v.trim() ? null : 'Branch is required',
      });
      if (!branch) { return; }
      const terminal = vscode.window.createTerminal({ name: `Ralph: Create ${name}` });
      terminal.show();
      terminal.sendText(`ralph worktree create ${name} --branch ${branch}`);
    }),
    vscode.commands.registerCommand('ralph.removeWorktree', async (item: WorktreeItem) => {
      if (!item?.worktree) { return; }
      const confirm = await vscode.window.showWarningMessage(
        `Remove worktree "${item.worktree.name}"? This will delete the worktree directory.`,
        { modal: true },
        'Remove',
      );
      if (confirm === 'Remove') {
        const terminal = vscode.window.createTerminal({ name: `Ralph: Remove ${item.worktree.name}` });
        terminal.show();
        terminal.sendText(`ralph worktree remove ${item.worktree.name}`);
      }
    }),
    vscode.commands.registerCommand('ralph.startWorktreeLoop', (item: WorktreeItem) => {
      if (!item?.worktree) { return; }
      const terminal = vscode.window.createTerminal({ name: `Ralph: Run ${item.worktree.name}` });
      terminal.show();
      terminal.sendText(`ralph worktree run ${item.worktree.name}`);
    }),
    vscode.commands.registerCommand('ralph.stopWorktreeLoop', (item: WorktreeItem) => {
      if (!item?.worktree) { return; }
      vscode.window.showInformationMessage(
        `To stop the loop for "${item.worktree.name}", close its terminal or press Ctrl+C in the running terminal.`,
      );
    }),
    vscode.commands.registerCommand('ralph.mergeWorktree', async (item: WorktreeItem) => {
      if (!item?.worktree) { return; }
      const confirm = await vscode.window.showWarningMessage(
        `Merge worktree "${item.worktree.name}" (branch: ${item.worktree.branch}) into current branch?`,
        { modal: true },
        'Merge',
      );
      if (confirm === 'Merge') {
        const terminal = vscode.window.createTerminal({ name: `Ralph: Merge ${item.worktree.name}` });
        terminal.show();
        terminal.sendText(`ralph worktree merge ${item.worktree.name}`);
      }
    }),
    vscode.commands.registerCommand('ralph.openWorktreeFolder', (item: WorktreeItem) => {
      if (!item?.worktree) { return; }
      const uri = vscode.Uri.file(item.worktree.path);
      vscode.commands.executeCommand('vscode.openFolder', uri, { forceNewWindow: true });
    }),
  );

  // Watch for workspace folder changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      const newRoot = getWorkspaceRoot();
      if (!newRoot) { return; }
      const newPrdDir = findPrdDir(newRoot);
      if (newPrdDir && newPrdDir !== prdDir) {
        const newConfig = new RalphConfig(newPrdDir);
        storiesTree.updateConfig(newConfig);
        worktreesTree.updateConfig(newConfig);
        progressView.updateConfig(newConfig);
        statusBar.updateConfig(newConfig);
      }
    }),
  );
}

export function deactivate(): void {
  watcher?.dispose();
}

function getWorkspaceRoot(): string | undefined {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return undefined;
  }
  return folders[0].uri.fsPath;
}
