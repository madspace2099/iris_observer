import type { InsightSource, ObserverAnswer } from "@observer/contracts";

/**
 * The shape of an Observer exchange, shared by every surface that holds one.
 *
 * The parts of an answer are separate fields rather than one block of prose,
 * because the whole architecture turns on the reader being able to see which
 * part a model wrote and which part it did not (ADR-0026). `ObserverAnswer`
 * itself is imported from the contracts package rather than restated here —
 * one definition, validated on the server, rendered on the client.
 */

export type { ObserverAnswer } from "@observer/contracts";

export interface ObserverStatus {
  readonly provider: string;
  readonly model: string;
  readonly live: boolean;
  /** Always null or the one fixed sentence. Redacted before it is sent. */
  readonly reason: string | null;
  /**
   * Whether the reader can fix this by connecting their own OpenAI account.
   *
   * A boolean, and it survives the redaction that strips `reason` — because it
   * says nothing about the vendor, the deployment or the request. It is true
   * for exactly one cause and false for every operator-side one, so the sheet
   * never sends somebody to Settings for a problem Settings cannot solve.
   *
   * Optional on this type because an outcome may be built by a surface that
   * predates the field; absent reads as false, which is the safe direction.
   */
  readonly setupRequired?: boolean;
}

export interface AskOutcome {
  readonly question: string;
  readonly answer: ObserverAnswer | null;
  readonly refusal: string | null;
  readonly toolsUsed: readonly string[];
  readonly sources: readonly InsightSource[];
  /** Whether this deployment is running demonstration data. Shown, not hidden. */
  readonly demoData: boolean;
  readonly status: ObserverStatus;
}

/**
 * What Observer is currently looking at.
 *
 * Carried into every question so the reader never has to name the thing that is
 * already on their screen: with a unit selected, "why is it losing attention"
 * is a complete question.
 */
export interface ObserverContext {
  /**
   * What this reader is allowed to be shown.
   *
   * Offers are part of the authorisation surface: suggesting "Compare the sales
   * agents" to a sales agent advertises a screen they may not open, and the
   * refusal that follows reads as a broken product rather than as a policy.
   */
  readonly role: "developer" | "agency_manager" | "sales_agent" | "madspace_admin";
  readonly tenantSlug: string;
  readonly projectSlug: string;
  readonly projectLabel: string;
  readonly period: string;
  readonly unitCode: string | null;
  readonly meetingId: string | null;
  readonly agentId: string | null;
  readonly agentName: string | null;
  readonly segment: string | null;
}
