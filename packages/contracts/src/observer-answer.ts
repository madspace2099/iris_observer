import { z } from "zod";

import { PRODUCIBLE_EVIDENCE_TIERS } from "./evidence";
import { InsightSourceSchema } from "./provenance";

/**
 * What Observer is allowed to say, as a contract.
 *
 * The language model does not return prose that the application then formats.
 * It returns *this shape*, and anything that fails to parse is discarded before
 * a reader sees it. That inversion is the whole point: a schema can be tested,
 * an instruction in a system prompt cannot, and the difference matters most
 * exactly when a model is behaving unusually.
 *
 * Three prohibitions are structural here rather than editorial:
 *
 *   1. **No causal claim.** `EvidenceLevelSchema` is built from
 *      `PRODUCIBLE_EVIDENCE_TIERS`, which omits `causal_claim`. A model that
 *      labels its own finding causal produces an answer that will not parse.
 *   2. **No unsourced finding.** Every finding names an evidence bundle, and a
 *      refinement check rejects an answer whose findings point at bundles that
 *      were never supplied.
 *   3. **No unbounded output.** Every string has a maximum length and every
 *      array a maximum size, so a runaway generation is a validation failure
 *      rather than a page that scrolls for a minute.
 */

/* --- the evidence bundle ---------------------------------------------------- */

/**
 * The tiers an answer may carry.
 *
 * Deliberately derived from the producible list rather than restated. Adding a
 * tier to the evidence taxonomy without deciding whether Observer may emit it
 * is then impossible: the two lists cannot drift apart, because there is only
 * one of them.
 */
export const EvidenceLevelSchema = z.enum(PRODUCIBLE_EVIDENCE_TIERS);
export type EvidenceLevel = z.infer<typeof EvidenceLevelSchema>;

/**
 * One traceable basis for a claim.
 *
 * Assembled by the server from what a tool actually returned — never by the
 * model, which only quotes the `bundleId`. A model that invents a bundle is
 * inventing a key that does not exist in a map the server owns, and the answer
 * is rejected rather than rendered with a plausible-looking citation.
 */
export const EvidenceBundleSchema = z.strictObject({
  /** Stable within one answer. What a finding cites. */
  bundleId: z.string().min(1).max(64),
  /** Which project the figure belongs to. An answer never crosses projects. */
  projectSlug: z.string().min(1).max(64),
  /** The period the figure was computed over, spelled as the reader sees it. */
  period: z.string().min(1).max(64),
  /**
   * The metric or fact this rests on.
   *
   * A registry metric id where one exists, otherwise the tool that computed it.
   * Either way the reader can be taken to the same figure on a screen.
   */
  factId: z.string().min(1).max(128),
  /** Which class of claim this is — observed, derived, CRM context, WEBIRIS. */
  sourceChannel: InsightSourceSchema,
  /** The honest denominator. Zero is a real answer and must survive. */
  sampleSize: z.number().int().min(0),
  evidenceLevel: EvidenceLevelSchema,
  /** Where the reader goes to check it. Resolved by the read model. */
  href: z.string().min(1).max(512).nullable().default(null),
});
export type EvidenceBundle = z.infer<typeof EvidenceBundleSchema>;

/* --- findings --------------------------------------------------------------- */

/**
 * One thing Observer observed, with the figure attached.
 *
 * `statement` and `value` are separate because the reader must be able to scan
 * the figures without reading the prose, and because a value the tools computed
 * should never be reachable only by parsing a sentence a model wrote.
 */
export const ObservedFindingSchema = z.strictObject({
  statement: z.string().min(1).max(400),
  /** Formatted for display by the tool. The model may not alter it. */
  value: z.string().max(64).nullable().default(null),
  /** Bundles supporting this finding. At least one, always. */
  evidenceRefs: z.array(z.string().min(1).max(64)).min(1).max(6),
});
export type ObservedFinding = z.infer<typeof ObservedFindingSchema>;

/**
 * Something Observer proposes doing about it.
 *
 * Capped at three by the contract. A list of eight recommendations is a list
 * nobody acts on, and the cap is the kind of product decision that should be
 * impossible to erode one release at a time.
 */
export const RecommendedActionSchema = z.strictObject({
  label: z.string().min(1).max(120),
  rationale: z.string().min(1).max(300),
  /** A route inside Observer, never an external address. */
  href: z.string().max(512).nullable().default(null),
});
export type RecommendedAction = z.infer<typeof RecommendedActionSchema>;

/* --- the orb ---------------------------------------------------------------- */

/**
 * The states an *answer* may put the orb into.
 *
 * A subset of the orb's full vocabulary: `listening`, `thinking` and `speaking`
 * describe what the client is doing and are set there, never claimed by a
 * server payload. What an answer gets to say is what it found.
 */
export const ANSWER_ORB_STATES = [
  /** Evidence was found and it points one way. */
  "insight",
  /** Evidence was found and it disagrees with itself. Said, never smoothed. */
  "contradictory_evidence",
  /** The question cannot be settled from data. A person has to decide. */
  "waiting_for_human",
  /** Something failed. The measured evidence is still on the page. */
  "error",
] as const;

export const AnswerOrbStateSchema = z.enum(ANSWER_ORB_STATES);
export type AnswerOrbState = z.infer<typeof AnswerOrbStateSchema>;

/* --- the answer -------------------------------------------------------------- */

export const ObserverAnswerSchema = z.strictObject({
  /**
   * The sentence that answers the question.
   *
   * Short on purpose. Everything qualifying it has its own field, so an
   * interface can show this alone without hiding a caveat inside prose.
   */
  answer: z.string().min(1).max(600),
  /** A headline that explains rather than labels. Not a title for the page. */
  headline: z.string().min(1).max(120),
  /** What was measured. May be empty only when the answer is an error. */
  findings: z.array(ObservedFindingSchema).max(8),
  /** Every bundle any finding may cite. Supplied by the server. */
  evidence: z.array(EvidenceBundleSchema).max(12),
  /**
   * What the figures appear to mean.
   *
   * The only field a model is genuinely free in, and the only one that may be
   * wrong without a figure being wrong. Kept separate for that reason.
   */
  interpretation: z.string().min(1).max(1200),
  /** What this cannot say, what is missing, what is stale. Never empty prose. */
  limitations: z.array(z.string().min(1).max(300)).max(6),
  recommendedActions: z.array(RecommendedActionSchema).max(3),
  followUpQuestions: z.array(z.string().min(1).max(160)).max(4),
  orbState: AnswerOrbStateSchema,
});
export type ObserverAnswer = z.infer<typeof ObserverAnswerSchema>;

/* --- integrity --------------------------------------------------------------- */

export type AnswerDefect =
  | { readonly kind: "dangling_evidence"; readonly detail: string }
  | { readonly kind: "unsupported_finding"; readonly detail: string }
  | { readonly kind: "ungrounded_answer"; readonly detail: string }
  | { readonly kind: "duplicate_finding"; readonly detail: string }
  | { readonly kind: "unsupported_causal_claim"; readonly detail: string };

/**
 * Wording that asks *why*, not *what*.
 *
 * Observer measures what happened inside a presentation. It can establish that
 * Compare use fell by fourteen points; it cannot establish what caused that,
 * because nothing it observes carries a cause. A question that asks for one has
 * to be answered by saying so — and then by naming the comparison that would
 * narrow it down.
 */
const CAUSAL_QUESTION =
  /\b(why|what caused|what's causing|what is causing|reason for|because of|due to|explain why|root cause)\b/i;

/** Language that asserts a cause rather than describing an association. */
const CAUSAL_ASSERTION =
  /\b(because|caused|causes|causing|drove|drives|led to|leads to|resulted in|results in|due to|therefore|as a result of)\b/i;

/** Language that declines one. */
const CAUSAL_REFUSAL =
  /\b(cannot|can't|does not|doesn't|do not|no evidence|not establish|not show|unable to|nothing here (?:shows|establishes)|does not say)\b/i;

export function isCausalQuestion(question: string): boolean {
  return CAUSAL_QUESTION.test(question);
}

/**
 * Whether an answer stands on what it claims to stand on.
 *
 * Schema validation proves the shape. This proves the *references*, which is a
 * different failure and the one that actually happens: a model that has been
 * shown four evidence bundles will occasionally cite a fifth, and a citation to
 * nothing is worse than no citation because it reads as rigour.
 *
 * Pure and exported so the rule is a unit test rather than a comment.
 */
export function findAnswerDefects(
  answer: ObserverAnswer,
  question?: string,
): readonly AnswerDefect[] {
  const defects: AnswerDefect[] = [];
  const known = new Set(answer.evidence.map((e) => e.bundleId));

  /*
   * The same statement twice.
   *
   * A live answer reported "Compare was unopened in 71%" and "Compare was
   * never opened in 71%" as two separate findings. Repetition reads as two
   * pieces of evidence when it is one, and it is the commonest way a model
   * pads an answer it cannot complete.
   */
  const seen = new Map<string, string>();
  for (const finding of answer.findings) {
    /*
     * Two statements are the same when they measure the same thing.
     *
     * Negation and tense are stripped because they are how a model restates a
     * figure without adding one: "Compare was unopened in 71%" and "Compare was
     * never opened in 71%" are one sentence twice. The `un` prefix has to go
     * with them — it is the negation carried inside a word rather than beside
     * it.
     */
    const key = finding.statement
      .toLowerCase()
      .replace(/[^a-z0-9%]+/g, " ")
      .split(" ")
      .filter((word) => !/^(was|were|is|are|been|being|never|not|the|a|an|of|in)$/.test(word))
      .map((word) => word.replace(/^un(?=[a-z]{3})/, ""))
      .filter((word) => word.length > 0)
      .sort()
      .join(" ");
    const first = seen.get(key);
    if (first !== undefined) {
      defects.push({
        kind: "duplicate_finding",
        detail: `"${finding.statement.slice(0, 60)}" repeats "${first.slice(0, 60)}".`,
      });
    } else {
      seen.set(key, finding.statement);
    }
  }

  /*
   * A question that asked why, answered as though it had asked what.
   *
   * The answer must either decline the causal step in so many words, or not
   * make one. Silently reporting three descriptive figures under a "why"
   * question leaves the reader believing they were told the reason.
   */
  if (question !== undefined && isCausalQuestion(question)) {
    const prose = `${answer.answer} ${answer.interpretation} ${answer.limitations.join(" ")}`;
    const declines = CAUSAL_REFUSAL.test(prose);
    const asserts = CAUSAL_ASSERTION.test(`${answer.answer} ${answer.interpretation}`);

    if (asserts) {
      defects.push({
        kind: "unsupported_causal_claim",
        detail: "The answer asserts a cause. Observer's evidence cannot establish one.",
      });
    } else if (!declines && answer.orbState !== "error") {
      defects.push({
        kind: "unsupported_causal_claim",
        detail:
          "The question asked why and the answer neither explains nor states that the evidence cannot say.",
      });
    }
  }

  for (const finding of answer.findings) {
    for (const ref of finding.evidenceRefs) {
      if (!known.has(ref)) {
        defects.push({
          kind: "dangling_evidence",
          detail: `Finding "${finding.statement.slice(0, 60)}" cites unknown evidence "${ref}".`,
        });
      }
    }
  }

  /*
   * An answer that reports findings while offering no evidence at all.
   *
   * Distinct from a dangling reference: this is the shape a model produces when
   * it has decided to answer from memory. `error` and `waiting_for_human` are
   * exempt — having nothing to show is precisely what they are for.
   */
  if (
    answer.evidence.length === 0 &&
    answer.findings.length > 0 &&
    answer.orbState !== "error" &&
    answer.orbState !== "waiting_for_human"
  ) {
    defects.push({
      kind: "ungrounded_answer",
      detail: "The answer states findings but carries no evidence bundle.",
    });
  }

  return defects;
}

/**
 * Whether every claim in this answer is traceable.
 *
 * The gate the route applies before serialising. An answer that fails it is
 * replaced by the deterministic evidence, never repaired — a repaired answer is
 * one nobody can reason about afterwards.
 */
export function isTraceable(answer: ObserverAnswer): boolean {
  return findAnswerDefects(answer).length === 0;
}
