import * as vscode from 'vscode';
import { RalphConfig } from '../ralph/config';
import { UserStory, StatusInfo } from '../ralph/types';

type TreeElement = StoryGroupItem | StoryItem;

const STORY_MIME = 'application/vnd.ralph.story';

class StoryGroupItem extends vscode.TreeItem {
  constructor(
    public readonly groupLabel: string,
    public readonly stories: StoryItem[],
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
  ) {
    super(groupLabel, collapsibleState);
  }
}

export class StoryItem extends vscode.TreeItem {
  constructor(
    public readonly story: UserStory,
    public readonly isRunning: boolean,
  ) {
    super(story.title, vscode.TreeItemCollapsibleState.None);

    this.id = story.id;
    this.description = `#${story.priority}  ${story.id}  ${story.model || 'sonnet'}  ${story.effort || 'medium'}`;

    if (isRunning) {
      this.iconPath = new vscode.ThemeIcon('sync~spin', new vscode.ThemeColor('charts.blue'));
      this.contextValue = 'story-running';
    } else if (story.passes) {
      this.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'));
      this.contextValue = 'story-done';
    } else {
      this.iconPath = new vscode.ThemeIcon('circle-outline', new vscode.ThemeColor('foreground'));
      this.contextValue = 'story-pending';
    }

    this.tooltip = this.buildTooltip();

    this.command = {
      command: 'ralph.showStoryDetail',
      title: 'Show Story Detail',
      arguments: [story],
    };
  }

  private buildTooltip(): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.appendMarkdown(`### ${this.story.id} — ${this.story.title}\n\n`);
    md.appendMarkdown(`**Status:** ${this.story.passes ? 'Done' : 'Pending'}  \n`);
    md.appendMarkdown(`**Model:** ${this.story.model || 'sonnet'}  \n`);
    md.appendMarkdown(`**Effort:** ${this.story.effort || 'medium'}  \n`);
    md.appendMarkdown(`**Priority:** ${this.story.priority}  \n\n`);

    if (this.story.description) {
      md.appendMarkdown(`${this.story.description}\n\n`);
    }

    if (this.story.acceptanceCriteria?.length) {
      md.appendMarkdown(`**Acceptance Criteria:**\n`);
      for (const ac of this.story.acceptanceCriteria) {
        md.appendMarkdown(`- ${ac}\n`);
      }
    }

    return md;
  }
}

export class StoriesTreeProvider implements vscode.TreeDataProvider<TreeElement>, vscode.TreeDragAndDropController<TreeElement> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeElement | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  readonly dropMimeTypes = [STORY_MIME];
  readonly dragMimeTypes = [STORY_MIME];

  constructor(private config: RalphConfig) {}

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  updateConfig(config: RalphConfig): void {
    this.config = config;
    this.refresh();
  }

  getTreeItem(element: TreeElement): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TreeElement): TreeElement[] {
    if (element instanceof StoryGroupItem) {
      return element.stories;
    }

    const data = this.config.load();
    if (!data) {
      return [];
    }

    const status = this.config.readStatus();
    const runningId = this.extractRunningId(status);

    // Sort by priority for display
    const sorted = [...data.userStories].sort((a, b) => (a.priority || 999) - (b.priority || 999));

    const running: StoryItem[] = [];
    const pending: StoryItem[] = [];
    const done: StoryItem[] = [];

    for (const story of sorted) {
      const isRunning = story.id === runningId;
      const item = new StoryItem(story, isRunning);

      if (isRunning) {
        running.push(item);
      } else if (story.passes) {
        done.push(item);
      } else {
        pending.push(item);
      }
    }

    const groups: StoryGroupItem[] = [];

    if (running.length > 0) {
      groups.push(new StoryGroupItem(
        `Running (${running.length})`,
        running,
        vscode.TreeItemCollapsibleState.Expanded,
      ));
    }

    if (pending.length > 0) {
      groups.push(new StoryGroupItem(
        `Pending (${pending.length})`,
        pending,
        vscode.TreeItemCollapsibleState.Expanded,
      ));
    }

    if (done.length > 0) {
      groups.push(new StoryGroupItem(
        `Done (${done.length})`,
        done,
        vscode.TreeItemCollapsibleState.Collapsed,
      ));
    }

    // If only one group or few stories, flatten
    if (groups.length === 1 || data.userStories.length <= 5) {
      return [...running, ...pending, ...done];
    }

    return groups;
  }

  // --- Drag and Drop ---

  handleDrag(source: readonly TreeElement[], dataTransfer: vscode.DataTransfer): void {
    const storyItems = source.filter((s): s is StoryItem => s instanceof StoryItem);
    if (storyItems.length === 0) { return; }
    dataTransfer.set(STORY_MIME, new vscode.DataTransferItem(storyItems[0].story.id));
  }

  handleDrop(target: TreeElement | undefined, dataTransfer: vscode.DataTransfer): void {
    const draggedId = dataTransfer.get(STORY_MIME)?.value as string | undefined;
    if (!draggedId) { return; }

    let targetPriority: number;

    if (target instanceof StoryItem) {
      targetPriority = target.story.priority;
    } else if (target instanceof StoryGroupItem && target.stories.length > 0) {
      // Dropped on a group header — put at the end of that group
      const last = target.stories[target.stories.length - 1];
      targetPriority = last.story.priority;
    } else {
      return;
    }

    const data = this.config.load();
    if (!data) { return; }

    const draggedStory = data.userStories.find(s => s.id === draggedId);
    if (!draggedStory || draggedStory.priority === targetPriority) { return; }

    this.config.reorderStory(draggedId, targetPriority);
    this.refresh();
  }

  private extractRunningId(status: StatusInfo | null): string | null {
    if (!status || !status.status.includes('running')) {
      return null;
    }
    return status.storyId;
  }
}
