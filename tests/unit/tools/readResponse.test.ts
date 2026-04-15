/**
 * Tests for the `cascade_read_response` retrieval tool.
 *
 * The tool reads slices from the in-memory response cache populated by
 * oversize Cascade responses. It mints no new responses; it only reads
 * what other tools have stored.
 */

import { describe, test, expect } from "bun:test";
import { registerReadResponseTool } from "../../../src/tools/readResponse.js";
import { ReadResponseRequestSchema } from "../../../src/schemas/requests.js";
import { createResponseCache } from "../../../src/cache.js";
import { CHARACTER_LIMIT } from "../../../src/constants.js";
import {
  makeMockServer,
  findTool,
  firstText,
} from "../../fixtures/mock-server.js";

// -----------------------------------------------------------------------------
// Registration / annotations
// -----------------------------------------------------------------------------

describe("registerReadResponseTool: registration", () => {
  test("registers a tool named cascade_read_response", () => {
    const { server, tools } = makeMockServer();
    const cache = createResponseCache();

    registerReadResponseTool(server as any, { cache });

    expect(tools).toHaveLength(1);
    expect(tools[0]!.name).toBe("cascade_read_response");
  });

  test("uses readOnly/idempotent/non-destructive/non-openWorld annotations", () => {
    const { server, tools } = makeMockServer();
    const cache = createResponseCache();

    registerReadResponseTool(server as any, { cache });

    const tool = findTool(tools, "cascade_read_response");
    expect(tool.config.annotations.readOnlyHint).toBe(true);
    expect(tool.config.annotations.idempotentHint).toBe(true);
    expect(tool.config.annotations.destructiveHint).toBe(false);
    expect(tool.config.annotations.openWorldHint).toBe(false);
  });

  test("description mentions the tool name and has an Examples section", () => {
    const { server, tools } = makeMockServer();
    const cache = createResponseCache();

    registerReadResponseTool(server as any, { cache });

    const tool = findTool(tools, "cascade_read_response");
    expect(tool.config.description).toContain("cascade_read_response");
    expect(tool.config.description).toContain("Examples");
  });
});

// -----------------------------------------------------------------------------
// Happy path / slicing semantics
// -----------------------------------------------------------------------------

describe("cascade_read_response handler: happy path", () => {
  test("returns the first N chars of the cached payload as raw text (no JSON fence)", async () => {
    const { server, tools } = makeMockServer();
    const cache = createResponseCache();
    const fullText = "abcdefghij".repeat(50); // 500 chars
    const handle = cache.put("cascade_read", "markdown", fullText);

    registerReadResponseTool(server as any, { cache });

    const tool = findTool(tools, "cascade_read_response");
    const result = await tool.handler({
      handle,
      offset: 0,
      length: 100,
      response_format: "markdown",
    });

    const text = firstText(result);
    expect(text.startsWith("```")).toBe(false); // not JSON-fenced
    expect(text).toBe(fullText.slice(0, 100));

    const sc = result.structuredContent as Record<string, unknown>;
    expect(sc.handle).toBe(handle);
    expect(sc.bytes_total).toBe(fullText.length);
    expect(sc.offset).toBe(0);
    expect(sc.bytes_returned).toBe(100);
    expect(sc.has_more).toBe(true);
    expect(sc.next_offset).toBe(100);
  });

  test("supports reading a later contiguous chunk via offset", async () => {
    const { server, tools } = makeMockServer();
    const cache = createResponseCache();
    const fullText = "X".repeat(50) + "Y".repeat(50) + "Z".repeat(50); // 150 chars
    const handle = cache.put("cascade_read", "markdown", fullText);

    registerReadResponseTool(server as any, { cache });

    const tool = findTool(tools, "cascade_read_response");
    const result = await tool.handler({
      handle,
      offset: 50,
      length: 50,
      response_format: "markdown",
    });

    const text = firstText(result);
    expect(text).toBe("Y".repeat(50));
    const sc = result.structuredContent as Record<string, unknown>;
    expect(sc.has_more).toBe(true);
    expect(sc.next_offset).toBe(100);
    expect(sc.bytes_returned).toBe(50);
    // The slice text appears in content[0].text; structuredContent must NOT
    // duplicate it under `_slice_text` (private channel is stripped).
    expect(sc._slice_text).toBeUndefined();
  });

  test("slice exactly at end: has_more=false, no next_offset", async () => {
    const { server, tools } = makeMockServer();
    const cache = createResponseCache();
    const fullText = "q".repeat(100);
    const handle = cache.put("cascade_read", "markdown", fullText);

    registerReadResponseTool(server as any, { cache });

    const tool = findTool(tools, "cascade_read_response");
    const result = await tool.handler({
      handle,
      offset: 50,
      length: 50,
      response_format: "markdown",
    });

    const sc = result.structuredContent as Record<string, unknown>;
    expect(sc.bytes_returned).toBe(50);
    expect(sc.has_more).toBe(false);
    expect(sc.next_offset).toBeUndefined();
  });

  test("two sequential reads match the originating substrings", async () => {
    const { server, tools } = makeMockServer();
    const cache = createResponseCache();
    const fullText = Array.from({ length: 200 }, (_, i) =>
      String.fromCharCode(65 + (i % 26)),
    ).join("");
    const handle = cache.put("cascade_read", "markdown", fullText);

    registerReadResponseTool(server as any, { cache });

    const tool = findTool(tools, "cascade_read_response");
    const first = await tool.handler({
      handle,
      offset: 0,
      length: 50,
      response_format: "markdown",
    });
    const second = await tool.handler({
      handle,
      offset: 50,
      length: 50,
      response_format: "markdown",
    });

    expect(firstText(first)).toBe(fullText.slice(0, 50));
    expect(firstText(second)).toBe(fullText.slice(50, 100));
  });
});

// -----------------------------------------------------------------------------
// Boundary / clamping
// -----------------------------------------------------------------------------

describe("cascade_read_response handler: boundaries", () => {
  test("offset past end: bytes_returned=0, has_more=false, no next_offset", async () => {
    const { server, tools } = makeMockServer();
    const cache = createResponseCache();
    const fullText = "small"; // 5 chars
    const handle = cache.put("cascade_read", "markdown", fullText);

    registerReadResponseTool(server as any, { cache });

    const tool = findTool(tools, "cascade_read_response");
    const result = await tool.handler({
      handle,
      offset: 100,
      length: 25,
      response_format: "markdown",
    });

    // structuredContent is the authoritative contract for empty slices.
    const sc = result.structuredContent as Record<string, unknown>;
    expect(sc.bytes_returned).toBe(0);
    expect(sc.has_more).toBe(false);
    expect(sc.next_offset).toBeUndefined();
    // `_slice_text` is the handler's private channel to renderMarkdown and
    // is stripped from structuredContent before sending — agents only see
    // the slice in `content[0].text`, never duplicated here.
    expect(sc._slice_text).toBeUndefined();
  });
});

// -----------------------------------------------------------------------------
// Error: missing handle
// -----------------------------------------------------------------------------

describe("cascade_read_response handler: errors", () => {
  test("unknown handle produces isError with handle string and 'not found' in message", async () => {
    const { server, tools } = makeMockServer();
    const cache = createResponseCache();

    registerReadResponseTool(server as any, { cache });

    const tool = findTool(tools, "cascade_read_response");
    const result = await tool.handler({
      handle: "h_does-not-exist",
      offset: 0,
      length: 100,
      response_format: "markdown",
    });

    expect(result.isError).toBe(true);
    const text = firstText(result);
    expect(text).toContain("h_does-not-exist");
    expect(text.toLowerCase()).toContain("not found");
  });
});

// -----------------------------------------------------------------------------
// Schema validation
// -----------------------------------------------------------------------------

describe("ReadResponseRequestSchema", () => {
  test("accepts a valid request", () => {
    const res = ReadResponseRequestSchema.safeParse({
      handle: "h_abc",
      offset: 0,
      length: 1000,
    });
    expect(res.success).toBe(true);
  });

  test("rejects empty handle", () => {
    const res = ReadResponseRequestSchema.safeParse({ handle: "" });
    expect(res.success).toBe(false);
  });

  test("rejects negative offset", () => {
    const res = ReadResponseRequestSchema.safeParse({
      handle: "h_abc",
      offset: -1,
    });
    expect(res.success).toBe(false);
  });

  test(`rejects length greater than CHARACTER_LIMIT (${CHARACTER_LIMIT})`, () => {
    const res = ReadResponseRequestSchema.safeParse({
      handle: "h_abc",
      length: CHARACTER_LIMIT + 1,
    });
    expect(res.success).toBe(false);
  });

  test("applies default offset=0 and length=CHARACTER_LIMIT when omitted", () => {
    const res = ReadResponseRequestSchema.safeParse({ handle: "h_abc" });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.offset).toBe(0);
      expect(res.data.length).toBe(CHARACTER_LIMIT);
    }
  });
});
