import { describe, test, expect } from "bun:test";
import {
  EntityTypeSchema,
  PathSchema,
  IdentifierSchema,
  ResponseFormatSchema,
} from "../../../src/schemas/common.js";

describe("EntityTypeSchema", () => {
  test("should accept well-known entity types (page, file, folder, block)", () => {
    expect(EntityTypeSchema.safeParse("page").success).toBe(true);
    expect(EntityTypeSchema.safeParse("file").success).toBe(true);
    expect(EntityTypeSchema.safeParse("folder").success).toBe(true);
    expect(EntityTypeSchema.safeParse("block").success).toBe(true);
  });

  test("should reject an unknown type value", () => {
    const res = EntityTypeSchema.safeParse("invalid_type");
    expect(res.success).toBe(false);
  });
});

describe("PathSchema", () => {
  test("should accept the minimum valid path object", () => {
    const res = PathSchema.safeParse({ path: "/foo/bar" });
    expect(res.success).toBe(true);
  });

  test("should accept path with siteName", () => {
    const res = PathSchema.safeParse({ path: "/foo/bar", siteName: "example" });
    expect(res.success).toBe(true);
  });

  test("should reject an empty path string", () => {
    const res = PathSchema.safeParse({ path: "" });
    expect(res.success).toBe(false);
  });
});

describe("IdentifierSchema", () => {
  test("should accept id-only identifier with type", () => {
    const res = IdentifierSchema.safeParse({ id: "abc", type: "page" });
    expect(res.success).toBe(true);
  });

  test("should accept path-only identifier with type", () => {
    const res = IdentifierSchema.safeParse({
      path: { path: "/foo" },
      type: "page",
    });
    expect(res.success).toBe(true);
  });

  test("should reject when both id and path are missing (refinement)", () => {
    const res = IdentifierSchema.safeParse({ type: "page" });
    expect(res.success).toBe(false);
  });

  test("should reject when type is missing", () => {
    const res = IdentifierSchema.safeParse({ id: "abc" });
    expect(res.success).toBe(false);
  });
});

describe("ResponseFormatSchema", () => {
  test("should default to 'markdown' when undefined is passed and accept 'json'", () => {
    const resDefault = ResponseFormatSchema.parse(undefined);
    expect(resDefault).toBe("markdown");

    const resJson = ResponseFormatSchema.safeParse("json");
    expect(resJson.success).toBe(true);
  });
});

describe("Schema descriptions (MCP client help)", () => {
  test("IdentifierSchema fields have .describe() metadata", () => {
    const shape = (IdentifierSchema as any)._def.schema.shape;
    expect(shape.id._def.description).toBeTruthy();
    expect(shape.type._def.description).toBeTruthy();
  });
});
