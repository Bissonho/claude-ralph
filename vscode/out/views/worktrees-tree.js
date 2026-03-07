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
exports.WorktreesTreeProvider = exports.WorktreeItem = void 0;
const vscode = __importStar(require("vscode"));
class WorktreeItem extends vscode.TreeItem {
    worktree;
    constructor(worktree) {
        super(worktree.name, vscode.TreeItemCollapsibleState.None);
        this.worktree = worktree;
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
    buildTooltip() {
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
exports.WorktreeItem = WorktreeItem;
class WorktreesTreeProvider {
    config;
    _onDidChangeTreeData = new vscode.EventEmitter();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
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
    getChildren() {
        const worktrees = this.config.loadWorktrees();
        return worktrees.map(wt => new WorktreeItem(wt));
    }
}
exports.WorktreesTreeProvider = WorktreesTreeProvider;
//# sourceMappingURL=worktrees-tree.js.map