import { z } from "zod";

/**
 * Where a stated finding came from.
 *
 * This is a different axis from `SourceSystem`. That records which system a
 * *record* arrived from. This records what kind of claim a *finding* is, and it
 * exists because the product's central discipline is the distance between
 * "IRIS observed this" and "the CRM says it closed" and "the model wrote a
 * sentence about it".
 *
 * It is part of the read-model and evidence contracts rather than a visual
 * label, so that the rule in ADR-0023 — no primary insight may rest solely on
 * CRM outcome context — is machine-checkable.
 */
export const INSIGHT_SOURCES = [
  /**
   * IRIS Showroom recorded this directly: a section was entered, a unit was
   * opened, a favourite was set. The strongest class Observer holds.
   */
  "IRIS_SHOWROOM_OBSERVED",
  /**
   * Calculated deterministically from observed showroom facts by Observer's
   * own analytics layer — coverage, position-in-presentation, dwell bands,
   * transition frequencies. Reproducible from the facts; not itself observed.
   */
  "IRIS_SHOWROOM_DERIVED",
  /**
   * The CRM's account of what the commercial process concluded. Admissible as
   * an outcome label, a later-stage validation signal, or a cohort boundary —
   * never as the subject of a primary insight.
   */
  "CRM_OUTCOME_CONTEXT",
  /**
   * Online behaviour before the meeting. Enriches a brief; never displaces the
   * showroom as the product's subject.
   */
  "WEBIRIS_CONTEXT",
  /**
   * A language model's prose about evidence it was given. The model never
   * computes a figure, so this class only ever accompanies one of the others —
   * it may not stand alone.
   */
  "AI_INTERPRETATION",
] as const;

export const InsightSourceSchema = z.enum(INSIGHT_SOURCES);
export type InsightSource = (typeof INSIGHT_SOURCES)[number];

/** The classes that make a finding about the IRIS presentation itself. */
export const SHOWROOM_ROOTED_SOURCES = [
  "IRIS_SHOWROOM_OBSERVED",
  "IRIS_SHOWROOM_DERIVED",
] as const satisfies readonly InsightSource[];

/**
 * Whether a finding is rooted in something IRIS actually saw.
 *
 * ADR-0023: every primary insight must be. A finding assembled only from CRM
 * outcomes is a CRM report, and the CRM already produces those.
 */
export function isShowroomRooted(sources: readonly InsightSource[]): boolean {
  return sources.some((s) => (SHOWROOM_ROOTED_SOURCES as readonly InsightSource[]).includes(s));
}

/**
 * Whether a model's prose is standing on its own.
 *
 * An answer classified only as interpretation has no evidence under it, which
 * is the failure mode the whole tool architecture exists to prevent.
 */
export function isUngroundedInterpretation(sources: readonly InsightSource[]): boolean {
  return sources.length > 0 && sources.every((s) => s === "AI_INTERPRETATION");
}

/** Short human labels. Used in chips, legends and the AI answer header. */
export const INSIGHT_SOURCE_LABELS: Record<InsightSource, string> = {
  IRIS_SHOWROOM_OBSERVED: "IRIS observed",
  IRIS_SHOWROOM_DERIVED: "IRIS calculated",
  CRM_OUTCOME_CONTEXT: "CRM outcome",
  WEBIRIS_CONTEXT: "WEBIRIS",
  AI_INTERPRETATION: "AI interpretation",
};

/* --- legacy availability --------------------------------------------------- */

/**
 * Whether a measurement can be answered today, and from what.
 *
 * Carried on requirements and on read models so a screen can say "this needs a
 * UE5 event that does not exist yet" instead of rendering a zero. The states
 * are the ones used throughout `docs/16-showroom-intelligence-audit.md`.
 */
export const MEASUREMENT_AVAILABILITY = [
  /** The legacy IRIS analytics already records it. */
  "legacy_available",
  /** Derivable from legacy data plus an inventory Observer supplies. */
  "partially_derivable",
  /** Needs a fact the UE5 module does not yet emit. */
  "requires_ue5_v2_event",
  /** Comes from the CRM, and is therefore context rather than subject. */
  "crm_outcome_context",
  /** Comes from the online viewer. */
  "webiris_context",
] as const;

export const MeasurementAvailabilitySchema = z.enum(MEASUREMENT_AVAILABILITY);
export type MeasurementAvailability = (typeof MEASUREMENT_AVAILABILITY)[number];
