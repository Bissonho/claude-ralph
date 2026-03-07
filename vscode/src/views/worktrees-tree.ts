import * as vscode from 'vscode';
import { RalphConfig } from '../ralph/config';
import { WorktreeInfo } from '../ralph/types';

export class WorktreeItem extends vscode.TreeItem {
  constructor(public readonly worktree: WorktreeInfo) {
    super(worktree.name, vscode.TreeItemCollapsibleState.None);

    this.description = worktree.branch;

    const progress = worktree.progress;
    const pctText = progress ? ` ${progress.done}/${progress.total} (${progress.pct}%)` : '';

    switch (worktree.status) {
      case 'running':
        this.iconPath = new vscode.ThemeIcon('sync~spin', new vscode.ThemeColor('charts.blue'));
        this.contextValue = 'worktree-running';
        this.description = `${worktree.branch} - running${pctText}`;
        break;
      case 'complete':
        this.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'));
        this.contextValue = 'worktree-complete';
        this.description = `${worktree.branch} - complete${pctText}`;
        break;
      default:
        this.iconPath = new vscode.ThemeIcon('circle-outline', new vscode.ThemeColor('foreground'));
        this.contextValue = 'worktree-idle';
        this.description = `${worktree.branch} - idle${pctText}`;
        break;
    }

    this.tooltip = this.buildTooltip();
  }

  private buildTooltip(): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.appendMarkdown(`### ${this.worktree.name}\n\n`);
    md.appendMarkdown(`**Branch:** ${this.worktree.branch}  \n`);
    md.appendMarkdown(`**Status:** ${this.worktree.status}  \n`);
    md.appendMarkdown(`**Path:** ${this.worktree.path}  \n`);
    if (this.worktree.progress) {
      const p = this.worktree.progress;
      md.appendMarkdown(`**Progress:** ${p.done}/${p.total} (${p.pct}%)  \n`);
    }
    md.appendMarkdown(`**Created:** ${this.worktree.createdAt}  \n`);
    return md;
  }
}

export class WorktreesTreeProvider implements vscode.TreeDataProvider<WorktreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<WorktreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private config: RalphConfig) {}

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  updateConfig(config: RalphConfig): void {
    this.config = config;
    this.refresh();
  }

  getTreeItem(element: WorktreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): WorktreeItem[] {
    const worktrees = this.config.loadWorktrees();
    return worktrees.map(wt => new WorktreeItem(wt));
  }
}
