#!/usr/bin/env node
/**
 * Node-runtime smoke test for the compiled dist/index.js.
 *
 * Spawns separate server processes for legacy and modern MCP because one
 * stdio connection is pinned to a single protocol era.
 */

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const TIMEOUT_MS = 8000;
const EXPECTED_BANNER = "started on stdio";
const WRAPPER_ARG = "--server-wrapper";
const SMOKE_SCRIPT = fileURLToPath(import.meta.url);
const LEGACY_PROTOCOL_VERSION = "2025-11-25";
const MODERN_PROTOCOL_VERSION = "2026-07-28";
const MODERN_META = {
  "io.modelcontextprotocol/protocolVersion": MODERN_PROTOCOL_VERSION,
  "io.modelcontextprotocol/clientInfo": {
    name: "cascade-cms-mcp-server-smoke",
    version: "0.0.0",
  },
  "io.modelcontextprotocol/clientCapabilities": {},
};

if (process.argv.includes(WRAPPER_ARG)) {
  process.on("message", (signal) => {
    if (signal === "SIGINT" || signal === "SIGTERM") process.emit(signal);
  });
  await import("../dist/index.js");
} else {
  await runSmokeSuite();
}

async function runSmokeSuite() {
  const results = await Promise.allSettled([
    runServerSmoke({ era: "legacy", shutdownSignal: "SIGINT" }),
    runServerSmoke({ era: "modern", shutdownSignal: "SIGTERM" }),
    runServerSmoke({ era: "fallback", shutdownSignal: "SIGINT" }),
    runServerSmoke({ era: "invalid", shutdownSignal: "SIGTERM" }),
  ]);
  const failures = results
    .filter((result) => result.status === "rejected")
    .map((result) => result.reason instanceof Error
      ? result.reason.message
      : String(result.reason));
  if (failures.length > 0) {
    throw new Error(failures.join("\n"));
  }

  console.log(
    "[smoke] PASS: node dist/index.js completed legacy and modern MCP stdio checks",
  );
}

async function runServerSmoke({ era, shutdownSignal }) {
  const useIpcWrapper = process.platform === "win32";
  const child = spawn(
    "node",
    useIpcWrapper ? [SMOKE_SCRIPT, WRAPPER_ARG] : ["dist/index.js"],
    {
      env: {
        ...process.env,
        CASCADE_API_KEY: "smoke-test-key",
        CASCADE_URL: "https://127.0.0.1:9/api/v1/",
        CASCADE_BROWSER_URL: "https://127.0.0.1:9/",
        CASCADE_BROWSER_USERNAME: "smoke-user",
        CASCADE_BROWSER_PASSWORD: "smoke-password",
        CASCADE_BROWSER_SITE_ID: "site-123",
      },
      stdio: useIpcWrapper
        ? ["pipe", "pipe", "pipe", "ipc"]
        : ["pipe", "pipe", "pipe"],
    },
  );

  let stdoutBuffer = "";
  let stderrText = "";
  let nextId = 1;
  let shuttingDown = false;
  const pending = new Map();
  let resolveBanner;
  const bannerPromise = new Promise((resolve) => {
    resolveBanner = resolve;
  });
  const stdioClosedPromise = new Promise((resolve) =>
    child.on("close", resolve)
  );

  const exitPromise = new Promise((resolve, reject) => {
    child.on("error", (error) => reject(new Error(`spawn error: ${error.message}`)));
    child.on("exit", (code, signal) => {
      if (!shuttingDown) {
        reject(
          new Error(
            `server exited before smoke completed: code=${code} signal=${signal}`,
          ),
        );
        return;
      }
      resolve({ code, signal });
    });
  });

  child.stdout.on("data", (chunk) => {
    stdoutBuffer += chunk.toString("utf8");
    drainStdout();
  });
  child.stderr.on("data", (chunk) => {
    stderrText += chunk.toString("utf8");
    if (stderrText.includes(EXPECTED_BANNER)) resolveBanner();
  });
  child.stdin.on("error", (error) => {
    if (!shuttingDown) rejectPending(new Error(`stdin error: ${error.message}`));
  });

  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      reject(
        new Error(
          `timed out after ${TIMEOUT_MS}ms. Captured stderr: ${stderrText.slice(0, 500)}`,
        ),
      );
    }, TIMEOUT_MS).unref();
  });

  try {
    await Promise.race([runProtocolChecks(), exitPromise, timeoutPromise]);
    await Promise.race([bannerPromise, exitPromise, timeoutPromise]);
    assert(
      !/browser login (?:succeeded|skipped)/i.test(stderrText),
      "startup did not attempt browser login",
    );

    shuttingDown = true;
    await sendShutdownSignal();
    const exit = await Promise.race([exitPromise, timeoutPromise]);
    assert(
      exit.code === 0 && exit.signal === null,
      `${shutdownSignal} was handled and exited with code 0`,
    );
    await Promise.race([stdioClosedPromise, timeoutPromise]);
    if (era === "invalid") assertSanitizedStdioError(stderrText);
  } catch (error) {
    shuttingDown = true;
    child.kill("SIGKILL");
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${era} smoke failed: ${message}`);
  }

  function sendShutdownSignal() {
    if (!useIpcWrapper) {
      assert(child.kill(shutdownSignal), `sent ${shutdownSignal}`);
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      child.send(shutdownSignal, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  async function runProtocolChecks() {
    if (era === "legacy") {
      const result = await sendRequest("initialize", {
        protocolVersion: LEGACY_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "cascade-cms-mcp-server-smoke", version: "0.0.0" },
      });
      assert(result && typeof result === "object", "initialize returned an object");
      assert(
        result.protocolVersion === LEGACY_PROTOCOL_VERSION,
        `initialize negotiated ${LEGACY_PROTOCOL_VERSION}`,
      );
      sendNotification("notifications/initialized");
    } else if (era === "modern") {
      const result = await sendRequest("server/discover", {}, { modern: true });
      assert(
        Array.isArray(result?.supportedVersions),
        "server/discover returned supportedVersions",
      );
      assert(
        result.supportedVersions.includes(MODERN_PROTOCOL_VERSION),
        `server/discover included ${MODERN_PROTOCOL_VERSION}`,
      );
      assertWireMetadata(result, "modern", "server/discover");
    } else if (era === "fallback") {
      const discovery = await sendRequest(
        "server/discover",
        {},
        { modern: true },
      );
      assertWireMetadata(discovery, "modern", "fallback server/discover");

      const initialized = await sendRequest("initialize", {
        protocolVersion: LEGACY_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "cascade-cms-mcp-server-smoke", version: "0.0.0" },
      });
      assert(
        initialized.protocolVersion === LEGACY_PROTOCOL_VERSION,
        "legacy initialize succeeded after modern discovery probe",
      );
      sendNotification("notifications/initialized");
    } else {
      const hostileVersion =
        `unsupported\n\u001b[31m token=sk-abcdef123456 ${"x".repeat(1000)}\u202e`;
      const error = await sendRequest(
        "server/discover",
        {},
        {
          acceptError: true,
          meta: {
            ...MODERN_META,
            "io.modelcontextprotocol/protocolVersion": hostileVersion,
          },
        },
      );
      assert(error.code === -32022, "unsupported protocol returned -32022");
      return;
    }

    await Promise.all([
      sendRequest("tools/list", {}).then((result) => assertToolsList(result, era)),
      sendRequest("tools/call", {
        name: "server_version",
        arguments: {},
      }).then((result) => assertServerVersionCall(result, era)),
      sendRequest("resources/list", {}).then((result) =>
        assertResourcesList(result, era)
      ),
      sendRequest("resources/templates/list", {}).then((result) =>
        assertResourceTemplatesList(result, era)
      ),
      sendRequest("resources/read", { uri: "cascade://entity-types" }).then(
        (result) => assertEntityTypesResource(result, era),
      ),
    ]);

    if (era === "modern") {
      const error = await sendRequest(
        "tools/list",
        {},
        { acceptError: true, modern: false },
      );
      assert(error.code === -32602, "missing modern envelope returned -32602");
    }
  }

  function sendRequest(method, params, options = {}) {
    const id = nextId++;
    const modern = options.modern ?? era === "modern";
    const requestParams = options.meta
      ? { ...params, _meta: options.meta }
      : modern
      ? { ...params, _meta: MODERN_META }
      : params;
    const response = new Promise((resolve, reject) => {
      pending.set(id, {
        acceptError: options.acceptError === true,
        method,
        resolve,
        reject,
      });
    });
    writeMessage({ jsonrpc: "2.0", id, method, params: requestParams });
    return response;
  }

  function sendNotification(method, params = {}) {
    writeMessage({ jsonrpc: "2.0", method, params });
  }

  function writeMessage(message) {
    child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  function drainStdout() {
    let newlineIndex = stdoutBuffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = stdoutBuffer.slice(0, newlineIndex).trim();
      stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
      if (line) handleStdoutLine(line);
      newlineIndex = stdoutBuffer.indexOf("\n");
    }
  }

  function handleStdoutLine(line) {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      rejectPending(new Error(`stdout line was not JSON: ${line.slice(0, 200)}`));
      return;
    }

    if (!Object.hasOwn(message, "id")) return;
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);

    if (message.error) {
      if (entry.acceptError) {
        entry.resolve(message.error);
        return;
      }
      entry.reject(
        new Error(
          `${entry.method} returned error: ${JSON.stringify(message.error)}`,
        ),
      );
      return;
    }
    entry.resolve(message.result);
  }

  function rejectPending(error) {
    for (const entry of pending.values()) entry.reject(error);
    pending.clear();
  }
}

function assertToolsList(result, era) {
  assert(Array.isArray(result?.tools), "tools/list returned tools array");
  assert(
    result.tools.some((tool) => tool.name === "server_version"),
    "tools/list included server_version",
  );
  assert(
    result.tools.every((tool) => !String(tool.name).startsWith("cascade_")),
    "tools/list omitted cascade_ tool prefixes",
  );
  assertWireMetadata(result, era, "tools/list");
}

function assertServerVersionCall(result, era) {
  assert(Array.isArray(result?.content), "tools/call returned content array");
  assert(
    result?.structuredContent?.name === "cascade-cms-mcp-server",
    "tools/call returned server metadata",
  );
  assertWireMetadata(result, era, "tools/call");
}

function assertResourcesList(result, era) {
  assert(Array.isArray(result?.resources), "resources/list returned resources array");
  assert(
    result.resources.some((resource) => resource.uri === "cascade://entity-types"),
    "resources/list included cascade://entity-types",
  );
  assertWireMetadata(result, era, "resources/list");
}

function assertResourceTemplatesList(result, era) {
  assert(
    Array.isArray(result?.resourceTemplates),
    "resources/templates/list returned resourceTemplates array",
  );
  assert(
    result.resourceTemplates.some((template) =>
      String(template.uriTemplate).includes("cascade://asset/{handle}/raw")
    ),
    "resources/templates/list included asset raw template",
  );
  assertWireMetadata(result, era, "resources/templates/list");
}

function assertEntityTypesResource(result, era) {
  assert(Array.isArray(result?.contents), "resources/read returned contents array");
  const first = result.contents[0];
  assert(first?.uri === "cascade://entity-types", "resources/read returned entity-types");
  assert(typeof first.text === "string", "entity-types content was text");
  const body = JSON.parse(first.text);
  assert(Array.isArray(body.entityTypes), "entity-types body contained entityTypes");
  assert(body.entityTypes.some((entry) => entry.type === "page"), "entity-types included page");
  assertWireMetadata(result, era, "resources/read");
}

function assertWireMetadata(result, era, method) {
  if (era === "modern") {
    assert(result.resultType === "complete", `${method} returned resultType`);
    assert(
      result?._meta?.["io.modelcontextprotocol/serverInfo"]?.name ===
        "cascade-cms-mcp-server",
      `${method} returned serverInfo metadata`,
    );
    return;
  }

  assert(!Object.hasOwn(result, "resultType"), `${method} omitted resultType`);
  assert(
    result?._meta?.["io.modelcontextprotocol/serverInfo"] === undefined,
    `${method} omitted serverInfo metadata`,
  );
}

function assertSanitizedStdioError(stderrText) {
  const lines = stderrText.split(/\r?\n/).filter(Boolean);
  assert(lines.length === 2, "unsupported protocol produced two stderr records");
  const stdioLine = lines.find((line) => line.includes("] stdio:"));
  assert(typeof stdioLine === "string", "unsupported protocol logged stdio error");
  assert(!stdioLine.includes("sk-abcdef123456"), "stdio error redacted secrets");
  assert(stdioLine.length < 650, "stdio error was length-bounded");
  assert(
    !/[\u0000-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/.test(stdioLine),
    "stdio error omitted control characters",
  );
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
