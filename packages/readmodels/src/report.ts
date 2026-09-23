import type { InsightSource } from "@observer/contracts";
import type { ViewContext } from "./context";
import type { EvidenceRef } from "./metric-value";

/**
 * What a report could contain, and the fact that nothing produces one yet.
 *
 * Report generation belongs to a later milestone (`docs/roadmap.md`); no
 * document is written, no file is produced, and no queue is waiting. The screen
 * that offers it therefore has one job — to say honestly what a report *would*
 * hold, per section, given the sources this project actually has — and one
 * failure mode, which is a Download button that does nothing.
 *
 * So "preview-ready, backend not connected" is a **type**, not a sentence a
 * component invents. `ReportGeneration.state` has exactly one member today, so
 * there is no truthy value a component can branch on into an action that does
 * not exist, and a reader is never promised a document.
 */

/**
 * Whether a section could be written from what this project has.
 *
 * Three states rather than a boolean, because "we have everything" and "we have
 * the meetings but not the outcomes" produce very different documents and the
 * reader has to know which one they would get before they ask for it.
 */
export const REPORT_SECTION_AVAILABILITIES = [
  /** Every source this section needs is connected and has data in the period. */
  "ready",
  /** Writable, but with a stated gap inside it. */
  "partial",
  /** A source it rests on is absent, so the section would be blank. */
  "unavailable",
] as const;
export type ReportSectionAvailability = (typeof REPORT_SECTION_AVAILABILITIES)[number];

export interface ReportSection {
  readonly id: string;
  readonly label: string;
  /** What the section would say, in one line. Never a promise of a figure. */
  readonly summary: string;
  readonly availability: ReportSectionAvailability;
  /** Why it is partial or unavailable. Null only when it is ready. */
  readonly reason: string | null;
  readonly sources: readonly InsightSource[];
  /** What stands behind it, counted in `sampleNoun`. Null for a section that does not rest on a sample. */
  readonly sampleSize: number | null;
  /**
   * What the sample is counted in: "meetings" for the project's sections,
   * "timed meetings" where a section's shares stand on the timed set. Every
   * surface prints it beside `sampleSize`, so no component supplies the noun:
   * a rate over meetings and a rate over timed meetings are different
   * questions, and the difference is the finding.
   */
  readonly sampleNoun: string;
  readonly evidence: EvidenceRef | null;
}

/**
 * Who the report would be about.
 *
 * A project report, a single meeting summary and one agent's summary are the
 * same machinery over different scopes, and naming the scope on the view is
 * what stops a component from titling one with another's heading.
 */
export interface ReportScope {
  readonly kind: "project" | "meeting" | "agent";
  readonly label: string;
  readonly projectName: string;
  /** Set only when the scope is one meeting. */
  readonly meetingId: string | null;
  /** Set only when the scope is one agent. */
  readonly agentId: string | null;
}

/**
 * Which one thing a report is asked for, when it is not the whole project.
 *
 * One of the two and never both: a scope that took a meeting id and an agent
 * id side by side would need a rule for the caller who passes both, and a
 * rule like that is remembered by nobody.
 */
export type ReportScopeSelector = { readonly meetingId: string } | { readonly agentId: string };

export const REPORT_GENERATION_STATES = [
  /** Sections can be described. Nothing renders a document. */
  "preview_only",
] as const;
export type ReportGenerationState = (typeof REPORT_GENERATION_STATES)[number];

/**
 * The generation state, as a literal rather than a flag.
 *
 * `state` is typed to the single member that exists, so a component cannot
 * write `state === "connected"` and cannot leave a live-looking control behind
 * when a second member is added — adding one is a type change every call site
 * has to acknowledge.
 */
export interface ReportGeneration {
  readonly state: "preview_only";
  /** Said out loud on the surface. Never a tooltip. */
  readonly statement: string;
  /** The milestone that owns it, so the answer to "when" is not "soon". */
  readonly milestone: string;
}

export interface ReportScopeView {
  readonly context: ViewContext;
  readonly scope: ReportScope;
  readonly periodLabel: string;
  readonly sections: readonly ReportSection[];
  readonly generation: ReportGeneration;
  /** Sections that would be blank, counted once so a component need not. */
  readonly unavailableCount: number;
  readonly evidence: EvidenceRef;
}
