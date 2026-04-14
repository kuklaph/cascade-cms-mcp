import { describe, test, expect } from "bun:test";
import {
  PageAssetSchema,
  FileAssetSchema,
  FolderAssetSchema,
  BlockAssetSchema,
  SymlinkAssetSchema,
  GenericAssetSchema,
  AssetInputSchema,
} from "../../../src/schemas/assets.js";

describe("PageAssetSchema", () => {
  test("should parse a valid page asset", () => {
    const input = {
      type: "page",
      name: "index",
      parentFolderPath: "/",
      siteName: "my-site",
      contentTypePath: "/content-types/default",
    };
    const res = PageAssetSchema.safeParse(input);
    expect(res.success).toBe(true);
  });

  test("should reject a page asset missing name", () => {
    const input = {
      type: "page",
      parentFolderPath: "/",
      siteName: "my-site",
      contentTypePath: "/content-types/default",
    };
    const res = PageAssetSchema.safeParse(input);
    expect(res.success).toBe(false);
    if (!res.success) {
      const issueText = JSON.stringify(res.error.issues);
      expect(issueText).toContain("name");
    }
  });

  test("should reject a page asset missing both parentFolderPath and parentFolderId", () => {
    const input = {
      type: "page",
      name: "index",
      siteName: "my-site",
      contentTypePath: "/content-types/default",
    };
    const res = PageAssetSchema.safeParse(input);
    expect(res.success).toBe(false);
  });

  test("should reject extra top-level fields (strict variant)", () => {
    const input = {
      type: "page",
      name: "index",
      parentFolderPath: "/",
      siteName: "my-site",
      contentTypePath: "/content-types/default",
      randomField: "should-not-exist",
    };
    const res = PageAssetSchema.safeParse(input);
    expect(res.success).toBe(false);
  });

  test("should accept arbitrary nested metadata via passthrough", () => {
    const input = {
      type: "page",
      name: "index",
      parentFolderPath: "/",
      siteName: "my-site",
      contentTypePath: "/content-types/default",
      metadata: {
        title: "My Page",
        arbitraryVendorField: "allowed",
        dynamicFields: [{ name: "foo", fieldValues: [{ value: "bar" }] }],
      },
    };
    const res = PageAssetSchema.safeParse(input);
    expect(res.success).toBe(true);
  });
});

describe("FileAssetSchema", () => {
  test("should parse a valid file asset", () => {
    const input = {
      type: "file",
      name: "readme.txt",
      parentFolderPath: "/docs",
      siteName: "my-site",
      text: "hello world",
    };
    const res = FileAssetSchema.safeParse(input);
    expect(res.success).toBe(true);
  });
});

describe("FolderAssetSchema", () => {
  test("should parse a valid folder asset", () => {
    const input = {
      type: "folder",
      name: "docs",
      parentFolderPath: "/",
      siteName: "my-site",
      shouldBePublished: true,
    };
    const res = FolderAssetSchema.safeParse(input);
    expect(res.success).toBe(true);
  });
});

describe("BlockAssetSchema", () => {
  test("should parse a valid block asset", () => {
    const input = {
      type: "block",
      name: "my-block",
      parentFolderPath: "/blocks",
      siteName: "my-site",
      subType: "TEXT",
      text: "block body content",
    };
    const res = BlockAssetSchema.safeParse(input);
    expect(res.success).toBe(true);
  });
});

describe("SymlinkAssetSchema", () => {
  test("should parse a valid symlink asset with linkURL", () => {
    const input = {
      type: "symlink",
      name: "external",
      parentFolderPath: "/links",
      siteName: "my-site",
      linkURL: "https://example.com",
    };
    const res = SymlinkAssetSchema.safeParse(input);
    expect(res.success).toBe(true);
  });

  test("should reject a symlink asset missing linkURL", () => {
    const input = {
      type: "symlink",
      name: "external",
      parentFolderPath: "/links",
      siteName: "my-site",
    };
    const res = SymlinkAssetSchema.safeParse(input);
    expect(res.success).toBe(false);
  });
});

describe("GenericAssetSchema (fallback)", () => {
  test("should accept a template type with arbitrary extra fields (passthrough)", () => {
    const input = {
      type: "template",
      xml: "<xhtml/>",
      anyField: "anyValue",
    };
    const res = GenericAssetSchema.safeParse(input);
    expect(res.success).toBe(true);
  });

  test("should accept a workflow type with arbitrary fields (passthrough)", () => {
    const input = {
      type: "workflow",
      name: "my-workflow",
      customField: { nested: true },
    };
    const res = GenericAssetSchema.safeParse(input);
    expect(res.success).toBe(true);
  });

  test("should reject an unknown type (not in any entity-type variant)", () => {
    const input = {
      type: "definitely_not_a_real_type",
    };
    const res = GenericAssetSchema.safeParse(input);
    expect(res.success).toBe(false);
  });
});

describe("AssetInputSchema (discriminated union)", () => {
  test("should route type=page to PageAssetSchema and type=file to FileAssetSchema", () => {
    const pageInput = {
      type: "page",
      name: "index",
      parentFolderPath: "/",
      siteName: "my-site",
      contentTypePath: "/content-types/default",
    };
    const fileInput = {
      type: "file",
      name: "readme.txt",
      parentFolderPath: "/docs",
      siteName: "my-site",
      text: "hello",
    };

    const pageRes = AssetInputSchema.safeParse(pageInput);
    const fileRes = AssetInputSchema.safeParse(fileInput);

    expect(pageRes.success).toBe(true);
    expect(fileRes.success).toBe(true);
  });
});

describe("Asset schema descriptions (MCP client help)", () => {
  test("GenericAssetSchema carries a description for agent guidance", () => {
    expect((GenericAssetSchema as any)._def.description).toBeTruthy();
  });
});
