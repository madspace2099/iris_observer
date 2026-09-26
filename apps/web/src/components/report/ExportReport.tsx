"use client";

import Link from "next/link";

import { useId, useState } from "react";
import {
  DEFAULT_LANGUAGE,
  plural,
  type Language,
  type PluralForms,
  type ReportGeneration,
  type ReportScope,
  type ReportSection,
} from "@observer/readmodels";

/** What the trigger and the dialog call themselves, by whose report it is. */
const TITLES: Readonly<Record<ReportScope["kind"], string>> = {
  project: "Export project report",
  meeting: "Export meeting summary",
  agent: "Export agent summary",
};

import { Dialog } from "@/components/product/Dialog";
import { ReportSections } from "./ReportSections";

/**
 * EXPORT — the frontend for a document nothing writes yet.
 *
 * Report generation belongs to a later milestone. No document is rendered, no
 * file is produced and no queue is waiting, and that is a fact this surface is
 * built to state rather than a fact it works around. The failure mode it exists
 * to avoid has a name in the doctrine: a Download button that does nothing.
 *
 * ## What is honest here, and what would not have been
 *
 * `ReportGeneration.state` is typed to a single member, `preview_only`. There is
 * no truthy value this component can branch on into an action that does not
 * exist, and adding a second member later is a type change every call site has
 * to acknowledge. So the generate control is `aria-disabled` with its reason
 * stated in the footer rather than in a tooltip, and the reason is the read
 * model's own sentence together with the milestone that owns it — so the answer
 * to "when" is a milestone rather than "soon".
 *
 * What would have been dishonest, and is deliberately absent: a progress bar, a
 * queued state, an email-it-to-me field, a download that produces an empty file,
 * and a format list that implies a renderer exists for each entry.
 *
 * **Every other control in this dialog works.** The section checkboxes and the
 * format select configure the preview sentence beneath them, which changes as
 * they change. They are not a mock of a generator; they are the specification a
 * reader is composing, and the one control that would act on it says plainly
 * that it cannot yet.
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
  readonly generation: ReportGeneration;
  /** Sections that would be blank, counted by the read model so this need not. */
  readonly unavailableCount: number;
}

/**
 * The shapes a document could take.
 *
 * Named and nothing more. None of them describes what the file would look like
 * inside, since no renderer exists to be described and a paragraph about
 * pagination would be a specification invented by a dialog.
 */
const FORMATS = [
  { id: "pdf", label: "PDF document" },
  { id: "page", label: "Shareable page" },
  { id: "csv", label: "Figures as CSV" },
] as const;

type FormatId = (typeof FORMATS)[number]["id"];

function formatLabel(id: FormatId): string {
  return FORMATS.find((format) => format.id === id)?.label ?? id;
}

/** The sections a report would leave blank. The Slovak and Hungarian forms are the ones a count takes standing alone. */
export const EXPORT_SECTIONS: PluralForms = {
  en: { one: "section", other: "sections" },
  sk: { one: "sekcia", few: "sekcie", other: "sekcií" },
  hu: { one: "szakasz", other: "szakasz" },
};

export function ExportReport({
  report,
  pageHref,
  weight = "quiet",
  language = DEFAULT_LANGUAGE,
}: {
  readonly report: ExportReportView;
  /**
   * The report as a page, which is the one format that exists: `/report`
   * draws every section this dialog describes. Already carrying the period,
   * because the caller knows it and this component must not guess it.
   */
  readonly pageHref: string;
  /** `quiet` beside other page controls; `primary` where export is the point. */
  readonly weight?: "primary" | "quiet";
  /** The words' language; the page passes the reader's once there is a choice. */
  readonly language?: Language;
}) {
  const title = TITLES[report.scope.kind];

  const ids = useId();
  const titleId = `${ids}-title`;
  const noteId = `${ids}-note`;
  const formatId = `${ids}-format`;

  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<FormatId>("pdf");
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
            The period is set in the bar at the top of the screen and applies to the whole document;
            there is one period control in this product and it is not in here. A document meant to
            be shared with a buyer is a separate, sanitised contract with no field the internal
            pre-meeting brief could reach — that contract is not built, so nothing assembled here
            leaves the room.
          </p>

          {/* --- what would be in it -------------------------------------- */}
          <div className="ox-field">
            <span className="ox-field-label">Sections</span>
            <ReportSections
              sections={report.sections}
              excluded={excluded}
              onToggle={toggle}
              idPrefix={ids}
            />
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
           * WHAT THE READER HAS SPECIFIED, AND THE STATE OF THE THING THAT
           * WOULD ACT ON IT.
           *
           * `.ox-result` rather than `.ox-empty`: this is a statement about the
           * product, not a slot that failed to fill. The chip carries the word
           * as well as the tone, since a state never reaches this screen as a
           * colour alone.
           */}
          <p className="ox-result">
            <span className="ox-chip" data-tone={format === "page" ? "good" : "watch"}>
              <span className="ox-chip-mark" aria-hidden="true" />
              {format === "page" ? "Available now" : "Preview-ready"}
            </span>
            <span>
              {formatLabel(format)} · {included.length} of {writable.length} writable sections ·{" "}
              {report.scope.label}.
              {report.unavailableCount === 0
                ? ""
                : ` ${report.unavailableCount} ${plural(language, report.unavailableCount, EXPORT_SECTIONS)} would be blank and cannot be included.`}
            </span>
          </p>
        </div>

        <div className="ox-dialog-foot">
          <p className="ox-dialog-note" id={noteId}>
            {format === "page"
              ? "The shareable page is this report drawn on a screen of its own, printable through the browser. It is the one format that exists today."
              : `${report.generation.statement} ${report.generation.milestone}`}
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
           * THE CONTROL THAT WOULD PRODUCE THE DOCUMENT, AND DOES NOT.
           *
           * `aria-disabled` rather than `disabled`, so it stays reachable and a
           * reader who tabs to it is told why it is unavailable through
           * `aria-describedby` — a control removed from the tab order is a
           * control a keyboard reader cannot discover the reason for. It has no
           * handler at all, so there is no path from pressing it to a file, an
           * empty download or a spinner that never resolves.
           */}
          {format === "page" ? (
            <Link className="ox-btn" data-weight="primary" href={pageHref as never}>
              Open the report page
            </Link>
          ) : null}
          {format === "page" ? null : (
            <button
              type="button"
              className="ox-btn"
              aria-disabled="true"
              aria-describedby={noteId}
              title={report.generation.statement}
            >
              Generate document
            </button>
          )}
        </div>
      </Dialog>
    </>
  );
}
