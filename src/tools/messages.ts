/**
 * Message tools: 4 user-mailbox and subscription operations.
 *
 *   cascade_list_subscribers — list users subscribed to an asset
 *   cascade_list_messages    — list the authenticated user's messages
 *   cascade_mark_message     — change a message's read/archive state
 *   cascade_delete_message   — permanently delete a message
 *
 * Each tool is a thin `registerCascadeTool` call delegating to the
 * matching `CascadeClient` method.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Types } from "cascade-cms-api";
import type { CascadeClient } from "../client.js";
import {
  registerCascadeTool,
  buildCascadeToolDescription,
  type CascadeDeps,
} from "./helper.js";
import {
  ListSubscribersRequestSchema,
  ListMessagesRequestSchema,
  MarkMessageRequestSchema,
  DeleteMessageRequestSchema,
} from "../schemas/requests.js";
import { paginatedHandler } from "../pagination.js";

export function registerMessageTools(
  server: McpServer,
  client: CascadeClient,
  deps?: CascadeDeps,
): void {
  registerCascadeTool(server, {
    name: "cascade_list_subscribers",
    title: "List Asset Subscribers",
    description: buildCascadeToolDescription(
      `List all users subscribed to notifications for a given asset.

Returns two arrays: auto-subscribers (users subscribed implicitly through ownership, workflow, or group membership) and manualSubscribers (users who explicitly opted in). Both arrays contain identifier references — names and IDs of the users/groups. Use this to audit notification reach before sending a message or publishing an asset.

Args:
  - identifier (object, required): The asset whose subscribers to list
    - id (string, optional): Asset ID (preferred)
    - path (object, optional): { path, siteId OR siteName }
    - type (string, required): Entity type of the asset

Returns:
  Cascade OperationResult:
  {
    success: true,
    subscribers: [ { id, type, path: { path, siteId, siteName } }, ... ],
    manualSubscribers: [ { id, type, path: { path, siteId, siteName } }, ... ]
  }
  On failure: { success: false, message: "<error>" }

Examples:
  - Use when: "Who gets notified when /about is edited?" -> { identifier: { type: "folder", path: { path: "/about", siteName: "www" } } }
  - Use when: "Audit manual subscriptions on a page" -> read manualSubscribers from the response.
  - Don't use when: You want to read messages sent — use cascade_list_messages.

Error Handling:
  - "Asset not found" when the identifier doesn't resolve
  - "Permission denied" when credentials lack read access`,
    ),
    inputSchema: ListSubscribersRequestSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: (input) => client.listSubscribers(input as unknown as Types.ListSubscribersRequest),
  }, deps);

  registerCascadeTool(server, {
    name: "cascade_list_messages",
    title: "List User Messages",
    description: buildCascadeToolDescription(
      `List in-Cascade mailbox messages for the authenticated user.

Cascade has an internal message center — workflow requests, publish notifications, system alerts, and peer messages all land here. Returns all messages visible to the authenticated user (both unread and read, active inbox and archived, depending on your Cascade server's defaults). Message IDs from this list can be passed to cascade_mark_message or cascade_delete_message.

Args:
  - limit (number, optional): Max results per page, 1-500 (default 50)
  - offset (number, optional): Skip N results for pagination (default 0)

Returns:
  The response is a page:
  {
    success: true,
    total: <total items available>,
    count: <items in this page>,
    offset: <current offset>,
    has_more: <bool>,
    next_offset: <offset for next page, if has_more>,
    messages: [
      { id, type: "message", to, from?, subject, date?, body },
      ...
    ]
  }
  On failure: { success: false, message: "<error>" }

Examples:
  - Use when: "What's in my Cascade inbox?" -> {}
  - Use when: "Check if workflow messages are waiting" -> {} then filter messages by subject.
  - Don't use when: You want subscribers to an asset — use cascade_list_subscribers.
  - Don't use when: You want audit events — use cascade_read_audits.

Pagination:
  - Default limit of 50 works for most inboxes. Increase up to 500 for larger ones.
  - If has_more is true and you need all messages, call again with offset: next_offset.
  - For focused queries (most recent only), stop as soon as you have what you need.

Error Handling:
  - "Authentication failed" when credentials are invalid
  - "Permission denied" when the user has no mailbox configured`,
    ),
    inputSchema: ListMessagesRequestSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: paginatedHandler(
      (req) => client.listMessages(req as unknown as Types.ListMessagesRequest),
      "messages",
    ),
  }, deps);

  registerCascadeTool(server, {
    name: "cascade_mark_message",
    title: "Mark Message",
    description: buildCascadeToolDescription(
      `Mark a Cascade inbox message as read, unread, archive, or unarchive.

Toggles the status of a single message. markType controls the action: "read"/"unread" swap the read flag; "archive"/"unarchive" move the message between the inbox and the archive. This is idempotent — marking an already-read message as "read" is a no-op.

Args:
  - identifier (object, required): The message to mark
    - id (string, required): Message ID (from cascade_list_messages)
    - type (string, required): Must be "message"
  - markType (string, required): One of "read" | "unread" | "archive" | "unarchive"

Returns:
  Cascade OperationResult:
  { success: true }
  On failure: { success: false, message: "<error>" }

Examples:
  - Use when: "Mark a workflow notice as read" -> { identifier: { type: "message", id: "..." }, markType: "read" }
  - Use when: "Archive an old notification" -> { identifier: { type: "message", id: "..." }, markType: "archive" }
  - Don't use when: You want to delete — use cascade_delete_message.
  - Don't use when: You want to list — use cascade_list_messages.

Error Handling:
  - "Message not found" when the identifier doesn't resolve
  - "Invalid markType" when markType is outside the allowed set
  - "Permission denied" when the message belongs to another user`,
    ),
    inputSchema: MarkMessageRequestSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: (input) => client.markMessage(input as unknown as Types.MarkMessageRequest),
  }, deps);

  registerCascadeTool(server, {
    name: "cascade_delete_message",
    title: "Delete Message",
    description: buildCascadeToolDescription(
      `Permanently delete a message from the authenticated user's Cascade mailbox.

This is a DESTRUCTIVE operation — once deleted, the message cannot be recovered (archive is not the same as recycle-bin for messages). Prefer cascade_mark_message with markType: "archive" for retention. Messages must belong to the authenticated user; you cannot delete messages in another user's mailbox.

Args:
  - identifier (object, required): The message to delete
    - id (string, required): Message ID (from cascade_list_messages)
    - type (string, required): Must be "message"

Returns:
  Cascade OperationResult:
  { success: true }
  On failure: { success: false, message: "<error>" }

Examples:
  - Use when: "Permanently clear spam-like notifications" -> { identifier: { type: "message", id: "..." } }
  - Don't use when: You want to hide it without deleting — use cascade_mark_message with markType: "archive".
  - Don't use when: You want to delete in bulk — this deletes one message per call.

Error Handling:
  - "Message not found" when the identifier doesn't resolve
  - "Permission denied" when the message belongs to another user`,
    ),
    inputSchema: DeleteMessageRequestSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: (input) => client.deleteMessage(input as unknown as Types.DeleteMessageRequest),
  }, deps);
}
