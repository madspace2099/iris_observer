import { z } from "zod";
import {
  ActivationFailureSchema,
  ActivationRequestSchema,
  ActivationSuccessSchema,
} from "./activation";
import {
  BatchEnvelopeSchema,
  BatchResponseSchema,
  EventEnvelopeSchema,
  EventResultSchema,
  RequestFailureBodySchema,
} from "./ingestion";
import { HeartbeatRequestSchema, HeartbeatResponseSchema } from "./heartbeat";
import { DiagnosticTestPropertiesSchema } from "./diagnostic";
import { LimitsSchema } from "./limits";
import { EVENT_REJECTIONS, REQUEST_FAILURES } from "./errors";
import { UE5_CONTRACT_STATUS, UE5_CONTRACT_VERSION } from "./wire";

/**
 * THE OPENAPI 3.1 DESCRIPTION, BUILT FROM THE SCHEMAS RATHER THAN BESIDE THEM.
 *
 * `packages/contracts` is described in `CLAUDE.md` as "Zod → JSON Schema →
 * OpenAPI → examples", and this is the middle two arrows. Generating the
 * document from the same Zod schemas the validator uses is the only arrangement
 * in which the published description cannot drift from the enforced rule — a
 * hand-written OpenAPI file beside a validator is two contracts that agree until
 * the afternoon somebody edits one of them.
 *
 * OpenAPI 3.1 is a superset of JSON Schema 2020-12, so the schemas go in
 * unmodified. The generated document is committed under `docs/ue5-contract/`
 * and a drift test regenerates it and compares, exactly as `pnpm matrix` does
 * for the measurement matrix.
 */

const SERVER_PLACEHOLDER = "https://{projectRef}.supabase.co/functions/v1";

function jsonSchema(schema: z.ZodType): Record<string, unknown> {
  const generated = z.toJSONSchema(schema, {
    target: "draft-2020-12",
    io: "input",
    unrepresentable: "any",
  }) as Record<string, unknown>;
  /* `$schema` belongs on a standalone document, not on a component. */
  delete generated["$schema"];
  return generated;
}

/** Named component schemas, in a stable order so the generated file is diffable. */
export const COMPONENT_SCHEMAS: Readonly<Record<string, z.ZodType>> = Object.freeze({
  ActivationRequest: ActivationRequestSchema,
  ActivationSuccess: ActivationSuccessSchema,
  ActivationFailure: ActivationFailureSchema,
  Limits: LimitsSchema,
  EventEnvelope: EventEnvelopeSchema,
  BatchEnvelope: BatchEnvelopeSchema,
  EventResult: EventResultSchema,
  BatchResponse: BatchResponseSchema,
  RequestFailureBody: RequestFailureBodySchema,
  HeartbeatRequest: HeartbeatRequestSchema,
  HeartbeatResponse: HeartbeatResponseSchema,
  DiagnosticTestProperties: DiagnosticTestPropertiesSchema,
});

/** Every component as JSON Schema. Also written out one file per schema. */
export function componentJsonSchemas(): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  for (const [name, schema] of Object.entries(COMPONENT_SCHEMAS)) {
    out[name] = jsonSchema(schema);
  }
  return out;
}

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

const json = (name: string) => ({
  content: { "application/json": { schema: ref(name) } },
});

const DESCRIPTION = [
  "**PROPOSED contract candidate. Not implemented; no endpoint exists.**",
  "",
  "The one rule to read before any other:",
  "",
  "> The HTTP status says whether the batch was processed. It never says whether the events",
  "> were accepted.",
  "",
  "`200` means the batch was processed — consult the per-event `results`, even when every",
  "event in it was rejected. Any non-2xx means the batch was **not** processed, nothing was",
  "stored, and the whole batch is safe to resend unchanged.",
  "",
  "Tenant, project and source identity are derived by the server from the activated",
  "credential. No request body carries them, and every envelope refuses them.",
].join("\n");

export function buildOpenApiDocument(): Record<string, unknown> {
  return {
    openapi: "3.1.0",
    info: {
      title: "IRIS Observer — UE5 ingestion contract",
      version: UE5_CONTRACT_VERSION,
      summary: `Activation, batch ingestion and heartbeat for the IRIS UE5 plugin (${UE5_CONTRACT_STATUS}).`,
      description: DESCRIPTION,
    },
    servers: [
      {
        url: SERVER_PLACEHOLDER,
        description: "Observer Edge Functions. The project reference is deployment-specific.",
        variables: { projectRef: { default: "example" } },
      },
    ],
    tags: [
      { name: "activation", description: "One-time exchange of a code for a source credential." },
      { name: "ingestion", description: "Batched, idempotent, per-event analytics submission." },
      {
        name: "diagnostics",
        description: "Liveness, plugin health, and the end-to-end test event.",
      },
    ],
    paths: {
      "/observer-activate": {
        post: {
          tags: ["activation"],
          operationId: "activateSource",
          summary: "Exchange a one-time activation code for a source credential",
          description:
            "Unauthenticated. Unknown, expired and already-consumed codes answer an identical " +
            "401, so that nothing discloses whether a tenant, project or source exists.",
          requestBody: { required: true, ...json("ActivationRequest") },
          responses: {
            "200": {
              description:
                "Activated or reactivated. The token is returned once, here, and never again.",
              ...json("ActivationSuccess"),
            },
            "400": {
              description: "The request could not be parsed.",
              ...json("ActivationFailure"),
            },
            "401": {
              description:
                "The code could not be used. Unknown, expired and consumed are indistinguishable.",
              ...json("ActivationFailure"),
            },
            "409": {
              description: "This installation already has a live source. No token is issued.",
              ...json("ActivationFailure"),
            },
            "429": { description: "Rate limited.", ...json("ActivationFailure") },
            "503": { description: "Temporarily unavailable.", ...json("ActivationFailure") },
          },
        },
      },
      "/observer-ingest": {
        post: {
          tags: ["ingestion"],
          operationId: "ingestBatch",
          summary: "Submit a batch of analytics events",
          description:
            "Identity is derived from the credential. An empty batch is valid and returns " +
            "`received: 0`; it is not a heartbeat.",
          security: [{ sourceToken: [] }],
          requestBody: { required: true, ...json("BatchEnvelope") },
          responses: {
            "200": {
              description: "The batch was processed. Consult the per-event results.",
              ...json("BatchResponse"),
            },
            "400": {
              description: "The batch envelope is malformed or carries a forbidden field.",
              ...json("RequestFailureBody"),
            },
            "401": {
              description: "The credential is unknown, revoked or superseded.",
              ...json("RequestFailureBody"),
            },
            "403": {
              description: "The credential is valid; the source is suspended or archived.",
              ...json("RequestFailureBody"),
            },
            "413": {
              description: "Over the batch ceiling in force. Split and retry.",
              ...json("RequestFailureBody"),
            },
            "429": {
              description: "Rate limited. Retry-After is authoritative.",
              ...json("RequestFailureBody"),
            },
            "503": {
              description: "Nothing was stored. Retain and back off.",
              ...json("RequestFailureBody"),
            },
          },
        },
      },
      "/observer-heartbeat": {
        post: {
          tags: ["diagnostics"],
          operationId: "heartbeat",
          summary: "Report liveness and plugin health",
          description:
            "Writes to the source's operational record and never to analytics_events. Carries " +
            "queue depth, quarantine count and the last error code — the things an operator " +
            "needs when a showroom looks quiet, none of which are facts about a customer.",
          security: [{ sourceToken: [] }],
          requestBody: { required: true, ...json("HeartbeatRequest") },
          responses: {
            "200": { description: "Acknowledged.", ...json("HeartbeatResponse") },
            "401": {
              description: "The credential is unknown, revoked or superseded.",
              ...json("RequestFailureBody"),
            },
            "403": {
              description: "The source is suspended or archived.",
              ...json("RequestFailureBody"),
            },
            "429": { description: "Rate limited.", ...json("RequestFailureBody") },
            "503": { description: "Temporarily unavailable.", ...json("RequestFailureBody") },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        sourceToken: {
          type: "http",
          scheme: "bearer",
          description:
            "The source credential from activation. Opaque: never parsed, decoded or logged. " +
            "Scoped to appending events for one source, and able to read nothing.",
        },
      },
      schemas: componentJsonSchemas(),
    },
    "x-observer-contract": {
      status: UE5_CONTRACT_STATUS,
      version: UE5_CONTRACT_VERSION,
      note: "Generated from Zod by `pnpm contracts:ue5`. Do not edit by hand.",
      requestFailures: REQUEST_FAILURES.map((failure) => ({
        code: failure.code,
        httpStatus: failure.httpStatus,
        meaning: failure.meaning,
        retryable: failure.retryable,
        outbox: failure.outbox,
        sending: failure.sending,
        operatorRequired: failure.operatorRequired,
      })),
      eventRejections: EVENT_REJECTIONS.map((rejection) => ({
        code: rejection.code,
        meaning: rejection.meaning,
        retryable: rejection.retryable,
        outbox: rejection.outbox,
        sending: rejection.sending,
        operatorRequired: rejection.operatorRequired,
      })),
      unknownCodePolicy:
        "An unrecognised rejection code is non-retryable and quarantines, whatever the server " +
        "says about retryable. An unrecognised non-2xx status retains the outbox and backs off.",
    },
  };
}
