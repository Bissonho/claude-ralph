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
exports.RalphStatusBar = void 0;
const vscode = __importStar(require("vscode"));
class RalphStatusBar {
    statusBarItem;
    config;
    constructor(config) {
        this.config = config;
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
        this.statusBarItem.command = 'ralph.showDashboard';
        this.statusBarItem.name = 'Ralph';
        this.refresh();
        this.statusBarItem.show();
    }
    updateConfig(config) {
        this.config = config;
        this.refresh();
    }
    refresh() {
        const data = this.config.load();
        if (!data) {
            this.statusBarItem.text = '$(circle-outline) Ralph';
            this.statusBarItem.tooltip = 'No Ralph project found';
            return;
        }
        const progress = this.config.getProgress(data);
        const status = this.config.readStatus();
        const isRunning = status?.status.includes('running') ?? false;
        if (isRunning) {
            const etaPart = status?.eta ? ` | ETA ${status.eta}` : '';
            this.statusBarItem.text = `$(sync~spin) Ralph: ${progress.done}/${progress.total} (${progress.pct}%)${status?.elapsed ? ` ${status.elapsed}` : ''}`;
            this.statusBarItem.tooltip = `Running: ${status?.storyId || '...'} | iter ${status?.iteration}/${status?.maxIterations}${status?.elapsed ? ` | elapsed ${status.elapsed}` : ''}${etaPart}`;
            this.statusBarItem.backgroundColor = undefined;
        }
        else if (progress.pending === 0) {
            this.statusBarItem.text = `$(check) Ralph: ${progress.total}/${progress.total} (100%)`;
            this.statusBarItem.tooltip = 'All stories complete!';
            this.statusBarItem.backgroundColor = undefined;
        }
        else {
            this.statusBarItem.text = `$(circle-outline) Ralph: ${progress.done}/${progress.total} (${progress.pct}%)`;
            this.statusBarItem.tooltip = `${progress.pending} stories pending — Click to open dashboard`;
            this.statusBarItem.backgroundColor = undefined;
        }
    }
    dispose() {
        this.statusBarItem.dispose();
    }
}
exports.RalphStatusBar = RalphStatusBar;
//# sourceMappingURL=status-bar.js.map