/**
 * Zod schemas for Cascade CMS asset inputs (create/edit payloads).
 *
 * Shape:
 *   - Strict schemas for the 5 common asset types: page, file, folder, block, symlink
 *   - Generic passthrough fallback for the remaining 51 entity types
 *   - Discriminated union keyed on `type`
 *   - Wrapper schema matching Cascade's `{ asset: ... }` aggregate
 *
 * Rationale: LLMs get rich guided validation for the 5 types they use 95% of
 * the time; rare types still work via passthrough. Nested `metadata` and
 * `structuredData` objects are unbounded, so they're typed as passthrough
 * records — Cascade's own error response surfaces any deeper issues.
 */

import { z } from "zod";

/** Passthrough record for arbitrary nested objects (metadata, structuredData). */
const PassthroughRecord = z
  .object({})
  .passthrough()
  .describe(
    "Arbitrary nested object. Cascade's server-side validation applies; structure varies by asset type and data definition.",
  );

/** Common fields present on every folder-contained asset variant. */
const commonAssetFields = {
  name: z
    .string()
    .min(1, "name is required")
    .describe(
      "Asset name (required on create, ignored on edit — use the move operation to rename).",
    ),
  id: z
    .string()
    .optional()
    .describe(
      "Asset ID. Omit on create (Cascade assigns it); required on edit to identify the target asset.",
    ),
  parentFolderId: z
    .string()
    .optional()
    .describe(
      "Parent folder ID. Required on create (either this or parentFolderPath); ignored on edit. Priority: parentFolderId > parentFolderPath.",
    ),
  parentFolderPath: z
    .string()
    .optional()
    .describe(
      "Parent folder path. Required on create (either this or parentFolderId); ignored on edit.",
    ),
  siteId: z
    .string()
    .optional()
    .describe(
      "Site ID where this asset lives. One of siteId/siteName is required.",
    ),
  siteName: z
    .string()
    .optional()
    .describe(
      "Site name where this asset lives. One of siteId/siteName is required.",
    ),
  metadata: PassthroughRecord.optional().describe(
    "Wired metadata fields (title, displayName, keywords, author, dynamicFields, etc.). Structure matches Cascade's Metadata type; dynamicFields is an array of `{ name, fieldValues: [{ value }] }`.",
  ),
  metadataSetId: z
    .string()
    .optional()
    .describe(
      "Metadata set ID. Priority: metadataSetId > metadataSetPath.",
    ),
  metadataSetPath: z
    .string()
    .optional()
    .describe("Metadata set path. Alternative to metadataSetId."),
  tags: z
    .array(
      z
        .object({ name: z.string().describe("Tag string value.") })
        .passthrough(),
    )
    .optional()
    .describe("Content tags assigned to the asset. Array of `{ name }` objects."),
  expirationFolderId: z
    .string()
    .optional()
    .describe(
      "Expiration folder ID. Priority: expirationFolderId > expirationFolderPath.",
    ),
  expirationFolderPath: z
    .string()
    .optional()
    .describe("Expiration folder path. Works only for non-recycled assets."),
  reviewOnSchedule: z
    .boolean()
    .optional()
    .describe("Whether the asset should be reviewed on a schedule."),
  reviewEvery: z
    .number()
    .optional()
    .describe("Review interval in days."),
};

/** Fields common to publishable assets (page, file, folder). */
const publishableFields = {
  shouldBePublished: z
    .boolean()
    .optional()
    .describe("Whether this asset can be published (default: true)."),
  shouldBeIndexed: z
    .boolean()
    .optional()
    .describe("Whether this asset can be indexed (default: true)."),
  lastPublishedDate: z
    .string()
    .optional()
    .describe("Last published timestamp. Read-only; ignored on create/edit."),
  lastPublishedBy: z
    .string()
    .optional()
    .describe("User who last published this asset. Read-only."),
};

/** Raw strict object for the PAGE variant (used as a discriminated-union branch). */
const PageAssetObject = z
  .object({
    type: z
      .literal("page")
      .describe("Discriminator: must be 'page' for a page asset."),
    ...commonAssetFields,
    ...publishableFields,
    contentTypeId: z
      .string()
      .optional()
      .describe(
        "Content type ID. Priority: (contentTypeId > contentTypePath) > (configurationSetId > configurationSetPath). One of the four is REQUIRED.",
      ),
    contentTypePath: z
      .string()
      .optional()
      .describe(
        "Content type path (e.g. '/content-types/default'). Alternative to contentTypeId.",
      ),
    configurationSetId: z
      .string()
      .optional()
      .describe(
        "Page configuration set ID. Used when no content type is provided.",
      ),
    configurationSetPath: z
      .string()
      .optional()
      .describe("Page configuration set path. Alternative to configurationSetId."),
    structuredData: PassthroughRecord.optional().describe(
      "Structured data content. A page has either `xhtml` OR `structuredData` (priority: xhtml > structuredData). Matches Cascade's StructuredData type.",
    ),
    xhtml: z
      .string()
      .optional()
      .describe(
        "XHTML content for a plain WYSIWYG page. Priority: xhtml > structuredData.",
      ),
    pageConfigurations: z
      .array(PassthroughRecord)
      .optional()
      .describe(
        "Page configurations holding page-level region/block/format assignments. Required on edit to preserve region assignments.",
      ),
    linkRewriting: z
      .enum(["inherit", "absolute", "relative", "site-relative"])
      .optional()
      .describe(
        "Link rewriting mode (default: 'inherit'). Controls how hyperlinks are rewritten on publish.",
      ),
  })
  .strict();

/** Raw strict object for the FILE variant. */
const FileAssetObject = z
  .object({
    type: z
      .literal("file")
      .describe("Discriminator: must be 'file' for a file asset."),
    ...commonAssetFields,
    ...publishableFields,
    text: z
      .string()
      .optional()
      .describe(
        "Plaintext file content. One of `text`/`data` is required. Priority: text > data.",
      ),
    data: z
      .array(z.number().describe("Byte value (0-255)."))
      .optional()
      .describe(
        "Binary content as a byte array (base64-encoded upstream). Used for non-text files.",
      ),
    rewriteLinks: z
      .boolean()
      .optional()
      .describe("Whether to rewrite links in the file's content on publish."),
    linkRewriting: z
      .enum(["inherit", "absolute", "relative", "site-relative"])
      .optional()
      .describe("Link rewriting mode (default: 'inherit')."),
  })
  .strict();

/** Raw strict object for the FOLDER variant. */
const FolderAssetObject = z
  .object({
    type: z
      .literal("folder")
      .describe("Discriminator: must be 'folder' for a folder asset."),
    ...commonAssetFields,
    ...publishableFields,
    children: z
      .array(PassthroughRecord)
      .optional()
      .describe(
        "Array of child identifiers contained in this folder. Read-only on create; used to reflect folder contents.",
      ),
    includeInStaleContent: z
      .boolean()
      .optional()
      .describe("Whether this folder participates in stale-content reports."),
  })
  .strict();

/** Raw strict object for the BLOCK variant. */
const BlockAssetObject = z
  .object({
    type: z
      .literal("block")
      .describe("Discriminator: must be 'block' for a block asset."),
    ...commonAssetFields,
    subType: z
      .string()
      .optional()
      .describe(
        "Block sub-type (e.g. 'TEXT', 'XML', 'XHTML_DATADEFINITION', 'INDEX', 'FEED'). Determines which content field applies.",
      ),
    text: z
      .string()
      .optional()
      .describe("Plaintext content for TEXT-type blocks."),
    xml: z
      .string()
      .optional()
      .describe("XML content for XML-type blocks."),
    structuredData: PassthroughRecord.optional().describe(
      "Structured data content for XHTML-datadefinition blocks. Priority: xhtml > structuredData.",
    ),
    xhtml: z
      .string()
      .optional()
      .describe(
        "XHTML content for plain WYSIWYG blocks. Priority: xhtml > structuredData.",
      ),
  })
  .strict();

/** Raw strict object for the SYMLINK variant. linkURL is required. */
const SymlinkAssetObject = z
  .object({
    type: z
      .literal("symlink")
      .describe(
        "Discriminator: must be 'symlink' for a symlink asset (a Cascade hyperlink asset, not a UNIX symlink).",
      ),
    ...commonAssetFields,
    linkURL: z
      .string()
      .min(1, "linkURL is required for symlink")
      .describe(
        "Fully qualified URL this symlink points to (e.g. 'https://example.com').",
      ),
  })
  .strict();

/** Set of variant types whose parent-folder constraint is enforced. */
const STRICT_VARIANT_TYPES = new Set([
  "page",
  "file",
  "folder",
  "block",
  "symlink",
]);

/** Refinement: require either parentFolderId or parentFolderPath for strict variants. */
function requireParentFolder<T extends z.ZodTypeAny>(schema: T) {
  return schema.refine(
    (v: {
      type?: string;
      parentFolderId?: string;
      parentFolderPath?: string;
    }) => {
      if (!v.type || !STRICT_VARIANT_TYPES.has(v.type)) return true;
      return v.parentFolderId !== undefined || v.parentFolderPath !== undefined;
    },
    {
      message: "Either parentFolderId or parentFolderPath must be provided",
      path: ["parentFolderId"],
    },
  );
}

/** Public-facing refined strict schemas for direct parse of single variants.
 * Production code consumes `AssetInputSchema` (the discriminated union);
 * these per-variant exports exist as a testing seam for variant-specific
 * coverage. */
export const PageAssetSchema = requireParentFolder(PageAssetObject);
export const FileAssetSchema = requireParentFolder(FileAssetObject);
export const FolderAssetSchema = requireParentFolder(FolderAssetObject);
export const BlockAssetSchema = requireParentFolder(BlockAssetObject);
export const SymlinkAssetSchema = requireParentFolder(SymlinkAssetObject);

/** Generic fallback — any entity type that is NOT one of the 5 strict variants.
 * Only the `type` discriminant is validated; every other field passes through.
 *
 * Types listed explicitly (rather than via `EntityTypeSchema.exclude(...)`) to
 * avoid TS2589 "excessively deep" instantiation when used in a discriminated
 * union. Keep in sync with `EntityTypeSchema`. */
const RemainingEntityTypes = z
  .enum([
    "assetfactory",
    "assetfactorycontainer",
    "block_FEED",
    "block_INDEX",
    "block_TEXT",
    "block_XHTML_DATADEFINITION",
    "block_XML",
    "block_TWITTER_FEED",
    "connectorcontainer",
    "twitterconnector",
    "facebookconnector",
    "wordpressconnector",
    "googleanalyticsconnector",
    "contenttype",
    "contenttypecontainer",
    "destination",
    "editorconfiguration",
    "group",
    "message",
    "metadataset",
    "metadatasetcontainer",
    "pageconfigurationset",
    "pageconfiguration",
    "pageregion",
    "pageconfigurationsetcontainer",
    "publishset",
    "publishsetcontainer",
    "reference",
    "role",
    "datadefinition",
    "datadefinitioncontainer",
    "sharedfield",
    "sharedfieldcontainer",
    "format",
    "format_XSLT",
    "format_SCRIPT",
    "site",
    "sitedestinationcontainer",
    "target",
    "template",
    "transport",
    "transport_fs",
    "transport_ftp",
    "transport_db",
    "transport_cloud",
    "transportcontainer",
    "user",
    "workflow",
    "workflowdefinition",
    "workflowdefinitioncontainer",
    "workflowemail",
    "workflowemailcontainer",
    "xhtmlDataDefinitionBlock",
  ])
  .describe(
    "Fallback discriminator for the 51 less-common asset types not covered by strict variants (page/file/folder/block/symlink).",
  );

export const GenericAssetSchema = z
  .object({
    type: RemainingEntityTypes,
  })
  .passthrough()
  .describe(
    "Fallback asset shape for uncommon entity types. Only `type` is validated; every other field passes through to Cascade, which returns structured errors on invalid payloads.",
  );

/** Discriminated union across all asset variants.
 * Uses the raw object schemas (not the refined wrappers) because
 * discriminatedUnion requires ZodObject branches. The parent-folder refinement
 * is re-applied on the union itself. */
export const AssetInputSchema = requireParentFolder(
  z
    .discriminatedUnion("type", [
      PageAssetObject,
      FileAssetObject,
      FolderAssetObject,
      BlockAssetObject,
      SymlinkAssetObject,
      GenericAssetSchema,
    ])
    .describe(
      "Cascade asset payload. The `type` field chooses the branch: 'page' | 'file' | 'folder' | 'block' | 'symlink' get strict schemas; every other entity type uses the passthrough fallback.",
    ),
);

export type AssetInput = z.infer<typeof AssetInputSchema>;
