import { closeSync, openSync } from 'node:fs';
import { spawn } from 'node:child_process';

const missionDir = '/Users/bethanyevittsair2/Documents/GitHub/BUS123-mission-control-active';
const serverScript = `${missionDir}/scripts/start-mission-control-server.zsh`;
const logPath = `${missionDir}/logs/mission-control-server.log`;

const logDescriptor = openSync(logPath, 'a');

try {
  const server = spawn('/bin/zsh', [serverScript], {
    cwd: missionDir,
    detached: true,
    stdio: ['ignore', logDescriptor, logDescriptor],
  });

  if (server.pid == null) {
    throw new Error('The detached server process did not receive a process identifier.');
  }

  server.unref();
} finally {
  closeSync(logDescriptor);
}
