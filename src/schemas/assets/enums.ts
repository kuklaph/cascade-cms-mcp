/**
 * Enums used across Cascade CMS asset schemas.
 *
 * Every enum below mirrors the OpenAPI spec verbatim
 * (`node_modules/cascade-cms-api/docs/swagger-ui/openapi.yaml`). Values and
 * order are preserved. These are the canonical literals the Cascade REST API
 * accepts in asset payloads.
 */

import { z } from "zod";

// ─── Role / User enums ──────────────────────────────────────────────────────

export const RoleTypeSchema = z
  .enum(["site", "global"])
  .describe("Role scope — 'site' applies to a specific site, 'global' applies system-wide.");

export const UserAuthTypeSchema = z
  .enum(["normal", "ldap", "custom"])
  .describe("User authentication type — 'normal' (Cascade-managed), 'ldap', or 'custom'.");

// ─── Site naming rule enums ─────────────────────────────────────────────────

export const NamingRuleCaseSchema = z
  .enum(["ANY", "LOWER", "UPPER"])
  .describe("Site naming-rule case policy.");

export const NamingRuleSpacingSchema = z
  .enum(["SPACE", "REMOVE", "HYPHEN", "UNDERSCORE"])
  .describe("Site naming-rule spacing policy.");

export const NamingRuleAssetSchema = z
  .enum([
    "block",
    "file",
    "folder",
    "page",
    "symlink",
    "template",
    "reference",
    "format",
  ])
  .describe("Asset types to which site naming rules apply.");

// ─── Site lifecycle enums ───────────────────────────────────────────────────

export const RecycleBinExpirationSchema = z
  .enum(["1", "15", "30", "never"])
  .describe("Days before recycled assets are purged, or 'never'.");

// ─── Scheduling enums ───────────────────────────────────────────────────────

export const ScheduledDestinationModeSchema = z
  .enum(["all-destinations", "selected-destinations"])
  .describe("Scheduled publish destination-selection mode.");

export const DayOfWeekSchema = z
  .enum([
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ])
  .describe("Day of week for scheduled publishing.");

// ─── Asset factory / workflow enums ─────────────────────────────────────────

export const AssetFactoryWorkflowModeSchema = z
  .enum(["folder-controlled", "factory-controlled", "none"])
  .describe("Who controls the workflow attached to assets produced by a factory.");

export const WorkflowNamingBehaviorSchema = z
  .enum(["auto-name", "name-of-definition", "empty"])
  .describe("How newly created workflow instances are named.");

// ─── Content type enums ─────────────────────────────────────────────────────

export const ContentTypePageConfigurationPublishModeSchema = z
  .enum(["all-destinations", "selected-destinations", "do-not-publish"])
  .describe("Publish policy for a page configuration within a content type.");

export const InlineEditableFieldTypeSchema = z
  .enum(["wired-metadata", "dynamic-metadata", "data-definition", "xhtml"])
  .describe("Inline-editable field kind on a content type.");

// ─── Metadata set enums ─────────────────────────────────────────────────────

export const MetadataFieldVisibilitySchema = z
  .enum(["inline", "hidden", "visible"])
  .describe("Metadata field visibility in the Cascade UI.");

export const DynamicMetadataFieldTypeSchema = z
  .enum(["text", "datetime", "radio", "dropdown", "checkbox", "multiselect"])
  .describe("Input control for a dynamic metadata field.");

// ─── Page / page-configuration enums ────────────────────────────────────────

export const SerializationTypeSchema = z
  .enum(["HTML", "XML", "PDF", "RTF", "JSON", "JS", "CSS"])
  .describe("Output serialization format for a page configuration.");

export const LinkRewritingSchema = z
  .enum(["inherit", "absolute", "relative", "site-relative"])
  .describe("Link-rewriting mode applied on publish.");

export const SiteLinkRewritingSchema = z
  .enum(["absolute", "relative", "site-relative"])
  .describe("Site-level default link rewriting (no 'inherit').");

// ─── Transport enums ────────────────────────────────────────────────────────

export const AuthModeSchema = z
  .enum(["PASSWORD", "PUBLIC_KEY"])
  .describe("SFTP authentication mode.");

export const FtpProtocolTypeSchema = z
  .enum(["FTP", "FTPS", "SFTP"])
  .describe("FTP protocol variant.");

// ─── Index block enums ──────────────────────────────────────────────────────

export const IndexBlockTypeSchema = z
  .enum(["folder", "content-type"])
  .describe("Index block source — a folder or a content type.");

export const IndexBlockSortMethodSchema = z
  .enum(["folder-order", "alphabetical", "last-modified-date", "created-date"])
  .describe("Sort method for indexed assets.");

export const IndexBlockSortOrderSchema = z
  .enum(["ascending", "descending"])
  .describe("Sort direction for indexed assets.");

export const IndexBlockPageXmlSchema = z
  .enum(["no-render", "render", "render-current-page-only"])
  .describe("Whether to include page XML in the indexed output.");

export const IndexBlockRenderingBehaviorSchema = z
  .enum([
    "render-normally",
    "hierarchy",
    "hierarchy-with-siblings",
    "hierarchy-siblings-forward",
  ])
  .describe("Rendering behavior when building the index output.");

// ─── Twitter feed block enum ────────────────────────────────────────────────

export const TwitterQueryTypeSchema = z
  .enum(["user-only", "users-and-mentions", "search-terms"])
  .describe("Twitter feed block query type.");

// ─── Structured data enums ──────────────────────────────────────────────────

export const StructuredDataTypeSchema = z
  .enum(["text", "asset", "group"])
  .describe("Node type in a structured data tree.");

export const StructuredDataAssetTypeSchema = z
  .enum(["block", "file", "page", "symlink", "page,file,symlink"])
  .describe("Permitted asset types when a structured data node references an asset.");

// ─── Entity type (identifier-level) ─────────────────────────────────────────
//
// Re-exported for use inside asset payloads that reference other assets by
// type (e.g. Reference.referencedAssetType). Based on Cascade's
// `EntityTypeString` from openapi.yaml line 149.
//
// Cascade uses two parallel naming schemes: EntityType strings (this schema —
// lowercase or snake_case, e.g. 'block_XHTML_DATADEFINITION', 'format_XSLT',
// 'transport_ftp', 'wordpressconnector') are the values used in identifier
// type fields; Asset envelope keys (see `src/schemas/assets.ts` — camelCase,
// e.g. 'xhtmlDataDefinitionBlock', 'xsltFormat', 'ftpTransport',
// 'wordPressConnector') are body-shape discriminators under `asset.<key>`.
// A handful of types spell the same in both schemes ('page', 'file',
// 'folder', 'symlink', 'template', ...); most do not. The upstream
// `EntityTypeString` incorrectly includes the envelope key
// `xhtmlDataDefinitionBlock`; it is excluded here because Cascade does not
// accept it as an identifier-level type.

export const EntityTypeStringSchema = z
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
    "facebookconnector",
    "twitterconnector",
  ])
  .describe(
    "Cascade entity type string — used in Identifier.type and Reference.referencedAssetType. Values are lowercase or snake_case (e.g. 'page', 'block_XHTML_DATADEFINITION', 'format_XSLT', 'transport_ftp', 'wordpressconnector'). These are DISTINCT from the camelCase envelope keys on the Asset body ('xhtmlDataDefinitionBlock', 'xsltFormat', 'ftpTransport', 'wordPressConnector'). A few types ('page', 'file', 'folder', 'symlink', 'template', 'reference', 'role', 'site', 'user', 'group') spell the same in both; most do not. Never use an envelope key here.",
  );

export type EntityTypeString = z.infer<typeof EntityTypeStringSchema>;
