import { describe, test, expect, mock } from "bun:test";
import { z } from "zod";
import type { ToolAnnotations, CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  registerCascadeTool,
  buildCascadeToolDescription,
} from "../../../src/tools/helper.js";

/** Minimal shape we require of McpServer for registerTool. */
interface MockServer {
  registerTool: ReturnType<typeof mock>;
}

function makeMockServer(): MockServer {
  return {
    registerTool: mock(() => ({})),
  };
}

/** Sample schema with response_format for most tests. */
const SampleSchema = z
  .object({
    name: z.string(),
    count: z.number().optional(),
    response_format: z.enum(["markdown", "json"]).default("markdown"),
  })
  .strict();

const SAMPLE_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

/** First text block text accessor. */
function firstText(r: CallToolResult): string {
  const block = r.content[0];
  if (!block || block.type !== "text") {
    throw new Error("Expected first content block to be type 'text'");
  }
  return block.text;
}

describe("registerCascadeTool", () => {
  test("should call server.registerTool with correct name, title, description, inputSchema (as .shape), and annotations", () => {
    const server = makeMockServer();
    const handler = mock(async () => ({ success: true }));

    registerCascadeTool(server as any, {
      name: "cascade_sample",
      title: "Sample Tool",
      description: "A sample tool for testing",
      inputSchema: SampleSchema,
      annotations: SAMPLE_ANNOTATIONS,
      handler,
    });

    expect(server.registerTool).toHaveBeenCalledTimes(1);
    const call = server.registerTool.mock.calls[0];
    expect(call[0]).toBe("cascade_sample");

    const config = call[1] as {
      title: string;
      description: string;
      inputSchema: unknown;
      annotations: ToolAnnotations;
    };
    expect(config.title).toBe("Sample Tool");
    expect(config.description).toBe("A sample tool for testing");
    // inputSchema must be `.shape` (ZodRawShape), not the full ZodObject
    expect(config.inputSchema).toBe(SampleSchema.shape);
    expect(config.annotations).toEqual(SAMPLE_ANNOTATIONS);

    // Callback must be a function
    expect(typeof call[2]).toBe("function");
  });

  test("should invoke config.handler with input minus response_format", async () => {
    const server = makeMockServer();
    const handler = mock(async (input: unknown) => ({ success: true, got: input }));

    registerCascadeTool(server as any, {
      name: "cascade_sample",
      title: "Sample",
      description: "desc",
      inputSchema: SampleSchema,
      annotations: SAMPLE_ANNOTATIONS,
      handler,
    });

    const wrapped = server.registerTool.mock.calls[0][2] as (
      input: unknown,
    ) => Promise<CallToolResult>;

    await wrapped({ name: "alice", count: 5, response_format: "markdown" });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toEqual({ name: "alice", count: 5 });
  });

  test("should return a formatted success response when the handler resolves with a result", async () => {
    const server = makeMockServer();
    const handler = mock(async () => ({ success: true, message: "hello" }));

    registerCascadeTool(server as any, {
      name: "cascade_sample",
      title: "Sample",
      description: "desc",
      inputSchema: SampleSchema,
      annotations: SAMPLE_ANNOTATIONS,
      handler,
    });

    const wrapped = server.registerTool.mock.calls[0][2] as (
      input: unknown,
    ) => Promise<CallToolResult>;

    const result = await wrapped({ name: "x", response_format: "markdown" });

    expect(result.isError).not.toBe(true);
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.structuredContent).toEqual({ success: true, message: "hello" });
  });

  test("should translate thrown errors into an isError result via translateError", async () => {
    const server = makeMockServer();
    const handler = mock(async () => {
      throw new Error("Request Failed. Request Response: Upstream exploded");
    });

    registerCascadeTool(server as any, {
      name: "cascade_sample",
      title: "Sample",
      description: "desc",
      inputSchema: SampleSchema,
      annotations: SAMPLE_ANNOTATIONS,
      handler,
    });

    const wrapped = server.registerTool.mock.calls[0][2] as (
      input: unknown,
    ) => Promise<CallToolResult>;

    const result = await wrapped({ name: "x", response_format: "markdown" });

    expect(result.isError).toBe(true);
    const text = firstText(result);
    expect(text).toContain("cascade_sample");
    expect(text).toContain("Upstream exploded");
  });

  test("should default response_format to 'markdown' when not present in input", async () => {
    const server = makeMockServer();
    // Handler returns a simple object so renderJson vs markdown clearly differs
    const handler = mock(async () => ({ success: true }));

    registerCascadeTool(server as any, {
      name: "cascade_sample",
      title: "Sample",
      description: "desc",
      inputSchema: SampleSchema,
      annotations: SAMPLE_ANNOTATIONS,
      handler,
    });

    const wrapped = server.registerTool.mock.calls[0][2] as (
      input: unknown,
    ) => Promise<CallToolResult>;

    // Intentionally omit response_format — SDK would have applied default but helper must default as well
    const result = await wrapped({ name: "x" });

    const text = firstText(result);
    // Markdown form contains the tool name + "succeeded"; JSON would be strict JSON
    expect(text).toContain("cascade_sample");
    expect(text.toLowerCase()).toContain("succeeded");
  });

  test("should use JSON formatting when response_format='json' and produce valid JSON text", async () => {
    const server = makeMockServer();
    const handler = mock(async () => ({ success: true, id: "abc" }));

    registerCascadeTool(server as any, {
      name: "cascade_sample",
      title: "Sample",
      description: "desc",
      inputSchema: SampleSchema,
      annotations: SAMPLE_ANNOTATIONS,
      handler,
    });

    const wrapped = server.registerTool.mock.calls[0][2] as (
      input: unknown,
    ) => Promise<CallToolResult>;

    const result = await wrapped({ name: "x", response_format: "json" });

    const text = firstText(result);
    const parsed = JSON.parse(text);
    expect(parsed).toEqual({ success: true, id: "abc" });
  });

  test("should invoke the renderMarkdown override when provided in markdown mode", async () => {
    const server = makeMockServer();
    const handler = mock(async () => ({ success: true, thing: "wumbo" }));
    const renderMarkdown = mock((r: unknown) => {
      const rec = r as { thing: string };
      return `# Custom: ${rec.thing}`;
    });

    registerCascadeTool(server as any, {
      name: "cascade_sample",
      title: "Sample",
      description: "desc",
      inputSchema: SampleSchema,
      annotations: SAMPLE_ANNOTATIONS,
      handler,
      renderMarkdown,
    });

    const wrapped = server.registerTool.mock.calls[0][2] as (
      input: unknown,
    ) => Promise<CallToolResult>;

    const result = await wrapped({ name: "x", response_format: "markdown" });

    expect(renderMarkdown).toHaveBeenCalledTimes(1);
    const text = firstText(result);
    expect(text).toContain("# Custom: wumbo");
  });
});

describe("buildCascadeToolDescription", () => {
  test("should produce a description that appends consistent footer text about response_format", () => {
    const desc = buildCascadeToolDescription("Do the thing.");

    expect(desc.startsWith("Do the thing.")).toBe(true);
    // Must mention response_format choices
    expect(desc).toContain("response_format");
    expect(desc).toContain("markdown");
    expect(desc).toContain("json");
  });
});
