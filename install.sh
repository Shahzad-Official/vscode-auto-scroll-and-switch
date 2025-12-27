#!/bin/bash

# Auto Scroll Extension Installer/Updater

REPO="Shahzad-Official/vscode-auto-scroll-and-switch"
EXTENSION_NAME="vscode-auto-scroll-and-switch"

echo "🔍 Checking for latest release..."

# Get latest release info
LATEST_RELEASE=$(curl -s "https://api.github.com/repos/$REPO/releases/latest")
LATEST_VERSION=$(echo "$LATEST_RELEASE" | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/')
DOWNLOAD_URL=$(echo "$LATEST_RELEASE" | grep '"browser_download_url":' | grep '.vsix' | sed -E 's/.*"([^"]+)".*/\1/')

if [ -z "$LATEST_VERSION" ]; then
  echo "❌ Failed to fetch latest release. Please check your internet connection."
  exit 1
fi

echo "✅ Latest version: $LATEST_VERSION"
echo "📥 Downloading extension..."

# Download the .vsix file
VSIX_FILE="$EXTENSION_NAME-$LATEST_VERSION.vsix"
curl -L -o "$VSIX_FILE" "$DOWNLOAD_URL"

if [ $? -ne 0 ]; then
  echo "❌ Failed to download extension."
  exit 1
fi

echo "📦 Installing extension..."

# Install the extension
code --install-extension "$VSIX_FILE"

if [ $? -eq 0 ]; then
  echo "✅ Extension installed successfully!"
  echo "🔄 Please reload VS Code to activate the extension."
  
  # Clean up
  rm "$VSIX_FILE"
  echo "🧹 Cleaned up temporary files."
else
  echo "❌ Failed to install extension."
  exit 1
fi
