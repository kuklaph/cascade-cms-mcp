/**
 * Unit tests for `registerCascadeResources`.
 *
 * The server exposes two MCP resources:
 *   - cascade://entity-types : static JSON listing the 56 Cascade entity types
 *   - cascade://sites        : dynamic; fetches via `client.listSites()` at read time
 *
 * We verify registration metadata and both read-callback branches
 * (success + upstream error) using a lightweight mock server that
 * captures each `registerResource` call.
 */

import { describe, test, expect, mock } from "bun:test";
import type { ResourceMetadata } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import { registerCascadeResources } from "../../src/resources.js";
import { EntityTypeSchema } from "../../src/schemas/common.js";
import { createMockClient } from "../fixtures/mock-client.js";

/** A captured `server.registerResource(name, uri, config, readCallback)` call. */
interface RegisteredResource {
  name: string;
  uri: string;
  config: ResourceMetadata;
  readCallback: (uri: URL, extra?: unknown) => Promise<ReadResourceResult>;
}

interface MockMcpServer {
  registerResource: ReturnType<typeof mock>;
}

function makeMockServer(): {
  server: MockMcpServer;
  resources: RegisteredResource[];
} {
  const resources: RegisteredResource[] = [];
  const server: MockMcpServer = {
    registerResource: mock(
      (name: string, uri: string, config: ResourceMetadata, readCallback: any) => {
        resources.push({ name, uri, config, readCallback });
        return {};
      },
    ),
  };
  return { server, resources };
}

/** Extract the text payload of the first content entry. */
function firstContentText(result: ReadResourceResult): string {
  const first = result.contents[0];
  if (!first || typeof (first as { text?: unknown }).text !== "string") {
    throw new Error("Expected first content entry to have a string `text` field");
  }
  return (first as { text: string }).text;
}

// =============================================================================
// Registration coverage
// =============================================================================

describe("registerCascadeResources", () => {
  test("registers exactly 2 resources", () => {
    const { server, resources } = makeMockServer();
    const client = createMockClient();

    registerCascadeResources(server as any, client);

    expect(resources).toHaveLength(2);
  });

  test("resource URIs are cascade://entity-types and cascade://sites", () => {
    const { server, resources } = makeMockServer();
    const client = createMockClient();

    registerCascadeResources(server as any, client);

    const uris = resources.map((r) => r.uri).sort();
    expect(uris).toEqual(["cascade://entity-types", "cascade://sites"]);
  });

  test("each resource has a name, description, and mimeType", () => {
    const { server, resources } = makeMockServer();
    const client = createMockClient();

    registerCascadeResources(server as any, client);

    for (const r of resources) {
      expect(typeof r.name).toBe("string");
      expect(r.name.length).toBeGreaterThan(0);
      expect(typeof r.config.description).toBe("string");
      expect((r.config.description as string).length).toBeGreaterThan(0);
      expect(r.config.mimeType).toBe("application/json");
    }
  });
});

// =============================================================================
// cascade://entity-types (static)
// =============================================================================

describe("cascade://entity-types resource", () => {
  test("fetch returns JSON listing all 56 entity types", async () => {
    const { server, resources } = makeMockServer();
    const client = createMockClient();
    registerCascadeResources(server as any, client);

    const entityTypes = resources.find((r) => r.uri === "cascade://entity-types");
    expect(entityTypes).toBeDefined();

    const result = await entityTypes!.readCallback(
      new URL("cascade://entity-types"),
    );

    expect(result.contents).toHaveLength(1);
    const first = result.contents[0];
    expect(first!.uri).toBe("cascade://entity-types");
    expect(first!.mimeType).toBe("application/json");

    const body = JSON.parse(firstContentText(result)) as {
      entityTypes: Array<{ type: string; description: string }>;
    };
    expect(Array.isArray(body.entityTypes)).toBe(true);
    // The count must match the EntityTypeSchema enum (the source of truth);
    // the enum currently holds all Cascade entity type strings.
    expect(body.entityTypes).toHaveLength(EntityTypeSchema.options.length);
    // Every entity type has a non-empty description so the resource body
    // is self-documenting.
    for (const entry of body.entityTypes) {
      expect(entry.type.length).toBeGreaterThan(0);
      expect(entry.description.length).toBeGreaterThan(0);
    }
  });

  test("fetch includes common entity types (page, file, folder) with descriptions", async () => {
    const { server, resources } = makeMockServer();
    const client = createMockClient();
    registerCascadeResources(server as any, client);

    const entityTypes = resources.find((r) => r.uri === "cascade://entity-types")!;
    const result = await entityTypes.readCallback(new URL("cascade://entity-types"));

    const body = JSON.parse(firstContentText(result)) as {
      entityTypes: Array<{ type: string; description: string }>;
    };
    const byType = new Map(body.entityTypes.map((e) => [e.type, e.description]));

    for (const t of ["page", "file", "folder", "block", "template"]) {
      expect(byType.has(t)).toBe(true);
      expect((byType.get(t) as string).length).toBeGreaterThan(0);
    }
  });
});

// =============================================================================
// cascade://sites (dynamic)
// =============================================================================

describe("cascade://sites resource", () => {
  test("fetch calls client.listSites() and returns its result as JSON", async () => {
    const SITES_RESPONSE = {
      success: true,
      sites: [
        { id: "s-1", name: "alpha" },
        { id: "s-2", name: "beta" },
      ],
    };
    const { server, resources } = makeMockServer();
    const client = createMockClient({
      listSites: mock(() => Promise.resolve(SITES_RESPONSE)),
    });
    registerCascadeResources(server as any, client);

    const sites = resources.find((r) => r.uri === "cascade://sites");
    expect(sites).toBeDefined();

    const result = await sites!.readCallback(new URL("cascade://sites"));

    expect(client.listSites).toHaveBeenCalledTimes(1);
    expect(client.listSites.mock.calls[0][0]).toEqual({});

    expect(result.contents).toHaveLength(1);
    const first = result.contents[0];
    expect(first!.uri).toBe("cascade://sites");
    expect(first!.mimeType).toBe("application/json");

    const parsed = JSON.parse(firstContentText(result));
    expect(parsed).toEqual(SITES_RESPONSE);
  });

  test("fetch returns an error content entry when client.listSites throws", async () => {
    const { server, resources } = makeMockServer();
    const client = createMockClient({
      listSites: mock(() =>
        Promise.reject(
          new Error("Request Failed. Request Response: Service Down"),
        ),
      ),
    });
    registerCascadeResources(server as any, client);

    const sites = resources.find((r) => r.uri === "cascade://sites")!;

    // Must not crash — translates the error into a resource-shaped response.
    const result = await sites.readCallback(new URL("cascade://sites"));

    expect(result.contents).toHaveLength(1);
    const first = result.contents[0];
    expect(first!.uri).toBe("cascade://sites");
    expect(first!.mimeType).toBe("application/json");

    // Error body is a valid JSON envelope — agents can safely JSON.parse.
    const text = firstContentText(result);
    const parsed = JSON.parse(text) as { error: string };
    expect(typeof parsed.error).toBe("string");
    expect(parsed.error).toContain("cascade://sites");
    expect(parsed.error.toLowerCase()).toContain("failed");
    expect(parsed.error).not.toContain("Request Failed. Request Response:");
  });
});
