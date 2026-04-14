/**
 * Server factory for the Cascade CMS MCP server.
 *
 * Instantiates a single `McpServer` and registers all tool cohorts
 * (25 tools across 9 files) against the provided Cascade client.
 *
 * Pure and side-effect-free: callers own transport/lifecycle.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CascadeClient } from "./client.js";
import { SERVER_NAME, SERVER_VERSION } from "./constants.js";
import { registerCrudTools } from "./tools/crud.js";
import { registerSearchTools } from "./tools/search.js";
import { registerSiteTools } from "./tools/sites.js";
import { registerAccessTools } from "./tools/access.js";
import { registerWorkflowTools } from "./tools/workflow.js";
import { registerMessageTools } from "./tools/messages.js";
import { registerCheckoutTools } from "./tools/checkout.js";
import { registerAuditTools } from "./tools/audits.js";
import { registerPublishTools } from "./tools/publish.js";
import { registerCascadeResources } from "./resources.js";

/**
 * Build an `McpServer` with all 25 Cascade tools registered.
 *
 * The server is returned unconnected; the caller must attach a transport
 * (e.g., `StdioServerTransport`) and invoke `server.connect(transport)`.
 */
export function createServer(client: CascadeClient): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  registerCrudTools(server, client);
  registerSearchTools(server, client);
  registerSiteTools(server, client);
  registerAccessTools(server, client);
  registerWorkflowTools(server, client);
  registerMessageTools(server, client);
  registerCheckoutTools(server, client);
  registerAuditTools(server, client);
  registerPublishTools(server, client);

  registerCascadeResources(server, client);

  return server;
}
