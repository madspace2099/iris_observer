import type { InsightSource } from "@observer/contracts";
import type { Language } from "@observer/readmodels";

import { SOURCE_LINE_WORDS } from "@/components/report/words";

/**
 * WHERE A BLOCK'S FIGURES COME FROM, IN A SALES DIRECTOR'S WORDS (ADR-0052).
 *
 * These were three chips — "IRIS observed", "IRIS calculated", "CRM outcome" —
 * and the owner, recording the Shark demo, could not tell what they meant or
 * why they stood under a chart. The provenance stays (ADR-0023: which class of
 * fact a figure rests on must be visible), said as one quiet line a reader
 * understands without the vocabulary.
 *
 * Every surface that names a source prints this line: the showroom blocks,
 * `Measure` and the observer answer panel (client components, hence its own
 * file), Ask's answer sheet, and through `Sources` in
 * `components/product/Provenance.tsx` every other screen and the printed
 * report. The words are the report's word tables' (`SOURCE_LINE_WORDS`),
 * because the report prints them in its own language; the Slovak and
 * Hungarian are drafts for review.
 */
export function SourceChips({
  sources,
  measured = false,
  language = "en",
}: {
  sources: readonly InsightSource[];
  /**
   * Kept so the call sites read as they did. The line is 12px on every route
   * now, which is what this flag used to raise the chips to on Sales Flow.
   */
  measured?: boolean;
  /** The words' language: the page's, or the report's on a printed report. */
  language?: Language;
}) {
  if (sources.length === 0) return null;
  const { lead, words } = SOURCE_LINE_WORDS[language];
  return (
    <span className={`iris-srcs${measured ? " iris-srcs-measured" : ""}`}>
      <b>{lead}:</b>{" "}
      {sources.map((source, index) => (
        <span className="iris-src" key={source} data-src={source}>
          {index === 0 ? null : " · "}
          {words[source]}
        </span>
      ))}
    </span>
  );
}
