"use client";

import { useActionState, useId } from "react";

import { importCsvAction, type ImportState } from "@/lib/madspace/connector-actions";

const IDLE: ImportState = { problem: null, summary: null, rejected: [] };

/**
 * The manual path's upload. A CSV goes in, the same sync loop runs, and the
 * rows that could not become a unit are listed by line rather than dropped.
 */
export function CsvUpload({ projectId }: { readonly projectId: string }) {
  const [state, submit, pending] = useActionState(importCsvAction, IDLE);
  const id = useId();

  return (
    <form className="mad-form" action={submit} noValidate>
      <input type="hidden" name="project" value={projectId} />
      <div className="mad-field" data-invalid={state.problem === null ? undefined : "true"}>
        <label className="mad-field-label" htmlFor={id}>
          Spreadsheet
        </label>
        <p className="mad-field-hint">
          A CSV export of the pricelist, comma- or semicolon-separated, with the headers named in
          the columns above. Up to 5 MB.
        </p>
        <input className="mad-input" id={id} name="file" type="file" accept=".csv,text/csv" />
      </div>
      {state.problem === null ? null : (
        <p className="mad-form-problem" role="alert">
          {state.problem}
        </p>
      )}
      {state.summary === null ? null : (
        <p className="mad-said" role="status">
          {state.summary}
        </p>
      )}
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
