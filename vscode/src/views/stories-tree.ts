import * as vscode from 'vscode';
import { RalphConfig } from '../ralph/config';
import { UserStory, StatusInfo } from '../ralph/types';

type TreeElement = StoryGroupItem | StoryItem;

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
    this.description = `${story.id}  ${story.model || 'sonnet'}  ${story.effort || 'medium'}`;

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

export class StoriesTreeProvider implements vscode.TreeDataProvider<TreeElement> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeElement | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

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

    const running: StoryItem[] = [];
    const pending: StoryItem[] = [];
    const done: StoryItem[] = [];

    for (const story of data.userStories) {
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

  private extractRunningId(status: StatusInfo | null): string | null {
    if (!status || !status.status.includes('running')) {
      return null;
    }
    return status.storyId;
  }
}
