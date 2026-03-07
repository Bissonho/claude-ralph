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
exports.setConfig = setConfig;
exports.startLoop = startLoop;
exports.stopLoop = stopLoop;
exports.pauseLoop = pauseLoop;
exports.skipStory = skipStory;
exports.isLoopRunning = isLoopRunning;
const vscode = __importStar(require("vscode"));
let loopTerminal;
let ralphConfig;
function setConfig(config) {
    ralphConfig = config;
}
function startLoop() {
    const config = vscode.workspace.getConfiguration('ralph');
    const maxIterations = config.get('maxIterations', 30);
    const tool = config.get('tool', 'claude');
    if (loopTerminal) {
        loopTerminal.show();
        vscode.window.showWarningMessage('Ralph loop is already running. Stop it first.');
        return;
    }
    loopTerminal = vscode.window.createTerminal({
        name: 'Ralph Loop',
        iconPath: new vscode.ThemeIcon('play'),
    });
    loopTerminal.show();
    loopTerminal.sendText(`ralph run --max-iterations ${maxIterations} --tool ${tool}`);
    vscode.commands.executeCommand('setContext', 'ralph.loopRunning', true);
    // Detect terminal close
    const disposable = vscode.window.onDidCloseTerminal(t => {
        if (t === loopTerminal) {
            loopTerminal = undefined;
            vscode.commands.executeCommand('setContext', 'ralph.loopRunning', false);
            ralphConfig?.clearRunningStatus();
            vscode.commands.executeCommand('ralph.refresh');
            disposable.dispose();
        }
    });
}
function stopLoop() {
    if (!loopTerminal) {
        // Even without terminal, clear stale running state
        ralphConfig?.clearRunningStatus();
        vscode.commands.executeCommand('setContext', 'ralph.loopRunning', false);
        vscode.commands.executeCommand('ralph.refresh');
        vscode.window.showInformationMessage('Ralph: cleared stale running state.');
        return;
    }
    // Send SIGINT (Ctrl+C)
    loopTerminal.sendText('\x03', false);
    setTimeout(() => {
        if (loopTerminal) {
            loopTerminal.dispose();
            loopTerminal = undefined;
        }
        vscode.commands.executeCommand('setContext', 'ralph.loopRunning', false);
        ralphConfig?.clearRunningStatus();
        vscode.commands.executeCommand('ralph.refresh');
    }, 2000);
}
function pauseLoop() {
    if (!loopTerminal) {
        vscode.window.showInformationMessage('Ralph: no loop running to pause.');
        return;
    }
    // Send SIGTSTP (Ctrl+Z)
    loopTerminal.sendText('\x1a', false);
    vscode.window.showInformationMessage('Ralph: pause signal sent (SIGTSTP).');
}
function skipStory() {
    if (!loopTerminal) {
        vscode.window.showInformationMessage('Ralph: no loop running.');
        return;
    }
    // Send SIGINT to kill the current agent; the loop will continue to next story
    loopTerminal.sendText('\x03', false);
    vscode.window.showInformationMessage('Ralph: skip signal sent — current agent will be terminated.');
}
function isLoopRunning() {
    return !!loopTerminal;
}
//# sourceMappingURL=loop.js.map