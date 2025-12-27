#!/bin/bash

# Auto Scroll Extension Release Script
# Usage: ./release.sh

set -e  # Exit on error

# Get current version from package.json
CURRENT_VERSION=$(grep -o '"version": "[^"]*' package.json | sed 's/"version": "//')

echo "📦 Current version: $CURRENT_VERSION"
echo ""
echo "Select version increment:"
echo "  1) Patch (bug fixes)      - e.g., $CURRENT_VERSION → $(echo $CURRENT_VERSION | awk -F. '{$NF = $NF + 1;} 1' OFS=.)"
echo "  2) Minor (new features)   - e.g., $CURRENT_VERSION → $(echo $CURRENT_VERSION | awk -F. '{$(NF-1) = $(NF-1) + 1; $NF = 0;} 1' OFS=.)"
echo "  3) Major (breaking)       - e.g., $CURRENT_VERSION → $(echo $CURRENT_VERSION | awk -F. '{$1 = $1 + 1; $2 = 0; $3 = 0;} 1' OFS=.)"
echo "  4) Custom version"
echo ""
read -p "Enter choice (1-4): " choice

case $choice in
  1)
    # Patch: increment last digit (0.0.1 -> 0.0.2)
    NEW_VERSION=$(echo $CURRENT_VERSION | awk -F. '{$NF = $NF + 1;} 1' OFS=.)
    VERSION_TYPE="Patch"
    ;;
  2)
    # Minor: increment middle digit, reset last (0.0.2 -> 0.1.0)
    NEW_VERSION=$(echo $CURRENT_VERSION | awk -F. '{$(NF-1) = $(NF-1) + 1; $NF = 0;} 1' OFS=.)
    VERSION_TYPE="Minor"
    ;;
  3)
    # Major: increment first digit, reset others (0.1.0 -> 1.0.0)
    NEW_VERSION=$(echo $CURRENT_VERSION | awk -F. '{$1 = $1 + 1; $2 = 0; $3 = 0;} 1' OFS=.)
    VERSION_TYPE="Major"
    ;;
  4)
    read -p "Enter custom version: " NEW_VERSION
    VERSION_TYPE="Custom"
    ;;
  *)
    echo "❌ Invalid choice"
    exit 1
    ;;
esac

echo ""
echo "📝 $VERSION_TYPE version bump: $CURRENT_VERSION → $NEW_VERSION"
echo ""
read -p "Continue with release? (y/n): " confirm

if [[ $confirm != "y" && $confirm != "Y" ]]; then
  echo "❌ Release cancelled"
  exit 0
fi

echo ""
echo "🚀 Starting release process for version $NEW_VERSION..."

# Update version in package.json
echo "📝 Updating package.json version to $NEW_VERSION..."
if [[ "$OSTYPE" == "darwin"* ]]; then
  # macOS
  sed -i '' "s/\"version\": \".*\"/\"version\": \"$NEW_VERSION\"/" package.json
else
  # Linux
  sed -i "s/\"version\": \".*\"/\"version\": \"$NEW_VERSION\"/" package.json
fi

# Verify the change
UPDATED_VERSION=$(grep -o '"version": "[^"]*' package.json | sed 's/"version": "//')
echo "✅ Version updated to: $UPDATED_VERSION"

# Compile the extension
echo "🔨 Compiling extension..."
npm run compile

if [ $? -ne 0 ]; then
  echo "❌ Compilation failed. Aborting release."
  exit 1
fi

# Add all changes
echo "📦 Staging all changes..."
git add .

# Commit changes
echo "💾 Committing changes..."
git commit -m "Release version $NEW_VERSION"

if [ $? -ne 0 ]; then
  echo "⚠️  No changes to commit or commit failed"
fi

# Push to GitHub
echo "⬆️  Pushing to GitHub..."
git push origin main

if [ $? -ne 0 ]; then
  echo "❌ Push failed. Please check your git configuration and try again."
  exit 1
fi

# Create and push tag
echo "🏷️  Creating tag v$NEW_VERSION..."
git tag "v$NEW_VERSION"

echo "⬆️  Pushing tag to GitHub..."
git push origin "v$NEW_VERSION"

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ 🎉 Release $NEW_VERSION completed successfully!"
  echo ""
  echo "📋 Next steps:"
  echo "1. GitHub Actions will automatically build the extension"
  echo "2. Check the Actions tab: https://github.com/Shahzad-Official/vscode-auto-scroll-and-switch/actions"
  echo "3. Release will be available at: https://github.com/Shahzad-Official/vscode-auto-scroll-and-switch/releases"
  echo ""
else
  echo "❌ Failed to push tag. Please check and try again."
  exit 1
fi
