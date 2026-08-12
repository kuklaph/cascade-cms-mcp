import { describe, expect, test } from "bun:test";
import { CohortOperationLimiter } from "../../src/cohortOperationLimiter.js";

type Deferred<T> = {
  promise: Promise<T>;
  reject: (reason?: unknown) => void;
  resolve: (value: T | PromiseLike<T>) => void;
};

const deferred = <T = void>(): Deferred<T> => {
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

const controlledSleep = () => {
  const calls: Array<{ delay: Deferred<void>; ms: number }> = [];
  return {
    calls,
    sleep: (ms: number) => {
      const delay = deferred();
      calls.push({ delay, ms });
      return delay.promise;
    },
  };
};

describe("CohortOperationLimiter", () => {
  test("rejects a cohort size above the fixed worst-case maximum", () => {
    expect(
      () => new CohortOperationLimiter({ cohortSize: 5001, delayMs: 0 }),
    ).toThrow("cohortSize must be an integer from 1 through 5000");
  });

  test("starts an idle operation immediately without sleeping", async () => {
    const sleeper = controlledSleep();
    const limiter = new CohortOperationLimiter({
      cohortSize: 2,
      delayMs: 3000,
      sleep: sleeper.sleep,
    });
    const starts: string[] = [];

    const run = limiter.run(() => {
      starts.push("first");
      return "done";
    });

    expect(starts).toEqual(["first"]);
    await expect(run).resolves.toBe("done");
    expect(sleeper.calls).toEqual([]);
  });

  test("admits one full cohort and queues the next operation", async () => {
    const limiter = new CohortOperationLimiter({ cohortSize: 2, delayMs: 0 });
    const first = deferred();
    const second = deferred();
    const starts: number[] = [];

    const runs = [
      limiter.run(async () => {
        starts.push(1);
        await first.promise;
      }),
      limiter.run(async () => {
        starts.push(2);
        await second.promise;
      }),
      limiter.run(async () => starts.push(3)),
    ];

    expect(starts).toEqual([1, 2]);
    first.resolve();
    second.resolve();
    await Promise.all(runs);
    expect(starts).toEqual([1, 2, 3]);
  });

  test("does not refill a full cohort after one early settlement", async () => {
    const limiter = new CohortOperationLimiter({ cohortSize: 2, delayMs: 0 });
    const first = deferred();
    const second = deferred();
    const starts: string[] = [];

    const firstRun = limiter.run(async () => {
      starts.push("first");
      await first.promise;
    });
    const secondRun = limiter.run(async () => {
      starts.push("second");
      await second.promise;
    });
    const queuedRun = limiter.run(async () => starts.push("queued"));

    first.resolve();
    await firstRun;
    await flushPromises();
    expect(starts).toEqual(["first", "second"]);

    second.resolve();
    await Promise.all([secondRun, queuedRun]);
    expect(starts).toEqual(["first", "second", "queued"]);
  });

  test("does not refill a full cohort after several early settlements", async () => {
    const limiter = new CohortOperationLimiter({ cohortSize: 3, delayMs: 0 });
    const gates = [deferred(), deferred(), deferred()];
    const starts: number[] = [];
    const activeRuns = gates.map((gate, index) =>
      limiter.run(async () => {
        starts.push(index);
        await gate.promise;
      }),
    );
    const queuedRun = limiter.run(async () => starts.push(3));

    gates[0]!.resolve();
    gates[1]!.resolve();
    await Promise.all(activeRuns.slice(0, 2));
    await flushPromises();
    expect(starts).toEqual([0, 1, 2]);

    gates[2]!.resolve();
    await Promise.all([...activeRuns, queuedRun]);
    expect(starts).toEqual([0, 1, 2, 3]);
  });

  test("admits arrivals to a partial active cohort until cumulative capacity", async () => {
    const limiter = new CohortOperationLimiter({ cohortSize: 3, delayMs: 0 });
    const first = deferred();
    const second = deferred();
    const third = deferred();
    const starts: number[] = [];

    const firstRun = limiter.run(async () => {
      starts.push(1);
      await first.promise;
    });
    const secondRun = limiter.run(async () => {
      starts.push(2);
      await second.promise;
    });

    first.resolve();
    await firstRun;

    const thirdRun = limiter.run(async () => {
      starts.push(3);
      await third.promise;
    });
    const fourthRun = limiter.run(async () => starts.push(4));

    expect(starts).toEqual([1, 2, 3]);
    second.resolve();
    await secondRun;
    await flushPromises();
    expect(starts).toEqual([1, 2, 3]);

    third.resolve();
    await Promise.all([thirdRun, fourthRun]);
    expect(starts).toEqual([1, 2, 3, 4]);
  });

  test("begins the delay only after the final active member settles", async () => {
    const sleeper = controlledSleep();
    const limiter = new CohortOperationLimiter({
      cohortSize: 2,
      delayMs: 75,
      sleep: sleeper.sleep,
    });
    const first = deferred();
    const second = deferred();

    const firstRun = limiter.run(() => first.promise);
    const secondRun = limiter.run(() => second.promise);
    const queuedRun = limiter.run(async () => "queued");

    first.resolve();
    await firstRun;
    await flushPromises();
    expect(sleeper.calls).toHaveLength(0);

    second.resolve();
    await secondRun;
    await flushPromises();
    expect(sleeper.calls.map(({ ms }) => ms)).toEqual([75]);

    sleeper.calls[0]!.delay.resolve();
    await expect(queuedRun).resolves.toBe("queued");
  });

  test("does not start the next cohort until the injected delay resolves", async () => {
    const sleeper = controlledSleep();
    const limiter = new CohortOperationLimiter({
      cohortSize: 1,
      delayMs: 20,
      sleep: sleeper.sleep,
    });
    const first = deferred();
    const starts: string[] = [];

    const firstRun = limiter.run(async () => {
      starts.push("first");
      await first.promise;
    });
    const secondRun = limiter.run(async () => starts.push("second"));

    first.resolve();
    await firstRun;
    await flushPromises();
    expect(starts).toEqual(["first"]);

    sleeper.calls[0]!.delay.resolve();
    await secondRun;
    expect(starts).toEqual(["first", "second"]);
  });

  test("does not sleep when a cohort settles without a queued successor", async () => {
    const sleeper = controlledSleep();
    const limiter = new CohortOperationLimiter({
      cohortSize: 1,
      delayMs: 3000,
      sleep: sleeper.sleep,
    });

    await limiter.run(async () => "complete");

    expect(sleeper.calls).toEqual([]);
  });

  test("returns to idle without imposing a stale cooldown", async () => {
    const sleeper = controlledSleep();
    const limiter = new CohortOperationLimiter({
      cohortSize: 1,
      delayMs: 3000,
      sleep: sleeper.sleep,
    });
    const starts: string[] = [];

    await limiter.run(async () => starts.push("first"));
    const second = limiter.run(async () => starts.push("second"));

    expect(starts).toEqual(["first", "second"]);
    await second;
    expect(sleeper.calls).toEqual([]);
  });

  test("queues arrivals during the delay for the next FIFO release", async () => {
    const sleeper = controlledSleep();
    const limiter = new CohortOperationLimiter({
      cohortSize: 2,
      delayMs: 10,
      sleep: sleeper.sleep,
    });
    const first = deferred();
    const second = deferred();
    const starts: number[] = [];

    const runs = [
      limiter.run(async () => {
        starts.push(1);
        await first.promise;
      }),
      limiter.run(async () => {
        starts.push(2);
        await second.promise;
      }),
      limiter.run(async () => starts.push(3)),
    ];
    first.resolve();
    second.resolve();
    await Promise.all(runs.slice(0, 2));
    await flushPromises();
    runs.push(limiter.run(async () => starts.push(4)));

    expect(starts).toEqual([1, 2]);
    sleeper.calls[0]!.delay.resolve();
    await Promise.all(runs);
    expect(starts).toEqual([1, 2, 3, 4]);
  });

  test("preserves FIFO order across multiple cohorts", async () => {
    const sleeper = controlledSleep();
    const limiter = new CohortOperationLimiter({
      cohortSize: 2,
      delayMs: 10,
      sleep: sleeper.sleep,
    });
    const firstCohort = [deferred(), deferred()];
    const secondCohort = [deferred(), deferred()];
    const starts: number[] = [];
    const runs = Array.from({ length: 5 }, (_, index) =>
      limiter.run(async () => {
        starts.push(index + 1);
        if (index < 2) await firstCohort[index]!.promise;
        if (index >= 2 && index < 4) await secondCohort[index - 2]!.promise;
      }),
    );

    firstCohort.forEach(({ resolve }) => resolve());
    await Promise.all(runs.slice(0, 2));
    await flushPromises();
    sleeper.calls[0]!.delay.resolve();
    await flushPromises();
    expect(starts).toEqual([1, 2, 3, 4]);

    secondCohort.forEach(({ resolve }) => resolve());
    await Promise.all(runs.slice(2, 4));
    await flushPromises();
    sleeper.calls[1]!.delay.resolve();
    await Promise.all(runs);
    expect(starts).toEqual([1, 2, 3, 4, 5]);
  });

  test("keeps re-entrant arrivals behind operations already queued for release", async () => {
    const sleeper = controlledSleep();
    const limiter = new CohortOperationLimiter({
      cohortSize: 2,
      delayMs: 10,
      sleep: sleeper.sleep,
    });
    const first = deferred();
    const second = deferred();
    const starts: number[] = [];
    let reentrantRun: Promise<void> | undefined;

    const runs = [
      limiter.run(async () => {
        starts.push(1);
        await first.promise;
      }),
      limiter.run(async () => {
        starts.push(2);
        await second.promise;
      }),
      limiter.run(async () => {
        starts.push(3);
        reentrantRun = limiter.run(async () => {
          starts.push(5);
        });
      }),
      limiter.run(async () => {
        starts.push(4);
      }),
    ];

    first.resolve();
    second.resolve();
    await Promise.all(runs.slice(0, 2));
    await flushPromises();
    sleeper.calls[0]!.delay.resolve();
    await flushPromises();

    expect(starts).toEqual([1, 2, 3, 4]);

    await Promise.all(runs);
    await flushPromises();
    sleeper.calls[1]!.delay.resolve();
    await reentrantRun;
    expect(starts).toEqual([1, 2, 3, 4, 5]);
  });

  test("waits for a queued cohort sibling when the first released operation throws synchronously", async () => {
    const limiter = new CohortOperationLimiter({
      cohortSize: 2,
      delayMs: 0,
    });
    const first = deferred();
    const second = deferred();
    const sibling = deferred();
    const failure = new Error("queued sync failure");
    const starts: number[] = [];

    const firstRun = limiter.run(async () => {
      starts.push(1);
      await first.promise;
    });
    const secondRun = limiter.run(async () => {
      starts.push(2);
      await second.promise;
    });
    const failedRun = limiter.run(() => {
      starts.push(3);
      throw failure;
    });
    const handledFailure = failedRun.catch((error) => error);
    const siblingRun = limiter.run(async () => {
      starts.push(4);
      await sibling.promise;
    });
    const laterRun = limiter.run(async () => {
      starts.push(5);
    });

    first.resolve();
    second.resolve();
    await Promise.all([firstRun, secondRun]);
    await flushPromises();

    expect(starts).toEqual([1, 2, 3, 4]);
    expect(await handledFailure).toBe(failure);

    sibling.resolve();
    await siblingRun;
    await laterRun;
    expect(starts).toEqual([1, 2, 3, 4, 5]);
  });

  test("skips sleep at delay zero but preserves the all-settled barrier", async () => {
    const sleeper = controlledSleep();
    const limiter = new CohortOperationLimiter({
      cohortSize: 2,
      delayMs: 0,
      sleep: sleeper.sleep,
    });
    const first = deferred();
    const second = deferred();
    const starts: number[] = [];

    const runs = [
      limiter.run(async () => {
        starts.push(1);
        await first.promise;
      }),
      limiter.run(async () => {
        starts.push(2);
        await second.promise;
      }),
      limiter.run(async () => starts.push(3)),
    ];
    first.resolve();
    await runs[0];
    await flushPromises();
    expect(starts).toEqual([1, 2]);

    second.resolve();
    await Promise.all(runs);
    expect(starts).toEqual([1, 2, 3]);
    expect(sleeper.calls).toEqual([]);
  });

  test("preserves synchronous result identity", async () => {
    const limiter = new CohortOperationLimiter({ cohortSize: 1, delayMs: 0 });
    const result = { stable: true };

    await expect(limiter.run(() => result)).resolves.toBe(result);
  });

  test("preserves asynchronous rejection identity", async () => {
    const limiter = new CohortOperationLimiter({ cohortSize: 1, delayMs: 0 });
    const failure = new Error("expected failure");

    await expect(limiter.run(() => Promise.reject(failure))).rejects.toBe(failure);
  });

  test("turns a synchronous throw into a rejection and permits later cohorts", async () => {
    const limiter = new CohortOperationLimiter({ cohortSize: 1, delayMs: 0 });
    const failure = new Error("sync failure");

    const failedRun = limiter.run(() => {
      throw failure;
    });

    await expect(failedRun).rejects.toBe(failure);
    await expect(limiter.run(async () => "recovered")).resolves.toBe("recovered");
  });

  test("does not cancel a sibling when one cohort member rejects", async () => {
    const limiter = new CohortOperationLimiter({ cohortSize: 2, delayMs: 0 });
    const sibling = deferred<string>();
    const failure = new Error("failed member");
    const starts: string[] = [];

    const failedRun = limiter.run(async () => {
      starts.push("failed");
      throw failure;
    });
    const siblingRun = limiter.run(async () => {
      starts.push("sibling");
      return sibling.promise;
    });
    const queuedRun = limiter.run(async () => starts.push("queued"));

    await expect(failedRun).rejects.toBe(failure);
    await flushPromises();
    expect(starts).toEqual(["failed", "sibling"]);

    sibling.resolve("sibling result");
    await expect(siblingRun).resolves.toBe("sibling result");
    await queuedRun;
    expect(starts).toEqual(["failed", "sibling", "queued"]);
  });

  test("keeps individual settlement independent from a pending cohort delay", async () => {
    const sleeper = controlledSleep();
    const limiter = new CohortOperationLimiter({
      cohortSize: 1,
      delayMs: 100,
      sleep: sleeper.sleep,
    });
    const first = deferred<string>();

    const firstRun = limiter.run(() => first.promise);
    const queuedRun = limiter.run(async () => "queued");
    first.resolve("first result");

    await expect(firstRun).resolves.toBe("first result");
    expect(sleeper.calls).toHaveLength(1);

    sleeper.calls[0]!.delay.resolve();
    await expect(queuedRun).resolves.toBe("queued");
  });

  test("rejects an already-cancelled operation without starting it", async () => {
    const limiter = new CohortOperationLimiter({ cohortSize: 1, delayMs: 0 });
    const controller = new AbortController();
    let started = false;
    controller.abort();

    const run = limiter.run(async () => {
      started = true;
    }, controller.signal);

    await expect(run).rejects.toMatchObject({ name: "AbortError" });
    expect(started).toBe(false);
  });

  test("removes a cancelled queued operation before dispatch", async () => {
    const limiter = new CohortOperationLimiter({ cohortSize: 1, delayMs: 0 });
    const active = deferred();
    const controller = new AbortController();
    const starts: string[] = [];

    const activeRun = limiter.run(async () => {
      starts.push("active");
      await active.promise;
    });
    const cancelledRun = limiter.run(async () => {
      starts.push("cancelled");
    }, controller.signal);
    const nextRun = limiter.run(async () => {
      starts.push("next");
    });

    controller.abort();
    await expect(cancelledRun).rejects.toMatchObject({ name: "AbortError" });
    expect(starts).toEqual(["active"]);

    active.resolve();
    await Promise.all([activeRun, nextRun]);
    expect(starts).toEqual(["active", "next"]);
  });

  test("keeps an active cohort delay after its original waiter is cancelled", async () => {
    const sleeper = controlledSleep();
    const limiter = new CohortOperationLimiter({
      cohortSize: 1,
      delayMs: 25,
      sleep: sleeper.sleep,
    });
    const active = deferred();
    const controller = new AbortController();
    const starts: string[] = [];

    const activeRun = limiter.run(async () => {
      starts.push("active");
      await active.promise;
    });
    const cancelledRun = limiter.run(async () => {
      starts.push("cancelled");
    }, controller.signal);

    active.resolve();
    await activeRun;
    await flushPromises();
    expect(sleeper.calls).toHaveLength(1);

    controller.abort();
    await expect(cancelledRun).rejects.toMatchObject({ name: "AbortError" });
    const laterRun = limiter.run(async () => {
      starts.push("later");
    });
    expect(starts).toEqual(["active"]);

    sleeper.calls[0]!.delay.resolve();
    await laterRun;
    expect(starts).toEqual(["active", "later"]);
  });

  test("accepts a large standard queue within the cap", async () => {
    const limiter = new CohortOperationLimiter({ cohortSize: 10, delayMs: 0 });
    const gate = deferred();
    let starts = 0;
    const runs = Array.from({ length: 50 }, () =>
      limiter.run(async () => {
        starts += 1;
        if (starts <= 10) await gate.promise;
      }),
    );

    expect(starts).toBe(10);
    gate.resolve();
    await Promise.all(runs);
    expect(starts).toBe(50);
  });

  test("accepts 1000 queued operations and rejects the next without starting it", async () => {
    const limiter = new CohortOperationLimiter({ cohortSize: 1, delayMs: 0 });
    const active = deferred();
    let overflowStarted = false;

    const activeRun = limiter.run(() => active.promise);
    const queuedRuns = Array.from({ length: 1000 }, () =>
      limiter.run(async () => undefined),
    );

    const overflowRun = limiter.run(async () => {
      overflowStarted = true;
    });
    active.resolve();

    await expect(overflowRun).rejects.toThrow(
      "Too many Cascade API operations are queued. Wait for queued operations to drain, then retry.",
    );
    expect(overflowStarted).toBe(false);

    await Promise.all([activeRun, ...queuedRuns]);
  });
});
