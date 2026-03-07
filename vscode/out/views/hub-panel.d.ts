import * as vscode from 'vscode';
export declare class HubPanel {
    private static instance;
    private panel;
    private pollTimer;
    private lastKnownStatuses;
    private constructor();
    static show(extensionUri: vscode.Uri): void;
    private loadContent;
    private isHubRunning;
    private loadHubDashboard;
    private patchHubHtml;
    private handleWebviewMessage;
    private startPolling;
    private pollStatus;
    private dispose;
    private getFallbackHtml;
    private esc;
}
//# sourceMappingURL=hub-panel.d.ts.map