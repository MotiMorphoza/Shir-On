const { spawn } = require('child_process');
const { join } = require('path');

const rootDir = join(__dirname, '..');
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function start(name, cwd) {
  const child = spawn(npmCmd, ['run', 'dev'], {
    cwd,
    stdio: 'inherit',
    env: process.env,
    shell: process.platform === 'win32',
  });

  child.on('error', (err) => {
    console.error(`[dev] ${name} failed to start:`, err.message);
  });

  return child;
}

const children = [
  { name: 'backend', proc: start('backend', join(rootDir, 'backend')) },
  { name: 'frontend', proc: start('frontend', join(rootDir, 'frontend')) },
];

let shuttingDown = false;

function shutdown(exitCode = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  for (const { proc } of children) {
    if (!proc.killed) {
      proc.kill('SIGINT');
    }
  }

  setTimeout(() => {
    for (const { proc } of children) {
      if (!proc.killed) {
        proc.kill('SIGTERM');
      }
    }
    process.exit(exitCode);
  }, 500);
}

for (const { name, proc } of children) {
  proc.on('exit', (code, signal) => {
    if (shuttingDown) {
      return;
    }

    if (signal) {
      console.error(`[dev] ${name} exited via signal ${signal}`);
    } else if (code !== 0) {
      console.error(`[dev] ${name} exited with code ${code}`);
    }

    shutdown(code ?? 1);
  });
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
