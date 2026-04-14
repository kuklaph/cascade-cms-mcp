import { describe, test, expect } from "bun:test";
import { createCascadeClient, type CascadeClient } from "../../src/client.js";
import type { Config } from "../../src/config.js";

const EXPECTED_METHOD_NAMES = [
  "read",
  "create",
  "edit",
  "remove",
  "move",
  "copy",
  "search",
  "siteCopy",
  "readAccessRights",
  "editAccessRights",
  "readWorkflowSettings",
  "editWorkflowSettings",
  "listSubscribers",
  "listMessages",
  "markMessage",
  "deleteMessage",
  "checkOut",
  "checkIn",
  "listSites",
  "readAudits",
  "readWorkflowInformation",
  "performWorkflowTransition",
  "readPreferences",
  "publishUnpublish",
  "editPreference",
] as const;

const FAKE_CONFIG: Config = {
  apiKey: "fake-key",
  url: "https://cascade.example.edu/api/v1",
  timeoutMs: 15000,
};

describe("createCascadeClient", () => {
  test("should return a client with exactly the 25 expected method names", () => {
    const client: CascadeClient = createCascadeClient(FAKE_CONFIG);

    const actual = Object.keys(client).sort();
    const expected = [...EXPECTED_METHOD_NAMES].sort();

    expect(actual).toEqual(expected);
  });

  test("should expose a function (not undefined) for every expected method", () => {
    const client: CascadeClient = createCascadeClient(FAKE_CONFIG);

    for (const name of EXPECTED_METHOD_NAMES) {
      expect(typeof client[name]).toBe("function");
    }
  });
});
