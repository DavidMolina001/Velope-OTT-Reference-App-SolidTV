#!/bin/sh
# Sets up a "shadow" copy of the tvOS project OUTSIDE iCloud Drive.
#
# Why: when this repository lives in an iCloud-synced folder (Desktop or Documents with
# "Desktop & Documents Folders" on), the sync daemon tags every bundle folder Xcode creates
# (.app, .framework) with Finder metadata seconds after it appears, and codesign then fails with
# "resource fork, Finder information, or similar detritus not allowed". Stripping the
# attributes is a race. The fix is to keep everything the build generates outside iCloud:
# this script creates ~/Library/Caches/velope-solidtv/project with the tracked source files
# symlinked in and a real node_modules/ + platforms/ there. scripts/tvos.sh runs the CLI from
# that folder when it exists. Cloning the repo somewhere not synced (e.g. ~/Developer) makes
# all of this unnecessary.
set -eu
NS=$(cd "$(dirname "$0")/.." && pwd)
ROOT=$(cd "$NS/.." && pwd)
B="$HOME/Library/Caches/velope-solidtv"
P="$B/project"
mkdir -p "$P"
# The shared app and its assets, one level up, as the real layout has them.
for item in src public .env .env.example; do
  [ -e "$ROOT/$item" ] || continue
  rm -f "$B/$item"; ln -s "$ROOT/$item" "$B/$item"
done
# The tracked files of the tvOS host. Folders and pnpm files are symlinked; the files Node
# `require`s (the CLI resolves a symlink to its real path, where no node_modules exists) are
# copied, and scripts/tvos.sh refreshes those copies on every run.
for item in app App_Resources stubs scripts package.json pnpm-workspace.yaml pnpm-lock.yaml; do
  [ -e "$NS/$item" ] || continue
  rm -f "$P/$item"; ln -s "$NS/$item" "$P/$item"
done
for item in nativescript.config.ts webpack.config.js tsconfig.json references.d.ts; do
  rm -f "$P/$item"; cp "$NS/$item" "$P/$item"
done
echo "shadow project: $P"
echo "next: cd \"$P\" && LC_ALL=en_US.UTF-8 pnpm install"
