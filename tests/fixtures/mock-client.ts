/**
 * Mock `CascadeClient` factory for unit tests.
 *
 * Returns a plain object matching the `CascadeClient` shape where every
 * method is a `bun:test` mock resolving to `OK_RESULT` by default. Tests
 * can pass `overrides` to customize return values per method.
 *
 * Usage:
 *   const client = createMockClient({ read: mock(() => Promise.resolve(READ_PAGE_OK)) });
 */

import { mock } from "bun:test";
import type { CascadeClient } from "../../src/client.js";
import { OK_RESULT } from "./cascade-responses.js";

/** All 25 method names on CascadeClient. */
const METHOD_NAMES = [
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

type MethodName = (typeof METHOD_NAMES)[number];

export type MockMethod = ReturnType<typeof mock>;

/** Each method is replaced by a mock fn; each mock is the `bun:test` mock. */
export type MockCascadeClient = {
  [K in MethodName]: MockMethod;
};

/**
 * Build a mock CascadeClient. Every method is a `mock()` that resolves
 * with `OK_RESULT` by default. Pass `overrides` to supply custom
 * per-method mocks.
 */
export function createMockClient(
  overrides: Partial<MockCascadeClient> = {},
): MockCascadeClient & CascadeClient {
  const client = {} as MockCascadeClient;
  for (const name of METHOD_NAMES) {
    client[name] = mock(() => Promise.resolve(OK_RESULT));
  }
  for (const [key, fn] of Object.entries(overrides)) {
    if (fn) {
      (client as Record<string, MockMethod>)[key] = fn;
    }
  }
  // The mocks accept any args and return whatever the test sets up; cast is safe here
  // for testing purposes — the real CascadeClient has more precise per-method signatures.
  return client as MockCascadeClient & CascadeClient;
}
