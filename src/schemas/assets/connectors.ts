/**
 * Connector asset schemas — WordPress and Google Analytics connectors.
 *
 * Both extend an abstract `Connector` type (openapi.yaml line 2512) which
 * itself extends `ContaineredAsset`. Neither concrete variant adds extra
 * fields — they're distinguished purely by envelope key.
 */

import { z } from "zod";
import { ContaineredAssetFields } from "./base.js";

// ─── Nested: ConnectorParameter ─────────────────────────────────────────────

const ConnectorParameterSchema = z
  .object({
    name: z
      .string()
      .nullable()
      .describe("REQUIRED: Parameter name. Value may not be null despite the OpenAPI nullable flag."),
    value: z
      .string()
      .nullable()
      .describe("REQUIRED: Parameter value."),
  })
  .strict();

// ─── Nested: ConnectorContentTypeLinkParam ─────────────────────────────────

const ConnectorContentTypeLinkParamSchema = z
  .object({
    name: z.string().nullable().describe("REQUIRED: Param name."),
    value: z.string().nullable().describe("REQUIRED: Param value."),
  })
  .strict();

// ─── Nested: ConnectorContentTypeLink ──────────────────────────────────────

const ConnectorContentTypeLinkSchema = z
  .object({
    contentTypeId: z
      .string()
      .optional()
      .describe("Linked content type id. One of id/path REQUIRED."),
    contentTypePath: z.string().optional().describe("Linked content type path (alt)."),
    pageConfigurationId: z.string().optional().describe("Page configuration id used for publishing."),
    pageConfigurationName: z.string().optional().describe("Page configuration name (alt)."),
    connectorContentTypeLinkParams: z
      .array(ConnectorContentTypeLinkParamSchema)
      .nullable()
      .optional()
      .describe("Per-link parameters."),
  })
  .strict();

// ─── Connector (abstract) — shared fields ──────────────────────────────────

const ConnectorFields = {
  ...ContaineredAssetFields,
  auth1: z
    .string()
    .nullable()
    .optional()
    .describe("First auth token — often username, email, or OAuth key."),
  auth2: z
    .string()
    .nullable()
    .optional()
    .describe("Second auth token — often password or OAuth secret. Write-only; hidden on read."),
  url: z
    .string()
    .nullable()
    .optional()
    .describe("Connector endpoint URL."),
  verified: z
    .boolean()
    .optional()
    .describe("Read-only: whether the connector has been successfully verified."),
  verifiedDate: z
    .string()
    .nullable()
    .optional()
    .describe("Read-only: timestamp of last successful verification."),
  connectorParameters: z
    .array(ConnectorParameterSchema)
    .nullable()
    .optional()
    .describe("Connector-specific parameters (name/value pairs)."),
  connectorContentTypeLinks: z
    .array(ConnectorContentTypeLinkSchema)
    .nullable()
    .optional()
    .describe(
      "Content-type linkage. REQUIRED for WordPressConnector per description (enforced server-side).",
    ),
};

// ─── WordPressConnector (envelope: `wordPressConnector`) ───────────────────

export const WordPressConnectorAssetSchema = z
  .object({ ...ConnectorFields })
  .strict()
  .describe("WordPress connector — pushes content to a WordPress site.");

export type WordPressConnectorAsset = z.infer<typeof WordPressConnectorAssetSchema>;

export const WordPressConnectorEnvelopeSchema = z
  .object({
    wordPressConnector: WordPressConnectorAssetSchema.describe("WordPress connector payload."),
  })
  .strict();

// ─── GoogleAnalyticsConnector (envelope: `googleAnalyticsConnector`) ───────

export const GoogleAnalyticsConnectorAssetSchema = z
  .object({ ...ConnectorFields })
  .strict()
  .describe("Google Analytics connector — pulls analytics data into Cascade.");

export type GoogleAnalyticsConnectorAsset = z.infer<typeof GoogleAnalyticsConnectorAssetSchema>;

export const GoogleAnalyticsConnectorEnvelopeSchema = z
  .object({
    googleAnalyticsConnector: GoogleAnalyticsConnectorAssetSchema.describe(
      "Google Analytics connector payload.",
    ),
  })
  .strict();
