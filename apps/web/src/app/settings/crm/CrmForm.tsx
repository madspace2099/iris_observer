"use client";

import { useActionState, type ReactNode } from "react";

import type { CrmActionState } from "./actions";

const IDLE: CrmActionState = { ok: null, message: null };

/**
 * One CRM form: the fields the page hands in, the project it is for, and the
 * sentence the action answers with. Uncontrolled — a typed password lives in
 * the DOM until the form is submitted to the server action and nowhere else,
 * and React clears the fields once the action has answered.
 */
export function CrmForm({
  action,
  tenant,
  project,
  submit,
  children,
}: {
  readonly action: (previous: CrmActionState, form: FormData) => Promise<CrmActionState>;
  readonly tenant: string;
  readonly project: string;
  readonly submit: string;
  readonly children: ReactNode;
}) {
  const [state, run, pending] = useActionState(action, IDLE);
  return (
    <form action={run} className="os-column">
      <input type="hidden" name="tenant" value={tenant} />
      <input type="hidden" name="project" value={project} />
      {children}
      <div className="ox-btn-row">
        <button
          type="submit"
          className="ox-btn"
          data-weight="primary"
          disabled={pending}
          aria-disabled={pending ? "true" : undefined}
        >
          {pending ? "Working…" : submit}
        </button>
      </div>
      {state.message === null ? null : (
        <p
          className="os-flash"
          data-tone={state.ok === true ? "ok" : "bad"}
          role={state.ok === true ? "status" : "alert"}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
