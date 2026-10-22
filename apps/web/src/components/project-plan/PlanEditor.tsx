"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";

import { saveSalesWindow, type PlanActionState } from "@/lib/project-plan/actions";

const IDLE: PlanActionState = { ok: null, message: null };

/**
 * THE COMPANY ADMIN'S TWO DATES (ADR-0055).
 *
 * One button under the window; pressed, two native date fields and Save or
 * Cancel. The page renders it only for the admin of the tenant's company, and
 * the action checks again. Saved, the form closes, the focus returns to the
 * button, the server's sentence is spoken, and the block above is drawn again
 * from the read model. Refused, the form stays open with what was typed and
 * the server's sentence under it; cancelled, that sentence goes with the form,
 * so a form opened again never starts under an old refusal.
 */
export function PlanEditor({
  tenant,
  project,
  startsOn,
  sellOutBy,
  stored,
}: {
  readonly tenant: string;
  readonly project: string;
  readonly startsOn: string | null;
  readonly sellOutBy: string | null;
  /** False where this server keeps no sales dates: the control is replaced by the reason. */
  readonly stored: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(startsOn ?? "");
  const [end, setEnd] = useState(sellOutBy ?? "");
  const [state, run, pending] = useActionState(
    async (previous: PlanActionState, form: FormData) => {
      const answer = await saveSalesWindow(previous, form);
      if (answer.ok === true) setOpen(false);
      return answer;
    },
    IDLE,
  );
  /* The answer Cancel closed on: not said again until the next save answers. */
  const [dismissed, setDismissed] = useState<PlanActionState | null>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const first = useRef<HTMLInputElement>(null);
  const opened = useRef(false);
  const id = useId();

  useEffect(() => {
    if (open) first.current?.focus();
    else if (opened.current) toggle.current?.focus();
    opened.current = open;
  }, [open]);

  if (!stored) {
    return (
      <p className="iris-plan-note iris-plan-edit">
        {sellOutBy === null
          ? "No sell-out date can be set on this deployment; dates are kept only on a local demonstration server."
          : "Dates set here are kept only on a local demonstration server; on this deployment the project's configured dates stand."}
      </p>
    );
  }

  const said =
    state.message === null || state === dismissed ? null : (
      <p
        className="iris-plan-said"
        data-tone={state.ok === true ? "ok" : "bad"}
        role={state.ok === true ? "status" : "alert"}
      >
        {state.message}
      </p>
    );

  return (
    <div className="iris-plan-edit">
      {open ? (
        <form action={run} className="iris-plan-form" aria-label="The sales window">
          <input type="hidden" name="tenant" value={tenant} />
          <input type="hidden" name="project" value={project} />
          <label htmlFor={`${id}-start`}>
            Sales start
            <input
              ref={first}
              id={`${id}-start`}
              type="date"
              name="startsOn"
              required
              value={start}
              onChange={(event) => setStart(event.target.value)}
            />
          </label>
          <label htmlFor={`${id}-end`}>
            Sell out by
            <input
              id={`${id}-end`}
              type="date"
              name="sellOutBy"
              required
              value={end}
              onChange={(event) => setEnd(event.target.value)}
            />
          </label>
          <div className="iris-plan-buttons">
            <button
              type="submit"
              className="iris-action"
              data-primary="true"
              disabled={pending}
              aria-disabled={pending ? "true" : undefined}
            >
              {pending ? "Saving…" : "Save dates"}
            </button>
            <button
              type="button"
              className="iris-action"
              onClick={() => {
                setStart(startsOn ?? "");
                setEnd(sellOutBy ?? "");
                setDismissed(state);
                setOpen(false);
              }}
            >
              Cancel
            </button>
          </div>
          {state.ok === false ? <div style={{ gridColumn: "1 / -1" }}>{said}</div> : null}
        </form>
      ) : (
        <>
          <button ref={toggle} type="button" className="iris-action" onClick={() => setOpen(true)}>
            {sellOutBy === null ? "Set the sell-out date" : "Change the dates"}
          </button>
          {state.ok === true ? said : null}
        </>
      )}
    </div>
  );
}
