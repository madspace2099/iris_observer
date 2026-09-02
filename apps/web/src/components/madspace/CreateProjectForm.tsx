"use client";

import { useActionState, useId, useRef, useState } from "react";
import type { FormEvent } from "react";

import { createProjectAction, type CreateProjectState } from "@/lib/madspace/create-actions";

/**
 * One field, because a project is one fact.
 *
 * The schema also holds a slug, and the operator is not asked for it: it is
 * display metadata, nothing routes by it, and asking would make somebody invent
 * a second name for the same building. `create-actions.ts` derives it from the
 * name and says so.
 *
 * ## Two validations, and neither is decoration
 *
 * The check below runs before the form is submitted, so an empty name costs no
 * round trip and the focus lands back where the operator can fix it. The server
 * validates again — it must, because a server action is an HTTP endpoint and
 * this component is not a gate — and its refusals arrive through
 * `useActionState` and render in exactly the same place. One message slot, two
 * possible authors, so the reader never has to learn two error vocabularies.
 */
const IDLE: CreateProjectState = { problem: null, field: null, name: "" };

export function CreateProjectForm() {
  const [state, submit, pending] = useActionState(createProjectAction, IDLE);
  /*
   * The client's own refusal, kept apart from the server's. Merging them into
   * one state would mean a stale server message surviving a local correction —
   * the operator fixes the name, sees the old sentence, and mistrusts the form.
   */
  const [local, setLocal] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const fieldId = useId();
  const hintId = `${fieldId}-hint`;
  const errorId = `${fieldId}-error`;

  const problem = local ?? (state.field === "name" ? state.problem : null);
  /*
   * A local refusal supersedes the server's entirely, including a form-level
   * one. Otherwise a stale "the control plane would not open" sentence keeps
   * standing under a field the operator has just been told to correct, and the
   * two read as one compound failure that never happened.
   */
  const formProblem = local === null && state.field === null ? state.problem : null;

  function check(event: FormEvent<HTMLFormElement>) {
    const typed = nameRef.current?.value.trim() ?? "";
    if (typed.length === 0) {
      /*
       * Preventing the default is what stops the action: React runs a form
       * action only for a submit event it has not been told to abandon.
       */
      event.preventDefault();
      setLocal("Give the project a name before creating it.");
      nameRef.current?.focus();
      return;
    }
    setLocal(null);
  }

  return (
    <form className="mad-form" action={submit} onSubmit={check} noValidate>
      <div className="mad-field" data-invalid={problem === null ? undefined : "true"}>
        <label className="mad-field-label" htmlFor={fieldId}>
          Project name
        </label>
        <p className="mad-field-hint" id={hintId}>
          What the development is known by — the name an operator would say out loud, such as ISTER
          TOWER. It heads every operations screen for this project, and it can be changed later.
        </p>
        <input
          className="mad-input"
          id={fieldId}
          name="name"
          type="text"
          ref={nameRef}
          defaultValue={state.name}
          maxLength={200}
          autoComplete="off"
          spellCheck={false}
          aria-describedby={problem === null ? hintId : `${hintId} ${errorId}`}
          aria-invalid={problem === null ? undefined : true}
          onChange={() => setLocal(null)}
        />
        {problem === null ? null : (
          <p className="mad-field-error" id={errorId} role="alert">
            {problem}
          </p>
        )}
      </div>

      {formProblem === null ? null : (
        <p className="mad-form-problem" role="alert">
          {formProblem}
        </p>
      )}

      <div className="mad-form-actions">
        {/*
         * Disabled AND relabelled. Disabling alone leaves the operator with no
         * evidence anything happened, so they press Enter and the browser posts
         * a second time; the label is what tells them to wait.
         */}
        <button className="mad-submit" type="submit" disabled={pending}>
          {pending ? "Creating project…" : "Create project"}
        </button>
        <a className="mad-quiet" href="/madspace/projects">
          Cancel
        </a>
      </div>
    </form>
  );
}
