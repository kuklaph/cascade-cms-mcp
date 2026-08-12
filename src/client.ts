/**
 * Factory for the configured and rate-limited Cascade API client.
 *
 * Bridges validated configuration to the upstream `CascadeAPI` constructor,
 * then wraps its operations with the shared cohort limiter.
 */

import { CascadeAPI } from "cascade-cms-api";
import { CohortOperationLimiter } from "./cohortOperationLimiter.js";
import type { Config } from "./config.js";
import { currentRequestSignal } from "./requestContext.js";

/**
 * The concrete client object returned by `CascadeAPI(...)` — includes all
 * 25 Cascade operations as methods.
 */
export type CascadeClient = ReturnType<typeof CascadeAPI>;

/**
 * Construct a Cascade API client from validated config.
 */
export function createCascadeClient(config: Config): CascadeClient {
  const client = CascadeAPI(
    { apiKey: config.apiKey, url: config.url },
    config.timeoutMs,
  );
  const limiter = new CohortOperationLimiter({
    cohortSize: config.maxConcurrentRequests,
    delayMs: config.requestBatchDelayMs,
  });
  const methods = client as unknown as Record<
    string,
    (...args: never[]) => unknown
  >;

  return Object.fromEntries(
    Object.entries(methods).map(([name, method]) => [
      name,
      (...args: never[]) =>
        limiter.run(
          () => method.apply(client, args),
          currentRequestSignal(),
        ),
    ]),
  ) as CascadeClient;
}
