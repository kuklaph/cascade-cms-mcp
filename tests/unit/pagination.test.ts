/**
 * Tests for the pagination helper.
 *
 * Cascade REST endpoints don't paginate upstream, so the MCP layer fetches
 * the full set and slices client-side. The helper preserves every other
 * response field (success, message, etc.) and attaches pagination metadata.
 */

import { describe, test, expect } from "bun:test";
import { paginateArray } from "../../src/pagination.js";

describe("paginateArray", () => {
  test("slices the array at offset 0 and reports has_more with next_offset", () => {
    const result = {
      success: true,
      matches: ["a", "b", "c", "d", "e"],
    };

    const paged = paginateArray(result, "matches", 2, 0);

    expect(paged.matches).toEqual(["a", "b"]);
    expect(paged.total).toBe(5);
    expect(paged.count).toBe(2);
    expect(paged.offset).toBe(0);
    expect(paged.has_more).toBe(true);
    expect(paged.next_offset).toBe(2);
  });

  test("omits next_offset on the final page", () => {
    const result = {
      success: true,
      matches: ["a", "b", "c", "d", "e"],
    };

    const paged = paginateArray(result, "matches", 2, 4);

    expect(paged.matches).toEqual(["e"]);
    expect(paged.total).toBe(5);
    expect(paged.count).toBe(1);
    expect(paged.offset).toBe(4);
    expect(paged.has_more).toBe(false);
    expect(paged.next_offset).toBeUndefined();
  });

  test("returns empty slice when offset is beyond the array length", () => {
    const result = {
      success: true,
      matches: ["a", "b", "c", "d", "e"],
    };

    const paged = paginateArray(result, "matches", 2, 10);

    expect(paged.matches).toEqual([]);
    expect(paged.total).toBe(5);
    expect(paged.count).toBe(0);
    expect(paged.offset).toBe(10);
    expect(paged.has_more).toBe(false);
    expect(paged.next_offset).toBeUndefined();
  });

  test("returns the full array and has_more=false when limit exceeds total", () => {
    const result = {
      success: true,
      matches: ["a", "b", "c"],
    };

    const paged = paginateArray(result, "matches", 100, 0);

    expect(paged.matches).toEqual(["a", "b", "c"]);
    expect(paged.total).toBe(3);
    expect(paged.count).toBe(3);
    expect(paged.offset).toBe(0);
    expect(paged.has_more).toBe(false);
    expect(paged.next_offset).toBeUndefined();
  });

  test("treats a missing key as an empty array (no crash)", () => {
    const result = { success: true } as Record<string, unknown>;

    const paged = paginateArray(result, "matches", 10, 0);

    expect(paged.matches).toEqual([]);
    expect(paged.total).toBe(0);
    expect(paged.count).toBe(0);
    expect(paged.has_more).toBe(false);
  });

  test("treats a non-array value at the key as empty", () => {
    const result = {
      success: true,
      matches: "not an array",
    } as Record<string, unknown>;

    const paged = paginateArray(result, "matches", 10, 0);

    expect(paged.matches).toEqual([]);
    expect(paged.total).toBe(0);
    expect(paged.has_more).toBe(false);
  });

  test("preserves other fields on the result (success, message)", () => {
    const result = {
      success: true,
      message: "hello",
      extra: { foo: "bar" },
      matches: ["a", "b"],
    };

    const paged = paginateArray(result, "matches", 1, 0);

    expect(paged.success).toBe(true);
    expect(paged.message).toBe("hello");
    expect(paged.extra).toEqual({ foo: "bar" });
    expect(paged.matches).toEqual(["a"]);
    expect(paged.has_more).toBe(true);
    expect(paged.next_offset).toBe(1);
  });

  test("handles an empty result object without crashing", () => {
    const paged = paginateArray({} as Record<string, unknown>, "matches", 10, 0);

    expect(paged.matches).toEqual([]);
    expect(paged.total).toBe(0);
    expect(paged.count).toBe(0);
    expect(paged.has_more).toBe(false);
  });

  test("works with alternate array keys (audits, messages)", () => {
    const auditsResult = {
      success: true,
      audits: [{ id: "1" }, { id: "2" }, { id: "3" }],
    };
    const paged = paginateArray(auditsResult, "audits", 2, 1);

    expect(paged.audits).toEqual([{ id: "2" }, { id: "3" }]);
    expect(paged.total).toBe(3);
    expect(paged.has_more).toBe(false);
  });

  test("clamps negative offset to 0 (defense-in-depth if Zod is bypassed)", () => {
    const result = { success: true, matches: ["a", "b", "c"] };
    const paged = paginateArray(result, "matches", 10, -5);

    expect(paged.offset).toBe(0);
    expect(paged.matches).toEqual(["a", "b", "c"]);
    expect(paged.has_more).toBe(false);
  });

  test("clamps zero/negative limit to 1", () => {
    const result = { success: true, matches: ["a", "b", "c"] };
    const paged = paginateArray(result, "matches", 0, 0);

    expect(paged.count).toBe(1);
    expect(paged.matches).toEqual(["a"]);
    expect(paged.has_more).toBe(true);
    expect(paged.next_offset).toBe(1);
  });

  test("caps limit at 500 even if caller passes enormous number", () => {
    const items = Array.from({ length: 600 }, (_, i) => i);
    const result = { success: true, matches: items };
    const paged = paginateArray(result, "matches", 1_000_000, 0);

    expect(paged.count).toBe(500);
    expect(paged.has_more).toBe(true);
    expect(paged.next_offset).toBe(500);
  });

  test("floors non-integer limit/offset", () => {
    const result = { success: true, matches: ["a", "b", "c", "d", "e"] };
    const paged = paginateArray(result, "matches", 2.9, 1.7);

    // limit floored to 2, offset floored to 1
    expect(paged.count).toBe(2);
    expect(paged.offset).toBe(1);
    expect(paged.matches).toEqual(["b", "c"]);
  });
});
