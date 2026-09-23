import type { ReactNode } from "react";

import type { PeriodPreset, ReportSection, ReportSectionAvailability } from "@observer/readmodels";
import { Evidence, Sample, Sources } from "@/components/product";

/**
 * ONE SECTION OF A PRINTED REPORT: THE MANIFEST'S FRAME AROUND THE PAGE'S BODY.
 *
 * `ReportSection` is a manifest — label, state, summary, reason, sources,
 * sample, evidence — and this plane draws exactly that around whatever body
 * the page supplies for the section. The body is the page's own: figures
 * drawn from the read model that owns them, with the components the screens
 * use, never composed from the section's fields.
 *
 * The sample's noun is the section's. This used to say "meetings" for every
 * section of every scope, which was true of the project report and wrong the
 * moment a section stood on the timed set, or on a set of eight listed rows:
 * the denominator of a rate over meetings and of a rate over timed meetings
 * are different questions, and a frame that guessed the noun would misstate
 * the one where the difference is the finding.
 */

export const AVAILABILITY_WORDS: Readonly<Record<ReportSectionAvailability, string>> = {
  ready: "Ready",
  partial: "Partial",
  unavailable: "Blank",
};

export const AVAILABILITY_TONES: Readonly<Record<ReportSectionAvailability, string>> = {
  ready: "good",
  partial: "watch",
  unavailable: "none",
};

export function ReportPlane({
  section,
  period,
  children,
}: {
  readonly section: ReportSection;
  readonly period: PeriodPreset;
  readonly children: ReactNode;
}) {
  const headingId = `${section.id}-heading`;
  return (
    <section className="ox-plane" id={section.id} aria-labelledby={headingId}>
      <div className="ox-section-head">
        <h2 className="ox-section-title" id={headingId}>
          {section.label}
        </h2>
        <span className="ox-chip" data-tone={AVAILABILITY_TONES[section.availability]}>
          <span className="ox-chip-mark" aria-hidden="true" />
          {AVAILABILITY_WORDS[section.availability]}
        </span>
      </div>
      <p className="ox-section-note">{section.summary}</p>
      {section.reason === null ? null : <p className="ox-section-note">{section.reason}</p>}
      {children}
      <div className="ox-alert-foot">
        <Sources sources={section.sources} />
        {section.sampleSize === null ? null : (
          <Sample n={section.sampleSize} noun={section.sampleNoun} />
        )}
        <Evidence evidence={section.evidence} period={period} />
      </div>
    </section>
  );
}
