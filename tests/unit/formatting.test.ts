import { describe, test, expect } from "bun:test";
import { formatResponse, type ResponseFormat } from "../../src/formatting.js";
import { CHARACTER_LIMIT } from "../../src/constants.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/** Narrow the first content block to a text block (TS-safe accessor). */
function firstText(r: CallToolResult): string {
  const block = r.content[0];
  if (!block || block.type !== "text") {
    throw new Error("Expected first content block to be of type 'text'");
  }
  return block.text;
}

describe("formatResponse", () => {
  test("should produce markdown text containing the tool name and 'succeeded' for a success OperationResult", () => {
    const result = { success: true };

    const out = formatResponse(result, "markdown" as ResponseFormat, "cascade_read");

    const text = firstText(out);
    expect(text).toContain("cascade_read");
    expect(text.toLowerCase()).toContain("succeeded");
  });

  test("should produce valid JSON text when format=json and round-trip equal to input", () => {
    const result = { success: true, foo: 42, nested: { a: [1, 2, 3] } };

    const out = formatResponse(result, "json", "tool");

    const text = firstText(out);
    // Must be valid JSON
    const parsed = JSON.parse(text);
    expect(parsed).toEqual(result);
  });

  test("should set structuredContent to the raw result object for simple objects", () => {
    const result = { success: true, id: "abc" };

    const out = formatResponse(result, "markdown", "tool");

    expect(out.structuredContent).toEqual(result);
  });

  test("should set structuredContent to {} for null input", () => {
    const out = formatResponse(null, "markdown", "tool");

    expect(out.structuredContent).toEqual({});
  });

  test("should set structuredContent to {} for undefined input", () => {
    const out = formatResponse(undefined, "json", "tool");

    expect(out.structuredContent).toEqual({});
  });

  test("should render a markdown table with '|' separators for search-style {success,matches} results", () => {
    const result = {
      success: true,
      matches: [
        { id: "x", type: "page", path: { path: "/foo" } },
        { id: "y", type: "file", path: { path: "/bar" } },
      ],
    };

    const out = formatResponse(result, "markdown", "cascade_search");

    const text = firstText(out);
    expect(text).toContain("|");
  });

  test("should truncate text in json mode when the result stringifies to more than CHARACTER_LIMIT, but keep structuredContent complete", () => {
    const big = { success: true, items: Array.from({ length: 3000 }, (_, i) => ({ i, v: "payload-" + i })) };

    const out = formatResponse(big, "json", "tool");

    const text = firstText(out);
    expect(text.length).toBeLessThanOrEqual(CHARACTER_LIMIT + 200); // allow for truncation marker
    expect(text).toContain("truncated");
    // structuredContent is NEVER truncated
    expect(out.structuredContent).toEqual(big);
  });

  test("should truncate text in markdown mode for a huge array with truncation marker present", () => {
    const big = {
      success: true,
      matches: Array.from({ length: 3000 }, (_, i) => ({
        id: "id-" + i,
        type: "page",
        path: { path: "/p/" + i },
      })),
    };

    const out = formatResponse(big, "markdown", "cascade_search");

    const text = firstText(out);
    expect(text).toContain("truncated");
    // structuredContent intact
    expect(out.structuredContent).toEqual(big);
  });

  test("should use the renderMarkdown override when provided in markdown mode", () => {
    const result = { success: true };
    const override = (_r: unknown) => "CUSTOM-MARKDOWN-OUTPUT";

    const out = formatResponse(result, "markdown", "tool", override);

    const text = firstText(out);
    expect(text).toBe("CUSTOM-MARKDOWN-OUTPUT");
  });

  test("should NOT use the renderMarkdown override in json mode", () => {
    const result = { success: true };
    const override = (_r: unknown) => "CUSTOM-MARKDOWN-OUTPUT";

    const out = formatResponse(result, "json", "tool", override);

    const text = firstText(out);
    // Should be JSON, not the override
    expect(() => JSON.parse(text)).not.toThrow();
    expect(text).not.toContain("CUSTOM-MARKDOWN-OUTPUT");
  });

  test("should never produce an empty text block, even for null input", () => {
    const cases: unknown[] = [null, undefined, {}, { success: true }];

    for (const c of cases) {
      for (const fmt of ["markdown", "json"] as const) {
        const out = formatResponse(c, fmt, "tool");
        const text = firstText(out);
        expect(text.length).toBeGreaterThan(0);
      }
    }
  });

  test("should always return content[0] with type === 'text'", () => {
    const cases: unknown[] = [
      null,
      undefined,
      { success: true },
      { success: true, matches: [{ id: "a", type: "page", path: { path: "/" } }] },
      "string result",
      42,
    ];

    for (const c of cases) {
      for (const fmt of ["markdown", "json"] as const) {
        const out = formatResponse(c, fmt, "tool");
        expect(out.content[0]?.type).toBe("text");
      }
    }
  });
});
