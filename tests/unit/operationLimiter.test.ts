import { describe, expect, test } from "bun:test";
import { OperationLimiter } from "../../src/operationLimiter.js";

const deferred = <T = void>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
};

const flushPromises = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe("OperationLimiter", () => {
  test("starts up to maxConcurrent operations immediately and makes the next wait", async () => {
    const limiter = new OperationLimiter({
      maxConcurrent: 2,
      maxQueued: 20,
      queueFullMessage: "queue full",
    });
    const first = deferred();
    const second = deferred();
    const starts: number[] = [];

    const firstRun = limiter.run(async () => {
      starts.push(1);
      await first.promise;
    });
    const secondRun = limiter.run(async () => {
      starts.push(2);
      await second.promise;
    });
    const thirdRun = limiter.run(async () => {
      starts.push(3);
    });

    await flushPromises();
    expect(starts).toEqual([1, 2]);

    first.resolve();
    await firstRun;
    await flushPromises();
    expect(starts).toEqual([1, 2, 3]);

    second.resolve();
    await Promise.all([secondRun, thirdRun]);
  });

  test("hands released permits directly to queued operations in FIFO order", async () => {
    const limiter = new OperationLimiter({
      maxConcurrent: 1,
      maxQueued: 20,
      queueFullMessage: "queue full",
    });
    const first = deferred();
    const second = deferred();
    const starts: string[] = [];

    const runs = [
      limiter.run(async () => {
        starts.push("first");
        await first.promise;
      }),
      limiter.run(async () => {
        starts.push("second");
        await second.promise;
      }),
      limiter.run(async () => {
        starts.push("third");
      }),
    ];

    first.resolve();
    await flushPromises();
    expect(starts).toEqual(["first", "second"]);

    second.resolve();
    await Promise.all(runs);
    expect(starts).toEqual(["first", "second", "third"]);
  });

  test("accepts exactly maxQueued waiters and rejects the next without calling it", async () => {
    const limiter = new OperationLimiter({
      maxConcurrent: 1,
      maxQueued: 20,
      queueFullMessage: "queue full",
    });
    const active = deferred();
    const starts: number[] = [];

    const activeRun = limiter.run(async () => {
      starts.push(0);
      await active.promise;
    });
    const queuedRuns = Array.from({ length: 20 }, (_, index) =>
      limiter.run(async () => {
        starts.push(index + 1);
      }),
    );
    let overflowCalled = false;

    await expect(
      limiter.run(async () => {
        overflowCalled = true;
      }),
    ).rejects.toThrow("queue full");
    expect(overflowCalled).toBe(false);
    expect(starts).toEqual([0]);

    active.resolve();
    await Promise.all([activeRun, ...queuedRuns]);
    expect(starts).toEqual(Array.from({ length: 21 }, (_, index) => index));
  });

  test("accepts an unbounded FIFO wait queue when maxQueued is omitted", async () => {
    const limiter = new OperationLimiter({ maxConcurrent: 1 });
    const active = deferred();
    const starts: number[] = [];

    const runs = Array.from({ length: 50 }, (_, index) =>
      limiter.run(async () => {
        starts.push(index);
        if (index === 0) await active.promise;
      }),
    );

    await flushPromises();
    expect(starts).toEqual([0]);

    active.resolve();
    await Promise.all(runs);
    expect(starts).toEqual(Array.from({ length: 50 }, (_, index) => index));
  });

  test("passes through operation results", async () => {
    const limiter = new OperationLimiter({
      maxConcurrent: 1,
      maxQueued: 20,
      queueFullMessage: "queue full",
    });

    await expect(limiter.run(async () => ({ ok: true }))).resolves.toEqual({ ok: true });
  });

  test("releases a permit after an asynchronous rejection without poisoning the queue", async () => {
    const limiter = new OperationLimiter({
      maxConcurrent: 1,
      maxQueued: 20,
      queueFullMessage: "queue full",
    });
    const failure = deferred();
    const starts: string[] = [];

    const failedRun = limiter.run(async () => {
      starts.push("failed");
      await failure.promise;
    });
    const nextRun = limiter.run(async () => {
      starts.push("next");
      return "done";
    });

    failure.reject(new Error("boom"));
    await expect(failedRun).rejects.toThrow("boom");
    await expect(nextRun).resolves.toBe("done");
    expect(starts).toEqual(["failed", "next"]);
  });

  test("releases a permit after a synchronous throw", async () => {
    const limiter = new OperationLimiter({
      maxConcurrent: 1,
      maxQueued: 20,
      queueFullMessage: "queue full",
    });

    await expect(
      limiter.run(() => {
        throw new Error("sync boom");
      }),
    ).rejects.toThrow("sync boom");
    await expect(limiter.run(async () => "recovered")).resolves.toBe("recovered");
  });

  test("holds the permit for the operation's whole retry-like promise", async () => {
    const limiter = new OperationLimiter({
      maxConcurrent: 1,
      maxQueued: 20,
      queueFullMessage: "queue full",
    });
    const firstAttempt = deferred();
    const retry = deferred();
    const starts: string[] = [];

    const retryingRun = limiter.run(async () => {
      starts.push("first attempt");
      await firstAttempt.promise;
      starts.push("retry");
      await retry.promise;
    });
    const queuedRun = limiter.run(async () => {
      starts.push("queued operation");
    });

    firstAttempt.resolve();
    await flushPromises();
    expect(starts).toEqual(["first attempt", "retry"]);

    retry.resolve();
    await Promise.all([retryingRun, queuedRun]);
    expect(starts).toEqual(["first attempt", "retry", "queued operation"]);
  });
});
