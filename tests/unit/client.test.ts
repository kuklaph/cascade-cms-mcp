import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { Config } from "../../src/config.js";
import { runWithRequestSignal } from "../../src/requestContext.js";

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

const { CascadeAPI: RealCascadeAPI } = await import("cascade-cms-api");

type MethodName = (typeof EXPECTED_METHOD_NAMES)[number];
type Invocation = { args: unknown[]; name: MethodName; thisValue: unknown };

let constructorCalls: Array<{ credentials: unknown; timeoutMs: number }> = [];
let invocations: Invocation[] = [];
let operationHandlers: Partial<Record<MethodName, (...args: unknown[]) => unknown>> = {};
let rawClient: Record<MethodName, (...args: unknown[]) => unknown>;

mock.module("cascade-cms-api", () => ({
  CascadeAPI: (credentials: unknown, timeoutMs: number) => {
    constructorCalls.push({ credentials, timeoutMs });
    rawClient = Object.fromEntries(
      EXPECTED_METHOD_NAMES.map((name) => [
        name,
        function (this: unknown, ...args: unknown[]) {
          invocations.push({ args, name, thisValue: this });
          return operationHandlers[name]?.(...args) ?? Promise.resolve({ args, name });
        },
      ]),
    ) as typeof rawClient;
    return rawClient;
  },
}));

const { createCascadeClient } = await import("../../src/client.js");

const FAKE_CONFIG: Config = {
  apiKey: "fake-key",
  url: "https://tenant.cascadecms.com/api/v1",
  timeoutMs: 15000,
  maxConcurrentRequests: 2,
  requestBatchDelayMs: 0,
};

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

const flushPromises = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe("createCascadeClient", () => {
  beforeEach(() => {
    constructorCalls = [];
    invocations = [];
    operationHandlers = {};
  });

  test("returns a client with exactly the 25 upstream method names", () => {
    const client = createCascadeClient(FAKE_CONFIG);

    expect(Object.keys(client).sort()).toEqual([...EXPECTED_METHOD_NAMES].sort());
    for (const name of EXPECTED_METHOD_NAMES) {
      expect(typeof client[name]).toBe("function");
    }
  });

  test("matches the installed upstream client's callable surface", () => {
    const client = RealCascadeAPI(
      { apiKey: "fake-key", url: "https://tenant.cascadecms.com/api/v1" },
      15000,
    );

    expect(Object.keys(client).sort()).toEqual([...EXPECTED_METHOD_NAMES].sort());
    for (const name of EXPECTED_METHOD_NAMES) {
      expect(typeof client[name]).toBe("function");
    }
  });

  test("passes validated credentials and timeout to CascadeAPI", () => {
    createCascadeClient(FAKE_CONFIG);

    expect(constructorCalls).toEqual([
      {
        credentials: { apiKey: "fake-key", url: "https://tenant.cascadecms.com/api/v1" },
        timeoutMs: 15000,
      },
    ]);
  });

  test("shares a full cohort barrier across different client methods", async () => {
    const read = deferred();
    const create = deferred();
    operationHandlers.read = () => read.promise;
    operationHandlers.create = () => create.promise;
    const client = createCascadeClient(FAKE_CONFIG);

    const readRun = client.read({} as never);
    const createRun = client.create({} as never);
    const editRun = client.edit({} as never);
    await flushPromises();

    expect(invocations.map(({ name }) => name)).toEqual(["read", "create"]);

    read.resolve();
    await readRun;
    await flushPromises();
    expect(invocations.map(({ name }) => name)).toEqual(["read", "create"]);

    create.resolve();
    await Promise.all([createRun, editRun]);
    expect(invocations.map(({ name }) => name)).toEqual(["read", "create", "edit"]);
  });

  test("holds a permit until the complete upstream promise settles", async () => {
    const upstream = deferred();
    operationHandlers.read = () => upstream.promise;
    const client = createCascadeClient({ ...FAKE_CONFIG, maxConcurrentRequests: 1 });

    const first = client.read({} as never);
    const second = client.create({} as never);
    await flushPromises();
    expect(invocations.map(({ name }) => name)).toEqual(["read"]);

    upstream.resolve();
    await first;
    await second;
    expect(invocations.map(({ name }) => name)).toEqual(["read", "create"]);
  });

  test("admits another method to a partial active cohort", async () => {
    const read = deferred();
    operationHandlers.read = () => read.promise;
    const client = createCascadeClient({ ...FAKE_CONFIG, maxConcurrentRequests: 3 });

    const readRun = client.read({ id: "asset-1" } as never);
    const createRun = client.create({ parent: "folder-1" } as never);

    expect(invocations.map(({ name }) => name)).toEqual(["read", "create"]);
    read.resolve();
    await Promise.all([readRun, createRun]);
  });

  test("starts queued methods in FIFO order after the full cohort settles", async () => {
    const read = deferred();
    const create = deferred();
    operationHandlers.read = () => read.promise;
    operationHandlers.create = () => create.promise;
    const client = createCascadeClient(FAKE_CONFIG);

    const runs = [
      client.read({} as never),
      client.create({} as never),
      client.edit({} as never),
      client.remove({} as never),
    ];
    read.resolve();
    create.resolve();
    await Promise.all(runs);

    expect(invocations.map(({ name }) => name)).toEqual([
      "read",
      "create",
      "edit",
      "remove",
    ]);
  });

  test("forwards a nonzero configured delay between client cohorts", async () => {
    const originalSetTimeout = globalThis.setTimeout;
    const delays: number[] = [];
    globalThis.setTimeout = ((callback: () => void, ms?: number) => {
      delays.push(ms ?? 0);
      queueMicrotask(callback);
      return 0;
    }) as unknown as typeof setTimeout;

    try {
      const read = deferred();
      operationHandlers.read = () => read.promise;
      const client = createCascadeClient({
        ...FAKE_CONFIG,
        maxConcurrentRequests: 1,
        requestBatchDelayMs: 125,
      });

      const readRun = client.read({} as never);
      const createRun = client.create({} as never);
      read.resolve();
      await Promise.all([readRun, createRun]);

      expect(delays).toEqual([125]);
    } finally {
      globalThis.setTimeout = originalSetTimeout;
    }
  });

  test("preserves arguments, upstream this binding, and result identity", async () => {
    const result = { stable: true };
    operationHandlers.read = () => result;
    const client = createCascadeClient(FAKE_CONFIG);
    const args = [{ identifier: { id: "asset-123", type: "page" } }, "extra"];

    const actual = await (client.read as (...values: unknown[]) => Promise<unknown>)(...args);

    expect(invocations[0]).toEqual({ args, name: "read", thisValue: rawClient });
    expect(actual).toBe(result);
  });

  test("preserves upstream error identity and releases the permit", async () => {
    const failure = new Error("upstream failed");
    operationHandlers.read = () => Promise.reject(failure);
    const client = createCascadeClient({ ...FAKE_CONFIG, maxConcurrentRequests: 1 });

    const failed = client.read({} as never);
    const next = client.create({} as never);

    await expect(failed).rejects.toBe(failure);
    expect((await next) as unknown).toEqual({ args: [{}], name: "create" });
  });

  test("preserves synchronous upstream throw identity without poisoning later methods", async () => {
    const failure = new Error("synchronous upstream failure");
    operationHandlers.read = () => {
      throw failure;
    };
    const client = createCascadeClient({ ...FAKE_CONFIG, maxConcurrentRequests: 1 });

    await expect(client.read({} as never)).rejects.toBe(failure);
    const recovered = await client.create({} as never);
    expect(recovered as unknown).toEqual({
      args: [{}],
      name: "create",
    });
  });

  test("does not start a queued method when only the failed sibling has settled", async () => {
    const sibling = deferred();
    const failure = new Error("read failed");
    operationHandlers.read = () => Promise.reject(failure);
    operationHandlers.create = () => sibling.promise;
    const client = createCascadeClient(FAKE_CONFIG);

    const failedRun = client.read({} as never);
    const siblingRun = client.create({} as never);
    const queuedRun = client.edit({} as never);

    await expect(failedRun).rejects.toBe(failure);
    await flushPromises();
    expect(invocations.map(({ name }) => name)).toEqual(["read", "create"]);

    sibling.resolve();
    await Promise.all([siblingRun, queuedRun]);
    expect(invocations.map(({ name }) => name)).toEqual(["read", "create", "edit"]);
  });

  test("does not call Cascade for a queued method cancelled by its MCP request", async () => {
    const active = deferred();
    operationHandlers.read = () => active.promise;
    const client = createCascadeClient({ ...FAKE_CONFIG, maxConcurrentRequests: 1 });
    const controller = new AbortController();

    const activeRun = client.read({} as never);
    const cancelledRun = runWithRequestSignal(controller.signal, () =>
      client.edit({} as never),
    );
    controller.abort();

    await expect(cancelledRun).rejects.toMatchObject({ name: "AbortError" });
    expect(invocations.map(({ name }) => name)).toEqual(["read"]);

    active.resolve();
    await activeRun;
    expect(invocations.map(({ name }) => name)).toEqual(["read"]);
  });

  test("accepts 50 operations while starting no more than 10 concurrently", async () => {
    const active = deferred();
    operationHandlers.read = () => active.promise;
    const client = createCascadeClient({ ...FAKE_CONFIG, maxConcurrentRequests: 10 });
    const runs = Array.from({ length: 50 }, () => client.read({} as never));

    await flushPromises();
    expect(invocations).toHaveLength(10);

    active.resolve();
    await Promise.all(runs);
    expect(invocations).toHaveLength(50);
  });
});
