import * as vscode from 'vscode';
import { RalphConfig, findPrdDir } from './ralph/config';
import { RalphWatcher } from './ralph/watcher';
import { StoriesTreeProvider, StoryItem } from './views/stories-tree';
import { ProgressViewProvider } from './views/progress-panel';
import { DashboardPanel } from './views/dashboard-panel';
import { RalphStatusBar } from './views/status-bar';
import { startLoop, stopLoop, setConfig as setLoopConfig } from './commands/loop';
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
  const progressView = new ProgressViewProvider(context.extensionUri, config);
  const statusBar = new RalphStatusBar(config);

  // Register views
  const storiesTreeView = vscode.window.createTreeView('ralph.stories', {
    treeDataProvider: storiesTree,
    dragAndDropController: storiesTree,
  });
  context.subscriptions.push(
    storiesTreeView,
    vscode.window.registerWebviewViewProvider('ralph.progress', progressView),
    statusBar,
  );

  // File watcher — auto-refresh on changes
  watcher = new RalphWatcher(prdDir);
  context.subscriptions.push(watcher);

  watcher.onDidChange(() => {
    storiesTree.refresh();
    progressView.refresh();
    statusBar.refresh();
    DashboardPanel.refresh();
  });

  // Also poll for status.txt changes (file watcher may miss rapid updates)
  const pollInterval = setInterval(() => {
    statusBar.refresh();
    progressView.refresh();
  }, vscode.workspace.getConfiguration('ralph').get<number>('autoRefreshInterval', 3000));
  context.subscriptions.push({ dispose: () => clearInterval(pollInterval) });

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('ralph.startLoop', () => startLoop()),
    vscode.commands.registerCommand('ralph.stopLoop', () => stopLoop()),
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
