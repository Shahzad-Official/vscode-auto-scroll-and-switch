# VSCode Auto Scroll and Switch

Automatically scrolls the active editor slowly from top to bottom and back,
then switches to the next open editor tab and repeats.

## Features

- Slow auto scroll (configurable delay in seconds)
- Scroll down then up
- Switch between open editor tabs automatically
- Built-in update checker
- Useful for monitoring, presentations, or passive code review

## Installation

### Option 1: One-line Install (Recommended)

**Linux/macOS:**

```bash
curl -sSL https://raw.githubusercontent.com/Shahzad-Official/vscode-auto-scroll-and-switch/main/install.sh | bash
```

**Windows (PowerShell as Admin):**

```powershell
irm https://raw.githubusercontent.com/Shahzad-Official/vscode-auto-scroll-and-switch/main/install.bat | iex
```

### Option 2: Manual Install

1. Download the latest `.vsix` file from [Releases](https://github.com/Shahzad-Official/vscode-auto-scroll-and-switch/releases/latest)
2. Install it:
   ```bash
   code --install-extension vscode-auto-scroll-and-switch-*.vsix
   ```

### Option 3: Build from Source

```bash
git clone https://github.com/Shahzad-Official/vscode-auto-scroll-and-switch.git
cd vscode-auto-scroll-and-switch
npm install
npm run compile
npm install -g @vscode/vsce
vsce package
code --install-extension vscode-auto-scroll-and-switch-*.vsix
```

## Usage

Run commands from Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`):

- `Auto Scroll: Start` - Start automatic scrolling
- `Auto Scroll: Stop` - Stop scrolling
- `Auto Scroll: Check for Updates` - Check for new versions

## Updating

### Automatic Update Check

1. Open Command Palette
2. Run: `Auto Scroll: Check for Updates`
3. Click "Download & Install" if update available

### Manual Update

Run the installation script again:

```bash
./install.sh  # Linux/macOS
install.bat   # Windows
```

Or use git pull if you installed from source:

```bash
git pull
npm run compile
vsce package
code --install-extension vscode-auto-scroll-and-switch-*.vsix
```
