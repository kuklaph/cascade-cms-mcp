#!/usr/bin/env node
/**
 * Entry point for the Cascade CMS MCP server.
 *
 * Loads config from env, builds process-scoped Cascade dependencies,
 * and serves fresh MCP server instances over stdio. Logs lifecycle events
 * to stderr (stdout is reserved for the MCP protocol stream).
 */

import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { loadConfig } from "./config.js";
import { createCascadeClient } from "./client.js";
import { createBrowserSession } from "./browserApi.js";
import { sanitizeLogMessage } from "./errors.js";
import { createServer } from "./server.js";
import { SERVER_NAME } from "./constants.js";

async function main(): Promise<void> {
  // Guard: some dependencies (including cascade-cms-api on timeout) call
  // console.log. On Node/Bun that writes to stdout, which would corrupt
  // the MCP JSON-RPC stream served over stdio. Route all console output
  // to stderr before the first tool invocation.
  const stderrWrite = (...args: unknown[]): void => {
    process.stderr.write(args.map((a) => String(a)).join(" ") + "\n");
  };
  console.log = stderrWrite;
  console.info = stderrWrite;
  console.warn = stderrWrite;
  console.debug = stderrWrite;

  let config;
  try {
    config = await loadConfig();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[${SERVER_NAME}] ${sanitizeLogMessage(msg)}\n`);
    process.exit(1);
  }

  const client = createCascadeClient(config);
  const browserSession = createBrowserSession(config);
  const handle = serveStdio(
    () => createServer(client, {
      browserSession,
      cascadeUrl: config.url,
    }),
    {
      legacy: "serve",
      onerror: (error) => {
        process.stderr.write(
          `[${SERVER_NAME}] stdio: ${sanitizeLogMessage(error.message)}\n`,
        );
      },
    },
  );

  process.stderr.write(`[${SERVER_NAME}] started on stdio\n`);

  let shuttingDown = false;
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      await handle.close();
      process.exit(0);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(
        `[${SERVER_NAME}] fatal: ${sanitizeLogMessage(msg)}\n`,
      );
      process.exit(1);
    }
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`[${SERVER_NAME}] fatal: ${sanitizeLogMessage(msg)}\n`);
  process.exit(1);
});
