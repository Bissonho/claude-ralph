import * as vscode from 'vscode';
import { RalphConfig } from '../ralph/config';
export declare class OpenRouterPanel {
    private static instance;
    private panel;
    private config;
    private constructor();
    static show(extensionUri: vscode.Uri, config: RalphConfig): void;
    private dispose;
    private sendConfig;
    private saveApiKey;
    private validateApiKey;
    private fetchModels;
    private toggleModel;
    private setModelSelection;
    private getHtml;
}
//# sourceMappingURL=openrouter-panel.d.ts.map