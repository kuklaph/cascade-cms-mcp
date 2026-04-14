/**
 * Client-side pagination helper for Cascade MCP responses.
 *
 * Cascade REST endpoints don't paginate upstream, so this MCP layer always
 * fetches the full set and slices client-side. `paginateArray` preserves
 * every other field on the result (success, message, etc.) and attaches
 * standard pagination metadata so agents can iterate:
 *
 *   total       — size of the full upstream array
 *   count       — size of the returned slice
 *   offset      — current offset the caller requested (clamped to [0, total])
 *   has_more    — true when another page exists
 *   next_offset — offset to use on the next call (only present when has_more)
 *
 * Edge case: if the caller's `offset` exceeds `total`, the slice is empty
 * and `has_more` is false — callers are expected to stop when they observe
 * `has_more: false`, regardless of whether offset overshot.
 */

const MIN_LIMIT = 1;
const MAX_LIMIT = 500;

export interface PaginationMetadata {
  total: number;
  count: number;
  offset: number;
  has_more: boolean;
  next_offset?: number;
}

/**
 * Slice an array field on a Cascade response and attach pagination metadata.
 *
 * Missing keys and non-array values are treated as empty arrays so the
 * helper never crashes on an unexpected upstream shape. Limit and offset
 * are defensively clamped (limit to [1, 500], offset to ≥ 0) so a bypassed
 * Zod layer or a bad direct call still produces sane output.
 *
 * @param result   - Raw upstream response (any object shape).
 * @param arrayKey - The response key whose array to paginate (e.g. `"matches"`).
 * @param limit    - Maximum items to return in the slice (clamped to [1, 500]).
 * @param offset   - Items to skip before the slice (clamped to ≥ 0).
 */
export function paginateArray<T extends Record<string, unknown>>(
  result: T,
  arrayKey: string,
  limit: number,
  offset: number,
): T & PaginationMetadata {
  const safeLimit = Math.max(
    MIN_LIMIT,
    Math.min(MAX_LIMIT, Math.floor(limit)),
  );
  const safeOffset = Math.max(0, Math.floor(offset));

  const raw = result[arrayKey];
  const items = Array.isArray(raw) ? raw : [];
  const total = items.length;
  const slice = items.slice(safeOffset, safeOffset + safeLimit);
  const has_more = safeOffset + slice.length < total;

  return {
    ...result,
    [arrayKey]: slice,
    total,
    count: slice.length,
    offset: safeOffset,
    has_more,
    ...(has_more ? { next_offset: safeOffset + slice.length } : {}),
  } as T & PaginationMetadata;
}

/**
 * Build a paginated tool handler for `registerCascadeTool`.
 *
 * Extracts `limit` and `offset` from the validated input, forwards the rest
 * to the underlying library call, then slices the named array field via
 * `paginateArray`. Use this for every paginated tool so the 3 (or more)
 * paginated handlers share one pipeline — Rule of Three.
 *
 * @example
 * handler: paginatedHandler(
 *   (req: unknown) => client.search(req as unknown as Types.SearchRequest),
 *   "matches",
 * ),
 *
 * @param call     - Wraps the library call. Receives input minus pagination fields.
 * @param arrayKey - Response key whose array to paginate (`"matches"`, `"messages"`, etc.).
 */
export function paginatedHandler(
  call: (req: unknown) => Promise<unknown>,
  arrayKey: string,
): (input: unknown) => Promise<unknown> {
  return async (input) => {
    const raw = (input ?? {}) as Record<string, unknown>;
    const limit =
      typeof raw.limit === "number" ? raw.limit : 50;
    const offset =
      typeof raw.offset === "number" ? raw.offset : 0;
    const { limit: _l, offset: _o, ...rest } = raw;
    const result = await call(rest);
    return paginateArray(
      result as Record<string, unknown>,
      arrayKey,
      limit,
      offset,
    );
  };
}
