#!/bin/sh
# Runs the NativeScript CLI for the tvOS host with the environment it needs:
#  - Xcode through DEVELOPER_DIR when xcode-select still points at the Command Line Tools,
#  - a UTF-8 locale, or the xcodeproj gem fails reading the xcconfig files,
#  - and from the iCloud shadow project when one exists (see scripts/icloud-shadow.sh).
# Usage: scripts/tvos.sh run | build | <any ns args>
set -eu
NS=$(cd "$(dirname "$0")/.." && pwd)
SHADOW="$HOME/Library/Caches/velope-solidtv/project"
if [ -d "$SHADOW/node_modules" ]; then
  for item in nativescript.config.ts webpack.config.js tsconfig.json references.d.ts; do cp "$NS/$item" "$SHADOW/$item"; done
  cd "$SHADOW"
else
  cd "$NS"
fi
export LC_ALL=en_US.UTF-8
if [ -z "${DEVELOPER_DIR:-}" ] && [ -d /Applications/Xcode.app/Contents/Developer ]; then
  export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
fi
echo "ns from: $(pwd)"
case "${1:-run}" in
  run) exec pnpm exec ns run tvos --emulator --no-hmr ;;
  build) exec pnpm exec ns build tvos ;;
  *) exec pnpm exec ns "$@" ;;
esac
