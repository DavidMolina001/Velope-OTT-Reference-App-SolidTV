#!/bin/zsh
# Usage: scripts/remote-sim.sh <udid> <out-dir> "<steps>" [launch|activate]
# Presses Siri Remote buttons on the Apple TV simulator through the XCUITest driver in
# nativescript/remote-driver (generate it once with `ruby generate.rb`). Steps, space
# separated: up down left right select menu play home, hold:<button>:<ms>, wait:<ms>,
# repeat:<button>:<n>. With "launch" the app is restarted first; otherwise the running one is
# brought to the front. Prints the driver's lines, then the app's own console lines.
set -u
UDID=$1; OUT=$2; STEPS=$3; MODE=${4:-activate}
BUNDLE=com.edinburghanalytics.velopetv
NAME=VelopeTV
export DEVELOPER_DIR=${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}
DRIVER=$(cd "$(dirname "$0")/../remote-driver" && pwd)
DERIVED="$HOME/Library/Caches/velope-solidtv/remote-driver-derived"
mkdir -p "$OUT"; OUT=$(cd "$OUT" && pwd)
: > "$OUT/remote.log"
xcrun simctl spawn "$UDID" log stream --style compact --predicate "process CONTAINS \"$NAME\" OR process CONTAINS \"RemoteDriver\"" > "$OUT/remote.log" 2>&1 &
LOGPID=$!
sleep 1
TEST_RUNNER_REMOTE_STEPS="$STEPS" TEST_RUNNER_REMOTE_LAUNCH="$MODE" TEST_RUNNER_REMOTE_BUNDLE="$BUNDLE" xcodebuild test \
  -project "$DRIVER/RemoteDriver.xcodeproj" -scheme RemoteDriverUITests \
  -destination "platform=tvOS Simulator,id=$UDID" \
  -derivedDataPath "$DERIVED" CODE_SIGNING_ALLOWED=NO > "$OUT/xcodebuild.log" 2>&1
echo "xcodebuild exit: $?"
sleep 1
xcrun simctl io "$UDID" screenshot "$OUT/remote.png" >/dev/null 2>&1 && echo "screenshot: $OUT/remote.png"
kill $LOGPID >/dev/null 2>&1
echo "--- driver ---"
grep -o "REMOTE_DRIVER .*" "$OUT/remote.log" | cut -c1-200
grep -E "Test Case.*(passed|failed)|error:|\*\* TEST" "$OUT/xcodebuild.log" | head -5
echo "--- app console ---"
grep -E "CONSOLE" "$OUT/remote.log" | grep -v "REMOTE_DRIVER" | sed 's/.*CONSOLE/CONSOLE/' | cut -c1-220 | tail -40
