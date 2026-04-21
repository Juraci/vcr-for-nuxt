import { openSync } from 'fs';
import { spawn, ChildProcess } from 'child_process';

export async function startDevServer(
  env: Record<string, string>,
  timeout = 80_000,
): Promise<ChildProcess> {
  // Opt-in debug logging: set VCR_E2E_LOG=/path/to/log.txt to capture the dev
  // server's stdout/stderr. Useful when an e2e failure needs Nuxt-side context.
  const logFile = process.env.VCR_E2E_LOG;
  const outFd = logFile ? openSync(logFile, 'a') : undefined;
  const proc = spawn('npm', ['run', 'dev'], {
    env: { ...process.env, ...env },
    cwd: process.cwd(),
    // Default: 'ignore' keeps the (chatty) nuxt dev output from filling the
    // pipe buffer and blocking the child when the parent doesn't drain.
    stdio: outFd ? ['ignore', outFd, outFd] : 'ignore',
    // Creates a new process group with npm as the leader (pgid = proc.pid).
    // Required so stopDevServer can kill the entire group (npm + shell + nuxt dev).
    detached: true,
  });

  await waitForServer('http://localhost:3000', timeout);
  return proc;
}

export async function stopDevServer(proc: ChildProcess): Promise<void> {
  await new Promise<void>((resolve) => {
    proc.on('exit', resolve);
    try {
      // Kill the entire process group: npm, the shell it spawned, and nuxt dev.
      // Without this, only npm dies and nuxt dev stays orphaned on port 3000,
      // causing the next startDevServer call to reuse the stale server.
      process.kill(-proc.pid!, 'SIGTERM');
    } catch {
      proc.kill('SIGTERM');
    }
  });
  await waitForPortFree(3000);
}

async function waitForPortFree(port: number, timeout = 10_000): Promise<void> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      await fetch(`http://localhost:${port}`);
      await new Promise((r) => setTimeout(r, 200));
    } catch {
      return;
    }
  }
}

async function waitForServer(url: string, timeout: number): Promise<void> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      await fetch(url);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error(`Dev server did not start within ${timeout}ms`);
}
