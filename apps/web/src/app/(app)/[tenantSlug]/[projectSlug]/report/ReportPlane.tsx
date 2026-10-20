import type { ReactNode } from "react";

import {
  type Language,
  type PeriodPreset,
  type ReportSection,
  type ReportSectionAvailability,
} from "@observer/readmodels";
import { Evidence, Sample, Sources } from "@/components/product";
import { sectionNumber } from "@/components/report/ReportDocument";
import { REPORT_WORDS } from "@/components/report/words";

/**
 * ONE SECTION OF A PRINTED REPORT: THE MANIFEST'S FRAME AROUND THE PAGE'S BODY.
 *
 * `ReportSection` is a manifest — label, state, summary, reason, sources,
 * sample, evidence — and this plane draws the part of it that belongs beside
 * the figures: the numbered heading with its state, and one line of
 * provenance (sources, sample, evidence). The body is the page's own: figures
 * drawn from the read model that owns them, with the components the screens
 * use, never composed from the section's fields.
 *
 * The rest of the manifest has a place of its own in the document (ADR-0050):
 * the summary is the section's line in the contents, and a partial section's
 * stated gap leads its entry in "How to read this report", numbered as the
 * section is. A blank section keeps its reason here, because the reason is
 * then all the section has to say.
 *
 * The sample's noun is the section's. This used to say "meetings" for every
 * section of every scope, which was true of the project report and wrong the
 * moment a section stood on the timed set, or on a set of eight listed rows:
 * the denominator of a rate over meetings and of a rate over timed meetings
 * are different questions, and a frame that guessed the noun would misstate
 * the one where the difference is the finding.
 */

export const AVAILABILITY_TONES: Readonly<Record<ReportSectionAvailability, string>> = {
  ready: "good",
  partial: "watch",
  unavailable: "none",
};

export function ReportPlane({
  section,
  number,
  period,
  children,
  language,
}: {
  readonly section: ReportSection;
  /** Its number in the printed document, as the contents and the notes repeat it. */
  readonly number: number;
  readonly period: PeriodPreset;
  readonly children: ReactNode;
  /** The report's language, as the export dialog chose it. */
  readonly language: Language;
}) {
  const headingId = `${section.id}-heading`;
  return (
    <section
      className="ox-plane ox-report-section"
      id={section.id}
      aria-labelledby={headingId}
      data-availability={section.availability}
    >
      <div className="ox-section-head">
        <h2 className="ox-section-title" id={headingId}>
          <span className="ox-report-num">{sectionNumber(number)}</span> {section.label}
        </h2>
        <span className="ox-chip" data-tone={AVAILABILITY_TONES[section.availability]}>
          <span className="ox-chip-mark" aria-hidden="true" />
          {REPORT_WORDS[language].availability[section.availability]}
        </span>
      </div>
      {section.availability === "unavailable" && section.reason !== null ? (
        <p className="ox-section-note">{section.reason}</p>
      ) : null}
      {children}
      <div className="ox-alert-foot ox-report-foot">
        <Sources sources={section.sources} language={language} />
        {section.sampleSize === null ? null : (
          <Sample n={section.sampleSize} noun={section.sampleNoun} />
        )}
        <Evidence evidence={section.evidence} period={period} language={language} />
      </div>
    </section>
  );
}
