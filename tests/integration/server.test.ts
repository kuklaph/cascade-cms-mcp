/**
 * Integration test for the server factory (`createServer`).
 *
 * Verifies that all 9 tool cohorts wire up correctly and produce
 * the expected 25 tools with well-formed names. Also exercises one
 * end-to-end handler invocation (`cascade_read`) through the real
 * pipeline that `registerCascadeTool` installs on the server.
 */

import { describe, test, expect, mock } from "bun:test";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { createServer } from "../../src/server.js";
import { createMockClient } from "../fixtures/mock-client.js";
import { READ_PAGE_OK } from "../fixtures/cascade-responses.js";

/**
 * Extract the runtime `_registeredTools` map from an `McpServer`.
 *
 * The SDK stores each `server.registerTool(name, config, cb)` under
 * `server._registeredTools[name]` as `{ title, description, inputSchema,
 * annotations, handler, ... }`. TypeScript flags `_registeredTools` as
 * private, but it's a plain runtime property on the instance.
 */
function getRegisteredTools(server: unknown): Record<string, {
  handler: (input: Record<string, unknown>) => Promise<CallToolResult>;
  annotations: { readOnlyHint?: boolean };
}> {
  return (server as { _registeredTools: Record<string, any> })._registeredTools;
}

/** All 25 expected tool names, one per cohort. */
const EXPECTED_TOOL_NAMES = [
  // crud (6)
  "cascade_read",
  "cascade_create",
  "cascade_edit",
  "cascade_remove",
  "cascade_move",
  "cascade_copy",
  // search (1)
  "cascade_search",
  // sites (2)
  "cascade_list_sites",
  "cascade_site_copy",
  // access (2)
  "cascade_read_access_rights",
  "cascade_edit_access_rights",
  // workflow (4)
  "cascade_read_workflow_settings",
  "cascade_edit_workflow_settings",
  "cascade_read_workflow_information",
  "cascade_perform_workflow_transition",
  // messages (4)
  "cascade_list_subscribers",
  "cascade_list_messages",
  "cascade_mark_message",
  "cascade_delete_message",
  // checkout (2)
  "cascade_check_out",
  "cascade_check_in",
  // audits (3)
  "cascade_read_audits",
  "cascade_read_preferences",
  "cascade_edit_preference",
  // publish (1)
  "cascade_publish_unpublish",
];

describe("createServer (server factory)", () => {
  test("registers exactly 25 tools", () => {
    const client = createMockClient();
    const server = createServer(client);
    const tools = getRegisteredTools(server);

    expect(Object.keys(tools)).toHaveLength(25);
  });

  test("all tool names use snake_case with cascade_ prefix", () => {
    const client = createMockClient();
    const server = createServer(client);
    const tools = getRegisteredTools(server);

    const namePattern = /^cascade_[a-z]+(?:_[a-z]+)*$/;
    for (const name of Object.keys(tools)) {
      expect(name).toMatch(namePattern);
    }
  });

  test("no duplicate tool names are registered", () => {
    const client = createMockClient();
    const server = createServer(client);
    const tools = getRegisteredTools(server);

    const names = Object.keys(tools);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
    expect(unique.size).toBe(25);
  });

  test("every expected tool from each cohort is present", () => {
    const client = createMockClient();
    const server = createServer(client);
    const tools = getRegisteredTools(server);
    const registered = new Set(Object.keys(tools));

    for (const expected of EXPECTED_TOOL_NAMES) {
      expect(registered.has(expected)).toBe(true);
    }
  });

  test("cascade_read handler invokes client.read and returns formatted result", async () => {
    const client = createMockClient({
      read: mock(() => Promise.resolve(READ_PAGE_OK)),
    });
    const server = createServer(client);
    const tools = getRegisteredTools(server);

    const readTool = tools["cascade_read"];
    expect(readTool).toBeDefined();

    const result = await readTool.handler({
      identifier: { id: "abc", type: "page" },
      response_format: "markdown",
    });

    // client.read should have been called once with response_format stripped.
    expect(client.read).toHaveBeenCalledTimes(1);
    expect(client.read.mock.calls[0][0]).toEqual({
      identifier: { id: "abc", type: "page" },
    });

    // The registerCascadeTool pipeline formats the response: expect both
    // content (text blocks) and structuredContent (raw operation result).
    expect(result.content).toBeDefined();
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.structuredContent).toEqual(READ_PAGE_OK);
  });
});
