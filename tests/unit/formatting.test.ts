import { describe, test, expect } from "bun:test";
import { formatResponse, type ResponseFormat } from "../../src/formatting.js";
import { createResponseCache } from "../../src/cache.js";
import { CHARACTER_LIMIT, PREVIEW_LIMIT } from "../../src/constants.js";
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

  // -------------------------------------------------------------------------
  // Oversize response → handle minting (cache provided)
  // -------------------------------------------------------------------------

  /** Build a result whose markdown renders well over CHARACTER_LIMIT. */
  function makeOversizeMatches(n: number) {
    return {
      success: true,
      matches: Array.from({ length: n }, (_, i) => ({
        id: "id-" + i,
        type: "page",
        path: { path: "/p/" + i },
      })),
    };
  }

  test("should cap preview text near PREVIEW_LIMIT when cache provided and result oversize (markdown)", () => {
    const cache = createResponseCache();
    const big = makeOversizeMatches(3000);

    const out = formatResponse(big, "markdown", "cascade_search", undefined, {
      cache,
    });

    const text = firstText(out);
    expect(text.length).toBeLessThanOrEqual(PREVIEW_LIMIT + 600);
    expect(text).toContain("cascade_read_response");
    expect(text).toMatch(/h_[a-z0-9-]+/);
  });

  test("should include the same handle in text and in structuredContent._cache", () => {
    const cache = createResponseCache();
    const big = makeOversizeMatches(3000);

    const out = formatResponse(big, "markdown", "cascade_search", undefined, {
      cache,
    });

    const text = firstText(out);
    const match = text.match(/h_[a-z0-9-]+/);
    expect(match).not.toBeNull();
    const handleInText = match![0];

    const structured = out.structuredContent as Record<string, unknown>;
    const envelope = structured._cache as Record<string, unknown>;
    expect(envelope.handle).toBe(handleInText);
  });

  test("should set _cache.bytes_total to the rendered fullText length when oversize", () => {
    const cache = createResponseCache();
    const big = makeOversizeMatches(3000);

    const out = formatResponse(big, "markdown", "cascade_search", undefined, {
      cache,
    });

    const structured = out.structuredContent as Record<string, unknown>;
    const envelope = structured._cache as Record<string, unknown>;

    // Retrieve the cached full text through the cache to confirm lengths line up.
    const handle = envelope.handle as string;
    const entry = cache.get(handle)!;
    expect(envelope.bytes_total).toBe(entry.fullText.length);
  });

  test("should set _cache.bytes_returned to PREVIEW_LIMIT when oversize", () => {
    const cache = createResponseCache();
    const big = makeOversizeMatches(3000);

    const out = formatResponse(big, "markdown", "cascade_search", undefined, {
      cache,
    });

    const structured = out.structuredContent as Record<string, unknown>;
    const envelope = structured._cache as Record<string, unknown>;
    expect(envelope.bytes_returned).toBe(PREVIEW_LIMIT);
  });

  test("should set _cache.tool to 'cascade_read_response' when minting handle", () => {
    const cache = createResponseCache();
    const big = makeOversizeMatches(3000);

    const out = formatResponse(big, "markdown", "cascade_search", undefined, {
      cache,
    });

    const structured = out.structuredContent as Record<string, unknown>;
    const envelope = structured._cache as Record<string, unknown>;
    expect(envelope.tool).toBe("cascade_read_response");
  });

  test("should retain all original keys in structuredContent alongside _cache envelope", () => {
    const cache = createResponseCache();
    const big = makeOversizeMatches(3000);

    const out = formatResponse(big, "markdown", "cascade_search", undefined, {
      cache,
    });

    const structured = out.structuredContent as Record<string, unknown>;
    expect(structured.success).toBe(true);
    expect(Array.isArray(structured.matches)).toBe(true);
    expect((structured.matches as unknown[]).length).toBe(3000);
    expect(structured._cache).toBeDefined();
  });

  test("should fall back to legacy truncation marker when no cache is provided (back-compat)", () => {
    const big = makeOversizeMatches(3000);

    const out = formatResponse(big, "markdown", "cascade_search"); // no options

    const text = firstText(out);
    expect(text).toContain("truncated");
    expect(text).not.toContain("cascade_read_response");
    const structured = out.structuredContent as Record<string, unknown>;
    expect(structured._cache).toBeUndefined();
  });

  test("should not touch cache or add _cache envelope when text fits under CHARACTER_LIMIT", () => {
    const cache = createResponseCache();
    const small = { success: true, id: "abc" };

    const sizeBefore = cache.size();
    const out = formatResponse(small, "markdown", "tool", undefined, { cache });
    const sizeAfter = cache.size();

    expect(sizeAfter).toBe(sizeBefore);
    const structured = out.structuredContent as Record<string, unknown>;
    expect(structured._cache).toBeUndefined();
  });

  test("should mint handle for oversize JSON when cache provided", () => {
    const cache = createResponseCache();
    const big = makeOversizeMatches(3000);

    const out = formatResponse(big, "json", "cascade_search", undefined, {
      cache,
    });

    const text = firstText(out);
    expect(text).toContain("cascade_read_response");
    expect(text).toMatch(/h_[a-z0-9-]+/);
    const structured = out.structuredContent as Record<string, unknown>;
    expect(structured._cache).toBeDefined();
  });

  test("should not mint a handle for null or undefined results even when cache is provided", () => {
    const cache = createResponseCache();

    const outNull = formatResponse(null, "markdown", "tool", undefined, {
      cache,
    });
    const outUndef = formatResponse(undefined, "json", "tool", undefined, {
      cache,
    });

    expect(outNull.structuredContent).toEqual({});
    expect(outUndef.structuredContent).toEqual({});
    expect(cache.size()).toBe(0);
  });
});
