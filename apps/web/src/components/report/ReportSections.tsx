"use client";

import type { ReportSection, ReportSectionAvailability } from "@observer/readmodels";

/*
 * Reached by module rather than through the layer's barrel. This is a client
 * component, so anything it imports joins the browser bundle; the barrel also
 * exports the table, the stacking plan and the page head, none of which this
 * dialog draws. `Provenance.tsx` is markup and two label maps and crosses the
 * boundary cleanly.
 */
import { Sample, Sources } from "@/components/product/Provenance";

/**
 * WHAT A REPORT WOULD CONTAIN, SECTION BY SECTION, AND WHAT EACH ONE WOULD SAY.
 *
 * The list is the honest part of an export dialog for a generator that does not
 * exist. `ReportScopeView` computes each section's availability from the same
 * sources every other surface reads, so a scheme with no CRM learns which pages
 * of its report would be blank **before** it asks for one. A reader who finds
 * that out on Friday has been let down by a product that knew on Monday.
 *
 * ## Three states, and why the third is not simply hidden
 *
 *   ready        every source it rests on is connected and has data.
 *   partial      writable, with a stated gap inside it.
 *   unavailable  a source it rests on is absent, so it would be blank.
 *
 * An unavailable section stays on the list with its reason and an unchecked,
 * disabled control. Removing it would leave the reader with a shorter list and
 * no way to discover that a section they expected was never possible — which is
 * the same defect as rendering an absent value as zero, one level up.
 *
 * ## The checkboxes are real controls and they configure a real thing
 *
 * They are not a mock of a generator. What they configure is the preview
 * sentence the dialog states beneath them: how many sections a document would
 * carry and which. Nothing here promises a file, and the one control that would
 * produce one says out loud that it cannot.
 *
 * ## Why the evidence reference is not rendered here
 *
 * Every `ReportSection.evidence` resolves to `/{tenant}/{project}/report`,
 * where the section it describes is drawn in full and the reference lands on
 * it. The dialog offers that page as its one existing format rather than
 * drawing a drill-down beside a checkbox; what it renders here is the
 * provenance a reader composing a document needs — which sources the section
 * rests on and what sample is behind it, in the section's own noun.
 */

/** The availability, in a word. A state never reaches the screen as a colour. */
const AVAILABILITY_WORDS: Readonly<Record<ReportSectionAvailability, string>> = {
  ready: "Ready",
  partial: "Partial",
  unavailable: "Would be blank",
};

const AVAILABILITY_TONES: Readonly<Record<ReportSectionAvailability, string>> = {
  ready: "good",
  partial: "watch",
  unavailable: "none",
};

export function ReportSections({
  sections,
  excluded,
  onToggle,
  idPrefix,
}: {
  readonly sections: readonly ReportSection[];
  /** Ids the reader has taken out. Everything writable starts included. */
  readonly excluded: readonly string[];
  readonly onToggle: (id: string) => void;
  /** Namespaces the checkbox ids, so two dialogs on one screen do not collide. */
  readonly idPrefix: string;
}) {
  return (
    <ul className="ox-scope">
      {sections.map((section) => {
        const blank = section.availability === "unavailable";
        const checked = !blank && !excluded.includes(section.id);
        const inputId = `${idPrefix}-${section.id}`;
        const reasonId = `${inputId}-reason`;

        return (
          <li className="ox-scope-item" key={section.id}>
            <div>
              <label htmlFor={inputId}>
                <input
                  id={inputId}
                  type="checkbox"
                  checked={checked}
                  disabled={blank}
                  {...(section.reason === null ? {} : { "aria-describedby": reasonId })}
                  onChange={() => onToggle(section.id)}
                />{" "}
                {section.label}
              </label>

              <p className="ox-section-note">{section.summary}</p>

              {/*
               * Why it is partial or blank, in the read model's words. Null only
               * when the section is ready, which is the one case where there is
               * nothing to warn about.
               */}
              {section.reason === null ? null : (
                <p className="ox-section-note" id={reasonId}>
                  {section.reason}
                </p>
              )}

              <div className="ox-alert-foot">
                <Sources sources={section.sources} />
                {section.sampleSize === null ? null : (
                  <Sample n={section.sampleSize} noun={section.sampleNoun} />
                )}
              </div>
            </div>

            <span className="ox-chip" data-tone={AVAILABILITY_TONES[section.availability]}>
              <span className="ox-chip-mark" aria-hidden="true" />
              {AVAILABILITY_WORDS[section.availability]}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
