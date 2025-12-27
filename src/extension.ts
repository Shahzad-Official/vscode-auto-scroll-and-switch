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
let scrolledLinesCount = 0;
let startLine = 0;

export function activate(context: vscode.ExtensionContext) {
  console.log("Auto Scroll Extension Activated");

  // Check for updates on activation (delayed by 5 seconds)
  setTimeout(() => {
    checkForUpdatesAutomatically(context);
  }, 5000);

  // Check for updates every 24 hours
  const updateCheckInterval = setInterval(() => {
    checkForUpdatesAutomatically(context);
  }, 24 * 60 * 60 * 1000); // 24 hours

  context.subscriptions.push({
    dispose: () => clearInterval(updateCheckInterval),
  });

  const start = vscode.commands.registerCommand("autoScroll.start", () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage("No active editor");
      return;
    }

    isAutoScrollActive = true;
    lastLine = 0;
    lastDirection = "down";
    lastCycleComplete = false;
    scrolledLinesCount = 0;
    startLine = editor.selection.active.line;

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

    // Get configuration
    const config = vscode.workspace.getConfiguration("autoScroll");
    const scrollDelay = config.get<number>("scrollDelay", 1000);
    const scrollDirection = config.get<string>(
      "scrollDirection",
      "bidirectional"
    );
    const autoSwitchTabs = config.get<boolean>("autoSwitchTabs", true);
    const maxScrollLines = config.get<number>("maxScrollLines", 0);
    const scrollStep = config.get<number>("scrollStep", 1);

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

      // Check if we've reached max scroll lines (if set)
      if (maxScrollLines > 0 && scrolledLinesCount >= maxScrollLines) {
        if (autoSwitchTabs) {
          vscode.commands.executeCommand("workbench.action.nextEditor");
          lastLine = 0;
          lastDirection = "down";
          scrolledLinesCount = 0;
          lastCycleComplete = false;
          return;
        } else {
          // Reset to start if not switching tabs
          lastLine = startLine;
          scrolledLinesCount = 0;
          lastDirection = "down";
          return;
        }
      }

      // Handle different scroll directions
      if (scrollDirection === "downOnly") {
        lastLine += scrollStep;
        scrolledLinesCount += scrollStep;
        if (lastLine >= maxLine) {
          lastLine = 0;
          lastCycleComplete = true;
        }
      } else if (scrollDirection === "upOnly") {
        lastLine -= scrollStep;
        scrolledLinesCount += scrollStep;
        if (lastLine <= 0) {
          lastLine = maxLine;
          lastCycleComplete = true;
        }
      } else {
        // bidirectional
        if (lastDirection === "down") {
          lastLine += scrollStep;
          scrolledLinesCount += scrollStep;
          if (lastLine >= maxLine) {
            lastDirection = "up";
          }
        } else {
          lastLine -= scrollStep;
          scrolledLinesCount += scrollStep;
          if (lastLine <= 0) {
            lastDirection = "down";
            lastCycleComplete = true;
          }
        }
      }

      // Switch to next tab after completing one scroll cycle (only if maxScrollLines not set)
      if (lastCycleComplete && autoSwitchTabs && maxScrollLines === 0) {
        vscode.commands.executeCommand("workbench.action.nextEditor");
        lastLine = 0;
        lastDirection = "down";
        scrolledLinesCount = 0;
        lastCycleComplete = false;
        return;
      }

      lastCycleComplete = false;

      const position = new vscode.Position(
        Math.max(0, Math.min(lastLine, maxLine)),
        0
      );
      currentEditor.selection = new vscode.Selection(position, position);
      currentEditor.revealRange(
        new vscode.Range(position, position),
        vscode.TextEditorRevealType.AtTop
      );
    }, scrollDelay);
  }

  function pauseScrollingForUserInteraction() {
    if (!isAutoScrollActive) {
      return;
    }

    // Get configuration
    const config = vscode.workspace.getConfiguration("autoScroll");
    const autoResume = config.get<boolean>("autoResume", true);
    const idleTimeout = config.get<number>("idleTimeout", 30);
    const showNotifications = config.get<boolean>("showNotifications", true);

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

    // Set timeout to resume scrolling if autoResume is enabled
    if (autoResume) {
      userIdleTimeout = setTimeout(() => {
        if (isAutoScrollActive) {
          startScrolling();
        }
      }, idleTimeout * 1000);
    }
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

async function checkForUpdatesAutomatically(context: vscode.ExtensionContext) {
  try {
    const currentVersion = vscode.extensions.getExtension(
      "local.vscode-auto-scroll-and-switch"
    )?.packageJSON.version;

    const latestVersion = await getLatestVersion();

    if (!latestVersion || latestVersion === currentVersion) {
      return; // No update available
    }

    // Check if user already dismissed this version
    const dismissedVersion = context.globalState.get<string>(
      "dismissedUpdateVersion"
    );
    if (dismissedVersion === latestVersion) {
      return; // User already dismissed this version
    }

    // Show update notification
    const selection = await vscode.window.showInformationMessage(
      `🎉 Auto Scroll v${latestVersion} is available! (current: v${currentVersion})`,
      "Download & Install",
      "View Release",
      "Dismiss"
    );

    if (selection === "Download & Install") {
      vscode.env.openExternal(
        vscode.Uri.parse(
          "https://github.com/Shahzad-Official/vscode-auto-scroll-and-switch/releases/latest"
        )
      );
      vscode.window.showInformationMessage(
        "💡 Download the .vsix file and run: code --install-extension <filename>.vsix"
      );
    } else if (selection === "View Release") {
      vscode.env.openExternal(
        vscode.Uri.parse(
          "https://github.com/Shahzad-Official/vscode-auto-scroll-and-switch/releases/latest"
        )
      );
    } else if (selection === "Dismiss") {
      // Remember dismissed version
      context.globalState.update("dismissedUpdateVersion", latestVersion);
    }
  } catch (error) {
    // Silently fail for automatic checks
    console.error("Auto update check failed:", error);
  }
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
