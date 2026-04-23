/**
 * MCP resource registrations for the Cascade CMS server.
 *
 * Resources complement the 26 tools by exposing URI-addressable reference
 * data that agents can fetch without invoking a tool. Two resources are
 * registered:
 *
 *   cascade://entity-types  (static)  — all Cascade entity type strings
 *                                       with short human-readable blurbs.
 *   cascade://sites         (dynamic) — live `client.listSites()` result.
 *
 * Both emit `application/json` text content. Dynamic failures are
 * translated via `translateError` so a flaky Cascade instance yields
 * an actionable error body instead of crashing the transport.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  ReadResourceResult,
  TextResourceContents,
} from "@modelcontextprotocol/sdk/types.js";
import type { Types } from "cascade-cms-api";
import type { CascadeClient } from "./client.js";
import { EntityTypeSchema } from "./schemas/common.js";
import { translateError } from "./errors.js";

/** Short human-readable descriptions for each Cascade entity type. */
const ENTITY_TYPE_DESCRIPTIONS: Record<string, string> = {
  assetfactory: "Template defining how new assets of a given type are created",
  assetfactorycontainer: "Folder-like container holding asset factories",
  block: "Reusable content block embeddable in pages or templates",
  block_FEED: "Block sourced from an external feed (e.g., RSS)",
  block_INDEX: "Block listing assets from an index or query",
  block_TEXT: "Plain-text content block",
  block_XHTML_DATADEFINITION: "Structured XHTML block backed by a data definition",
  block_XML: "Block holding raw XML content",
  block_TWITTER_FEED: "Block pulling posts from a Twitter/X feed",
  connectorcontainer: "Container grouping external-service connectors",
  twitterconnector: "Connector to a Twitter/X account",
  facebookconnector: "Connector to a Facebook page",
  wordpressconnector: "Connector to a WordPress site",
  googleanalyticsconnector: "Connector to a Google Analytics property",
  contenttype: "Definition of a page's content schema and templates",
  contenttypecontainer: "Folder-like container holding content types",
  destination: "Publish destination (server, path, transport binding)",
  editorconfiguration: "Rich-text editor configuration preset",
  file: "A file asset (images, documents, binaries, etc.)",
  folder: "A folder that groups other assets",
  group: "A user group for permissions and workflows",
  message: "An in-app message for a user's inbox",
  metadataset: "Schema defining metadata fields for assets",
  metadatasetcontainer: "Folder-like container holding metadata sets",
  page: "A web page asset",
  pageconfigurationset: "A set of page configurations (regions, templates)",
  pageconfiguration: "A single page configuration within a set",
  pageregion: "A named region inside a page configuration",
  pageconfigurationsetcontainer: "Folder-like container for page configuration sets",
  publishset: "A named group of assets published together",
  publishsetcontainer: "Folder-like container holding publish sets",
  reference: "A reference (link) to another asset",
  role: "A named role granting capabilities to users",
  datadefinition: "Structured-data schema used by pages and blocks",
  datadefinitioncontainer: "Folder-like container holding data definitions",
  sharedfield: "A reusable field definition shared across data definitions",
  sharedfieldcontainer: "Folder-like container holding shared fields",
  format: "A generic format/transform definition",
  format_XSLT: "An XSLT-based format transform",
  format_SCRIPT: "A script-based format transform (Velocity, etc.)",
  site: "A Cascade site (top-level container for assets)",
  sitedestinationcontainer: "Container grouping a site's publish destinations",
  symlink: "A symbolic link asset pointing at an external URL",
  target: "A publish target within a destination",
  template: "A page template (layout skeleton with regions)",
  transport: "A generic transport binding for publishing",
  transport_fs: "Filesystem transport (local or mounted path)",
  transport_ftp: "FTP/SFTP transport",
  transport_db: "Database transport",
  transport_cloud: "Cloud-storage transport (S3, etc.)",
  transportcontainer: "Folder-like container holding transports",
  user: "A Cascade user account",
  workflow: "A running workflow instance",
  workflowdefinition: "A definition describing workflow steps and transitions",
  workflowdefinitioncontainer: "Folder-like container holding workflow definitions",
  workflowemail: "An email template used by workflows",
  workflowemailcontainer: "Folder-like container holding workflow emails",
};

/**
 * Build the JSON payload for `cascade://entity-types`.
 *
 * Derives the complete list of entity types from `EntityTypeSchema.options`
 * (the Zod enum source of truth) so adding a new type in `common.ts`
 * automatically surfaces here. Descriptions MUST exist for every type in
 * `ENTITY_TYPE_DESCRIPTIONS` — if a type is missing, an explicit placeholder
 * is emitted so drift is visible in the resource body (rather than silently
 * masked by an empty string).
 */
function buildEntityTypesPayload(): string {
  const entityTypes = EntityTypeSchema.options.map((type) => ({
    type,
    description:
      ENTITY_TYPE_DESCRIPTIONS[type] ?? `(no description — add to resources.ts)`,
  }));
  return JSON.stringify({ entityTypes }, null, 2);
}

/** Build a text-content resource result for a URI. */
function textResource(
  uri: URL,
  text: string,
): ReadResourceResult {
  const contents: TextResourceContents = {
    uri: uri.toString(),
    mimeType: "application/json",
    text,
  };
  return { contents: [contents] };
}

/**
 * Register the two Cascade MCP resources on the given server.
 *
 * Idempotent per server: the SDK throws on duplicate URIs, so call this
 * exactly once per `McpServer` instance.
 */
export function registerCascadeResources(
  server: McpServer,
  client: CascadeClient,
): void {
  // Static: all Cascade entity types with short descriptions. The count is
  // derived from the Zod enum so it stays in sync automatically.
  const entityTypeCount = EntityTypeSchema.options.length;
  server.registerResource(
    "Cascade Entity Types",
    "cascade://entity-types",
    {
      description: `List of all ${entityTypeCount} Cascade CMS entity type strings (page, file, folder, block, template, etc.) used as the \`type\` field in asset identifiers.`,
      mimeType: "application/json",
    },
    async (uri: URL) => textResource(uri, buildEntityTypesPayload()),
  );

  // Dynamic: live list of sites fetched from Cascade on read.
  server.registerResource(
    "Cascade Sites",
    "cascade://sites",
    {
      description:
        "Live list of all Cascade CMS sites accessible with the current API credentials. Fetched on read.",
      mimeType: "application/json",
    },
    async (uri: URL) => {
      try {
        const result = await client.listSites(
          {} as unknown as Types.ListSitesRequest,
        );
        return textResource(uri, JSON.stringify(result, null, 2));
      } catch (err) {
        // Translate via the shared error pipeline so secret redaction and
        // actionable messaging are identical to tool-invocation errors.
        // Wrap in a JSON envelope so the advertised application/json
        // mimeType is honest and agents can reliably JSON.parse the body.
        const translated = translateError(err, "cascade://sites");
        const firstBlock = translated.content[0];
        const errorText =
          firstBlock && firstBlock.type === "text"
            ? firstBlock.text
            : "cascade://sites failed: unknown error";
        return textResource(
          uri,
          JSON.stringify({ error: errorText }, null, 2),
        );
      }
    },
  );
}
