import * as vscode from "vscode";

let interval: NodeJS.Timeout | undefined;

export function activate(context: vscode.ExtensionContext) {
  console.log("Auto Scroll extension activated");

  const start = vscode.commands.registerCommand("autoScroll.start", () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    let direction = 1;

    interval = setInterval(() => {
      const visible = editor.visibleRanges[0];
      const line =
        direction > 0 ? visible.end.line + 1 : visible.start.line - 1;

      editor.revealRange(
        new vscode.Range(line, 0, line, 0),
        vscode.TextEditorRevealType.AtTop
      );

      if (line >= editor.document.lineCount - 1) {
        direction = -1;
      }
      if (line <= 0) {
        direction = 1;
      }
    }, 1000); // seconds-based delay
  });

  const stop = vscode.commands.registerCommand("autoScroll.stop", () => {
    if (interval) {
      clearInterval(interval);
      interval = undefined;
    }
  });

  context.subscriptions.push(start, stop);
}

export function deactivate() {
  if (interval) {
    clearInterval(interval);
  }
}
