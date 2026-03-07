import * as vscode from 'vscode';
import { RalphConfig } from '../ralph/config';

let loopTerminal: vscode.Terminal | undefined;
let ralphConfig: RalphConfig | undefined;

export function setConfig(config: RalphConfig): void {
  ralphConfig = config;
}

export function startLoop(): void {
  const config = vscode.workspace.getConfiguration('ralph');
  const maxIterations = config.get<number>('maxIterations', 30);
  const tool = config.get<string>('tool', 'claude');

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

export function stopLoop(): void {
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

export function pauseLoop(): void {
  if (!loopTerminal) {
    vscode.window.showInformationMessage('Ralph: no loop running to pause.');
    return;
  }
  // Send SIGTSTP (Ctrl+Z)
  loopTerminal.sendText('\x1a', false);
  vscode.window.showInformationMessage('Ralph: pause signal sent (SIGTSTP).');
}

export function skipStory(): void {
  if (!loopTerminal) {
    vscode.window.showInformationMessage('Ralph: no loop running.');
    return;
  }
  // Send SIGINT to kill the current agent; the loop will continue to next story
  loopTerminal.sendText('\x03', false);
  vscode.window.showInformationMessage('Ralph: skip signal sent — current agent will be terminated.');
}

export function isLoopRunning(): boolean {
  return !!loopTerminal;
}
