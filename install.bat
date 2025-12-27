@echo off
setlocal enabledelayedexpansion

set REPO=Shahzad-Official/vscode-auto-scroll-and-switch
set EXTENSION_NAME=vscode-auto-scroll-and-switch

echo Checking for latest release...

REM Download release info
powershell -Command "& {$response = Invoke-RestMethod -Uri 'https://api.github.com/repos/%REPO%/releases/latest'; $response.tag_name | Out-File -FilePath version.tmp -Encoding ASCII; $response.assets[0].browser_download_url | Out-File -FilePath download.tmp -Encoding ASCII}"

set /p LATEST_VERSION=<version.tmp
set /p DOWNLOAD_URL=<download.tmp

echo Latest version: %LATEST_VERSION%
echo Downloading extension...

set VSIX_FILE=%EXTENSION_NAME%-%LATEST_VERSION%.vsix

REM Download the .vsix file
powershell -Command "& {Invoke-WebRequest -Uri '%DOWNLOAD_URL%' -OutFile '%VSIX_FILE%'}"

echo Installing extension...

REM Install the extension
code --install-extension %VSIX_FILE%

if %ERRORLEVEL% EQU 0 (
  echo Extension installed successfully!
  echo Please reload VS Code to activate the extension.
  del %VSIX_FILE%
  del version.tmp
  del download.tmp
  echo Cleaned up temporary files.
) else (
  echo Failed to install extension.
  exit /b 1
)
