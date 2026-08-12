#!/usr/bin/env node
/**
 * dev-restart.mjs
 *
 * Restarts the Next.js dev server reliably on Windows.
 *
 * Why this exists:
 * - Next.js 16 `next dev` does NOT fail when port 3000 is already taken by
 *   another dev server. It silently moves to port 3001 (or prints a notice
 *   and exits), while the browser keeps loading the OLD server on 3000. Any
 *   code changes then appear "stale" no matter how often you restart.
 * - This script kills every orphaned Next.js dev process (server, CLI,
 *   Turbopack workers, the `npm run dev` wrapper) plus anything holding the
 *   target port, then starts exactly ONE dev server in the foreground.
 *
 * Usage:
 *   npm run dev:restart            (kills orphans, starts dev on :3000)
 *   npm run dev:restart -- --clean (also deletes .next before starting)
 *
 * Note: .next does not normally need deleting - Turbopack's dev cache
 * invalidates correctly. --clean is only for corrupted-cache recovery.
 */

import { spawn, execSync } from "node:child_process";
import { rmSync } from "node:fs";
import process from "node:process";

const PORT = Number(process.env.PORT || 3000);
const CLEAN = process.argv.includes("--clean");

function powershell(command) {
  try {
    return execSync(`powershell -NoProfile -Command "${command}"`, {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
      windowsHide: true,
    })
      .trim()
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function findDevServerPids() {
  // node.exe processes belonging to this project's dev server.
  const json = powershell(
    "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | " +
      "Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress",
  ).join("");

  const pids = new Set();
  try {
    const rows = JSON.parse(json);
    const list = Array.isArray(rows) ? rows : [rows];
    for (const row of list) {
      const cmd = row.CommandLine ?? "";
      if (
        /next[\\/]dist[\\/]bin[\\/]next/.test(cmd) || // `next dev` CLI
        /start-server\.js/.test(cmd) || // the HTTP server process
        /\.next[\\/]dev[\\/]/.test(cmd) // Turbopack worker pools
      ) {
        if (!/shadcn/.test(cmd) && !/dev-restart\.mjs/.test(cmd)) {
          pids.add(String(row.ProcessId));
        }
      }
    }
  } catch {
    // JSON parse failed; fall back to nothing.
  }

  // Anything listening on the dev port (the most important check).
  for (const pid of powershell(
    `Get-NetTCPConnection -LocalPort ${PORT} -State Listen | Select-Object -ExpandProperty OwningProcess`,
  )) {
    if (pid && String(pid) !== String(process.pid)) pids.add(pid);
  }

  return [...pids];
}

for (const pid of findDevServerPids()) {
  process.stdout.write(`Stopping dev server (PID ${pid})...\n`);
  try {
    // /T kills the whole tree (Turbopack workers included).
    execSync(`taskkill /PID ${pid} /T /F`, { stdio: "ignore", windowsHide: true });
  } catch {
    // Already gone - fine.
  }
}

if (CLEAN) {
  process.stdout.write("Cleaning .next...\n");
  rmSync(".next", { recursive: true, force: true });
}

process.stdout.write(`Starting dev server on http://localhost:${PORT}\n`);
const child = spawn(
  "cmd.exe",
  ["/d", "/s", "/c", "npm run dev"],
  { stdio: "inherit", env: { ...process.env, PORT: String(PORT) } },
);
child.on("exit", (code) => process.exit(code ?? 0));
child.on("error", (error) => {
  process.stderr.write(`Failed to start dev server: ${error.message}\n`);
  process.exit(1);
});
