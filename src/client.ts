/**
 * Thin factory wrapping the cascade-cms-api `CascadeAPI` constructor.
 *
 * This module exists purely to bridge our validated `Config` type to the
 * upstream library's two-argument initializer: `({ apiKey, url }, timeoutMs)`.
 */

import { CascadeAPI } from "cascade-cms-api";
import type { Config } from "./config.js";

/**
 * The concrete client object returned by `CascadeAPI(...)` — includes all
 * 25 Cascade operations as methods.
 */
export type CascadeClient = ReturnType<typeof CascadeAPI>;

/**
 * Construct a Cascade API client from validated config.
 */
export function createCascadeClient(config: Config): CascadeClient {
  return CascadeAPI({ apiKey: config.apiKey, url: config.url }, config.timeoutMs);
}
