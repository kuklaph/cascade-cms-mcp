export type OperationLimiterOptions = {
  maxConcurrent: number;
  maxQueued?: number;
  queueFullMessage?: string;
};

export class OperationLimiter {
  private active = 0;
  private readonly queue: Array<() => void> = [];

  constructor(private readonly options: OperationLimiterOptions) {}

  run<T>(operation: () => T | PromiseLike<T>): Promise<T> {
    if (this.active < this.options.maxConcurrent) {
      this.active += 1;
      return this.execute(operation);
    }
    if (
      this.options.maxQueued !== undefined &&
      this.queue.length >= this.options.maxQueued
    ) {
      return Promise.reject(new Error(this.options.queueFullMessage));
    }

    return new Promise<T>((resolve, reject) => {
      this.queue.push(() => {
        this.execute(operation).then(resolve, reject);
      });
    });
  }

  private async execute<T>(operation: () => T | PromiseLike<T>): Promise<T> {
    try {
      return await operation();
    } finally {
      const next = this.queue.shift();
      if (next) {
        next();
      } else {
        this.active -= 1;
      }
    }
  }
}
