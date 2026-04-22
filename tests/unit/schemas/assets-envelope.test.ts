/**
 * Regression tests for the asset envelope shape.
 *
 * The Cascade `Asset` type — which `EditRequest` and `CreateRequest` extend —
 * requires the shape `{ asset: { <typeKey>: { ...fields } } }`. Earlier
 * revisions of this schema accepted a flat `{ asset: { type, ...fields } }`
 * shape that matched no Cascade type and was rejected server-side with
 * "No schema asset was bundled with the Edit request".
 *
 * These tests lock the wrapper to Cascade's native envelope shape and verify
 * the flat shape no longer validates.
 */

import { describe, test, expect } from "bun:test";
import { AssetInputSchema } from "../../../src/schemas/assets.js";
import {
  CreateRequestSchema,
  EditRequestSchema,
} from "../../../src/schemas/requests.js";

describe("AssetInputSchema — envelope shape", () => {
  test("accepts a nested page envelope (matches Cascade Asset.page)", () => {
    const input = {
      page: {
        type: "page",
        name: "index",
        parentFolderPath: "/",
        siteName: "my-site",
        contentTypePath: "/content-types/default",
      },
    };
    const res = AssetInputSchema.safeParse(input);
    expect(res.success).toBe(true);
  });

  test("accepts a nested file envelope (matches Cascade Asset.file)", () => {
    const input = {
      file: {
        type: "file",
        name: "readme.txt",
        parentFolderPath: "/docs",
        siteName: "my-site",
        text: "hello world",
      },
    };
    const res = AssetInputSchema.safeParse(input);
    expect(res.success).toBe(true);
  });

  test("accepts a nested folder envelope (matches Cascade Asset.folder)", () => {
    const input = {
      folder: {
        type: "folder",
        name: "docs",
        parentFolderPath: "/",
        siteName: "my-site",
      },
    };
    const res = AssetInputSchema.safeParse(input);
    expect(res.success).toBe(true);
  });

  test("accepts a nested symlink envelope (matches Cascade Asset.symlink)", () => {
    const input = {
      symlink: {
        type: "symlink",
        name: "external",
        parentFolderPath: "/links",
        siteName: "my-site",
        linkURL: "https://example.com",
      },
    };
    const res = AssetInputSchema.safeParse(input);
    expect(res.success).toBe(true);
  });

  test("rejects the legacy flat shape for page (regression)", () => {
    const flat = {
      type: "page",
      name: "index",
      parentFolderPath: "/",
      siteName: "my-site",
      contentTypePath: "/content-types/default",
    };
    const res = AssetInputSchema.safeParse(flat);
    expect(res.success).toBe(false);
  });

  test("rejects the legacy flat shape for symlink (regression)", () => {
    const flat = {
      type: "symlink",
      name: "external",
      parentFolderPath: "/links",
      siteName: "my-site",
      linkURL: "https://example.com",
    };
    const res = AssetInputSchema.safeParse(flat);
    expect(res.success).toBe(false);
  });

  test("rejects an envelope with the wrong type key for the inner type", () => {
    // Inner type says 'page' but envelope key is 'file' — mismatch.
    const input = {
      file: {
        type: "page",
        name: "index",
        parentFolderPath: "/",
        siteName: "my-site",
        contentTypePath: "/content-types/default",
      },
    };
    const res = AssetInputSchema.safeParse(input);
    expect(res.success).toBe(false);
  });

  test("rejects an envelope with multiple type keys", () => {
    const input = {
      page: {
        type: "page",
        name: "index",
        parentFolderPath: "/",
        siteName: "my-site",
        contentTypePath: "/content-types/default",
      },
      file: {
        type: "file",
        name: "readme.txt",
        parentFolderPath: "/",
        siteName: "my-site",
        text: "hi",
      },
    };
    const res = AssetInputSchema.safeParse(input);
    expect(res.success).toBe(false);
  });

  test("rejects an empty envelope (no type key)", () => {
    const res = AssetInputSchema.safeParse({});
    expect(res.success).toBe(false);
  });

  test("accepts a page envelope without parentFolder (edit case)", () => {
    // parentFolder is required on CREATE only — our shared create/edit schema
    // defers that check to Cascade, so a page without parent should parse.
    const editShape = {
      page: {
        type: "page",
        id: "existing-page-id",
        name: "index",
        siteName: "my-site",
      },
    };
    const res = AssetInputSchema.safeParse(editShape);
    expect(res.success).toBe(true);
  });

  test("accepts a template envelope with its required xml field", () => {
    const input = {
      template: {
        type: "template",
        name: "my-template",
        parentFolderPath: "/templates",
        siteName: "my-site",
        xml: "<xhtml/>",
      },
    };
    const res = AssetInputSchema.safeParse(input);
    expect(res.success).toBe(true);
  });

  test("rejects a template envelope with an unknown field (strict mirror)", () => {
    // Strict schemas reject unknown keys — every Cascade field is modelled,
    // so a stray field indicates a typo or upstream API drift.
    const input = {
      template: {
        type: "template",
        name: "my-template",
        parentFolderPath: "/templates",
        siteName: "my-site",
        xml: "<xhtml/>",
        arbitraryField: "not allowed",
      },
    };
    const res = AssetInputSchema.safeParse(input);
    expect(res.success).toBe(false);
  });
});

describe("EditRequestSchema + CreateRequestSchema — round-trip with cascade_read output", () => {
  test("CreateRequestSchema accepts the nested envelope", () => {
    const res = CreateRequestSchema.safeParse({
      asset: {
        page: {
          type: "page",
          name: "index",
          parentFolderPath: "/",
          siteName: "my-site",
          contentTypePath: "/content-types/default",
        },
      },
    });
    expect(res.success).toBe(true);
  });

  test("EditRequestSchema accepts a read-output shape directly (round-trip)", () => {
    // Simulates: read asset, modify metadata, pass whole asset back unchanged.
    const readOutput = {
      success: true,
      asset: {
        page: {
          type: "page",
          id: "page-001",
          name: "index",
          parentFolderPath: "/",
          siteName: "my-site",
          contentTypePath: "/content-types/default",
          metadata: { title: "Home (edited)" },
        },
      },
    };

    const res = EditRequestSchema.safeParse({ asset: readOutput.asset });
    expect(res.success).toBe(true);
  });

  test("EditRequestSchema rejects the legacy flat shape (regression)", () => {
    const res = EditRequestSchema.safeParse({
      asset: {
        type: "page",
        id: "page-001",
        name: "index",
        parentFolderPath: "/",
        siteName: "my-site",
        contentTypePath: "/content-types/default",
      },
    });
    expect(res.success).toBe(false);
  });

  test("CreateRequestSchema rejects the legacy flat shape (regression)", () => {
    const res = CreateRequestSchema.safeParse({
      asset: {
        type: "page",
        name: "index",
        parentFolderPath: "/",
        siteName: "my-site",
        contentTypePath: "/content-types/default",
      },
    });
    expect(res.success).toBe(false);
  });
});
