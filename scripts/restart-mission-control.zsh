#!/bin/zsh

set -u

MISSION_DIR="/Users/bethanyevittsair2/Documents/GitHub/BUS123-mission-control-active"
LOG_DIR="$MISSION_DIR/logs"
SERVER_SCRIPT="$MISSION_DIR/scripts/start-mission-control-server.zsh"
MISSION_URL="http://localhost:8123/?v=grading-launcher-1"

mkdir -p "$LOG_DIR"

for port in 8123 8124; do
  pid="$(/usr/sbin/lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "$pid" ]]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') Stopping listener on $port: $pid" >> "$LOG_DIR/mission-control-server.log"
    /bin/kill $pid 2>/dev/null || true
  fi
done

/usr/bin/nohup /bin/zsh "$SERVER_SCRIPT" >> "$LOG_DIR/mission-control-server.log" 2>&1 </dev/null &
disown

for _ in {1..30}; do
  if /usr/sbin/lsof -nP -iTCP:8123 -sTCP:LISTEN >/dev/null 2>&1; then
    /usr/bin/open "$MISSION_URL"
    exit 0
  fi
  sleep 0.25
done

echo "$(date '+%Y-%m-%d %H:%M:%S') Mission Control did not start within the expected window." >> "$LOG_DIR/mission-control-server.log"
exit 1
