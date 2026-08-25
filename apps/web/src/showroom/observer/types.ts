import type { InsightSource } from "@observer/contracts";

/**
 * The shape of an Observer exchange, shared by every surface that holds one.
 *
 * The five parts of an answer are separate fields rather than one block of
 * prose, because the whole architecture turns on the reader being able to see
 * which part a model wrote and which part it did not (ADR-0024).
 */

export interface ToolFact {
  readonly label: string;
  readonly value: string;
  readonly note: string | null;
}

export interface AnswerEvidence {
  readonly evidenceId: string;
  readonly tier: string;
  readonly href: string;
  readonly observationCount: number;
}

export interface AskAnswer {
  readonly observed: readonly ToolFact[];
  readonly interpretation: string;
  readonly recommendation: string | null;
  readonly limitations: readonly string[];
  readonly confidence: "high" | "moderate" | "low";
  readonly dataCompleteness: string;
  readonly evidence: readonly AnswerEvidence[];
  readonly sources: readonly InsightSource[];
  readonly action: { readonly label: string; readonly href: string } | null;
}

export interface AskOutcome {
  readonly question: string;
  readonly answer: AskAnswer | null;
  readonly refusal: string | null;
  readonly toolsUsed: readonly string[];
  readonly status: {
    readonly provider: string;
    readonly model: string;
    readonly live: boolean;
    readonly reason: string | null;
  };
}

/**
 * What Observer is currently looking at.
 *
 * Carried into every question so the reader never has to name the thing that is
 * already on their screen: with a unit selected, "why is it losing attention"
 * is a complete question.
 */
export interface ObserverContext {
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
