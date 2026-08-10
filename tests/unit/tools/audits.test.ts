import { describe, test, expect, mock } from "bun:test";
import type { ToolAnnotations, CallToolResult } from "@modelcontextprotocol/server";
import { registerAuditTools } from "../../../src/tools/audits.js";
import {
  ReadAuditsRequestSchema,
  ReadPreferencesRequestSchema,
  EditPreferenceRequestSchema,
} from "../../../src/schemas/requests.js";
import { createMockClient } from "../../fixtures/mock-client.js";
import {
  makeMockServer,
  findTool,
  firstText,
} from "../../fixtures/mock-server.js";
import { OK_RESULT } from "../../fixtures/cascade-responses.js";


// -----------------------------------------------------------------------------
// Fixtures
// -----------------------------------------------------------------------------

const AUDITS_OK = {
  success: true,
  audits: [
    { action: "login", userName: "sample-user-1" },
    { action: "edit", userName: "sample-user-2" },
  ],
} as const;

const PREFERENCES_OK = {
  success: true,
  preferences: [
    { name: "system_site_name", value: "My Site" },
    { name: "system_default_access", value: "read" },
  ],
} as const;

// =============================================================================
// api_read_audits
// =============================================================================

describe("api_read_audits tool", () => {
  test("happy path: calls client.readAudits (without pagination args) and returns paginated response", async () => {
    const { server, tools } = makeMockServer();
    const client = createMockClient({
      readAudits: mock(() => Promise.resolve(AUDITS_OK)),
    });

    registerAuditTools(server as any, client);

    const tool = findTool(tools, "api_read_audits");
    expect(tool.config.annotations.readOnlyHint).toBe(true);
    expect(tool.config.annotations.destructiveHint).toBe(false);
    expect(tool.config.annotations.idempotentHint).toBe(true);
    expect(tool.config.annotations.openWorldHint).toBe(true);

    const identifier = {
      type: "page",
      id: "asset-123",
    };
    const auditParameters = {
      auditType: "edit",
      startDate: "Jul 1, 2026 12:00:00 AM",
      endDate: "Aug 5, 2026 11:59:59 PM",
    };
    const result = await tool.handler({
      identifier,
      auditParameters,
      limit: 25,
      offset: 0,
    });

    expect(client.readAudits).toHaveBeenCalledTimes(1);
    expect(client.readAudits.mock.calls[0][0]).toEqual({
      identifier,
      auditParameters,
    });
    expect(result.isError).not.toBe(true);

    const sc = result.structuredContent as Record<string, unknown>;
    expect(sc.success).toBe(true);
    expect(sc.audits).toEqual(AUDITS_OK.audits);
    expect(sc.total).toBe(AUDITS_OK.audits.length);
    expect(sc.count).toBe(AUDITS_OK.audits.length);
    expect(sc.offset).toBe(0);
    expect(sc.has_more).toBe(false);
  });

  test("applies default limit/offset when caller omits them", async () => {
    const { server, tools } = makeMockServer();
    const client = createMockClient({
      readAudits: mock(() => Promise.resolve(AUDITS_OK)),
    });

    registerAuditTools(server as any, client);
    const tool = findTool(tools, "api_read_audits");

    const auditParameters = { username: "sample-user" };
    const result = await tool.handler({ auditParameters });

    expect(client.readAudits.mock.calls[0][0]).toEqual({ auditParameters });
    const sc = result.structuredContent as Record<string, unknown>;
    expect(sc.offset).toBe(0);
    expect(sc.count).toBe(AUDITS_OK.audits.length);
    expect(sc.has_more).toBe(false);
  });

  test("slices audits with has_more=true when result larger than limit", async () => {
    const bigAudits = Array.from({ length: 8 }, (_, i) => ({
      action: "edit",
      userName: `u-${i}`,
    }));
    const { server, tools } = makeMockServer();
    const client = createMockClient({
      readAudits: mock(() =>
        Promise.resolve({ success: true, audits: bigAudits }),
      ),
    });

    registerAuditTools(server as any, client);
    const tool = findTool(tools, "api_read_audits");

    const result = await tool.handler({
      auditParameters: { groupname: "sample-group" },
      limit: 3,
      offset: 1,
    });

    const sc = result.structuredContent as Record<string, unknown>;
    expect((sc.audits as unknown[]).length).toBe(3);
    expect(sc.total).toBe(8);
    expect(sc.count).toBe(3);
    expect(sc.offset).toBe(1);
    expect(sc.has_more).toBe(true);
    expect(sc.next_offset).toBe(4);
  });

  test("schema validation: accepts an asset target without auditParameters", () => {
    const parsed = ReadAuditsRequestSchema.safeParse({
      identifier: { type: "page", id: "asset-123" },
    });
    expect(parsed.success).toBe(true);
  });

  test("schema validation: rejects filters without a target", () => {
    const parsed = ReadAuditsRequestSchema.safeParse({
      auditParameters: { auditType: "edit" },
    });
    expect(parsed.success).toBe(false);
  });

  test("description documents the REST-specific target and date shapes", () => {
    const { server, tools } = makeMockServer();
    const client = createMockClient();

    registerAuditTools(server as any, client);
    const description = findTool(tools, "api_read_audits").config.description;

    expect(description).toContain("top-level");
    expect(description).toContain("Jul 1, 2026 12:00:00 AM");
    expect(description).not.toContain("2026-04-13T00:00:00Z");
  });

  test("library throws: returns isError result via translateError", async () => {
    const { server, tools } = makeMockServer();
    const client = createMockClient({
      readAudits: mock(() =>
        Promise.reject(new Error("Request Failed. Request Response: Forbidden")),
      ),
    });

    registerAuditTools(server as any, client);
    const tool = findTool(tools, "api_read_audits");

    const result = await tool.handler({
      auditParameters: { rolename: "sample-role" },
    });

    expect(result.isError).toBe(true);
    const text = firstText(result);
    expect(text).toContain("api_read_audits");
    expect(text).toContain("Forbidden");
  });
});

// =============================================================================
// api_read_preferences
// =============================================================================

describe("api_read_preferences tool", () => {
  test("happy path: calls client.readPreferences and returns success response", async () => {
    const { server, tools } = makeMockServer();
    const client = createMockClient({
      readPreferences: mock(() => Promise.resolve(PREFERENCES_OK)),
    });

    registerAuditTools(server as any, client);
    const tool = findTool(tools, "api_read_preferences");

    expect(tool.config.annotations.readOnlyHint).toBe(true);
    expect(tool.config.annotations.destructiveHint).toBe(false);
    expect(tool.config.annotations.idempotentHint).toBe(true);
    expect(tool.config.annotations.openWorldHint).toBe(true);

    const result = await tool.handler({});

    expect(client.readPreferences).toHaveBeenCalledTimes(1);
    expect(client.readPreferences.mock.calls[0][0]).toEqual({});
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toEqual(PREFERENCES_OK);
  });

  test("schema validation: accepts empty body (no required fields)", () => {
    const parsed = ReadPreferencesRequestSchema.safeParse({});
    expect(parsed.success).toBe(true);
  });

  test("library throws: returns isError response", async () => {
    const { server, tools } = makeMockServer();
    const client = createMockClient({
      readPreferences: mock(() =>
        Promise.reject(new Error("Request Failed. Request Response: Unauthorized")),
      ),
    });

    registerAuditTools(server as any, client);
    const tool = findTool(tools, "api_read_preferences");

    const result = await tool.handler({});

    expect(result.isError).toBe(true);
    expect(firstText(result)).toContain("api_read_preferences");
  });
});

// =============================================================================
// api_edit_preference
// =============================================================================

describe("api_edit_preference tool", () => {
  test("happy path: calls client.editPreference with preference body", async () => {
    const { server, tools } = makeMockServer();
    const client = createMockClient({
      editPreference: mock(() => Promise.resolve(OK_RESULT)),
    });

    registerAuditTools(server as any, client);
    const tool = findTool(tools, "api_edit_preference");

    expect(tool.config.annotations.readOnlyHint).toBe(false);
    expect(tool.config.annotations.destructiveHint).toBe(false);
    expect(tool.config.annotations.idempotentHint).toBe(false);
    expect(tool.config.annotations.openWorldHint).toBe(true);

    const preference = {
      name: "system_default_access",
      value: "write",
    };
    const result = await tool.handler({
      preference,
    });

    expect(client.editPreference).toHaveBeenCalledTimes(1);
    expect(client.editPreference.mock.calls[0][0]).toEqual({ preference });
    expect(result.isError).not.toBe(true);
  });

  test("schema validation: rejects missing preference", () => {
    const parsed = EditPreferenceRequestSchema.safeParse({});
    expect(parsed.success).toBe(false);
  });

  test("library throws: returns isError response", async () => {
    const { server, tools } = makeMockServer();
    const client = createMockClient({
      editPreference: mock(() =>
        Promise.reject(new Error("Request Failed. Request Response: Invalid Preference")),
      ),
    });

    registerAuditTools(server as any, client);
    const tool = findTool(tools, "api_edit_preference");

    const result = await tool.handler({
      preference: { name: "unknown", value: "x" },
    });

    expect(result.isError).toBe(true);
    expect(firstText(result)).toContain("api_edit_preference");
  });
});

// =============================================================================
// Registration coverage: all 3 audit tools registered
// =============================================================================

describe("registerAuditTools coverage", () => {
  test("registers all 3 audit tools", () => {
    const { server, tools } = makeMockServer();
    const client = createMockClient();

    registerAuditTools(server as any, client);

    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([
      "api_edit_preference",
      "api_read_audits",
      "api_read_preferences",
    ]);
  });
});
