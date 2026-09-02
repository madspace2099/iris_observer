import { expect } from "vitest";
import type { ActivationSuccess, BatchResponse } from "@observer/contracts/ue5";
import { MockObserverBackend, type MockOutcome } from "../src/backend";
import { Deterministic } from "../src/ids";

/**
 * Builders, so a test says what it is testing rather than what JSON looks like.
 *
 * Every identifier comes from a seeded generator, so a failure is reproducible
 * and two runs of the same test produce the same transcript.
 */

const ids = new Deterministic(0x51a7_1c0d);

export const uuid = (): string => ids.uuid();

export const WHEN = "2026-09-01T09:14:02.881Z";

export function activationRequest(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    activation_code: "OBS-0000-0000-0000",
    reported_environment: "production",
    installation_nonce: uuid(),
    build: {
      app_version: "IRIS 4.3.0",
      plugin_version: "ObserverUE 0.1.0",
      build_id: "iris-4.3.0-win64-shipping-8821",
      engine_version: "5.6",
    },
    os: "Windows 11 24H2",
    ...over,
  };
}

export function event(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    event_id: uuid(),
    event_name: "unit.viewed",
    schema_version: 1,
    occurred_at: WHEN,
    session_id: null,
    sequence: null,
    app: {
      version: "1.0.0",
      plugin: "0.2.0",
      build_id: "BUILD-2026-09-01",
      environment: "development",
    },
    properties: { unit_code: "A-402" },
    ...over,
  };
}

export function batch(events: readonly Record<string, unknown>[]): Record<string, unknown> {
  return { batch_id: uuid(), sent_at: WHEN, events: [...events] };
}

/** A response outcome, with the type narrowing a test would otherwise repeat. */
export function response(outcome: MockOutcome): {
  status: number;
  body: Record<string, unknown>;
  headers: Readonly<Record<string, string>>;
} {
  if (outcome.kind !== "response") throw new Error("expected a response, got a dropped request");
  return {
    status: outcome.status,
    body: outcome.body as Record<string, unknown>,
    headers: outcome.headers,
  };
}

export function ingestBody(outcome: MockOutcome): BatchResponse {
  const { status, body } = response(outcome);
  expect(status).toBe(200);
  return body as unknown as BatchResponse;
}

/** A backend with one activated source, and the token it issued. */
export function activated(backend?: MockObserverBackend): {
  backend: MockObserverBackend;
  token: string;
  sourceId: string;
  activation: ActivationSuccess;
} {
  const target = backend ?? new MockObserverBackend();
  const code = target.issueActivationCode({ displayLabel: "Northgate · Showroom PC 1" });
  const outcome = target.activate(activationRequest({ activation_code: code }));
  const { status, body } = response(outcome);
  expect(status, JSON.stringify(body)).toBe(200);
  const activation = body as unknown as ActivationSuccess;
  return {
    backend: target,
    token: activation.source_token,
    sourceId: activation.source_id,
    activation,
  };
}

export const bearer = (token: string): string => `Bearer ${token}`;
