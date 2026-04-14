/**
 * Response formatting for the Cascade CMS MCP server.
 *
 * Produces MCP-compliant `CallToolResult` objects with both:
 *   - `content`: text (markdown or JSON, truncated if over CHARACTER_LIMIT)
 *   - `structuredContent`: the raw result object (NEVER truncated)
 *
 * LLM agents get readable text by default (markdown), can request
 * full JSON via `response_format: "json"`, or can programmatically
 * consume `structuredContent` when they need complete data.
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { CHARACTER_LIMIT } from "./constants.js";

export type ResponseFormat = "markdown" | "json";

/** Optional custom markdown renderer for a tool. */
export type MarkdownRenderer = (result: unknown) => string;

/**
 * Format a tool result into an MCP `CallToolResult`.
 *
 * @param result       - Raw result from the Cascade API (any shape).
 * @param format       - "markdown" (human-friendly) or "json" (raw).
 * @param toolName     - Used in default markdown rendering and context.
 * @param renderMarkdown - Optional per-tool markdown override (ignored in json mode).
 */
export function formatResponse(
  result: unknown,
  format: ResponseFormat,
  toolName: string,
  renderMarkdown?: MarkdownRenderer,
): CallToolResult {
  // Build the text block.
  let text: string;
  if (format === "json") {
    text = renderJson(result);
  } else {
    text = renderMarkdown
      ? renderMarkdown(result)
      : defaultMarkdown(result, toolName);
  }

  // Ensure non-empty text so agents always see something.
  if (text.length === 0) {
    text = "(empty response)";
  }

  text = truncate(text);

  return {
    content: [{ type: "text", text }],
    structuredContent: toStructured(result),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderJson(result: unknown): string {
  if (result === undefined) return "undefined";
  if (result === null) return "null";
  return JSON.stringify(result, null, 2);
}

function toStructured(result: unknown): Record<string, unknown> {
  if (result === null || result === undefined) return {};
  if (typeof result !== "object") {
    return { value: result };
  }
  return result as Record<string, unknown>;
}

function truncate(text: string): string {
  if (text.length <= CHARACTER_LIMIT) return text;
  const omitted = text.length - CHARACTER_LIMIT;
  return (
    text.slice(0, CHARACTER_LIMIT) +
    `\n\n[truncated — ${omitted} chars omitted. Use response_format="json" for full data]`
  );
}

/**
 * Default markdown renderer — handles the common Cascade response shapes
 * without needing per-tool overrides.
 */
function defaultMarkdown(result: unknown, toolName: string): string {
  if (result === null || result === undefined) {
    return "(empty response)";
  }

  if (typeof result !== "object") {
    return codeFence(String(result));
  }

  const obj = result as Record<string, unknown>;

  // Search-style: { success: true, matches: [...] } → table.
  if (obj.success === true && Array.isArray(obj.matches)) {
    return renderMatchesTable(obj.matches, toolName);
  }

  // Success OperationResult: bullet list of keys.
  if (obj.success === true) {
    return renderOperationResult(obj, toolName);
  }

  // Fallback: JSON in a code fence.
  return codeFence(JSON.stringify(obj, null, 2));
}

function renderOperationResult(
  obj: Record<string, unknown>,
  toolName: string,
): string {
  const lines: string[] = [`## ${toolName} succeeded`];
  for (const [key, value] of Object.entries(obj)) {
    if (key === "success") continue;
    lines.push(`- **${key}**: ${shortValue(value)}`);
  }
  return lines.join("\n");
}

function renderMatchesTable(matches: unknown[], toolName: string): string {
  const header = `## ${toolName} results (${matches.length} match${matches.length === 1 ? "" : "es"})`;
  const tableHeader = "| type | id | path |";
  const tableSep = "| --- | --- | --- |";
  const rows = matches.map((m) => {
    const rec = (m ?? {}) as Record<string, unknown>;
    const pathObj = rec.path as { path?: unknown } | undefined;
    return `| ${shortValue(rec.type)} | ${shortValue(rec.id)} | ${shortValue(pathObj?.path)} |`;
  });
  return [header, "", tableHeader, tableSep, ...rows].join("\n");
}

function shortValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}

function codeFence(content: string): string {
  return "```json\n" + content + "\n```";
}
