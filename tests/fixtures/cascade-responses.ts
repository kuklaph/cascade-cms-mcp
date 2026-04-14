/**
 * Canned responses from the Cascade API for use in unit tests.
 *
 * These mirror the shapes returned by cascade-cms-api's operations
 * (OperationResult + per-op response types). Reuse these to keep
 * tests consistent and to catch drift in a single place.
 */

/** Bare OperationResult success. */
export const OK_RESULT = { success: true } as const;

/** Success with a short message. */
export const OK_WITH_MESSAGE = {
  success: true,
  message: "Operation completed",
} as const;

/** Create returned a new asset id. */
export const CREATE_OK = {
  success: true,
  createdAssetId: "abc123",
} as const;

/** Read returned a page asset body. */
export const READ_PAGE_OK = {
  success: true,
  asset: {
    page: {
      id: "page-001",
      name: "index",
      path: "/index",
      type: "page",
      parentFolderPath: "/",
      siteName: "my-site",
      contentTypePath: "/content-types/default",
    },
  },
} as const;

/** Search returned two matches. */
export const SEARCH_OK = {
  success: true,
  matches: [
    { id: "a-1", type: "page", path: { path: "/about" } },
    { id: "a-2", type: "file", path: { path: "/assets/logo.png" } },
  ],
} as const;

/** Library returned a failure object (rare; library usually throws). */
export const FAILURE_NOT_FOUND = {
  success: false,
  message: "Asset not found",
} as const;
