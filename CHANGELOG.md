# Changelog

All notable changes to `cascade-cms-mcp-server` will be documented here.

## Unreleased

### Added

- Added `browser_list_asset_versions` to retrieve an asset's complete version history through the authenticated Cascade browser session.

### Breaking Changes

- Renamed the local cached-response reader from `read_response` to `local_read_cached_response`.
- Prefixed all 25 direct Cascade REST tools with `api_`; for example, `read`, `edit`, and `list_sites` are now `api_read`, `api_edit`, and `api_list_sites`.
- Asset-targeted `api_read_audits` calls must move `identifier` from `auditParameters.identifier` to the request's top-level `identifier` field.

### Changed

- Existing unprefixed and `cascade_*` tool-block rules continue matching renamed `api_*` tools. Generated site protections now store `api_remove` and `api_move`.
- Asset-specific tool-block rules now recognize the flat `asset_id` and `asset_type` fields used by browser asset tools.
- Made `api_read` preview the primary read path and reserved raw mode for cases where preview or cached inspection cannot provide the required data.
- Updated `cascade-cms-api` to `^2.1.0`, whose published audit request types match the corrected REST contract.

### Fixed

- Removed the preview warning that recommended raw mode solely because an asset had no `structuredData`.
- Corrected `api_read_audits` to accept asset identifiers at the request top level, require an asset/user/group/role target, and document Cascade's textual audit-date format.

## 2.1.0 - 2026-07-23

### Added

- Draft open and validation responses now include `approval_asset`, `approval_path`, and `approval_url` aliases for compact approval previews. Submit accepts these optional aliases and verifies every supplied value against the current draft.
- Added `CASCADE_MAX_CONCURRENT_REQUESTS` to configure concurrent logical Cascade API operations per MCP process. The default is 10.

### Breaking Changes

- `local_draft_submit` now requires approval context fields for the Cascade URL, title, display name, asset and parent placement, asset type, asset name, site name, and site ID. Copy the final values from `local_draft_validate` after any patch that could change them.
- Read-only cached-asset JSON Pointer fields now reject the reserved object-key segments `__proto__`, `prototype`, and `constructor`.

### Changed

- Updated `@modelcontextprotocol/server` from `2.0.0-alpha.2` to `2.0.0-beta.5` and removed the no-longer-required direct `@cfworker/json-schema` dependency.
- Oversized response envelopes and `read_response` now expose `characters_total` and `characters_returned`; offsets and character counts use JavaScript UTF-16 code units. `bytes_total` and `bytes_returned` remain as deprecated compatibility aliases and are not byte counts.
- `CASCADE_BROWSER_URL` is now normalized and validated before server tools use it. It must use HTTPS. Its host must match the `CASCADE_URL` host, have a parent/subdomain relationship, or share the `cascadecms.com` service domain. Credentials, queries, and fragments are rejected.
- Normal Cascade API operations now use a FIFO concurrency limit that covers each complete logical operation, including retries. Additional normal operations wait without a fixed queue cap. This limits logical operations rather than physical HTTP fetches.
- Browser session operations now run one at a time through validation, login or site selection, cookie use, expiry recovery, retry, and completion. The existing 3-second browser request-start spacing remains unchanged.

### Fixed

- Draft approval asset URLs now use the origin of `CASCADE_URL`; `CASCADE_BROWSER_URL` remains limited to browser-backed operations.
- Expired browser workflows now re-authenticate and retry in the explicitly selected active site instead of reverting to the configured `CASCADE_BROWSER_SITE_ID`.
- Draft browser URLs for all block subtypes now use Cascade's generic `type=block` editor URL.

## 2.0.1 - 2026-06-30

### Changed

- Tool-block `create` rules now match create payloads by intended parent path plus asset name, letting matching local draft workflows fail before local draft work continues.
- Local draft initiation and scaffold workflows now check final or generated tool-block payloads before creating or committing local draft state when the target is known.
- Generated site/root-folder protection rules now block both `remove` and `move`.

## 2.0.0 - 2026-06-22

### Breaking Changes

- Migrated the MCP server runtime from `@modelcontextprotocol/sdk` v1 to `@modelcontextprotocol/server@2.0.0-alpha.2`.
- Raised the supported Node.js runtime to Node 20 or newer.
- Removed the redundant `cascade_` prefix from public MCP tool names.
- Renamed MCP-local draft tools from `cascade_draft_*` to `local_draft_*` to distinguish local payload drafts from Cascade browser draft state.
- Renamed cached reference response `source_scope` from `cascade_references` to `asset_references`.

### Changed

- Browser-backed requests now start at most once every 3 seconds per MCP session to reduce pressure on Cascade browser UI endpoints.
- Added `@cfworker/json-schema` as a direct runtime dependency required by `@modelcontextprotocol/server`.
- Clarified `search` guidance for pass-through Cascade search syntax, quoted phrase searches, wildcard searches, and optional `searchFields` / `searchTypes` narrowing filters.

## 2.0.0-alpha.0 - 2026-06-11

### Breaking Changes

- Migrated the MCP server runtime from `@modelcontextprotocol/sdk` v1 to `@modelcontextprotocol/server@2.0.0-alpha.2`.
- Raised the supported Node.js runtime to Node 20 or newer.

### Changed

- Browser-backed requests now start at most once every 3 seconds per MCP session to reduce pressure on Cascade browser UI endpoints.
- Added `@cfworker/json-schema` as a direct runtime dependency required by the MCP server v2 alpha package.
- Clarified `cascade_search` guidance for pass-through Cascade search syntax, quoted phrase searches, wildcard searches, and optional `searchFields` / `searchTypes` narrowing filters.

## 1.1.3 - 2026-06-10

### Added

- Added `CHANGELOG.md` to the npm package files.
- Added browser-backed tools for Cascade browser UI login, active draft notification checks, and snippet administration.
- Added `cascade_draft_set_file_data` to set draft `file.data` from exactly one local path or base64 payload, preserving real `text` values and removing only null scaffold placeholders.
- Added `cascade_draft_*` tools for draft-based create/edit workflows: open, inspect, patch, validate, and submit complete asset payloads without mutating the original read cache.
- Added `cascade_draft_scaffold_create` to start create drafts from bare required scaffolds for every Cascade asset envelope.
- Added semantic structured-data helpers for cached assets and drafts: resolve nodes, assert values, and apply semantic draft patches that compile to existing JSON Pointer patch operations.
- Added `cascade_draft_scaffold_from_asset` to create create-safe drafts from an existing cached asset shape by stripping read-only fields/recycled flags and clearing structured-data text and asset-reference values.
- Added `cascade_draft_mutation_plan_execute` for local sequential draft orchestration with stop-on-first-failure behavior and plan-level resolved-payload tool-block checks.
- Added `cascade://draft/{handle}/raw` for exact draft JSON retrieval guarded by draft read tool-block rules.
- Added `cascade_file_data_*` helpers for Cascade file binary data: inspect metadata, read bounded byte ranges, return magic-byte verified images as MCP image content, and export exact bytes to an explicit local path.

### Changed

- Updated `cascade-cms-api` to `^2.0.2` and aligned MCP validation with its generated TypeScript declarations.
- Tightened MCP input validation to mirror generated Cascade API request shapes instead of accepting loosely typed nested payloads.
- Modeled `workflowConfiguration` as an optional companion property beside one concrete asset envelope, matching Cascade's `Asset` shape.
- Browser-backed tools now cache the browser session in memory, auto-login when full browser config is present, and support `CASCADE_BROWSER_SITE_ID` for startup/default site activation.
- `cascade_create`, `cascade_edit`, and `cascade_draft_submit` now normalize `file.data` byte arrays to Cascade signed Java bytes.
- Draft file-data bytes are kept outside the draft JSON cache until submit so large uploads do not trip the draft JSON size guard.
- Clarified README setup guidance for browser API environment values, production site ID lookup, and agent-facing tool references.
- Clarified cached asset and draft helper descriptions so agents choose search, list, and scalar-artifact tools correctly.
- `cascade_file_data_image` now returns image-only MCP content with no JSON text or structured metadata; use `cascade_file_data_info` separately for file metadata.
- Tightened draft patch/submit revision checks and `editorConfiguration` site validation to match Cascade API type requirements.
- `cascade_read` preview now summarizes Cascade `file.data` byte arrays instead of indexing every byte, preserving exact raw JSON while keeping binary file previews bounded.
- File-data export is marked as a destructive local filesystem write, rejects single binary payloads over 100 MiB, and the read cache evicts older binary entries after 250 MiB of cached binary data.

### Fixed

- Preserved browser endpoint `success: false` mutation responses and surfaced non-auth browser HTTP failures without clearing valid sessions.
- Prevented concurrent `cascade_draft_submit` calls for the same draft from submitting the same revision twice.
- Serialized `cascade_tool_blocks` and `cascade_protect_site_removal` repository updates so concurrent guardrail changes do not overwrite each other.
- Redacted unreadable root-folder errors returned by `cascade_protect_site_removal`.
- Cleared credential fields when scaffolding create drafts from existing assets.
- Returned live draft-cache state in mutation-plan `current_drafts` summaries after submit or in-flight draft changes.
- Aligned `cascade_draft_list_nodelets` with the cached asset nodelet response shape.
- Added missing `facebookConnector` asset envelope validation coverage and removed stale `target` asset assumptions.

## 1.1.2 - 2026-05-12

### Added

- Added local tool-block guardrails for preventing matching Cascade tool calls before execution.
- Added a server version tool for MCP reachability and version checks.

### Changed

- Updated `@modelcontextprotocol/sdk` to `^1.29.0`.
- Updated `zod` to `^4.4.3`.
- Adapted validation error handling for Zod 4 issue shapes while preserving the existing `valid_values` response field.
- Tightened MCP response contracts, structured content, oversized-response handling, and cached follow-up tool guidance.
- Reorganized README setup, tool permission, encrypted environment value, and workflow documentation.
- Added dependency overrides for vulnerable transitive SDK dependencies used by both Bun and npm installs.

### Fixed

- Preserved MCP client schema-description coverage with Zod 4-safe assertions.
- Blocked direct site and root-folder removal through `cascade_remove`.
- Clarified access-rights group ID wording.
