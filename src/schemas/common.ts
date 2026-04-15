/**
 * Common Zod schemas shared across all Cascade CMS request schemas.
 *
 * Exports:
 *   - EntityTypeSchema: the 56-variant EntityTypeString union
 *   - PathSchema: an asset path with optional site id/name
 *   - IdentifierSchema: an asset identifier (id-or-path + required type)
 *   - ResponseFormatSchema: "markdown" | "json" (defaults to "markdown")
 *   - ResponseDetailSchema: "summary" | "full" (defaults to "full"; cascade_read only)
 */

import { z } from "zod";

/**
 * The 56 entity types supported by Cascade. Mirrors
 * `cascade-cms-api/types/types.d.ts::EntityTypeString`.
 */
export const EntityTypeSchema = z
  .enum([
    "assetfactory",
    "assetfactorycontainer",
    "block",
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
    "file",
    "folder",
    "group",
    "message",
    "metadataset",
    "metadatasetcontainer",
    "page",
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
    "symlink",
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
    "Cascade CMS asset type discriminator. Common values: 'page', 'file', 'folder', 'block', 'symlink'. 56 variants total covering all asset kinds (templates, formats, workflows, users, transports, etc.).",
  );

export type EntityType = z.infer<typeof EntityTypeSchema>;

export const PathSchema = z
  .object({
    path: z
      .string()
      .min(1, "path must not be empty")
      .describe(
        "Asset path within a site, starting from root (e.g. '/about/team'). Works only for non-recycled assets. When reading a site, set this to the site's name.",
      ),
    siteId: z
      .string()
      .optional()
      .describe(
        "Optional site ID. Takes precedence over siteName when both are provided.",
      ),
    siteName: z
      .string()
      .optional()
      .describe(
        "Optional site name. Used to resolve the path if siteId is not supplied.",
      ),
  })
  .strict()
  .describe(
    "Fully qualified path to an asset. Pair `path` with one of siteId/siteName to disambiguate across sites.",
  );

export type Path = z.infer<typeof PathSchema>;

export const IdentifierSchema = z
  .object({
    id: z
      .string()
      .optional()
      .describe(
        "Asset ID. Preferred over path because IDs survive when assets are moved or recycled. One of `id` or `path` is required.",
      ),
    path: PathSchema.optional().describe(
      "Asset path object (path + site). Works only for non-recycled assets. One of `id` or `path` is required.",
    ),
    type: EntityTypeSchema.describe(
      "REQUIRED: The entity type of this asset (e.g. 'page', 'file', 'folder'). Determines how Cascade resolves the id/path.",
    ),
    recycled: z
      .boolean()
      .optional()
      .describe(
        "Set true to target an asset inside the recycle bin. For reading only; ignored on edit/copy/move.",
      ),
  })
  .strict()
  .refine((v) => v.id !== undefined || v.path !== undefined, {
    message: "Either id or path must be provided",
    path: ["id"],
  })
  .describe(
    "Uniquely identifies a Cascade asset. Supply either `id` (preferred, survives moves/recycling) or `path` plus the asset `type`.",
  );

export type Identifier = z.infer<typeof IdentifierSchema>;

export const ResponseFormatSchema = z
  .enum(["markdown", "json"])
  .default("markdown")
  .describe(
    "Response format: 'markdown' (human-readable, default) or 'json' (machine-readable full payload). Use 'json' when the response is large or needs to be parsed programmatically.",
  );

export type ResponseFormat = z.infer<typeof ResponseFormatSchema>;

export const ResponseDetailSchema = z
  .enum(["summary", "full"])
  .default("full")
  .describe(
    "Detail level: 'full' (default, complete asset) or 'summary' (lean projection — keeps id, name, path, type, lastModifiedDate, metadata; omits xhtml, structuredData, file data, page configurations, and similar heavy fields). Best for content asset types (page, file, folder, block, template). Other entity types (user, workflow, transport, etc.) lack these fields and pass through unchanged. Use 'summary' when you only need to discover or describe an asset, not edit it.",
  );

export type ResponseDetail = z.infer<typeof ResponseDetailSchema>;
