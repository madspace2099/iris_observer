import type { InsightSource } from "@observer/contracts";
import type { Language } from "@observer/readmodels";

/**
 * WHERE A BLOCK'S FIGURES COME FROM, IN A SALES DIRECTOR'S WORDS (ADR-0052).
 *
 * These were three chips — "IRIS observed", "IRIS calculated", "CRM outcome" —
 * and the owner, recording the Shark demo, could not tell what they meant or
 * why they stood under a chart. The provenance stays (ADR-0023: which class of
 * fact a figure rests on must be visible), said as one quiet line a reader
 * understands without the vocabulary. `INSIGHT_SOURCE_LABELS` in the frozen
 * contract keeps its short names for the surfaces that still print chips
 * (`Sources` in `components/product/Provenance.tsx`).
 *
 * Its own file, with no other import, so the two client components that list a
 * measurement's sources (`Measure`, the observer answer panel) print the same
 * words without pulling the server parts in.
 *
 * A source's words stand alone, because a line may name any one of them. The
 * Slovak and Hungarian are drafts for review, as `Provenance.tsx`'s are.
 */
const SOURCE_LINE_WORDS: Readonly<
  Record<
    Language,
    { readonly lead: string; readonly words: Readonly<Record<InsightSource, string>> }
  >
> = {
  en: {
    lead: "Source",
    words: {
      IRIS_SHOWROOM_OBSERVED: "recorded in the showroom by the IRIS app",
      IRIS_SHOWROOM_DERIVED: "calculated by Observer from showroom recordings",
      CRM_OUTCOME_CONTEXT: "deal stages from your CRM",
      WEBIRIS_CONTEXT: "website visits from WEBIRIS",
      AI_INTERPRETATION: "worded by an AI model",
    },
  },
  sk: {
    lead: "Zdroj",
    words: {
      IRIS_SHOWROOM_OBSERVED: "zaznamenané v showroome aplikáciou IRIS",
      IRIS_SHOWROOM_DERIVED: "vypočítané Observerom zo záznamov zo showroomu",
      CRM_OUTCOME_CONTEXT: "fázy obchodov z vášho CRM",
      WEBIRIS_CONTEXT: "návštevy webu z WEBIRIS",
      AI_INTERPRETATION: "sformuloval model AI",
    },
  },
  hu: {
    lead: "Forrás",
    words: {
      IRIS_SHOWROOM_OBSERVED: "a bemutatóteremben rögzítette az IRIS alkalmazás",
      IRIS_SHOWROOM_DERIVED: "az Observer számolta a bemutatótermi rögzítésekből",
      CRM_OUTCOME_CONTEXT: "üzleti szakaszok a CRM-ből",
      WEBIRIS_CONTEXT: "weboldal-látogatások a WEBIRIS-ből",
      AI_INTERPRETATION: "MI-modell fogalmazta",
    },
  },
};

/**
 * One quiet line: "Source: recorded in the showroom by the IRIS app ·
 * calculated by Observer from showroom recordings". Each source keeps its
 * `data-src`, in the read model's order.
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
  /** The words' language: the page's, which on every showroom surface is English. */
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
