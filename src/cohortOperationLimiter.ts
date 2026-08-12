import { MAX_CONCURRENT_REQUESTS } from "./constants.js";

const MAX_QUEUED_OPERATIONS = 1000;
const QUEUE_FULL_MESSAGE =
  "Too many Cascade API operations are queued. Wait for queued operations to drain, then retry.";

type QueuedOperation = {
  cleanup: () => void;
  start: () => void;
};

export type CohortOperationLimiterOptions = {
  cohortSize: number;
  delayMs: number;
  sleep?: (ms: number) => Promise<void>;
};

export class CohortOperationLimiter {
  private active = 0;
  private admissions = 0;
  private delaying = false;
  private dispatching = false;
  private readonly queue: QueuedOperation[] = [];
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly options: CohortOperationLimiterOptions) {
    if (
      !Number.isInteger(options.cohortSize) ||
      options.cohortSize < 1 ||
      options.cohortSize > MAX_CONCURRENT_REQUESTS
    ) {
      throw new Error("cohortSize must be an integer from 1 through 5000");
    }
    this.sleep = options.sleep ?? defaultSleep;
  }

  run<T>(
    operation: () => T | PromiseLike<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    if (signal?.aborted) return Promise.reject(cancelledOperationError());

    if (!this.delaying && this.admissions < this.options.cohortSize) {
      return this.start(operation);
    }
    if (this.queue.length >= MAX_QUEUED_OPERATIONS) {
      return Promise.reject(new Error(QUEUE_FULL_MESSAGE));
    }

    return new Promise<T>((resolve, reject) => {
      const entry: QueuedOperation = {
        cleanup: () => signal?.removeEventListener("abort", cancel),
        start: () => {
          entry.cleanup();
          if (signal?.aborted) {
            reject(cancelledOperationError());
            return;
          }
          this.start(operation).then(resolve, reject);
        },
      };
      const cancel = () => {
        const index = this.queue.indexOf(entry);
        if (index === -1) return;
        this.queue.splice(index, 1);
        entry.cleanup();
        reject(cancelledOperationError());
      };
      signal?.addEventListener("abort", cancel, { once: true });
      this.queue.push(entry);
    });
  }

  private start<T>(operation: () => T | PromiseLike<T>): Promise<T> {
    this.admissions += 1;
    this.active += 1;
    return this.execute(operation);
  }

  private async execute<T>(operation: () => T | PromiseLike<T>): Promise<T> {
    try {
      return await operation();
    } finally {
      this.active -= 1;
      if (this.active === 0 && !this.dispatching) this.finishCohort();
    }
  }

  private finishCohort(): void {
    if (this.queue.length === 0) {
      this.admissions = 0;
      return;
    }

    this.delaying = true;
    void this.releaseNextCohort();
  }

  private async releaseNextCohort(): Promise<void> {
    if (this.options.delayMs > 0) {
      await this.sleep(this.options.delayMs);
    }

    this.admissions = 0;
    this.dispatching = true;
    while (
      this.queue.length > 0 &&
      this.admissions < this.options.cohortSize
    ) {
      this.queue.shift()!.start();
    }
    this.dispatching = false;
    this.delaying = false;
    if (this.active === 0) this.finishCohort();
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cancelledOperationError(): Error {
  const error = new Error("Cascade API operation was cancelled before it started.");
  error.name = "AbortError";
  return error;
}
