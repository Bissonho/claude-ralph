import * as vscode from 'vscode';
import { RalphConfig } from '../ralph/config';
export declare class RalphStatusBar implements vscode.Disposable {
    private statusBarItem;
    private config;
    constructor(config: RalphConfig);
    updateConfig(config: RalphConfig): void;
    refresh(): void;
    dispose(): void;
}
//# sourceMappingURL=status-bar.d.ts.map