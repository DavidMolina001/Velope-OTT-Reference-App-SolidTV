#!/bin/zsh
# Usage: scripts/run-sim.sh <udid> <out-dir> [done-pattern] [settle-seconds]
# Installs the simulator build on a booted Apple TV simulator, launches it, streams its
# unified log until the done pattern shows (default: the app's "APP rendered" line), settles,
# screenshots, and prints the app's console lines and any errors. Build first with
# `scripts/tvos.sh build`.
set -u
UDID=$1; OUT=$2; DONE=${3:-"APP rendered"}; SETTLE=${4:-4}
BUNDLE=com.edinburghanalytics.velopetv
NAME=VelopeTV
export DEVELOPER_DIR=${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}
SHADOW="$HOME/Library/Caches/velope-solidtv/project"
PROJ=$(cd "$(dirname "$0")/.." && pwd); [ -d "$SHADOW/platforms" ] && PROJ=$SHADOW
mkdir -p "$OUT"; OUT=$(cd "$OUT" && pwd)
APP=$(find "$PROJ/platforms/tvos/build" -maxdepth 3 -type d -name "$NAME.app" | grep -i simulator | head -1)
echo "app: $APP"
[ -z "$APP" ] && { echo "no simulator build; run: scripts/tvos.sh build"; exit 1; }
xcrun simctl terminate "$UDID" "$BUNDLE" >/dev/null 2>&1
xcrun simctl uninstall "$UDID" "$BUNDLE" >/dev/null 2>&1
xcrun simctl install "$UDID" "$APP" || exit 1
: > "$OUT/oslog.log"
xcrun simctl spawn "$UDID" log stream --style compact --predicate "process CONTAINS \"$NAME\"" > "$OUT/oslog.log" 2>&1 &
LOGPID=$!
sleep 1
xcrun simctl launch "$UDID" "$BUNDLE" > "$OUT/launch.log" 2>&1
for i in {1..90}; do
  if grep -q "$DONE" "$OUT/oslog.log" 2>/dev/null; then break; fi
  sleep 1
done
sleep "$SETTLE"
xcrun simctl io "$UDID" screenshot "$OUT/screenshot.png" >/dev/null 2>&1 && echo "screenshot: $OUT/screenshot.png"
kill $LOGPID >/dev/null 2>&1
echo "--- app console (CONSOLE lines) ---"
grep -E "CONSOLE|JS:" "$OUT/oslog.log" | cut -c1-300 | tail -40
echo "--- errors in the unified log ---"
grep -iE "error|exception|fatal|JS ERROR|Unhandled" "$OUT/oslog.log" | grep -v "BoardServices\|XPCErrors\|CoreAnalytics" | cut -c1-300 | head -20
