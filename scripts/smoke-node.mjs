#!/usr/bin/env node
/**
 * Node-runtime smoke test for the compiled dist/index.js.
 *
 * Spawns `node dist/index.js` with dummy credentials, waits up to 3s for
 * the startup banner on stderr, then kills the child and exits 0. Missing
 * banner = fail (exit 1). Run as part of prepublishOnly so a broken dist
 * cannot be published.
 *
 * Intentionally simple and Node-only (no Bun dependency); uses only
 * process, console, setTimeout, and child_process.spawn.
 */

import { spawn } from "node:child_process";

const TIMEOUT_MS = 3000;
const EXPECTED_BANNER = "started on stdio";

const child = spawn("node", ["dist/index.js"], {
  env: {
    ...process.env,
    CASCADE_API_KEY: "smoke-test-key",
    CASCADE_URL: "https://smoke-test.invalid/api/v1/",
  },
  stdio: ["ignore", "ignore", "pipe"],
});

let gotBanner = false;
let captured = "";

const timer = setTimeout(() => {
  if (!gotBanner) {
    console.error(
      `[smoke] FAIL: no "${EXPECTED_BANNER}" banner within ${TIMEOUT_MS}ms.\n` +
        `[smoke] Captured stderr: ${captured.slice(0, 500)}`,
    );
    child.kill("SIGKILL");
    process.exit(1);
  }
}, TIMEOUT_MS);

child.stderr.on("data", (chunk) => {
  captured += chunk.toString();
  if (!gotBanner && captured.includes(EXPECTED_BANNER)) {
    gotBanner = true;
    clearTimeout(timer);
    console.log(`[smoke] PASS: node dist/index.js booted with "${EXPECTED_BANNER}"`);
    child.kill("SIGINT");
  }
});

child.on("exit", () => {
  clearTimeout(timer);
  process.exit(gotBanner ? 0 : 1);
});

child.on("error", (err) => {
  clearTimeout(timer);
  console.error(`[smoke] FAIL: spawn error: ${err.message}`);
  process.exit(1);
});
