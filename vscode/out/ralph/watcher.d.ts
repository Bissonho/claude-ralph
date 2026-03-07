import * as vscode from 'vscode';
export declare class RalphWatcher implements vscode.Disposable {
    private watchers;
    private _onDidChange;
    readonly onDidChange: vscode.Event<void>;
    constructor(prdDir: string);
    dispose(): void;
}
//# sourceMappingURL=watcher.d.ts.map