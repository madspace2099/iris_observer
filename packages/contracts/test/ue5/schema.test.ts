import { describe, expect, it } from "vitest";
import { ActivationRequestSchema, ActivationSuccessSchema } from "../../src/ue5/activation";
import {
  BatchEnvelopeSchema,
  BatchFrameSchema,
  BatchResponseSchema,
  EventEnvelopeSchema,
  EventResultSchema,
} from "../../src/ue5/ingestion";
import { HeartbeatRequestSchema } from "../../src/ue5/heartbeat";
import { UNSTATED_LIMITS } from "../../src/ue5/limits";

/**
 * THE SCHEMAS, EXERCISED AGAINST WHAT A CLIENT WILL ACTUALLY SEND WRONG.
 *
 * Happy paths are the cheap half. What earns its keep here is the other half:
 * the field a plugin adds because it seemed useful, the timestamp without an
 * offset, the identifier that is a string but not a UUID, and the schema version
 * somebody sent as `"1"` instead of `1`.
 */

const UUID_A = "6f1c9f6e-2c7a-4a4e-9b31-9b0f9a3f1a2b";
const UUID_B = "b2a5f0c1-3d4e-4f7a-8c9b-0d1e2f3a4b5c";
const UUID_C = "0c9f2d31-77a4-4b12-9e88-1f2a3b4c5d6e";
const WHEN = "2026-09-01T09:14:02.881Z";

const activation = {
  activation_code: "OBS-7K4M-2QX9-D3TA",
  reported_environment: "production",
  installation_nonce: UUID_A,
  build: {
    app_version: "IRIS 4.3.0",
    plugin_version: "ObserverUE 0.1.0",
    build_id: "iris-4.3.0-win64-shipping-8821",
    engine_version: "5.6",
  },
  os: "Windows 11 24H2",
};

const event = {
  event_id: UUID_B,
  event_name: "section.entered",
  schema_version: 1,
  occurred_at: WHEN,
  session_id: UUID_C,
  sequence: 1,
  properties: { path: ["home"] },
};

describe("activation request", () => {
  it("accepts a realistic request", () => {
    const parsed = ActivationRequestSchema.safeParse(activation);
    expect(parsed.success ? null : parsed.error.issues).toBeNull();
  });

  it("refuses a missing required field", () => {
    const without: Record<string, unknown> = { ...activation };
    delete without["installation_nonce"];
    expect(ActivationRequestSchema.safeParse(without).success).toBe(false);
  });

  it("refuses an unexpected field", () => {
    /*
     * A strict envelope, and this is the case it exists for: `hostname_hint` was
     * removed from the proposal, so a build that still sends it must be told,
     * not quietly humoured.
     */
    const parsed = ActivationRequestSchema.safeParse({
      ...activation,
      hostname_hint: "ISTER-SHOWROOM-PC1",
    });
    expect(parsed.success).toBe(false);
  });

  it("refuses an installation nonce that is not a UUID", () => {
    expect(
      ActivationRequestSchema.safeParse({ ...activation, installation_nonce: "pc-1" }).success,
    ).toBe(false);
  });

  it("refuses an unknown environment", () => {
    expect(
      ActivationRequestSchema.safeParse({ ...activation, reported_environment: "prod" }).success,
    ).toBe(false);
  });

  it("refuses an activation code long enough to be an attack", () => {
    expect(
      ActivationRequestSchema.safeParse({ ...activation, activation_code: "A".repeat(4_096) })
        .success,
    ).toBe(false);
  });
});

describe("activation success", () => {
  const success = {
    status: "activated",
    source_id: UUID_A,
    display_label: "Northgate · Showroom PC 1",
    environment: "production",
    environment_mismatch: false,
    source_token: `obs_${"a".repeat(56)}`,
    token_expires_at: null,
    ingest_url: "https://example.supabase.co/functions/v1/observer-ingest",
    heartbeat_url: "https://example.supabase.co/functions/v1/observer-heartbeat",
    accepted_schema_versions: { min: 1, max: 1 },
    limits: UNSTATED_LIMITS,
    config_refresh_after: "2026-10-01T00:00:00.000Z",
  };

  it("accepts the proposed body", () => {
    const parsed = ActivationSuccessSchema.safeParse(success);
    expect(parsed.success ? null : parsed.error.issues).toBeNull();
  });

  it("has no place to put a tenant or a project identifier", () => {
    /*
     * The Phase 2 decision, asserted rather than described. Returning these
     * would put two authoritative-looking identifiers inside a client that has
     * no use for them and every opportunity to echo them back.
     */
    for (const field of ["tenant_id", "project_id"]) {
      expect(
        ActivationSuccessSchema.safeParse({ ...success, [field]: UUID_B }).success,
        field,
      ).toBe(false);
    }
  });

  it("states no expiry, in a field that could carry one later", () => {
    /*
     * The field exists precisely because the answer is "never". Without it, a
     * future expiry policy would have to arrive in a new field, and every build
     * parsing this response strictly would break on the day it did.
     */
    expect(ActivationSuccessSchema.parse(success).token_expires_at).toBeNull();
    expect(
      ActivationSuccessSchema.safeParse({
        ...success,
        token_expires_at: "2027-01-01T00:00:00.000Z",
      }).success,
      "and a value parses, so introducing one is not a breaking change",
    ).toBe(true);
  });

  it("refuses a token too short to be one", () => {
    expect(ActivationSuccessSchema.safeParse({ ...success, source_token: "obs_1" }).success).toBe(
      false,
    );
  });
});

describe("event envelope", () => {
  it("accepts a well-formed event", () => {
    const parsed = EventEnvelopeSchema.safeParse(event);
    expect(parsed.success ? null : parsed.error.issues).toBeNull();
  });

  it("accepts a session-less event with a null sequence", () => {
    const parsed = EventEnvelopeSchema.safeParse({ ...event, session_id: null, sequence: null });
    expect(parsed.success ? null : parsed.error.issues).toBeNull();
  });

  it("refuses an identifier that is not a UUID", () => {
    expect(EventEnvelopeSchema.safeParse({ ...event, event_id: "evt-1" }).success).toBe(false);
  });

  it("refuses a timestamp with no offset", () => {
    /* A showroom in a country that changes its clocks needs the offset. */
    expect(
      EventEnvelopeSchema.safeParse({ ...event, occurred_at: "2026-09-01T09:14:02" }).success,
    ).toBe(false);
  });

  it("refuses a timestamp that is not a timestamp", () => {
    expect(EventEnvelopeSchema.safeParse({ ...event, occurred_at: "yesterday" }).success).toBe(
      false,
    );
  });

  it("refuses an event name that is not dotted lower_snake_case", () => {
    for (const name of ["Section.Entered", "section entered", "section", "9.bad", ""]) {
      expect(EventEnvelopeSchema.safeParse({ ...event, event_name: name }).success, name).toBe(
        false,
      );
    }
  });

  it("refuses a schema version that is a string, a float or zero", () => {
    for (const version of ["1", 1.5, 0, -1]) {
      expect(
        EventEnvelopeSchema.safeParse({ ...event, schema_version: version }).success,
        String(version),
      ).toBe(false);
    }
  });

  it("refuses a sequence below one", () => {
    expect(EventEnvelopeSchema.safeParse({ ...event, sequence: 0 }).success).toBe(false);
  });

  it("refuses an unexpected envelope field", () => {
    expect(EventEnvelopeSchema.safeParse({ ...event, ingested_at: WHEN }).success).toBe(false);
  });

  it("keeps the properties bag open", () => {
    /* Closed envelope, open payload. The registry owns the payload's shape. */
    const parsed = EventEnvelopeSchema.safeParse({
      ...event,
      properties: { anything: { nested: [1, "two", null] } },
    });
    expect(parsed.success).toBe(true);
  });
});

describe("batch envelope", () => {
  const batch = { batch_id: UUID_A, sent_at: WHEN, events: [event] };

  it("accepts a batch", () => {
    const parsed = BatchEnvelopeSchema.safeParse(batch);
    expect(parsed.success ? null : parsed.error.issues).toBeNull();
  });

  it("accepts an empty batch", () => {
    expect(BatchEnvelopeSchema.safeParse({ ...batch, events: [] }).success).toBe(true);
  });

  it("refuses identity smuggled onto the batch", () => {
    for (const field of ["tenant_id", "project_id", "source_id"]) {
      expect(BatchEnvelopeSchema.safeParse({ ...batch, [field]: UUID_B }).success, field).toBe(
        false,
      );
    }
  });

  it("refuses a batch whose events are not events", () => {
    expect(
      BatchEnvelopeSchema.safeParse({ ...batch, events: [{ event_id: UUID_B }] }).success,
    ).toBe(false);
  });
});

describe("the frame a server parses is not the envelope it publishes", () => {
  const frame = { batch_id: UUID_A, sent_at: WHEN, events: [event] };

  it("accepts a frame carrying an event that will be rejected individually", () => {
    /*
     * The defect this exists to prevent, found by a test rather than by reading:
     * parsing an incoming batch with `BatchEnvelopeSchema` validates every event
     * inside it, so one malformed event fails the whole parse and the batch comes
     * back 400 — quietly destroying partial batch success, which is LOCKED.
     */
    const withBadEvent = {
      ...frame,
      events: [event, { ...event, event_id: UUID_C, event_name: "NOT A NAME" }],
    };
    expect(BatchEnvelopeSchema.safeParse(withBadEvent).success, "the envelope refuses it").toBe(
      false,
    );
    expect(BatchFrameSchema.safeParse(withBadEvent).success, "the frame accepts it").toBe(true);
  });

  it("requires a readable event_id on every element, and nothing else", () => {
    /*
     * The one exception to "never validate events at the batch level", and it is
     * forced rather than chosen: the per-event result protocol is *addressed by*
     * `event_id`. An event without one cannot be reported on, acknowledged or
     * deduplicated, so there is nothing sensible to put in `results`.
     */
    expect(BatchFrameSchema.safeParse({ ...frame, events: [{ occurred_at: WHEN }] }).success).toBe(
      false,
    );
    expect(
      BatchFrameSchema.safeParse({ ...frame, events: [{ event_id: "nope", x: 1 }] }).success,
    ).toBe(false);
    expect(
      BatchFrameSchema.safeParse({ ...frame, events: [{ event_id: UUID_B, anything: true }] })
        .success,
      "everything else is judged per event",
    ).toBe(true);
  });

  it("still refuses a broken frame", () => {
    expect(BatchFrameSchema.safeParse({ ...frame, events: "lots" }).success).toBe(false);
    expect(BatchFrameSchema.safeParse({ ...frame, project_id: UUID_B }).success).toBe(false);
    expect(BatchFrameSchema.safeParse({ ...frame, sent_at: "whenever" }).success).toBe(false);
  });
});

describe("responses", () => {
  it("accepts a result carrying a code this build has never seen", () => {
    /*
     * Deliberate. If the wire type were the closed enum, a code added after this
     * build shipped would make the whole response unparseable — turning one
     * quarantined event into a permanently stuck batch.
     */
    const parsed = EventResultSchema.safeParse({
      event_id: UUID_B,
      status: "rejected",
      code: "some_future_reason",
      retryable: false,
      detail: null,
    });
    expect(parsed.success ? null : parsed.error.issues).toBeNull();
  });

  it("accepts a batch response where everything was rejected", () => {
    const parsed = BatchResponseSchema.safeParse({
      batch_id: UUID_A,
      received: 1,
      accepted: 0,
      duplicate: 0,
      rejected: 1,
      results: [
        {
          event_id: UUID_B,
          status: "rejected",
          code: "schema_unknown",
          retryable: false,
          detail: "not registered",
        },
      ],
      warnings: [],
    });
    expect(parsed.success ? null : parsed.error.issues).toBeNull();
  });

  it("refuses a detail long enough to hide a payload in", () => {
    expect(
      EventResultSchema.safeParse({
        event_id: UUID_B,
        status: "rejected",
        code: "schema_invalid",
        retryable: false,
        detail: "x".repeat(500),
      }).success,
    ).toBe(false);
  });
});

describe("heartbeat", () => {
  it("accepts a health report", () => {
    const parsed = HeartbeatRequestSchema.safeParse({
      sent_at: WHEN,
      build: activation.build,
      queue: {
        pending_events: 42,
        oldest_pending_at: "2026-09-01T08:02:11.000Z",
        quarantined_events: 0,
        bytes_used: 1_048_576,
        bytes_ceiling: 52_428_800,
        dropped_events: 0,
      },
      last_error: { code: "rate_limited", at: WHEN },
    });
    expect(parsed.success ? null : parsed.error.issues).toBeNull();
  });

  it("has nowhere to put a free-text message", () => {
    /*
     * The most likely place in the whole protocol for an exception string
     * carrying a token or a buyer's name to reach a server log. So there is no
     * such field, and adding one has to be a deliberate contract change.
     */
    expect(
      HeartbeatRequestSchema.safeParse({
        sent_at: WHEN,
        build: activation.build,
        queue: {
          pending_events: 0,
          oldest_pending_at: null,
          quarantined_events: 0,
          bytes_used: 0,
          bytes_ceiling: null,
          dropped_events: 0,
        },
        last_error: { code: "unavailable", at: WHEN, message: "connect ECONNREFUSED" },
      }).success,
    ).toBe(false);
  });
});
