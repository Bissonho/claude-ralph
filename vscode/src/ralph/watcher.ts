import * as vscode from 'vscode';
import * as path from 'path';

export class RalphWatcher implements vscode.Disposable {
  private watchers: vscode.FileSystemWatcher[] = [];
  private _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  constructor(prdDir: string) {
    const prdPattern = new vscode.RelativePattern(prdDir, 'prd.json');
    const statusPattern = new vscode.RelativePattern(prdDir, 'status.txt');
    const progressPattern = new vscode.RelativePattern(prdDir, 'progress.txt');

    for (const pattern of [prdPattern, statusPattern, progressPattern]) {
      const watcher = vscode.workspace.createFileSystemWatcher(pattern);
      watcher.onDidChange(() => this._onDidChange.fire());
      watcher.onDidCreate(() => this._onDidChange.fire());
      watcher.onDidDelete(() => this._onDidChange.fire());
      this.watchers.push(watcher);
    }
  }

  dispose(): void {
    this.watchers.forEach(w => w.dispose());
    this._onDidChange.dispose();
  }
}
