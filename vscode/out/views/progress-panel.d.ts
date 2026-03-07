import * as vscode from 'vscode';
import { RalphConfig } from '../ralph/config';
export declare class ProgressViewProvider implements vscode.WebviewViewProvider {
    private readonly extensionUri;
    private config;
    private _view?;
    private activityWatcher?;
    constructor(extensionUri: vscode.Uri, config: RalphConfig);
    updateConfig(config: RalphConfig): void;
    refresh(): void;
    resolveWebviewView(webviewView: vscode.WebviewView): void;
    private writeFeedback;
    private openStoryLog;
    private readActivity;
    private getCompletedStories;
    private getCurrentStory;
    private formatDuration;
    private getEventIcon;
    private formatEventText;
    private formatTime;
    private getHtml;
    private getEmptyHtml;
    private escapeHtml;
}
//# sourceMappingURL=progress-panel.d.ts.map