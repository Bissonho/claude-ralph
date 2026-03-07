import * as vscode from 'vscode';
import { RalphConfig } from '../ralph/config';

export class RalphStatusBar implements vscode.Disposable {
  private statusBarItem: vscode.StatusBarItem;
  private config: RalphConfig;

  constructor(config: RalphConfig) {
    this.config = config;
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      50,
    );
    this.statusBarItem.command = 'ralph.showDashboard';
    this.statusBarItem.name = 'Ralph';
    this.refresh();
    this.statusBarItem.show();
  }

  updateConfig(config: RalphConfig): void {
    this.config = config;
    this.refresh();
  }

  refresh(): void {
    const data = this.config.load();
    if (!data) {
      this.statusBarItem.text = '$(circle-outline) Ralph';
      this.statusBarItem.tooltip = 'No Ralph project found';
      return;
    }

    const progress = this.config.getProgress(data);
    const status = this.config.readStatus();
    const isRunning = status?.status.includes('running') ?? false;

    if (isRunning) {
      this.statusBarItem.text = `$(sync~spin) Ralph: ${progress.done}/${progress.total} (${progress.pct}%)`;
      this.statusBarItem.tooltip = `Running: ${status?.storyId || '...'} | iter ${status?.iteration}/${status?.maxIterations}`;
      this.statusBarItem.backgroundColor = undefined;
    } else if (progress.pending === 0) {
      this.statusBarItem.text = `$(check) Ralph: ${progress.total}/${progress.total} (100%)`;
      this.statusBarItem.tooltip = 'All stories complete!';
      this.statusBarItem.backgroundColor = undefined;
    } else {
      this.statusBarItem.text = `$(circle-outline) Ralph: ${progress.done}/${progress.total} (${progress.pct}%)`;
      this.statusBarItem.tooltip = `${progress.pending} stories pending — Click to open dashboard`;
      this.statusBarItem.backgroundColor = undefined;
    }
  }

  dispose(): void {
    this.statusBarItem.dispose();
  }
}
