import * as vscode from 'vscode';
import { RalphConfig } from '../ralph/config';
import { UserStory } from '../ralph/types';
type TreeElement = StoryGroupItem | StoryItem;
declare class StoryGroupItem extends vscode.TreeItem {
    readonly groupLabel: string;
    readonly stories: StoryItem[];
    readonly collapsibleState: vscode.TreeItemCollapsibleState;
    constructor(groupLabel: string, stories: StoryItem[], collapsibleState: vscode.TreeItemCollapsibleState);
}
export declare class StoryItem extends vscode.TreeItem {
    readonly story: UserStory;
    readonly isRunning: boolean;
    constructor(story: UserStory, isRunning: boolean);
    private buildTooltip;
}
export declare class StoriesTreeProvider implements vscode.TreeDataProvider<TreeElement>, vscode.TreeDragAndDropController<TreeElement> {
    private config;
    private _onDidChangeTreeData;
    readonly onDidChangeTreeData: vscode.Event<TreeElement | undefined>;
    readonly dropMimeTypes: string[];
    readonly dragMimeTypes: string[];
    constructor(config: RalphConfig);
    refresh(): void;
    updateConfig(config: RalphConfig): void;
    getTreeItem(element: TreeElement): vscode.TreeItem;
    getChildren(element?: TreeElement): TreeElement[];
    handleDrag(source: readonly TreeElement[], dataTransfer: vscode.DataTransfer): void;
    handleDrop(target: TreeElement | undefined, dataTransfer: vscode.DataTransfer): void;
    private extractRunningId;
}
export {};
//# sourceMappingURL=stories-tree.d.ts.map