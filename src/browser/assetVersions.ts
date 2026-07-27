import {
  ajaxHeaders,
  assertBrowserResponseOk,
  readJsonObjectResponse,
} from "./http.js";
import type {
  BrowserAssetVersion,
  BrowserFetch,
  BrowserListAssetVersionsResult,
} from "./types.js";

type AssetVersionsContext = {
  browserUrl: string;
  cookieHeader: string;
  fetchImpl: BrowserFetch;
};

export async function listAssetVersions(
  ctx: AssetVersionsContext,
  args: { assetId: string; assetType: string },
): Promise<BrowserListAssetVersionsResult> {
  const assetId = encodeURIComponent(args.assetId);
  const assetType = encodeURIComponent(args.assetType);
  const res = await ctx.fetchImpl(
    `${ctx.browserUrl}/ajax/getAssetVersions.act?id=${assetId}&type=${assetType}&_=${Date.now()}`,
    {
      headers: ajaxHeaders({
        accept: "application/json, text/javascript, */*; q=0.01",
        cookie: ctx.cookieHeader,
        Referer:
          `${ctx.browserUrl}/entity/open.act?id=${assetId}` +
          `&type=${assetType}&action=versions`,
      }),
      method: "GET",
    },
  );

  await assertBrowserResponseOk(res, "List asset versions");

  const body = await readJsonObjectResponse(
    res,
    "Invalid asset versions response",
  );
  if (
    !Array.isArray(body.versions) ||
    !body.versions.every(isBrowserAssetVersion) ||
    typeof body.statusCode !== "string"
  ) {
    throw new Error("Invalid asset versions response");
  }

  return {
    success: true,
    asset_id: args.assetId,
    asset_type: args.assetType,
    count: body.versions.length,
    status_code: body.statusCode,
    versions: body.versions,
  };
}

function isBrowserAssetVersion(value: unknown): value is BrowserAssetVersion {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
