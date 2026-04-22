# cascade-cms-mcp-server

An MCP (Model Context Protocol) server that exposes the Cascade CMS REST API to LLMs and agents. Wraps the [cascade-cms-api](https://github.com/kuklaph/cascade-cms-api) library and provides Zod input validation, markdown/JSON response formatting, and actionable error messages for AI consumers.

Built in TypeScript on [Bun](https://bun.sh). **26 tools**: 25 Cascade tools across 9 cohorts (CRUD, search, sites, access rights, workflow, messages, check in/out, audits/preferences, publish) plus 1 retrieval tool (`cascade_read_response`) for accessing oversize responses by handle. **2 MCP resources** (`cascade://entity-types`, `cascade://sites`). Paginated results on `cascade_search`, `cascade_list_messages`, `cascade_read_audits`. Oversize responses are stored in an in-memory LRU cache and accessible by handle. Every tool invocation emits a single-line audit record to stderr.

## Requirements

- **Claude Code plugin users**: Node 18+ (Claude Code spawns the MCP server via `npx`).
- **MCP client config users** (Claude Desktop, Cline, etc.): Node 18+ (for `npx`) **or** Bun 1.0+ (for `bunx`). Either works — `bunx` is faster if you already have Bun.
- **Contributors**: Bun 1.0+ for the dev toolchain (tests, watch mode) — see [Development](#development).
- A Cascade CMS instance (v8.1.1+) with an API key.
- An MCP client (Claude Code, Claude Desktop, Cline, MCP Inspector, or any compliant agent).

## Quick Start

Pick whichever path matches your client:

### Option A: Claude Code Plugin (auto-registers the MCP server)

If you use [Claude Code](https://docs.claude.com/en/docs/claude-code), install this repo as a plugin. The bundled `.claude-plugin/plugin.json` declares the MCP server inline (via its `mcpServers` field) so Claude Code auto-registers it on install — no manual config file edit.

1. Add this repo as a plugin source in Claude Code and install the `cascade-cms` plugin. The exact command varies by Claude Code version — see the [plugin documentation](https://docs.claude.com/en/docs/claude-code/plugins).
2. Set credentials in your **shell environment** (not a JSON config — Claude Code plugins read env vars from your shell at subprocess spawn):

   **POSIX** (add to `~/.bashrc`, `~/.zshrc`, or your shell's rc file):
   ```bash
   export CASCADE_API_KEY="your_api_key_here"
   export CASCADE_URL="https://yourorg.cascadecms.com/api/v1/"
   ```

   **Windows PowerShell** (add to `$PROFILE`):
   ```powershell
   $env:CASCADE_API_KEY = "your_api_key_here"
   $env:CASCADE_URL = "https://yourorg.cascadecms.com/api/v1/"
   ```

3. Make sure the env vars are set in the shell session that launches Claude Code. If Claude Code was already running when you set them, close it, open a new terminal so the updated env loads, then relaunch Claude Code from that terminal. Tools become available as `mcp__plugin_cascade-cms_cascade-cms__cascade_<op>`.

> **Credentials note**: If `CASCADE_API_KEY` or `CASCADE_URL` is unset when Claude Code spawns the server, the server exits fast with a clear error and tools will appear non-functional. Verify without leaking the secret to shell history:
>
> **POSIX**: `[ -n "$CASCADE_API_KEY" ] && echo "set" || echo "UNSET"`
>
> **PowerShell**: `if ($env:CASCADE_API_KEY) { "set" } else { "UNSET" }`

### Option B: MCP Client Config (Claude Desktop, Cline, and other MCP clients)

Add a server entry to your MCP client's config. Example for **Claude Desktop** (Windows, macOS — Anthropic does not ship Claude Desktop for Linux; on Linux use Claude Code via Option A, Cline, or another MCP-compatible client).

Edit `claude_desktop_config.json`:

- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "cascade-cms": {
      "command": "bunx",
      "args": ["cascade-cms-mcp-server"],
      "env": {
        "CASCADE_API_KEY": "your_api_key_here",
        "CASCADE_URL": "https://yourorg.cascadecms.com/api/v1/"
      }
    }
  }
}
```

Restart the client. `bunx` fetches the package on first run and caches it (recommended for speed if you have [Bun](https://bun.sh) installed).

**Node-only alternative** — swap `bunx` for `npx` if you don't have Bun:

```json
"command": "npx",
"args": ["-y", "cascade-cms-mcp-server"]
```

Both resolve to the same entry point (`dist/index.js`) via the package's `bin`; choose whichever is already on your machine. Credentials go **inline in the `env` block** (easier than Option A's shell-env setup) since the MCP client reads them directly from the config file.

### Environment variables

Whichever path you pick, the same three variables control the server:

| Variable             | Required | Description                                                           |
| -------------------- | :------: | --------------------------------------------------------------------- |
| `CASCADE_API_KEY`    |   Yes    | API key generated from your Cascade dashboard                         |
| `CASCADE_URL`        |   Yes    | Your Cascade API URL (e.g., `https://yourorg.cascadecms.com/api/v1/`) |
| `CASCADE_TIMEOUT_MS` |    No    | Request timeout in milliseconds (default: 30000)                      |

The server exits with a clear error on startup if `CASCADE_API_KEY` or `CASCADE_URL` is missing or invalid.

#### Encrypted values (optional)

Any of the three env vars can be an [envlock](https://github.com/kuklaph/envlock) ciphertext (`enc:<iv>:<authTag>:<ciphertext>`) instead of plaintext — useful when the value would otherwise sit in plain sight inside an MCP client config file. envlock is an optional peer dependency; install it globally only if you want to use encrypted values:

```sh
bun install -g envlock   # or: npm install -g envlock
envlock set CASCADE_API_KEY "sk-your-key"   # run in a throwaway dir, then copy the enc:... output
```

If an `enc:` value is detected but envlock isn't installed, the server exits with an actionable error. Decryption errors (tampered ciphertext, wrong master key) also exit cleanly without leaking the ciphertext. Plaintext values pass through untouched and envlock is never loaded.

## MCP Client Configuration

### Claude Desktop

The Quick Start snippet above is the canonical form. Restart Claude Desktop after editing the config file; the MCP server spawns automatically when Claude starts.

### Claude Code

Three ways to add this to Claude Code, in order of recommended UX:

**Option 1 — Install as a plugin (recommended)**: See [Option A in Quick Start](#option-a-claude-code-plugin-auto-registers-the-mcp-server). The plugin's `plugin.json` declares the MCP server inline, so Claude Code auto-registers it on install.

**Option 2 — Project-scoped `.mcp.json`** at your repo root (manual MCP config Claude Code reads for this project only; same `mcpServers` shape as any MCP client config):

```json
{
  "mcpServers": {
    "cascade-cms": {
      "command": "bunx",
      "args": ["cascade-cms-mcp-server"],
      "env": {
        "CASCADE_API_KEY": "your_api_key_here",
        "CASCADE_URL": "https://yourorg.cascadecms.com/api/v1/"
      }
    }
  }
}
```

Swap `bunx` → `npx` (with `"args": ["-y", "cascade-cms-mcp-server"]`) if you don't have Bun installed.

**Option 3 — CLI**: `claude mcp add` with the same command/args/env values.

### MCP Inspector

Interactive debug UI (recommended — uses `bunx`):

```bash
bunx @modelcontextprotocol/inspector bunx cascade-cms-mcp-server
```

Or with `npx` if you don't have Bun:

```bash
npx @modelcontextprotocol/inspector npx -y cascade-cms-mcp-server
```

CLI mode (list tools without the UI):

```bash
# POSIX shell (bash, zsh) — bunx preferred:
CASCADE_API_KEY=... CASCADE_URL=... \
  bunx @modelcontextprotocol/inspector --cli \
  bunx cascade-cms-mcp-server --method tools/list
```

On Windows, set env vars separately first. PowerShell:

```powershell
$env:CASCADE_API_KEY="..."
$env:CASCADE_URL="..."
bunx @modelcontextprotocol/inspector --cli bunx cascade-cms-mcp-server --method tools/list
```

Or Windows `cmd`:

```cmd
set CASCADE_API_KEY=...
set CASCADE_URL=...
bunx @modelcontextprotocol/inspector --cli bunx cascade-cms-mcp-server --method tools/list
```

Every invocation above works with `npx` (with `-y` on the package) if Bun isn't installed. Both tools resolve the published package identically.

The Inspector will list all 26 tools and 2 resources, and let you invoke them interactively.

## Audit Logging

Every tool invocation emits a single line to stderr. Format:

```
[cascade-cms-mcp-server] cascade_read: ok in 234ms
[cascade-cms-mcp-server] cascade_create: error in 123ms — "Permission denied"
```

Error suffixes are passed through the same secret-redaction pipeline as user-facing errors, newlines are collapsed, and length is capped at 500 characters. stdout stays reserved for the MCP JSON-RPC protocol stream.

Claude Desktop and similar clients typically route server stderr to a log file; check your client docs for the location.

## Tool Catalog

Every tool accepts an optional `response_format` parameter (`"markdown"` or `"json"`, default `"markdown"`). Every tool returns a Cascade `OperationResult` wrapped in MCP `content` + `structuredContent`. The `structuredContent` carries the raw Cascade response (primitives are wrapped as `{ value: X }`; null/empty as `{}`).

**Oversize handling**: When a tool's rendered text exceeds 25,000 characters, the server stores the full payload in an in-memory cache, returns a 20,000-char preview + handle in `content[0].text`, and adds a `_cache` envelope (`{handle, bytes_total, bytes_returned, tool}`) to `structuredContent`. Use [`cascade_read_response`](#response-cache) to fetch additional bytes by handle and offset. See [Response Cache](#response-cache) for the full pattern.

**MCP annotations**: Each tool also sets `destructiveHint`, `idempotentHint`, and `openWorldHint` per MCP conventions. Tools marked `destructiveHint: true` are `cascade_remove`, `cascade_delete_message`, and `cascade_publish_unpublish`. Inspect tool metadata via the [MCP Inspector](https://github.com/modelcontextprotocol/inspector) for full annotation details.

### Assets (CRUD)

| Tool             | Read-only | Description                                                                                    |
| ---------------- | :-------: | ---------------------------------------------------------------------------------------------- |
| `cascade_read`   |    Yes    | Read an asset by identifier (id or path + type). Accepts `response_detail: "summary" \| "full"` (default `full`) — `summary` strips heavy fields like `xhtml`, `structuredData`, file `data`, `pageConfigurations`. |
| `cascade_create` |    No     | Create a new asset (strict schemas for page/file/folder/block/symlink; passthrough for others) |
| `cascade_edit`   |    No     | Edit an existing asset                                                                         |
| `cascade_remove` |    No     | Delete an asset (with optional workflow + delete parameters)                                   |
| `cascade_move`   |    No     | Move and/or rename an asset                                                                    |
| `cascade_copy`   |    No     | Copy an asset to a new container with a new name                                               |

### Search

| Tool             | Read-only | Description                                                |
| ---------------- | :-------: | ---------------------------------------------------------- |
| `cascade_search` |    Yes    | Search assets by terms, field, and type filter (paginated) |

### Sites

| Tool                 | Read-only | Description                                                                |
| -------------------- | :-------: | -------------------------------------------------------------------------- |
| `cascade_list_sites` |    Yes    | List all sites accessible with current credentials                         |
| `cascade_site_copy`  |    No     | Copy an entire site to a new site with a new name (long-running operation) |

### Access Rights

| Tool                         | Read-only | Description                                         |
| ---------------------------- | :-------: | --------------------------------------------------- |
| `cascade_read_access_rights` |    Yes    | Read access rights for an asset                     |
| `cascade_edit_access_rights` |    No     | Modify access rights (optionally apply to children) |

### Workflow

| Tool                                  | Read-only | Description                               |
| ------------------------------------- | :-------: | ----------------------------------------- |
| `cascade_read_workflow_settings`      |    Yes    | Read workflow settings for a container    |
| `cascade_edit_workflow_settings`      |    No     | Update workflow settings for a container  |
| `cascade_read_workflow_information`   |    Yes    | Read in-flight workflow info for an asset |
| `cascade_perform_workflow_transition` |    No     | Advance a workflow to its next action     |

### Messages & Subscribers

| Tool                       | Read-only | Description                                                     |
| -------------------------- | :-------: | --------------------------------------------------------------- |
| `cascade_list_subscribers` |    Yes    | List users subscribed to an asset                               |
| `cascade_list_messages`    |    Yes    | List in-Cascade messages for the authenticated user (paginated) |
| `cascade_mark_message`     |    No     | Mark a message as read/unread/archive/unarchive                 |
| `cascade_delete_message`   |    No     | Permanently delete a message                                    |

### Check In / Check Out

| Tool                | Read-only | Description                                |
| ------------------- | :-------: | ------------------------------------------ |
| `cascade_check_out` |    No     | Lock an asset for exclusive editing        |
| `cascade_check_in`  |    No     | Release a checked-out asset with a comment |

### Audits & Preferences

| Tool                       | Read-only | Description                                            |
| -------------------------- | :-------: | ------------------------------------------------------ |
| `cascade_read_audits`      |    Yes    | Read audit log entries matching parameters (paginated) |
| `cascade_read_preferences` |    Yes    | Read system preferences                                |
| `cascade_edit_preference`  |    No     | Update a single system preference                      |

### Publish

| Tool                        | Read-only | Description                                                                  |
| --------------------------- | :-------: | ---------------------------------------------------------------------------- |
| `cascade_publish_unpublish` |    No     | Publish an asset (or unpublish with `unpublish: true` in publishInformation) |

### Response Cache

| Tool                     | Read-only | Description                                                                                  |
| ------------------------ | :-------: | -------------------------------------------------------------------------------------------- |
| `cascade_read_response`  |    Yes    | Retrieve a slice of an oversize cached response by handle (`{handle, offset?, length?}`). See [Response Cache](#response-cache) for the full pattern. |

## Resources

Resources expose URI-addressable reference data that agents can fetch via MCP `resources/read` without invoking a tool.

| URI                      |  Kind   | Description                                                                                                      |
| ------------------------ | :-----: | ---------------------------------------------------------------------------------------------------------------- |
| `cascade://entity-types` | Static  | JSON listing all Cascade entity type strings (page, file, folder, block, template, etc.) with short descriptions |
| `cascade://sites`        | Dynamic | Live `listSites()` result (JSON). On upstream failure, body is a JSON error envelope: `{ "error": "..." }`       |

Both resources advertise `application/json`. The error envelope on `cascade://sites` is a valid JSON object, so agents can reliably `JSON.parse` the response without checking a separate error flag.

## Pagination

`cascade_search`, `cascade_list_messages`, and `cascade_read_audits` accept optional pagination fields and return pagination metadata in both `content` and `structuredContent`.

### Parameters

| Field    | Type   | Default | Bounds |
| -------- | ------ | :-----: | :----: |
| `limit`  | number |   50    | 1–500  |
| `offset` | number |    0    |  ≥ 0   |

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

Pagination is performed client-side by the MCP layer: Cascade's REST endpoints always return full result sets, and this server slices them before returning. Full data is always available in `structuredContent` if the agent prefers to process it in one pass; if the rendered text exceeds 25,000 characters, the [Response Cache](#response-cache) kicks in and the agent can retrieve additional bytes via `cascade_read_response`.

## Response Cache

When a tool's rendered response text exceeds 25,000 characters, the server stores the full payload in an in-memory LRU cache and returns:

- **`content[0].text`** — a 20,000-char preview followed by a marker naming the handle and the retrieval tool
- **`structuredContent._cache`** — `{handle, bytes_total, bytes_returned, tool}`, where `tool` is always `"cascade_read_response"`
- **`structuredContent`** — the original raw response object, untouched alongside `_cache` (machine-readable clients see everything)

The marker text looks like:

```
---
[Preview truncated at 20000 of 145000 chars. Full response retained as handle h_550e8400-e29b-41d4-a716-446655440000. To retrieve more: call cascade_read_response({handle, offset, length}). Slice with offset:20000 to continue. See structuredContent._cache for machine-readable metadata.]
```

### Retrieving more bytes

Call `cascade_read_response` with the handle plus an offset and length:

```json
{
  "tool": "cascade_read_response",
  "arguments": { "handle": "h_550e8400-...", "offset": 20000, "length": 25000 }
}
```

Returns:

```json
{
  "success": true,
  "handle": "h_550e8400-...",
  "bytes_total": 145000,
  "offset": 20000,
  "bytes_returned": 25000,
  "has_more": true,
  "next_offset": 45000
}
```

The slice text itself appears in `content[0].text` (raw, not JSON-fenced). `length` is capped at 25,000 chars per call; iterate via `next_offset` until `has_more: false`.

### Cache policy

| Setting              | Value           | Notes                                                            |
| -------------------- | --------------- | ---------------------------------------------------------------- |
| Eviction             | LRU             | Last 10 oversize responses retained; recency refreshed on `get`  |
| Per-entry cap        | 2 MB            | Larger payloads store a "[entry too large]" marker by the handle |
| Total memory         | ~20 MB max      | Bounded by the two caps above                                    |
| TTL                  | None            | Process-scoped; cache dies when the stdio server exits           |
| Handle format        | `h_<uuid>` (38 chars) | Cryptographically random via `crypto.randomUUID()`         |

If a handle is missing or evicted, `cascade_read_response` returns `isError: true` with a message naming the handle and suggesting to re-run the originating tool.

### Avoiding the cache up front

For `cascade_read`, set `response_detail: "summary"` to project out heavy fields (`xhtml`, `structuredData`, `pageConfigurations`, file `data`/`text`) before rendering. The lean projection keeps `id`, `name`, `path`, `type`, `lastModifiedDate`, and `metadata`. Useful for discovery passes where you just need to know an asset exists or what it's named.

```json
{
  "tool": "cascade_read",
  "arguments": {
    "identifier": { "id": "abc123", "type": "page" },
    "response_detail": "summary"
  }
}
```

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
- `response_format: "json"` — pretty-printed JSON of the raw Cascade response. Best for programmatic chaining.

The raw Cascade response object is always passed through to `structuredContent` (null/empty is wrapped as `{}`; primitives as `{ value: X }`). When a rendered response exceeds 25,000 characters, the [Response Cache](#response-cache) intercepts it: `content[0].text` becomes a 20,000-char preview + handle, `structuredContent` keeps the full raw object plus a `_cache` envelope, and the agent can fetch additional bytes via `cascade_read_response`.

## Asset Input Schemas

For `cascade_create` and `cascade_edit`, the `asset` field is a discriminated union on `type`:

- **Strict schemas** for common types: `page`, `file`, `folder`, `block`, `symlink`. These enforce required fields (`name`, `parentFolderPath` or `parentFolderId`, `siteId` or `siteName`, type-specific fields like `contentTypePath` for pages or `linkURL` for symlinks).
- **Passthrough fallback** for the 50+ other Cascade asset types (template, workflow, format, metadataset, etc.). The `type` field is validated against the full entity type enum; all other fields pass through to Cascade.

If Cascade returns a validation error for a passthrough asset, the error message surfaces directly in the MCP response.

## Development

For contributors and those wanting to run a local build or modify the server. End users do not need to clone — use the `npx` snippet in [Quick Start](#quick-start).

### Setup

```bash
git clone https://github.com/kuklaph/cascade-cms-mcp-server
cd cascade-cms-mcp-server
bun install
```

Optional: copy `.env.example` to `.env` and fill in credentials for local smoke tests (the MCP client's `env` block is the production path; `.env` is a developer convenience).

### Commands

The dev loop requires Bun (scripts shell out to `bun run`). End users running the published package only need Node 18+.

```bash
bun test                 # Run all tests (~290 tests across 23 files)
bun run typecheck        # Type-check with tsc --noEmit
bun run build            # Compile src/ → dist/ via tsconfig.build.json
bun run smoke:node       # Boot dist/index.js with Node, verify startup banner
bun run dev              # Watch mode (runs src/index.ts on save)
bun start                # Run src/index.ts once with Bun
node dist/index.js       # Run the built output with Node (after bun run build)
```

### Publishing

`prepublishOnly` runs `bun test && bun run build && bun run smoke:node` automatically before `npm publish` / `bun publish`, so a broken tree cannot ship. The smoke test boots `node dist/index.js` with dummy credentials and requires the startup banner on stderr, catching any Node-runtime regression that the Bun test suite can't see. The published package ships only `dist/`, `README.md`, and `LICENSE` (see `"files"` in `package.json`).

### Project Structure

```
.claude-plugin/
  plugin.json           Claude Code plugin manifest (name, metadata,
                        and inline mcpServers config for the plugin)
  marketplace.json      Single-plugin marketplace catalog for
                        /plugin marketplace add
src/
  index.ts              stdio bootstrap (redirects console.* → stderr)
  server.ts             createServer() factory (wires all 9 tool cohorts + retrieval tool + 2 resources)
  client.ts             Cascade API client factory
  config.ts             env validation
  errors.ts             error translation to MCP format (+ exported redactSecrets)
  formatting.ts         markdown/JSON response formatting + oversize handle minting
  constants.ts          character limit, preview limit, cache caps, server name/version
  audit.ts              stderr audit-log line per invocation (redacts + sanitizes)
  pagination.ts         client-side pagination helper + paginatedHandler factory
  cache.ts              in-memory LRU response cache for oversize payloads
  resources.ts          MCP resource registrations (cascade://entity-types, cascade://sites)
  tools/
    helper.ts           registerCascadeTool shared helper + CascadeDeps interface
    crud.ts             read, create, edit, remove, move, copy (read supports response_detail)
    search.ts           search (paginated)
    sites.ts            list_sites, site_copy
    access.ts           read/edit_access_rights
    workflow.ts         4 workflow tools
    messages.ts         4 message tools (list_messages paginated)
    checkout.ts         check_out, check_in
    audits.ts           read_audits (paginated), read/edit_preference
    publish.ts          publish_unpublish
    readResponse.ts     cascade_read_response (slice retrieval by handle)
  schemas/
    common.ts           Identifier, EntityType, Path, ResponseFormat, ResponseDetail
    assets.ts           Discriminated asset union + passthrough fallback
    requests.ts         26 Zod request schemas (25 Cascade + 1 retrieval, + PaginationFields mixin)
tests/
  unit/                 mirrors src/ (includes audit, pagination, resources)
  integration/          end-to-end server wiring tests
  fixtures/             mock client + mock server helpers + canned responses
```

## How It Works

Both install paths converge on the same built `dist/index.js` running under Node. The difference is who registers the MCP server with the client:

```
 ┌───────────────────────────────┐   ┌───────────────────────────────┐
 │ Claude Code (plugin)          │   │ Claude Desktop / Cline /      │
 │                               │   │ other MCP clients             │
 │ /plugin install cascade-cms   │   │ edit config.json              │
 │            │                  │   │            │                  │
 └────────────┼──────────────────┘   └────────────┼──────────────────┘
              │ auto-registers from               │ manual entry
              ▼                                   ▼
     .claude-plugin/plugin.json          "command": "bunx" or "npx"
     mcpServers field (inline)           "args": ["cascade-cms-mcp-server"]
     pins "command": "npx",              (user choice; -y required for npx)
     "args": ["-y", ...]
              │                                   │
              └────────────────┬──────────────────┘
                               ▼
            npx -y cascade-cms-mcp-server  /  bunx cascade-cms-mcp-server
                 (resolves the npm package's bin)
                               │
                               ▼
                 dist/index.js (#!/usr/bin/env node)
                               │
                               ▼
                        Cascade CMS API
```

1. The MCP client spawns the server subprocess. For plugin users, Claude Code reads the `mcpServers` field inline in `plugin.json` and runs `npx -y cascade-cms-mcp-server` with env vars from the user's shell. For MCP-config users, the client runs `bunx cascade-cms-mcp-server` (or `npx -y`) with env vars from the config's `env` block. Either way, the runner resolves the package's `bin` entry to `dist/index.js`, and the `#!/usr/bin/env node` shebang routes execution through Node. The entry point redirects `console.*` to stderr (guards the stdio protocol stream from accidental stdout writes by dependencies), validates config, builds a Cascade client from `cascade-cms-api`, creates an MCP server, registers 25 Cascade tools + the `cascade_read_response` retrieval tool + 2 resources, and connects over stdio.
2. Each cohort file (`src/tools/<cohort>.ts`) calls `registerCascadeTool(server, config, deps)` for each of its tools, where `deps` carries the shared response cache.
3. The helper wraps the tool handler with: start timer → Zod input validation → delegate to the Cascade client method → format response (markdown or JSON) → catch + translate errors to MCP `isError: true` results → emit a stderr audit record (`ok`/`error` + duration + redacted error text).
4. Paginated tools (`cascade_search`, `cascade_list_messages`, `cascade_read_audits`) extract `limit`/`offset` from input, call Cascade for the full result set, and slice client-side via `paginatedHandler`.
5. When rendered text exceeds 25,000 characters, `formatResponse` mints a handle, stores the full text in the in-memory LRU cache, and returns a 20,000-char preview + handle. The companion `cascade_read_response` tool retrieves slices by handle. See [Response Cache](#response-cache).
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
