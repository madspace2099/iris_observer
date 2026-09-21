"use client";

import { useActionState, useId } from "react";

import {
  importCsvAction,
  importDealsCsvAction,
  type ImportState,
} from "@/lib/madspace/connector-actions";

const IDLE: ImportState = { problem: null, summary: null, rejected: [] };

/**
 * The manual path's upload. A CSV goes in, the same sync loop runs, and the
 * rows that could not become a unit, or a deal, are listed by line rather
 * than dropped. Two sheets, one form: the pricelist and the deals differ in
 * their columns and their action, and in nothing the operator sees.
 */
const SHEETS = {
  units: {
    action: importCsvAction,
    label: "Spreadsheet",
    hint: "A CSV export of the pricelist, comma- or semicolon-separated, with the headers named in the columns above. Up to 5 MB.",
  },
  deals: {
    action: importDealsCsvAction,
    label: "Deals sheet",
    hint: "A CSV export of the deals, comma- or semicolon-separated, with the headers named in the deal columns above. The email and phone columns are hashed on the way in. Up to 5 MB.",
  },
} as const;

export function CsvUpload({
  projectId,
  sheet = "units",
}: {
  readonly projectId: string;
  readonly sheet?: keyof typeof SHEETS;
}) {
  const which = SHEETS[sheet];
  const [state, submit, pending] = useActionState(which.action, IDLE);
  const id = useId();

  return (
    <form className="mad-form" action={submit} noValidate>
      <input type="hidden" name="project" value={projectId} />
      <div className="mad-field" data-invalid={state.problem === null ? undefined : "true"}>
        <label className="mad-field-label" htmlFor={id}>
          {which.label}
        </label>
        <p className="mad-field-hint">{which.hint}</p>
        <input
          className="mad-input"
          id={id}
          name="file"
          type="file"
          accept=".csv,text/csv"
          aria-invalid={state.problem === null ? undefined : true}
          aria-describedby={state.problem === null ? undefined : `${id}-problem`}
        />
        {/* The refusal under the control, and the control points at it. */}
        {state.problem === null ? null : (
          <p className="mad-field-error" id={`${id}-problem`} role="alert">
            {state.problem}
          </p>
        )}
      </div>
      {/*
       * Rendered whenever the form is, empty until there is something to say,
       * so a screen reader is already watching the region when the count lands.
       */}
      <p className="mad-said" role="status" aria-live="polite">
        {state.summary ?? ""}
      </p>
      {state.rejected.length === 0 ? null : (
        <ul className="mad-alerts">
          {state.rejected.map((line) => (
            <li className="mad-alert" key={line}>
              {line}
            </li>
          ))}
        </ul>
      )}
      <div className="mad-form-actions">
        <button
          className="mad-submit mad-button"
          data-emphasis="primary"
          type="submit"
          disabled={pending}
        >
          {pending ? "Reading…" : "Upload and apply"}
        </button>
      </div>
    </form>
  );
}
