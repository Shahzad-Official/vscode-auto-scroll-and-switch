import * as vscode from "vscode";
import * as https from "https";

let scrollInterval: NodeJS.Timeout | undefined;
let userIdleTimeout: NodeJS.Timeout | undefined;
let isScrollingPaused = false;
let isAutoScrollActive = false;
let lastLine = 0;
let lastDirection: "down" | "up" = "down";
let lastCycleComplete = false;
let disposables: vscode.Disposable[] = [];

export function activate(context: vscode.ExtensionContext) {
  console.log("Auto Scroll Extension Activated");

  const start = vscode.commands.registerCommand("autoScroll.start", () => {
    vscode.window.showInformationMessage("Auto Scroll Started");

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage("No active editor");
      return;
    }

    isAutoScrollActive = true;
    lastLine = 0;
    lastDirection = "down";
    lastCycleComplete = false;

    // Start scrolling
    startScrolling();

    // Listen for user interactions
    const textChangeDisposable = vscode.workspace.onDidChangeTextDocument(
      () => {
        if (isAutoScrollActive) {
          pauseScrollingForUserInteraction();
        }
      }
    );

    const selectionChangeDisposable =
      vscode.window.onDidChangeTextEditorSelection((event) => {
        if (isAutoScrollActive && !isScrollingPaused) {
          // Only pause if this was a manual user interaction (not our automated scroll)
          const currentEditor = vscode.window.activeTextEditor;
          if (
            currentEditor &&
            event.textEditor === currentEditor &&
            event.kind === vscode.TextEditorSelectionChangeKind.Mouse
          ) {
            pauseScrollingForUserInteraction();
          }
        }
      });

    disposables.push(textChangeDisposable, selectionChangeDisposable);
    context.subscriptions.push(textChangeDisposable, selectionChangeDisposable);
  });

  function startScrolling() {
    if (scrollInterval) {
      clearInterval(scrollInterval);
    }

    isScrollingPaused = false;

    scrollInterval = setInterval(() => {
      if (isScrollingPaused) {
        return;
      }

      const currentEditor = vscode.window.activeTextEditor;
      if (!currentEditor) {
        return;
      }

      const document = currentEditor.document;
      const maxLine = document.lineCount - 1;

      if (lastDirection === "down") {
        lastLine += 1;
        if (lastLine >= maxLine) {
          lastDirection = "up";
        }
      } else {
        lastLine -= 1;
        if (lastLine <= 0) {
          lastDirection = "down";
          lastCycleComplete = true;
        }
      }

      // Switch to next tab after completing one bidirectional cycle
      if (lastCycleComplete) {
        vscode.commands.executeCommand("workbench.action.nextEditor");
        lastLine = 0;
        lastDirection = "down";
        lastCycleComplete = false;
        return;
      }

      const position = new vscode.Position(lastLine, 0);
      currentEditor.selection = new vscode.Selection(position, position);
      currentEditor.revealRange(
        new vscode.Range(position, position),
        vscode.TextEditorRevealType.AtTop
      );
    }, 1000); // ⬅️ DELAY IN MILLISECONDS (1000 = 1 second)
  }

  function pauseScrollingForUserInteraction() {
    if (!isAutoScrollActive) {
      return;
    }

    // Pause scrolling
    isScrollingPaused = true;

    // Save current cursor position
    const currentEditor = vscode.window.activeTextEditor;
    if (currentEditor) {
      lastLine = currentEditor.selection.active.line;
    }

    // Clear existing idle timeout
    if (userIdleTimeout) {
      clearTimeout(userIdleTimeout);
    }

    // Show status message
    vscode.window.showInformationMessage(
      "Auto Scroll paused (resuming in 30s if no interaction)"
    );

    // Set 30-second timeout to resume scrolling
    userIdleTimeout = setTimeout(() => {
      if (isAutoScrollActive) {
        vscode.window.showInformationMessage("Auto Scroll resumed");
        startScrolling();
      }
    }, 30000); // 30 seconds
  }

  const stop = vscode.commands.registerCommand("autoScroll.stop", () => {
    if (scrollInterval) {
      clearInterval(scrollInterval);
      scrollInterval = undefined;
    }

    if (userIdleTimeout) {
      clearTimeout(userIdleTimeout);
      userIdleTimeout = undefined;
    }

    isAutoScrollActive = false;
    isScrollingPaused = false;

    // Clean up event listeners
    disposables.forEach((d) => d.dispose());
    disposables = [];

    vscode.window.showInformationMessage("Auto Scroll Stopped");
  });

  const checkUpdates = vscode.commands.registerCommand(
    "autoScroll.checkUpdates",
    async () => {
      try {
        const currentVersion = vscode.extensions.getExtension(
          "local.vscode-auto-scroll-and-switch"
        )?.packageJSON.version;

        const latestVersion = await getLatestVersion();

        if (!latestVersion) {
          vscode.window.showErrorMessage(
            "Failed to check for updates. Please try again later."
          );
          return;
        }

        if (latestVersion === currentVersion) {
          vscode.window.showInformationMessage(
            `You have the latest version (v${currentVersion})`
          );
        } else {
          const selection = await vscode.window.showInformationMessage(
            `New version available: v${latestVersion} (current: v${currentVersion})`,
            "Download & Install",
            "View Release"
          );

          if (selection === "Download & Install") {
            vscode.env.openExternal(
              vscode.Uri.parse(
                "https://github.com/Shahzad-Official/vscode-auto-scroll-and-switch/releases/latest"
              )
            );
            vscode.window.showInformationMessage(
              "Download the .vsix file and run: code --install-extension <filename>.vsix"
            );
          } else if (selection === "View Release") {
            vscode.env.openExternal(
              vscode.Uri.parse(
                "https://github.com/Shahzad-Official/vscode-auto-scroll-and-switch/releases/latest"
              )
            );
          }
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Error checking for updates: ${error}`);
      }
    }
  );

  context.subscriptions.push(start, stop, checkUpdates);
}

export function deactivate() {
  if (scrollInterval) {
    clearInterval(scrollInterval);
  }
  if (userIdleTimeout) {
    clearTimeout(userIdleTimeout);
  }
  disposables.forEach((d) => d.dispose());
  disposables = [];
}

function getLatestVersion(): Promise<string | null> {
  return new Promise((resolve) => {
    const options = {
      hostname: "api.github.com",
      path: "/repos/Shahzad-Official/vscode-auto-scroll-and-switch/releases/latest",
      method: "GET",
      headers: {
        "User-Agent": "VSCode-Extension",
      },
    };

    https
      .get(options, (res) => {
        let data = "";

        res.on("data", (chunk) => {
          data += chunk;
        });

        res.on("end", () => {
          try {
            const release = JSON.parse(data);
            const version = release.tag_name?.replace("v", "");
            resolve(version || null);
          } catch {
            resolve(null);
          }
        });
      })
      .on("error", () => {
        resolve(null);
      });
  });
}
