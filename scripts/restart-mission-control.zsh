#!/bin/zsh

set -u

MISSION_DIR="/Users/bethanyevittsair2/Documents/GitHub/BUS123-mission-control-active"
LOG_DIR="$MISSION_DIR/logs"
SERVER_LAUNCHER="$MISSION_DIR/scripts/launch-mission-control-server.mjs"
NODE_BIN="/Users/bethanyevittsair2/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
FOCUS_SCRIPT="$MISSION_DIR/scripts/focus-mission-control.applescript"
MISSION_URL="http://localhost:8123/?v=grading-launcher-1"
NO_OPEN="${BUS123_MISSION_NO_OPEN:-0}"

mkdir -p "$LOG_DIR"

log_message() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') $1" >> "$LOG_DIR/mission-control-server.log"
}

server_is_compatible() {
  /usr/bin/curl -fsS --max-time 2 "http://127.0.0.1:8123/api/status" >/dev/null 2>&1 &&
    /usr/bin/curl -fsS --max-time 2 "http://127.0.0.1:8123/api/course/visibility" >/dev/null 2>&1
}

stop_port_listeners() {
  local port
  local pid

  for port in 8123 8124; do
    for pid in $(/usr/sbin/lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null); do
      if [[ "$pid" == <-> ]]; then
        log_message "Stopping listener on $port: $pid"
        /bin/kill "$pid" 2>/dev/null
      fi
    done
  done

  for _ in {1..40}; do
    if ! /usr/sbin/lsof -tiTCP:8123 -sTCP:LISTEN >/dev/null 2>&1 &&
      ! /usr/sbin/lsof -tiTCP:8124 -sTCP:LISTEN >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.1
  done

  return 1
}

show_start_error() {
  if [[ "$NO_OPEN" != "1" ]]; then
    /usr/bin/osascript -e 'display alert "BUS123 Mission Control could not start" message "The local server did not become ready. Please open a Codex task so the launcher log can be checked without risking your draft." as critical' >/dev/null 2>&1
  fi
}

log_message "Desktop launcher invoked."

server_ready=0
if server_is_compatible; then
  server_ready=1
else
  if ! stop_port_listeners; then
    log_message "Existing Mission Control listeners did not stop in time."
    show_start_error
    exit 75
  fi

  if [[ ! -x "$NODE_BIN" ]] || ! "$NODE_BIN" "$SERVER_LAUNCHER"; then
    log_message "Could not launch the detached Mission Control server."
    show_start_error
    exit 78
  fi

  for _ in {1..40}; do
    if server_is_compatible; then
      server_ready=1
      break
    fi
    sleep 0.25
  done
fi

if [[ "$server_ready" != "1" ]]; then
  log_message "Mission Control did not become compatible within the expected window."
  show_start_error
  exit 75
fi

if [[ "$NO_OPEN" == "1" ]]; then
  log_message "Mission Control is ready; browser focus suppressed."
  exit 0
fi

focus_result="$(/usr/bin/osascript "$FOCUS_SCRIPT" 2>/dev/null)"
if [[ "$focus_result" == "focused" ]]; then
  log_message "Focused the existing Chrome Mission Control tab."
  exit 0
fi

/usr/bin/open "$MISSION_URL"
log_message "Opened Mission Control in the default browser."
