import * as vscode from 'vscode';
import { RalphConfig } from '../ralph/config';
export declare class DashboardPanel {
    private static instance;
    private panel;
    private config;
    private refreshInterval;
    private constructor();
    static show(extensionUri: vscode.Uri, config: RalphConfig): void;
    static refresh(): void;
    updateConfig(config: RalphConfig): void;
    private refresh;
    private dispose;
    private getHtml;
    private renderStory;
    private extractRunningId;
    private esc;
}
//# sourceMappingURL=dashboard-panel.d.ts.map