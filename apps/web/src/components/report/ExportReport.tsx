"use client";

import Link from "next/link";

import { useId, useState } from "react";
import {
  DEFAULT_LANGUAGE,
  LANGUAGES,
  sentence,
  type Language,
  type PluralForms,
  type ReportScope,
  type ReportSection,
  type Sentence,
} from "@observer/readmodels";

/** What the trigger and the dialog call themselves, by whose report it is. */
const TITLES: Readonly<Record<ReportScope["kind"], string>> = {
  project: "Export project report",
  meeting: "Export meeting summary",
  agent: "Export agent summary",
};

import { Dialog } from "@/components/product/Dialog";
import { LANGUAGE_NAMES, WRITTEN_IN, withLanguage } from "@/lib/language";
import { ReportSections } from "./ReportSections";
import { csvAddress, withOmitted, withPrint } from "./omit";

/**
 * EXPORT — three ways to take the report away, and all three work.
 *
 * The owner, recording a demo (2026-10-20): "the Generate document button is
 * locked". It was, by design: `ReportGeneration.state` was typed to
 * `preview_only` and the button was `aria-disabled` pending an M4 renderer.
 * ADR-0045 replaces that with what the browser and the read models can do
 * today, and says plainly what each one is:
 *
 *   PDF document    the composed report page opens in a new tab with
 *                   `print=1`, and the page opens the browser's print dialog
 *                   once it and its fonts have loaded. The reader chooses
 *                   "Save as PDF"; the print stylesheet puts it on paper
 *                   (ADR-0042). The browser makes the PDF; no server does.
 *   Shareable page  a link to the composed report page.
 *   Figures as CSV  a download from `report/csv`, which authorises like the
 *                   page and flattens the same read models into one row per
 *                   figure. It computes nothing.
 *
 * All three take the same address: the scope and period the caller passed,
 * the language chosen here and the sections taken out here. So the section
 * checkboxes and the language chips apply to the PDF and the CSV exactly as
 * to the page, and the report says on its cover what was left out.
 *
 * What is still absent — a server-side PDF renderer, scheduled sends, and a
 * buyer-facing document — is M4, recorded in ADR-0045 and `docs/roadmap.md`
 * rather than on this screen: a reader choosing a format needs to know what
 * the button does, not the milestone plan. No progress bar, no queue, no
 * email-it-to-me field.
 *
 * ## ADR-0018 — a client-facing document is a different contract
 *
 * The internal pre-meeting brief is prohibited from every buyer-visible
 * surface, and the buyer-facing meeting report is a **separate, sanitised
 * output contract** that shares no schema with it, so that there is no field
 * which could leak by being rendered in the wrong template.
 *
 * `ReportSection` has no audience axis and `getReportScope` takes no audience
 * argument, which means this dialog cannot assemble a buyer-facing document and
 * must not appear to. The audience is therefore STATED as internal rather than
 * offered as a control: a two-option control where one option is permanently
 * unavailable is a control that does nothing, and a two-option control where
 * both work would be this component deciding which sections are safe to hand a
 * buyer — a product rule a component is not allowed to invent.
 *
 * ## Scope
 *
 * `ReportScope.kind` is `project | meeting | agent`, and the three are the same
 * machinery over different scopes — which is what stops a component titling
 * one with another's heading. This component reads the kind and titles itself
 * accordingly, so Project Overview, Meeting Detail and the agent's screen
 * mount the same trigger. The port answers for one meeting or one agent
 * through `ReportScopeSelector`, and the caller that mounts this dialog has
 * already asked it; nothing here decides whose report it is.
 *
 * ## Why the period is stated and not chosen
 *
 * The period lives in the URL and is owned by the one switcher in the shell's
 * context band. A second period control inside a dialog is how a screen ends up
 * measuring two different spans at once, and that defect has been fixed twice in
 * this codebase already. The dialog says which period the document would cover
 * and where to change it.
 */

/**
 * What the dialog needs from `ReportScopeView`.
 *
 * Narrower than the view on purpose: this is a client component, so everything
 * it takes crosses to the browser, and `ViewContext` carries the viewer's
 * identity and grants. A `ReportScopeView` satisfies this structurally, so a
 * caller passes the view straight through.
 */
export interface ExportReportView {
  readonly scope: ReportScope;
  readonly periodLabel: string;
  readonly sections: readonly ReportSection[];
  /** Sections that would be blank, counted by the read model so this need not. */
  readonly unavailableCount: number;
}

/**
 * The shapes the document takes, and what pressing the button does for each,
 * in plain words: the footer says it before the reader presses.
 */
const FORMATS = [
  {
    id: "pdf",
    label: "PDF document",
    note: "The report opens in a new tab and the browser’s print dialog appears: choose “Save as PDF”. The browser makes the PDF from the printed page.",
  },
  {
    id: "page",
    label: "Shareable page",
    note: "The shareable page is this report drawn on a screen of its own, printable through the browser.",
  },
  {
    id: "csv",
    label: "Figures as CSV",
    note: "Downloads every figure the report prints, one row each, with its own base where the report states one, the period’s dates, scope and sources. Separated by commas in English and by semicolons in Slovak and Hungarian, the separator Excel expects under those regional settings.",
  },
] as const;

type FormatId = (typeof FORMATS)[number]["id"];

function formatOf(id: FormatId): (typeof FORMATS)[number] {
  return FORMATS.find((format) => format.id === id) ?? FORMATS[0];
}

/**
 * The three addresses the dialog's buttons take, from the one it composed:
 * the caller's scope and period, the language chosen and the sections taken
 * out. A blank section cannot be taken out, so only writable ids travel.
 */
export function exportAddresses(
  pageHref: string,
  language: Language,
  omitted: readonly string[],
): Readonly<Record<FormatId, string>> {
  const page = withOmitted(withLanguage(pageHref, language), omitted);
  return { page, pdf: withPrint(page), csv: csvAddress(page) };
}

/** The sections a report would leave blank. The Slovak and Hungarian forms are the ones a count takes standing alone. */
export const EXPORT_SECTIONS: PluralForms = {
  en: { one: "section", other: "sections" },
  sk: { one: "sekcia", few: "sekcie", other: "sekcií" },
  hu: { one: "szakasz", other: "szakasz" },
};

/** "2 sections would be blank and cannot be included." */
export const EXPORT_BLANK_SENTENCE: Sentence = {
  en: {
    text: "{count} {sections|count} would be blank and cannot be included.",
    words: { sections: EXPORT_SECTIONS.en },
  },
  sk: {
    text: "{count} {sections|count} {rest|count}.",
    words: {
      sections: EXPORT_SECTIONS.sk,
      rest: {
        one: "by bola prázdna a nemožno ju zahrnúť",
        few: "by boli prázdne a nemožno ich zahrnúť",
        other: "by bolo prázdnych a nemožno ich zahrnúť",
      },
    },
  },
  hu: { text: "{count} szakasz üres lenne, ezért nem vehető fel." },
};

export function ExportReport({
  report,
  pageHref,
  weight = "quiet",
  language,
}: {
  readonly report: ExportReportView;
  /**
   * The report as a page: `/report` draws every section this dialog
   * describes, and the PDF and CSV are taken from the same address. Already
   * carrying the scope and period, because the caller knows them and this
   * component must not guess them.
   */
  readonly pageHref: string;
  /** `quiet` beside other page controls; `primary` where export is the point. */
  readonly weight?: "primary" | "quiet";
  /** The words' language; the page passes the reader's once there is a choice. */
  readonly language: Language;
}) {
  const title = TITLES[report.scope.kind];

  const ids = useId();
  const titleId = `${ids}-title`;
  const noteId = `${ids}-note`;
  const formatId = `${ids}-format`;
  const languageLabelId = `${ids}-language`;
  const languageNoteId = `${ids}-language-note`;

  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<FormatId>("pdf");
  const written = WRITTEN_IN[report.scope.kind];
  /* The document's language, not the screen's: the screens stay as they are. */
  const [reportLanguage, setReportLanguage] = useState<Language>(DEFAULT_LANGUAGE);
  /*
   * Held as the sections taken OUT rather than the ones put in, so a section
   * that becomes writable between two reads arrives already included. The
   * alternative — an inclusion list seeded once — would silently drop a section
   * that only became available after the reader opened the dialog.
   *
   * This is component state and nothing else. There is no browser storage
   * anywhere in this application; a test scans for it and expects none.
   */
  const [excluded, setExcluded] = useState<readonly string[]>([]);

  const writable = report.sections.filter((section) => section.availability !== "unavailable");
  const included = writable.filter((section) => !excluded.includes(section.id));
  /*
   * The document the reader composed: the sections they kept and the language
   * they chose travel on every address, so the page, the PDF and the CSV are
   * the one described here and not the page's default.
   */
  const hrefs = exportAddresses(
    pageHref,
    reportLanguage,
    writable.filter((section) => excluded.includes(section.id)).map((section) => section.id),
  );

  const toggle = (id: string) =>
    setExcluded((current) =>
      current.includes(id) ? current.filter((each) => each !== id) : [...current, id],
    );

  return (
    <>
      <button
        type="button"
        className="ox-btn"
        data-weight={weight}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        {title}
      </button>

      <Dialog
        open={open}
        onDismiss={() => setOpen(false)}
        labelledBy={titleId}
        describedBy={noteId}
      >
        <div className="ox-dialog-head">
          <h2 className="ox-dialog-title" id={titleId}>
            {title}
          </h2>
          <button
            type="button"
            className="ox-btn"
            data-weight="quiet"
            onClick={() => setOpen(false)}
          >
            Close
          </button>
        </div>

        <div className="ox-dialog-body">
          {/* --- the three facts the document would carry on its cover --- */}
          <ul className="ox-scope">
            <li className="ox-scope-item">
              <span>Scope</span>
              <span>{report.scope.label}</span>
            </li>
            <li className="ox-scope-item">
              <span>Period</span>
              <span>{report.periodLabel}</span>
            </li>
            <li className="ox-scope-item">
              <span>Audience</span>
              <span>Internal</span>
            </li>
          </ul>

          <p className="ox-section-note">
            The period is the one chosen with the period control (on a narrow screen, in the menu),
            and it covers the whole document. Everything made here is the internal report; a
            document for a buyer is a separate, sanitised contract, and it is not built.
          </p>

          {/* --- what would be in it -------------------------------------- */}
          <div className="ox-field">
            <span className="ox-field-label">Sections</span>
            <ReportSections
              language={language}
              sections={report.sections}
              excluded={excluded}
              onToggle={toggle}
              idPrefix={ids}
            />
          </div>

          {/* --- what language it is written in --------------------------- */}
          <div className="ox-field">
            <span className="ox-field-label" id={languageLabelId}>
              Language
            </span>
            <ul className="ox-chipset" role="group" aria-labelledby={languageLabelId}>
              {LANGUAGES.map((code) => {
                const available = written.includes(code);
                return (
                  <li key={code}>
                    <button
                      type="button"
                      className="ox-toggle"
                      lang={code}
                      aria-pressed={reportLanguage === code}
                      disabled={!available}
                      {...(available ? {} : { "aria-describedby": languageNoteId })}
                      onClick={() => setReportLanguage(code)}
                    >
                      {LANGUAGE_NAMES[code]}
                    </button>
                  </li>
                );
              })}
            </ul>
            {LANGUAGES.every((code) => written.includes(code)) ? null : (
              <p className="ox-section-note" id={languageNoteId}>
                A language is offered once every word of this document is written in it. The screens
                themselves stay in English either way; only the document changes.
              </p>
            )}
          </div>

          {/* --- what shape it would take --------------------------------- */}
          <div className="ox-field">
            <label className="ox-field-label" htmlFor={formatId}>
              Format
            </label>
            <select
              className="ox-select"
              id={formatId}
              value={format}
              onChange={(event) => setFormat(event.target.value as FormatId)}
            >
              {FORMATS.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </select>
          </div>

          {/*
           * WHAT THE READER HAS SPECIFIED, AND WHAT PRODUCES IT.
           *
           * `.ox-result` rather than `.ox-empty`: this is a statement about the
           * product, not a slot that failed to fill. The chip carries the word
           * as well as the tone, since a state never reaches this screen as a
           * colour alone. How the chosen format is produced is the footer's one
           * plain sentence, beside the button that produces it.
           */}
          <p className="ox-result">
            <span className="ox-chip" data-tone="good">
              <span className="ox-chip-mark" aria-hidden="true" />
              Available now
            </span>
            <span>
              {formatOf(format).label} · {LANGUAGE_NAMES[reportLanguage]} · {included.length} of{" "}
              {writable.length} writable sections · {report.scope.label}.
              {report.unavailableCount === 0
                ? ""
                : ` ${sentence(language, EXPORT_BLANK_SENTENCE, { count: report.unavailableCount })}`}
            </span>
          </p>
        </div>

        <div className="ox-dialog-foot">
          <p className="ox-dialog-note" id={noteId}>
            {formatOf(format).note}
          </p>

          <button
            type="button"
            className="ox-btn"
            data-weight="quiet"
            onClick={() => setOpen(false)}
            data-autofocus
          >
            Close
          </button>

          {/*
           * THE CONTROL THAT PRODUCES THE DOCUMENT — a link in every format,
           * because each is an address: the page, the page asking to be
           * printed (in a new tab, so the dialog's screen is still here), and
           * the CSV route as a download. The footer note above says what
           * happens before the reader presses.
           */}
          {format === "page" ? (
            <Link className="ox-btn" data-weight="primary" href={hrefs.page as never}>
              Open the report page
            </Link>
          ) : format === "pdf" ? (
            <a
              className="ox-btn"
              data-weight="primary"
              href={hrefs.pdf}
              target="_blank"
              rel="noopener"
              aria-describedby={noteId}
            >
              Generate document
            </a>
          ) : (
            <a
              className="ox-btn"
              data-weight="primary"
              href={hrefs.csv}
              download
              aria-describedby={noteId}
            >
              Generate document
            </a>
          )}
        </div>
      </Dialog>
    </>
  );
}
