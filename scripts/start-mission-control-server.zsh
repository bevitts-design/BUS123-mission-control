#!/bin/zsh

set -u

MISSION_DIR="/Users/bethanyevittsair2/Documents/GitHub/BUS123-mission-control-active"
LOG_DIR="$MISSION_DIR/logs"
NODE_BIN="/Users/bethanyevittsair2/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"

mkdir -p "$LOG_DIR"
echo "$(date '+%Y-%m-%d %H:%M:%S') LaunchAgent wrapper starting Mission Control" >> "$LOG_DIR/mission-control-server.log"
echo "$(date '+%Y-%m-%d %H:%M:%S') Node: $NODE_BIN" >> "$LOG_DIR/mission-control-server.log"

cd "$MISSION_DIR" || exit 78
exec "$NODE_BIN" "$MISSION_DIR/server.mjs"
