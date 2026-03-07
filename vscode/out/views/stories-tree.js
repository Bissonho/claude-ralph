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
exports.StoriesTreeProvider = exports.StoryItem = void 0;
const vscode = __importStar(require("vscode"));
const STORY_MIME = 'application/vnd.ralph.story';
class StoryGroupItem extends vscode.TreeItem {
    groupLabel;
    stories;
    collapsibleState;
    constructor(groupLabel, stories, collapsibleState) {
        super(groupLabel, collapsibleState);
        this.groupLabel = groupLabel;
        this.stories = stories;
        this.collapsibleState = collapsibleState;
    }
}
class StoryItem extends vscode.TreeItem {
    story;
    isRunning;
    constructor(story, isRunning) {
        super(story.title, vscode.TreeItemCollapsibleState.None);
        this.story = story;
        this.isRunning = isRunning;
        this.id = story.id;
        this.description = `#${story.priority}  ${story.id}  ${story.model || 'sonnet'}  ${story.effort || 'medium'}`;
        if (isRunning) {
            this.iconPath = new vscode.ThemeIcon('sync~spin', new vscode.ThemeColor('charts.blue'));
            this.contextValue = 'story-running';
        }
        else if (story.passes) {
            this.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'));
            this.contextValue = 'story-done';
        }
        else {
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
    buildTooltip() {
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
exports.StoryItem = StoryItem;
class StoriesTreeProvider {
    config;
    _onDidChangeTreeData = new vscode.EventEmitter();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    dropMimeTypes = [STORY_MIME];
    dragMimeTypes = [STORY_MIME];
    constructor(config) {
        this.config = config;
    }
    refresh() {
        this._onDidChangeTreeData.fire(undefined);
    }
    updateConfig(config) {
        this.config = config;
        this.refresh();
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
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
        const running = [];
        const pending = [];
        const done = [];
        for (const story of sorted) {
            const isRunning = story.id === runningId;
            const item = new StoryItem(story, isRunning);
            if (isRunning) {
                running.push(item);
            }
            else if (story.passes) {
                done.push(item);
            }
            else {
                pending.push(item);
            }
        }
        const groups = [];
        if (running.length > 0) {
            groups.push(new StoryGroupItem(`Running (${running.length})`, running, vscode.TreeItemCollapsibleState.Expanded));
        }
        if (pending.length > 0) {
            groups.push(new StoryGroupItem(`Pending (${pending.length})`, pending, vscode.TreeItemCollapsibleState.Expanded));
        }
        if (done.length > 0) {
            groups.push(new StoryGroupItem(`Done (${done.length})`, done, vscode.TreeItemCollapsibleState.Collapsed));
        }
        // If only one group or few stories, flatten
        if (groups.length === 1 || data.userStories.length <= 5) {
            return [...running, ...pending, ...done];
        }
        return groups;
    }
    // --- Drag and Drop ---
    handleDrag(source, dataTransfer) {
        const storyItems = source.filter((s) => s instanceof StoryItem);
        if (storyItems.length === 0) {
            return;
        }
        dataTransfer.set(STORY_MIME, new vscode.DataTransferItem(storyItems[0].story.id));
    }
    handleDrop(target, dataTransfer) {
        const draggedId = dataTransfer.get(STORY_MIME)?.value;
        if (!draggedId) {
            return;
        }
        let targetPriority;
        if (target instanceof StoryItem) {
            targetPriority = target.story.priority;
        }
        else if (target instanceof StoryGroupItem && target.stories.length > 0) {
            // Dropped on a group header — put at the end of that group
            const last = target.stories[target.stories.length - 1];
            targetPriority = last.story.priority;
        }
        else {
            return;
        }
        const data = this.config.load();
        if (!data) {
            return;
        }
        const draggedStory = data.userStories.find(s => s.id === draggedId);
        if (!draggedStory || draggedStory.priority === targetPriority) {
            return;
        }
        this.config.reorderStory(draggedId, targetPriority);
        this.refresh();
    }
    extractRunningId(status) {
        if (!status || !status.status.includes('running')) {
            return null;
        }
        return status.storyId;
    }
}
exports.StoriesTreeProvider = StoriesTreeProvider;
//# sourceMappingURL=stories-tree.js.map