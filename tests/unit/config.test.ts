import { describe, test, expect } from "bun:test";
import { loadConfig, type Config } from "../../src/config.js";

describe("loadConfig", () => {
  test("should return a valid Config when all required env vars are present", () => {
    const env = {
      CASCADE_API_KEY: "abc123",
      CASCADE_URL: "https://cascade.example.edu/api",
      CASCADE_TIMEOUT_MS: "15000",
    };

    const cfg: Config = loadConfig(env as NodeJS.ProcessEnv);

    expect(cfg).toEqual({
      apiKey: "abc123",
      url: "https://cascade.example.edu/api",
      timeoutMs: 15000,
    });
  });

  test("should throw with CASCADE_API_KEY named in message when key is missing", () => {
    const env = {
      CASCADE_URL: "https://cascade.example.edu/api",
    };

    expect(() => loadConfig(env as NodeJS.ProcessEnv)).toThrow(/CASCADE_API_KEY/);
  });

  test("should throw with CASCADE_URL named in message when URL is missing", () => {
    const env = {
      CASCADE_API_KEY: "abc123",
    };

    expect(() => loadConfig(env as NodeJS.ProcessEnv)).toThrow(/CASCADE_URL/);
  });

  test("should throw with CASCADE_URL + reason when URL is not a valid URL", () => {
    const env = {
      CASCADE_API_KEY: "abc123",
      CASCADE_URL: "not a url",
    };

    let thrown: Error | null = null;
    try {
      loadConfig(env as NodeJS.ProcessEnv);
    } catch (e) {
      thrown = e as Error;
    }

    expect(thrown).not.toBeNull();
    expect(thrown!.message).toMatch(/CASCADE_URL/);
    // Reason is present (Zod url reason or similar)
    expect(thrown!.message.length).toBeGreaterThan("CASCADE_URL".length + 1);
  });

  test("should default timeoutMs to 30000 when CASCADE_TIMEOUT_MS is missing", () => {
    const env = {
      CASCADE_API_KEY: "abc123",
      CASCADE_URL: "https://cascade.example.edu/api",
    };

    const cfg = loadConfig(env as NodeJS.ProcessEnv);

    expect(cfg.timeoutMs).toBe(30000);
  });

  test("should throw with CASCADE_TIMEOUT_MS named when value is non-numeric", () => {
    const env = {
      CASCADE_API_KEY: "abc123",
      CASCADE_URL: "https://cascade.example.edu/api",
      CASCADE_TIMEOUT_MS: "not-a-number",
    };

    expect(() => loadConfig(env as NodeJS.ProcessEnv)).toThrow(/CASCADE_TIMEOUT_MS/);
  });
});
