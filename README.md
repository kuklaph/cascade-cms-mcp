# cascade-cms-mcp-server

An MCP (Model Context Protocol) server that exposes the Cascade CMS REST API to LLMs and agents. Wraps the [cascade-cms-api](https://github.com/kuklaph/cascade-cms-api) library and provides Zod input validation, markdown/JSON response formatting, and actionable error messages for AI consumers.

Built in TypeScript on [Bun](https://bun.sh). **25 tools** across 9 cohorts (CRUD, search, sites, access rights, workflow, messages, check in/out, audits/preferences, publish) plus **2 MCP resources** (`cascade://entity-types`, `cascade://sites`). Paginated results on `cascade_search`, `cascade_list_messages`, `cascade_read_audits`. Every tool invocation emits a single-line audit record to stderr.

## Requirements

- Bun 1.0 or later
- A Cascade CMS instance (v8.1.1+) with an API key
- An MCP client (Claude Desktop, MCP Inspector, or any compliant agent)

## Installation

```bash
bun install
```

## Configuration

Copy `.env.example` to `.env` and fill in your Cascade credentials:

```bash
cp .env.example .env
```

```
CASCADE_API_KEY=your_api_key_here
CASCADE_URL=https://yourorg.cascadecms.com/api/v1/
# Optional:
# CASCADE_TIMEOUT_MS=30000
```

| Variable | Required | Description |
|----------|----------|-------------|
| `CASCADE_API_KEY` | Yes | API key generated from your Cascade dashboard |
| `CASCADE_URL` | Yes | Your Cascade API URL (e.g., `https://yourorg.cascadecms.com/api/v1/`) |
| `CASCADE_TIMEOUT_MS` | No | Request timeout in milliseconds (default: 30000) |

The server refuses to start if either `CASCADE_API_KEY` or `CASCADE_URL` is missing or invalid.

## Running

```bash
bun start
```

The server listens on stdio. Log messages go to stderr; the MCP protocol stream uses stdout.

## MCP Client Configuration

### Claude Desktop

Add this to your Claude Desktop `config.json`:

```json
{
  "mcpServers": {
    "cascade-cms": {
      "command": "bun",
      "args": ["run", "C:\\path\\to\\cascade-cms-mcp\\src\\index.ts"],
      "env": {
        "CASCADE_API_KEY": "your_api_key_here",
        "CASCADE_URL": "https://yourorg.cascadecms.com/api/v1/"
      }
    }
  }
}
```

Adjust the path to match your install location. Restart Claude Desktop after editing.

### MCP Inspector

```bash
npx @modelcontextprotocol/inspector bun run src/index.ts
```

The Inspector will list all 25 tools and 2 resources, and let you invoke them interactively.

## Audit Logging

Every tool invocation emits a single line to stderr. Format:

```
[cascade-cms-mcp-server] cascade_read: ok in 234ms
[cascade-cms-mcp-server] cascade_create: error in 123ms — "Permission denied"
```

Error suffixes are passed through the same secret-redaction pipeline as user-facing errors, newlines are collapsed, and length is capped at 500 characters. stdout stays reserved for the MCP JSON-RPC protocol stream.

Claude Desktop and similar clients typically route server stderr to a log file; check your client docs for the location.

## Tool Catalog

Every tool accepts an optional `response_format` parameter (`"markdown"` or `"json"`, default `"markdown"`). Every tool returns a Cascade `OperationResult` wrapped in MCP `content` + `structuredContent`. The `structuredContent` carries the raw Cascade response (primitives are wrapped as `{ value: X }`; null/empty as `{}`). The `content` text is truncated at 25,000 characters in both formats — read `structuredContent` for guaranteed full data.

**MCP annotations**: Each tool also sets `destructiveHint`, `idempotentHint`, and `openWorldHint` per MCP conventions. Tools marked `destructiveHint: true` are `cascade_remove`, `cascade_delete_message`, and `cascade_publish_unpublish`. Inspect tool metadata via the [MCP Inspector](https://github.com/modelcontextprotocol/inspector) for full annotation details.

### Assets (CRUD)

| Tool | Read-only | Description |
|------|:---------:|-------------|
| `cascade_read` | Yes | Read an asset by identifier (id or path + type) |
| `cascade_create` | No | Create a new asset (strict schemas for page/file/folder/block/symlink; passthrough for others) |
| `cascade_edit` | No | Edit an existing asset |
| `cascade_remove` | No | Delete an asset (with optional workflow + delete parameters) |
| `cascade_move` | No | Move and/or rename an asset |
| `cascade_copy` | No | Copy an asset to a new container with a new name |

### Search

| Tool | Read-only | Description |
|------|:---------:|-------------|
| `cascade_search` | Yes | Search assets by terms, field, and type filter (paginated) |

### Sites

| Tool | Read-only | Description |
|------|:---------:|-------------|
| `cascade_list_sites` | Yes | List all sites accessible with current credentials |
| `cascade_site_copy` | No | Copy an entire site to a new site with a new name (long-running operation) |

### Access Rights

| Tool | Read-only | Description |
|------|:---------:|-------------|
| `cascade_read_access_rights` | Yes | Read access rights for an asset |
| `cascade_edit_access_rights` | No | Modify access rights (optionally apply to children) |

### Workflow

| Tool | Read-only | Description |
|------|:---------:|-------------|
| `cascade_read_workflow_settings` | Yes | Read workflow settings for a container |
| `cascade_edit_workflow_settings` | No | Update workflow settings for a container |
| `cascade_read_workflow_information` | Yes | Read in-flight workflow info for an asset |
| `cascade_perform_workflow_transition` | No | Advance a workflow to its next action |

### Messages & Subscribers

| Tool | Read-only | Description |
|------|:---------:|-------------|
| `cascade_list_subscribers` | Yes | List users subscribed to an asset |
| `cascade_list_messages` | Yes | List in-Cascade messages for the authenticated user (paginated) |
| `cascade_mark_message` | No | Mark a message as read/unread/archive/unarchive |
| `cascade_delete_message` | No | Permanently delete a message |

### Check In / Check Out

| Tool | Read-only | Description |
|------|:---------:|-------------|
| `cascade_check_out` | No | Lock an asset for exclusive editing |
| `cascade_check_in` | No | Release a checked-out asset with a comment |

### Audits & Preferences

| Tool | Read-only | Description |
|------|:---------:|-------------|
| `cascade_read_audits` | Yes | Read audit log entries matching parameters (paginated) |
| `cascade_read_preferences` | Yes | Read system preferences |
| `cascade_edit_preference` | No | Update a single system preference |

### Publish

| Tool | Read-only | Description |
|------|:---------:|-------------|
| `cascade_publish_unpublish` | No | Publish an asset (or unpublish with `unpublish: true` in publishInformation) |

## Resources

Resources expose URI-addressable reference data that agents can fetch via MCP `resources/read` without invoking a tool.

| URI | Kind | Description |
|-----|:----:|-------------|
| `cascade://entity-types` | Static | JSON listing all Cascade entity type strings (page, file, folder, block, template, etc.) with short descriptions |
| `cascade://sites` | Dynamic | Live `listSites()` result (JSON). On upstream failure, body is a JSON error envelope: `{ "error": "..." }` |

Both resources advertise `application/json`. The error envelope on `cascade://sites` is a valid JSON object, so agents can reliably `JSON.parse` the response without checking a separate error flag.

## Pagination

`cascade_search`, `cascade_list_messages`, and `cascade_read_audits` accept optional pagination fields and return pagination metadata in both `content` and `structuredContent`.

### Parameters

| Field | Type | Default | Bounds |
|-------|------|:-------:|:------:|
| `limit` | number | 50 | 1–500 |
| `offset` | number | 0 | ≥ 0 |

### Response envelope

```json
{
  "success": true,
  "total": 237,
  "count": 50,
  "offset": 0,
  "has_more": true,
  "next_offset": 50,
  "matches": [ ... ]
}
```

Arrays: `matches` (search), `messages` (list_messages), `audits` (read_audits).

### Iteration pattern

```
let offset = 0;
while (true) {
  const page = await call({ ..., limit: 100, offset });
  processPage(page.items);
  if (!page.has_more) break;
  offset = page.next_offset;
}
```

### Guidance for agents

- **Default `limit: 50` fits most queries.** Raise to 500 for bulk enumeration.
- **If `has_more: false`, stop.** Don't re-query; you've seen everything.
- **If you only need top matches** (e.g., "first file that mentions X"), stop as soon as the found item appears — don't exhaust the set.
- **For complete date-ranged audit exports**, loop until `has_more: false` to guarantee no gaps.

Pagination is performed client-side by the MCP layer: Cascade's REST endpoints always return full result sets, and this server slices them before returning. Full data is always available in `structuredContent` if the agent prefers to process it in one pass (with the usual 25,000-char text truncation applied to `content`).

## Example Tool Invocations

### Read a page by id

```json
{
  "tool": "cascade_read",
  "arguments": {
    "identifier": {
      "id": "d3631e59ac1easd2434bd70be3fbfe8148abc",
      "type": "page"
    }
  }
}
```

### Read a folder by path

```json
{
  "tool": "cascade_read",
  "arguments": {
    "identifier": {
      "path": { "path": "/about/team", "siteName": "www" },
      "type": "folder"
    }
  }
}
```

### Search for pages containing "admissions" (paginated)

```json
{
  "tool": "cascade_search",
  "arguments": {
    "searchInformation": {
      "searchTerms": "admissions",
      "searchTypes": ["page"],
      "searchFields": ["title", "summary"],
      "siteName": "www"
    },
    "limit": 100,
    "offset": 0
  }
}
```

Response `structuredContent`:

```json
{
  "success": true,
  "total": 237,
  "count": 100,
  "offset": 0,
  "has_more": true,
  "next_offset": 100,
  "matches": [ { "id": "...", "type": "page", "path": { "path": "/admissions", "siteName": "www" } }, ... ]
}
```

### Read audit log entries for April 2026

```json
{
  "tool": "cascade_read_audits",
  "arguments": {
    "auditParameters": {
      "auditType": "publish",
      "startDate": "2026-04-01T00:00:00Z",
      "endDate": "2026-04-30T23:59:59Z"
    },
    "limit": 200
  }
}
```

### List recent inbox messages

```json
{
  "tool": "cascade_list_messages",
  "arguments": { "limit": 20 }
}
```

### Create a page

```json
{
  "tool": "cascade_create",
  "arguments": {
    "asset": {
      "type": "page",
      "name": "new-page",
      "parentFolderPath": "/about",
      "siteName": "www",
      "contentTypePath": "/standard/content-type"
    }
  }
}
```

### Publish an asset

```json
{
  "tool": "cascade_publish_unpublish",
  "arguments": {
    "identifier": { "id": "abc123", "type": "page" },
    "publishInformation": { "unpublish": false }
  }
}
```

### Request JSON output instead of markdown

Add `response_format: "json"` to any call:

```json
{
  "tool": "cascade_read",
  "arguments": {
    "identifier": { "id": "abc123", "type": "page" },
    "response_format": "json"
  }
}
```

## Response Formats

- `response_format: "markdown"` (default) — human/LLM-readable markdown with key fields highlighted. Best for agent reasoning.
- `response_format: "json"` — pretty-printed JSON of the raw Cascade response. Best for programmatic chaining or when the markdown view truncates.

The raw Cascade response object is passed through to `structuredContent` regardless of format (null/empty is wrapped as `{}`; primitives as `{ value: X }`). Read `structuredContent` when you need guaranteed full data — text content is truncated at 25,000 characters in both markdown and JSON modes.

## Asset Input Schemas

For `cascade_create` and `cascade_edit`, the `asset` field is a discriminated union on `type`:

- **Strict schemas** for common types: `page`, `file`, `folder`, `block`, `symlink`. These enforce required fields (`name`, `parentFolderPath` or `parentFolderId`, `siteId` or `siteName`, type-specific fields like `contentTypePath` for pages or `linkURL` for symlinks).
- **Passthrough fallback** for the 50+ other Cascade asset types (template, workflow, format, metadataset, etc.). The `type` field is validated against the full entity type enum; all other fields pass through to Cascade.

If Cascade returns a validation error for a passthrough asset, the error message surfaces directly in the MCP response.

## Development

```bash
# Run all tests (238 tests across 21 files)
bun test

# Type-check the project
bun run typecheck

# Start the server in watch mode
bun run dev
```

### Project Structure

```
src/
  index.ts              stdio bootstrap (redirects console.* → stderr)
  server.ts             createServer() factory (wires all 9 tool cohorts + 2 resources)
  client.ts             Cascade API client factory
  config.ts             env validation
  errors.ts             error translation to MCP format (+ exported redactSecrets)
  formatting.ts         markdown/JSON response formatting
  constants.ts          character limit, server name/version
  audit.ts              stderr audit-log line per invocation (redacts + sanitizes)
  pagination.ts         client-side pagination helper + paginatedHandler factory
  resources.ts          MCP resource registrations (cascade://entity-types, cascade://sites)
  tools/
    helper.ts           registerCascadeTool shared helper
    crud.ts             read, create, edit, remove, move, copy
    search.ts           search (paginated)
    sites.ts            list_sites, site_copy
    access.ts           read/edit_access_rights
    workflow.ts         4 workflow tools
    messages.ts         4 message tools (list_messages paginated)
    checkout.ts         check_out, check_in
    audits.ts           read_audits (paginated), read/edit_preference
    publish.ts          publish_unpublish
  schemas/
    common.ts           Identifier, EntityType, Path, ResponseFormat
    assets.ts           Discriminated asset union + passthrough fallback
    requests.ts         25 Zod request schemas (+ PaginationFields mixin)
tests/
  unit/                 mirrors src/ (includes audit, pagination, resources)
  integration/          end-to-end server wiring tests
  fixtures/             mock client + mock server helpers + canned responses
```

## How It Works

1. `src/index.ts` redirects `console.*` to stderr (guards the stdio protocol stream from accidental stdout writes by dependencies), loads env vars, builds a Cascade client from `cascade-cms-api`, creates an MCP server, registers 25 tools plus 2 resources, and connects over stdio.
2. Each cohort file (`src/tools/<cohort>.ts`) calls `registerCascadeTool(server, config)` for each of its tools.
3. The helper wraps the tool handler with: start timer → Zod input validation → delegate to the Cascade client method → format response (markdown or JSON) → catch + translate errors to MCP `isError: true` results → emit a stderr audit record (`ok`/`error` + duration + redacted error text).
4. Paginated tools (`cascade_search`, `cascade_list_messages`, `cascade_read_audits`) extract `limit`/`offset` from input, call Cascade for the full result set, and slice client-side via `paginatedHandler`.
5. Truncation at 25,000 characters prevents oversized text responses. The raw data stays available via `structuredContent` regardless of format.
6. Resources (`cascade://entity-types`, `cascade://sites`) are registered alongside tools on the same server. Dynamic resource errors return a JSON error envelope so `application/json` parsing stays reliable.

## Security Notes

- API keys are loaded from environment variables only. The server never echoes, logs, or surfaces credential values in error messages (defensive redaction catches common patterns even if upstream errors ever embed them).
- All error messages are routed to the MCP client via `isError: true` results. Stack traces and internal details never reach the client.
- Input validation via Zod `.strict()` rejects unknown fields at the MCP boundary; rare passthrough cases are bounded by the discriminator enum.

## License

MIT — see [LICENSE](LICENSE).

## Related

- [cascade-cms-api](https://github.com/kuklaph/cascade-cms-api) — the underlying JavaScript client library
- [Model Context Protocol](https://modelcontextprotocol.io/) — the protocol specification
- [Cascade CMS REST API](https://www.hannonhill.com/cascadecms/latest/developing-in-cascade/rest-api/index.html) — upstream API documentation
