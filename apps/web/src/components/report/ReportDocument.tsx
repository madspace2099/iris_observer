import type { ReactNode } from "react";

import type { Language, ReportScope, ReportScopeView, ReportSection } from "@observer/readmodels";

import { InfoTip } from "@/components/iris/InfoTip";
import { PrintPage } from "./PrintPage";
import { Synthetic, Tally, TallyItem } from "@/components/product";
import { LANGUAGE_NAMES } from "@/lib/language";
import { AGENT_REPORT_WORDS, REPORT_DOCUMENT_WORDS, REPORT_WORDS } from "./words";

/**
 * THE REPORT AS A PRINTED DOCUMENT (ADR-0050).
 *
 * The owner exported an agent summary to PDF and found fourteen pages of one
 * long column: no cover, a contents list without structure, every section
 * followed by its explanatory paragraphs, and page breaks that left half
 * pages white. These are the document's own parts, shared by the three
 * scopes, so a project report, an agent summary and a meeting summary print
 * as one kind of document:
 *
 *   - the cover, print only: the document type, its subject, the verdict the
 *     screen's head states and three or four headline figures, each passed in
 *     by the page from the read model it already reads, never computed here;
 *   - the contents, numbered, with each section's one line from the manifest;
 *   - the notes appendix, "How to read this report": every sentence that
 *     qualifies a section, numbered as the section is, so a section keeps one
 *     line of provenance and its figures, and nothing is dropped;
 *   - the running footer, written into the paged-media margin boxes in the
 *     report's language. A browser without margin boxes prints no footer and
 *     lays the page out exactly as before.
 *
 * Nothing here is a client component: printing needs no script.
 */

/** The document type in a word, from the words the page already prints for it. */
export function documentKind(kind: ReportScope["kind"], language: Language): string {
  if (kind === "agent") return AGENT_REPORT_WORDS[language].kicker;
  if (kind === "meeting") return REPORT_WORDS[language].meetingSummary;
  return REPORT_WORDS[language].title;
}

/** Section number by id, in the order the page prints them. Left-out sections have none. */
export function sectionNumbers(printed: readonly ReportSection[]): ReadonlyMap<string, number> {
  return new Map(printed.map((section, i) => [section.id, i + 1]));
}

/** "01", "02": the number as the headings, the contents and the notes print it. */
export const sectionNumber = (n: number): string => String(n).padStart(2, "0");

/** One headline figure on the cover: a label, and a value that carries its own denominator. */
export interface CoverFigure {
  readonly key: string;
  readonly label: string;
  readonly value: ReactNode;
}

/**
 * The IRIS wordmark, drawn inline so the cover prints it without fetching
 * `/brand/iris-wordmark.svg` (the same six paths, in the ink around it).
 */
function IrisMark() {
  return (
    <svg
      className="ox-cover-mark"
      viewBox="0 0 1063.94 242.89"
      aria-hidden="true"
      focusable="false"
    >
      <g fill="currentColor" transform="translate(-11.06 -6)">
        <path d="M86.52,7.47V193.53a51.2,51.2,0,0,1-51.2,51.2H11.06V58.68a51.2,51.2,0,0,1,51.2-51.2Z" />
        <path d="M664.94,6V197.69a51.2,51.2,0,0,1-51.2,51.2H589.52V57.21A51.2,51.2,0,0,1,640.72,6Z" />
        <path d="M239.53,104.68v88.85a51.2,51.2,0,0,1-51.2,51.2H164.11V104.68Z" />
        <path d="M503.74,244.73H408L298.53,104.68H404.28a23.74,23.74,0,0,0,0-47.47H164.11A51.2,51.2,0,0,1,215.31,6h219A69.19,69.19,0,0,1,503.47,75.2v11.5a69.19,69.19,0,0,1-69.19,69.19l68.93,88.18Z" />
        <path d="M1075,57.21H735.6A51.2,51.2,0,0,1,786.8,6h237a51.2,51.2,0,0,1,51.2,51.2" />
        <path d="M1075,168.94v6.6a69.19,69.19,0,0,1-69.19,69.19h-219a51.2,51.2,0,0,1-51.2-51.2H978.31a21.27,21.27,0,0,0,0-42.54H786.8a51.2,51.2,0,0,1-51.2-51.2v0h270.21A69.19,69.19,0,0,1,1075,168.94" />
      </g>
    </svg>
  );
}

/**
 * THE COVER — page one of the printed document, and nothing on screen.
 *
 * On screen the page head already states the subject and the verdict, so the
 * cover is not drawn there; on paper the head gives way to it. It stands on
 * the graphite ground with the brand's ink (ADR-0042 keeps paper for every
 * printed page after it), and says what the document is, whose, over which
 * days, in which language, for whom — "internal", ADR-0018 — and when it was
 * produced, then the verdict and the figures the page passed in.
 *
 * The period is its label alone: the bounds are the CSV's, and on the cover
 * they set an exclusive end beside meetings the read model counts after it.
 * A meeting's cover names no period at all — its title is the meeting's date.
 */
export function ReportCover({
  report,
  subject,
  verdict,
  verdictBase = null,
  figures,
  language,
}: {
  readonly report: ReportScopeView;
  /** Whose document: the agent, the meeting, or the project. */
  readonly subject: string;
  /** The sentence the screen's head states, as the read model wrote it. Null where it states none. */
  readonly verdict: string | null;
  /**
   * The meetings the verdict was read from, in words, where they are not the
   * period's own (Sales Flow's `verdictMeetings`, ADR-0048). Never computed here.
   */
  readonly verdictBase?: string | null;
  readonly figures: readonly CoverFigure[];
  readonly language: Language;
}) {
  const words = REPORT_DOCUMENT_WORDS[language];
  const { project, generatedAt } = report.context;
  const generated = new Intl.DateTimeFormat(project.locale, {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: project.timeZone,
  }).format(new Date(generatedAt));

  return (
    <section className="ox-cover ox-graphite" aria-labelledby="report-cover-title">
      <div className="ox-cover-top">
        <span className="ox-cover-brand">
          <IrisMark />
          <span className="ox-cover-product">IRIS Observer</span>
        </span>
        <span className="ox-cover-internal">{words.internal}</span>
      </div>

      <div className="ox-cover-main">
        <p className="ox-cover-kind">{documentKind(report.scope.kind, language)}</p>
        <h1 className="ox-cover-title" id="report-cover-title">
          {subject}
        </h1>
        {verdict === null ? null : <p className="ox-cover-verdict">{verdict}</p>}
        {verdict === null || verdictBase === null ? null : (
          <p className="ox-cover-verdict-base">{verdictBase}</p>
        )}
        {figures.length === 0 ? null : (
          <dl className="ox-cover-figures">
            {figures.map((figure) => (
              <div className="ox-cover-figure" key={figure.key}>
                <dt>{figure.label}</dt>
                <dd>{figure.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      <dl className="ox-cover-meta">
        <div>
          <dt>{words.project}</dt>
          <dd>{project.name}</dd>
        </div>
        {report.scope.kind === "meeting" ? null : (
          <div>
            <dt>{words.period}</dt>
            <dd>
              <span className="ox-cover-period">{report.periodLabel}</span>
            </dd>
          </div>
        )}
        <div>
          <dt>{words.language}</dt>
          <dd>{LANGUAGE_NAMES[language]}</dd>
        </div>
        <div>
          <dt>{words.generated}</dt>
          <dd>
            {generated}
            <span className="ox-cover-marker">
              <Synthetic language={language} />
            </span>
          </dd>
        </div>
      </dl>
    </section>
  );
}

/**
 * THE CONTENTS — every section of the scope, numbered as its heading is, with
 * the manifest's one line beneath it. A section the reader left out keeps its
 * place, unnumbered and marked, so the document says what it does not carry.
 * Page numbers would need `target-counter()`, which Chrome does not print;
 * the section numbers are what the headings and the notes repeat.
 */
export function ReportContents({
  sections,
  numbers,
  statement,
  hasNotes,
  language,
}: {
  readonly sections: readonly ReportSection[];
  readonly numbers: ReadonlyMap<string, number>;
  /** The cover's statements: audience, attribution, blank, partial and left-out counts. */
  readonly statement: ReactNode;
  /** Whether the notes appendix is printed, so the contents lists it. */
  readonly hasNotes: boolean;
  readonly language: Language;
}) {
  const words = REPORT_WORDS[language];
  const doc = REPORT_DOCUMENT_WORDS[language];
  return (
    <section className="ox-plane ox-report-toc" aria-labelledby="report-contents">
      <div className="ox-section-head">
        <h2 className="ox-section-title" id="report-contents">
          {doc.contents}
        </h2>
      </div>
      {/* Paper's; on screen the same statement stands behind the head's `i`. */}
      <p className="ox-section-note ox-report-statement">{statement}</p>
      <ol className="ox-report-contents">
        {sections.map((section) => {
          const n = numbers.get(section.id);
          return n === undefined ? (
            <li key={section.id} data-left-out="true">
              <span className="ox-report-num" aria-hidden="true">
                —
              </span>
              <span className="ox-toc-label">{section.label}</span>
              <span className="ox-toc-state">{words.leftOut}</span>
            </li>
          ) : (
            <li key={section.id}>
              <span className="ox-report-num">{sectionNumber(n)}</span>
              <a className="ox-toc-label" href={`#${section.id}`}>
                {section.label}
              </a>
              {/* A state only where it is news; the appendix lists every one. */}
              {section.availability === "ready" ? null : (
                <span className="ox-toc-state">{words.availability[section.availability]}</span>
              )}
              <span className="ox-toc-summary">{section.summary}</span>
            </li>
          );
        })}
        {hasNotes ? (
          <li>
            <span className="ox-report-num" aria-hidden="true">
              A
            </span>
            <a className="ox-toc-label" href="#report-notes">
              {doc.howToRead}
            </a>
          </li>
        ) : null}
      </ol>
    </section>
  );
}

/** The notes one section carries into the appendix, in the order the section had them. */
export type SectionNotes = Readonly<Record<string, readonly ReactNode[]>>;

/**
 * "HOW TO READ THIS REPORT" — the appendix every explanatory paragraph moved
 * to. A partial section's stated gap leads its entry (the chip on the section
 * says "partial"; the entry says what is missing); a blank section keeps its
 * reason on the section itself, because there it is the whole of the body.
 */
export function ReportNotes({
  printed,
  numbers,
  notes,
  language,
}: {
  readonly printed: readonly ReportSection[];
  readonly numbers: ReadonlyMap<string, number>;
  readonly notes: SectionNotes;
  readonly language: Language;
}) {
  const entries = notedSections(printed, notes);
  if (entries.length === 0) return null;
  const words = REPORT_DOCUMENT_WORDS[language];
  return (
    <section
      className="ox-plane ox-report-notes"
      id="report-notes"
      aria-labelledby="report-notes-heading"
    >
      <div className="ox-section-head">
        <h2 className="ox-section-title" id="report-notes-heading">
          <span className="ox-report-num">A</span> {words.howToRead}
        </h2>
      </div>
      <p className="ox-section-note">{words.howToReadLede}</p>
      <ol className="ox-notes">
        {entries.map((section) => (
          <li className="ox-notes-entry" key={section.id}>
            <h3 className="ox-notes-head">
              <span className="ox-report-num">{sectionNumber(numbers.get(section.id) ?? 0)}</span>{" "}
              {section.label}
            </h3>
            {section.availability === "partial" && section.reason !== null ? (
              <p className="ox-notes-text">{section.reason}</p>
            ) : null}
            {(notes[section.id] ?? []).map((note, i) => (
              <p className="ox-notes-text" key={i}>
                {note}
              </p>
            ))}
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * The sections with something for the appendix: a note, or a partial
 * section's stated gap. A blank section prints no body, so its notes, which
 * qualify that body, are not printed either.
 */
export function notedSections(
  printed: readonly ReportSection[],
  notes: SectionNotes,
): readonly ReportSection[] {
  return printed.filter(
    (section) =>
      section.availability !== "unavailable" &&
      ((notes[section.id]?.length ?? 0) > 0 ||
        (section.availability === "partial" && section.reason !== null)),
  );
}

/**
 * WHAT THE DOCUMENT IS, BEHIND AN `i` IN THE HEAD'S ASIDE (the owner,
 * 2026-10-23: simplify). On screen the head keeps its title and its verdict;
 * the lede and the contents' statement (audience, attribution, blank and
 * left-out counts) stand here. Paper has no `i`: it prints the statement over
 * the contents, and the cover says the rest.
 */
export function ReportAbout({
  kind,
  language,
  lede,
  statement,
  print,
}: {
  readonly kind: ReportScope["kind"];
  readonly language: Language;
  readonly lede: ReactNode;
  readonly statement: ReactNode;
  /** The print control's words, in the report's language: it shares the `i`'s row. */
  readonly print: string;
}) {
  return (
    <div className="ox-report-actions">
      <InfoTip id="report-about" label={documentKind(kind, language)}>
        <p>{lede}</p>
        <p>{statement}</p>
      </InfoTip>
      <PrintPage label={print} />
    </div>
  );
}

/**
 * The cover's headline figures, on screen, under the head: the cover is
 * paper's alone, and without these the first screen of a report held a
 * heading, a verdict and prose, and no figure. Print hides them; the cover
 * carries the same figures.
 */
function HeadlineFigures({ figures }: { readonly figures: readonly CoverFigure[] }) {
  if (figures.length === 0) return null;
  return (
    <div className="ox-report-headline">
      <Tally>
        {figures.map((figure) => (
          <TallyItem key={figure.key} label={figure.label} value={figure.value} />
        ))}
      </Tally>
    </div>
  );
}

/** A count with the set it is counted in, as one figure: "57 of 274 meetings". */
export function Count({ n, of }: { readonly n: number; readonly of: string }) {
  return (
    <span className="ox-value">
      <span className="ox-figure">{n}</span>
      <span className="ox-of">{of}</span>
    </span>
  );
}

/**
 * THE DOCUMENT AROUND A SCOPE'S SECTIONS: the screen's head, the printed
 * cover, the numbered contents, the sections, "How to read this report", and
 * the running footer's words. The three scopes pass their own parts; the
 * order is the same for each.
 */
export function ReportDocument({
  report,
  printed,
  notes,
  language,
  head,
  cover,
  footer,
  statement,
  figures = [],
  children,
}: {
  readonly report: ReportScopeView;
  readonly printed: readonly ReportSection[];
  readonly notes: SectionNotes;
  readonly language: Language;
  /** The page head, on screen. */
  readonly head: ReactNode;
  /** The cover, on paper. */
  readonly cover: ReactNode;
  /** The cover's headline figures, which the screen draws under its head. */
  readonly figures?: readonly CoverFigure[];
  /** The footer's parts after the product's name. */
  readonly footer: readonly string[];
  /** The contents' opening statement. */
  readonly statement: ReactNode;
  /** The sections, given each one's number. */
  readonly children: (number: (id: string) => number) => ReactNode;
}) {
  const numbers = sectionNumbers(printed);
  return (
    <div className="ox-page ox-report" lang={language}>
      <PrintFooter parts={footer} />
      {head}
      {cover}
      <div className="ox-body">
        <HeadlineFigures figures={figures} />
        <ReportContents
          sections={report.sections}
          numbers={numbers}
          statement={statement}
          hasNotes={notedSections(printed, notes).length > 0}
          language={language}
        />
        {children((id) => numbers.get(id) ?? 0)}
        <ReportNotes printed={printed} numbers={numbers} notes={notes} language={language} />
      </div>
    </div>
  );
}

/**
 * A CSS string, safe inside a `<style>` element: the backslash and the quote
 * escaped for the string, a line break as its escape, and `<` as `\3c ` so no
 * project or agent name can close the element it stands in.
 */
export function cssString(text: string): string {
  const escaped = text
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/</g, "\\3c ")
    .replace(/[\n\r\f]/g, "\\a ");
  return `"${escaped}"`;
}

/**
 * THE RUNNING FOOTER, in the report's language: "IRIS Observer · project ·
 * document · period" in the bottom-left margin box of every page after the
 * cover. The page counter, the margins and the cover's bare first page are
 * the sheet's (`observer-product.css`, `@page report`); only the words are the
 * report's, so only they are written here.
 */
export function PrintFooter({ parts }: { readonly parts: readonly string[] }) {
  const text = ["IRIS Observer", ...parts].join(" · ");
  return (
    <style
      // The words are server-rendered from the read model; `cssString` escapes them.
      dangerouslySetInnerHTML={{
        __html: `@page report { @bottom-left { content: ${cssString(text)}; } }`,
      }}
    />
  );
}
