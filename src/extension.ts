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
let commentLinesSinceLastComment = 0;
let pendingCommentDeletion: NodeJS.Timeout | undefined;
let lastCommentPosition: { line: number; text: string } | undefined;

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
    commentLinesSinceLastComment = 0;
    lastCommentPosition = undefined;

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
    const enableComments = config.get<boolean>("enableComments", false);
    const commentFrequency = config.get<number>("commentFrequency", 50);
    const commentDuration = config.get<number>("commentDuration", 3);
    const commentText = config.get<string>(
      "commentText",
      "// Auto Scroll Checkpoint"
    );

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

      // Handle comment insertion
      if (enableComments) {
        commentLinesSinceLastComment += scrollStep;

        // Check if it's time to insert a comment
        if (commentLinesSinceLastComment >= commentFrequency) {
          insertComment(currentEditor, lastLine, commentText, commentDuration);
          commentLinesSinceLastComment = 0;
        }
      }

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

  async function insertComment(
    editor: vscode.TextEditor,
    lineNumber: number,
    commentText: string,
    duration: number
  ) {
    // Cancel any pending comment deletion
    if (pendingCommentDeletion) {
      clearTimeout(pendingCommentDeletion);
    }

    // Delete previous comment if exists
    if (lastCommentPosition) {
      await deleteComment(editor, lastCommentPosition);
    }

    // Pause scrolling temporarily
    const wasScrollingPaused = isScrollingPaused;
    isScrollingPaused = true;

    try {
      // Insert new comment with typing animation
      const position = new vscode.Position(lineNumber, 0);
      const lineText = editor.document.lineAt(lineNumber).text;
      const indentation = lineText.match(/^\s*/)?.[0] || "";

      const fullText = `${indentation}${commentText}\n`;

      // Insert empty line first
      await editor.edit((editBuilder) => {
        editBuilder.insert(position, `${indentation}\n`);
      });

      // Type character by character with realistic typing speed
      for (let i = 0; i < commentText.length; i++) {
        const char = commentText[i];
        const currentPos = new vscode.Position(
          lineNumber,
          indentation.length + i
        );

        await editor.edit((editBuilder) => {
          editBuilder.insert(currentPos, char);
        });

        // Random typing speed between 30-80ms per character for realistic effect
        const typingDelay = Math.random() * 50 + 30;
        await new Promise((resolve) => setTimeout(resolve, typingDelay));
      }

      // Store comment info for later deletion
      lastCommentPosition = {
        line: lineNumber,
        text: commentText,
      };

      // Schedule comment deletion
      pendingCommentDeletion = setTimeout(async () => {
        if (lastCommentPosition && isAutoScrollActive) {
          const currentEditor = vscode.window.activeTextEditor;
          if (currentEditor) {
            await deleteComment(currentEditor, lastCommentPosition);
            lastCommentPosition = undefined;
          }
        }
        // Resume scrolling after deletion
        isScrollingPaused = wasScrollingPaused;
      }, duration * 1000);
    } catch (error) {
      console.error("Failed to insert comment:", error);
    }

    // Resume scrolling after typing animation
    setTimeout(() => {
      isScrollingPaused = wasScrollingPaused;
    }, 100);
  }

  async function deleteComment(
    editor: vscode.TextEditor,
    commentInfo: { line: number; text: string }
  ) {
    try {
      const document = editor.document;
      if (commentInfo.line >= document.lineCount) {
        return;
      }

      const line = document.lineAt(commentInfo.line);
      if (line.text.includes(commentInfo.text)) {
        await editor.edit((editBuilder) => {
          editBuilder.delete(
            new vscode.Range(
              new vscode.Position(commentInfo.line, 0),
              new vscode.Position(commentInfo.line + 1, 0)
            )
          );
        });
      }
    } catch (error) {
      console.error("Failed to delete comment:", error);
    }
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

    if (pendingCommentDeletion) {
      clearTimeout(pendingCommentDeletion);
      pendingCommentDeletion = undefined;
    }

    isAutoScrollActive = false;
    isScrollingPaused = false;
    lastCommentPosition = undefined;

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
  if (pendingCommentDeletion) {
    clearTimeout(pendingCommentDeletion);
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
