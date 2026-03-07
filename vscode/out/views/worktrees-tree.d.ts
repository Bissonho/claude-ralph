import * as vscode from 'vscode';
import { RalphConfig } from '../ralph/config';
import { WorktreeInfo } from '../ralph/types';
export declare class WorktreeItem extends vscode.TreeItem {
    readonly worktree: WorktreeInfo;
    constructor(worktree: WorktreeInfo);
    private buildTooltip;
}
export declare class WorktreesTreeProvider implements vscode.TreeDataProvider<WorktreeItem> {
    private config;
    private _onDidChangeTreeData;
    readonly onDidChangeTreeData: vscode.Event<WorktreeItem | undefined>;
    constructor(config: RalphConfig);
    refresh(): void;
    updateConfig(config: RalphConfig): void;
    getTreeItem(element: WorktreeItem): vscode.TreeItem;
    getChildren(): WorktreeItem[];
}
//# sourceMappingURL=worktrees-tree.d.ts.map