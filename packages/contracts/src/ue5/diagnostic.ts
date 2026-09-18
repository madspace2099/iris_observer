import { z } from "zod";

/**
 * THE DIAGNOSTIC NAMESPACE — a mechanism, not a catalogue.
 *
 * Onboarding needs to prove one thing a heartbeat cannot: that an event can
 * travel the whole ingestion path and be stored — envelope, registry lookup,
 * validation, insert, idempotency. The only honest way to prove that is to send
 * a real event through the real path.
 *
 * So one name is reserved, registered like any other, and permanently excluded
 * from every read model **by an explicit rule rather than by convention**. That
 * distinction is the entire point. A synthetic row that read models are supposed
 * to remember to exclude is a wrong number waiting for the first person who
 * forgets; a reserved namespace with a published constant is a rule a test can
 * enforce.
 *
 * **This file defines no business events.** ADR-0013 defers the catalogue and
 * this contract does not pre-empt it. `diagnostic.` is infrastructure.
 */

/** The reserved namespace. Nothing outside it may begin with this prefix. */
export const DIAGNOSTIC_NAMESPACE = "diagnostic." as const;

/** The one diagnostic event this contract defines. */
export const DIAGNOSTIC_TEST_EVENT = "diagnostic.test" as const;

/** True for any event that must be excluded from analytics read models. */
export function isDiagnosticEvent(eventName: string): boolean {
  return eventName.startsWith(DIAGNOSTIC_NAMESPACE);
}

/**
 * The payload of a `diagnostic.test` event.
 *
 * Deliberately almost empty. Its job is to be *ordinary* — to exercise the same
 * code path a real event does — and a diagnostic that needs special handling
 * proves the special handling rather than the path.
 */
export const DiagnosticTestPropertiesSchema = z.strictObject({
  /**
   * Why this was sent, so an operator reading the source's history can tell an
   * onboarding check from a support engineer's poke at a live installation.
   */
  reason: z.enum(["activation_check", "manual_check", "support_check"]),
  /**
   * A short free-text note from whoever pressed the button, or null.
   *
   * Bounded hard and documented as operator-authored: it is the one place in the
   * protocol where a human types into a payload, so it says plainly that it must
   * carry no personal data, and the forbidden-content scan applies to it exactly
   * as it does to every other property.
   */
  note: z.string().max(120).nullable(),
});
export type DiagnosticTestProperties = z.infer<typeof DiagnosticTestPropertiesSchema>;

/**
 * How a read model must exclude diagnostics.
 *
 * Published as a constant so the rule is one edit rather than a habit, and so a
 * test can assert that no metric counts a diagnostic row.
 */
export const READ_MODEL_EXCLUSION_RULE = "event_name NOT LIKE 'diagnostic.%'" as const;
