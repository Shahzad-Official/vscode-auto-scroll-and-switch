import * as vscode from "vscode";
import * as https from "https";

let scrollInterval: NodeJS.Timeout | undefined;

export function activate(context: vscode.ExtensionContext) {
  console.log("Auto Scroll Extension Activated");

  const start = vscode.commands.registerCommand("autoScroll.start", () => {
    vscode.window.showInformationMessage("Auto Scroll Started");

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage("No active editor");
      return;
    }

    let line = 0;
    let direction: "down" | "up" = "down";
    let cycleComplete = false;

    scrollInterval = setInterval(() => {
      const currentEditor = vscode.window.activeTextEditor;
      if (!currentEditor) {
        return;
      }

      const document = currentEditor.document;
      const lastLine = document.lineCount - 1;

      if (direction === "down") {
        line += 1;
        if (line >= lastLine) {
          direction = "up";
        }
      } else {
        line -= 1;
        if (line <= 0) {
          direction = "down";
          cycleComplete = true;
        }
      }

      // Switch to next tab after completing one bidirectional cycle
      if (cycleComplete) {
        vscode.commands.executeCommand("workbench.action.nextEditor");
        line = 0;
        direction = "down";
        cycleComplete = false;
        return;
      }

      const position = new vscode.Position(line, 0);
      currentEditor.selection = new vscode.Selection(position, position);
      currentEditor.revealRange(
        new vscode.Range(position, position),
        vscode.TextEditorRevealType.AtTop
      );
    }, 1000); // ⬅️ DELAY IN MILLISECONDS (1000 = 1 second)
  });

  const stop = vscode.commands.registerCommand("autoScroll.stop", () => {
    if (scrollInterval) {
      clearInterval(scrollInterval);
      scrollInterval = undefined;
      vscode.window.showInformationMessage("Auto Scroll Stopped");
    }
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
