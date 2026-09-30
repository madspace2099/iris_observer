import Link from "next/link";
import {
  MEETINGS,
  plural,
  type Language,
  type PeriodPreset,
  type ShowroomFinding,
} from "@observer/readmodels";

import { dynamicRoute } from "@/lib/href";
import { withPeriod } from "@/lib/period";
import { Evidence, Sample, Sources } from "./Provenance";

/**
 * FINDINGS — one stated thing, with everything needed to argue with it.
 *
 * The legacy dashboard's "Insights" panel reported the maximum and the minimum
 * of a single series. `ShowroomFinding` was shaped to answer five questions
 * instead, and this component's whole job is to render all five every time, so
 * that a surface cannot show a conclusion while quietly omitting the sample it
 * rests on:
 *
 *   statement   what happened, with its number inside the sentence.
 *   baseline    compared with what. Null only when nothing comparable exists.
 *   soWhat      why it might matter. Never a causal claim — the wording is the
 *               read model's and a test scans it for the banned verbs.
 *   caveat      what would make it wrong. Rendered on its own rail so it is
 *               visibly not part of the claim.
 *   the foot    sources, evidence, sample size, and where to look next.
 *
 * **This component is how the product satisfies "no verdict without a sample
 * size".** `Sample` is not conditional and has no prop that would suppress it.
 * A finding whose sample is too small to support it is a finding the read model
 * should not have produced; if one arrives anyway, the number that says so is
 * printed next to it.
 *
 * ## Prose is never rewritten here
 *
 * Every sentence rendered below is the read model's, verbatim. Not because
 * component-side wording would be hard, but because the causal-language guard
 * runs over the read models — `apps/web/test/showroom.test.ts` scans them for
 * "because", "caused", "drives", "leads to", "due to", "therefore", "proves" —
 * and a component that composed its own sentence would be prose nothing checks.
 * The only words this file contributes are the two structural ones, "against"
 * before a baseline and the empty-state sentence, and neither makes a claim
 * about the data.
 *
 * ## Why an empty list is a result and not a slot
 *
 * `observer-product.css` §21 draws the distinction and it is the difference
 * between a working screen and one that looks unfinished: a dashed `.ox-empty`
 * slot reads as "something belongs here and is missing", while `.ox-result` is
 * a solid panel making a statement. "No finding was produced for this period"
 * is a statement. It gets the panel.
 */
/*
 * The list's own words in each language a report can be printed in. English is
 * the words this file always printed; Slovak and Hungarian are drafts for
 * review (P2-17).
 */
const FINDING_WORDS: Readonly<
  Record<Language, { readonly against: string; readonly empty: string }>
> = {
  en: {
    against: "against",
    empty:
      "No finding was produced for this period. That is the read model's answer, not a gap in it.",
  },
  sk: {
    against: "porovnanie:",
    empty:
      "Pre toto obdobie nevzniklo žiadne zistenie. To je odpoveď dátového modelu, nie medzera v ňom.",
  },
  hu: {
    against: "összevetés:",
    empty:
      "Erre az időszakra nem született megállapítás. Ez az adatmodell válasza, nem hiány benne.",
  },
};

export function FindingList({
  findings,
  period,
  sampleNoun,
  emptyNote,
  language,
}: {
  readonly findings: readonly ShowroomFinding[];
  readonly period: PeriodPreset;
  /**
   * What the sample counts. `ShowroomFinding.sampleSize` is meetings on every
   * surface that produces one today, and the default says so — but a finding
   * about units counts units, and printing "meetings" there would be a false
   * denominator, which is worse than a verbose call site.
   */
  readonly sampleNoun?: string;
  readonly emptyNote?: string;
  /** The words' language: English on the screens, the reader's choice on a printed report. */
  readonly language: Language;
}) {
  const words = FINDING_WORDS[language];
  /* English has always printed "meetings" whatever the count; the others agree with it. */
  const noun = (n: number) =>
    sampleNoun ?? (language === "en" ? "meetings" : plural(language, n, MEETINGS));
  if (findings.length === 0) {
    return <p className="ox-result">{emptyNote ?? words.empty}</p>;
  }

  return (
    <div className="ox-findings">
      {findings.map((finding) => (
        <article className="ox-finding" key={finding.id}>
          <p className="ox-finding-statement">{finding.statement}</p>

          {finding.baseline === null ? null : (
            <p className="ox-finding-baseline">
              {words.against} {finding.baseline}
            </p>
          )}

          <p className="ox-finding-so-what">{finding.soWhat}</p>

          {finding.caveat === null ? null : <p className="ox-finding-caveat">{finding.caveat}</p>}

          <div className="ox-finding-foot">
            <Sources sources={finding.sources} language={language} />
            <Evidence evidence={finding.evidence} period={period} language={language} />
            <Sample n={finding.sampleSize} noun={noun(finding.sampleSize)} />
            {finding.nextStep === null ? null : (
              <Link
                className="ox-btn"
                data-weight="quiet"
                href={dynamicRoute(withPeriod(finding.nextStep.href, period))}
              >
                {finding.nextStep.label}
              </Link>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
