"use client";

import { useActionState, useId, useRef, useState } from "react";
import type { FormEvent } from "react";

import { createProjectAction, type CreateProjectState } from "@/lib/madspace/create-actions";
import { InfoNote } from "@/components/madspace/InfoNote";

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
 *
 * ## Where the sentences went
 *
 * What the name is for, and what pressing the button does, are both behind an
 * `i`. Neither is a refusal, a state or a date, and both were standing in front
 * of the control they described. The example the definition carried did not go
 * with them: an example belongs in the placeholder, which is the one thing a
 * placeholder is allowed to hold.
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
        {/*
         * The disclosure sits BESIDE the label, never inside it.
         *
         * A `label` lends its whole text content to the input as an accessible
         * name, so a button nested in it would have the screen reader announce
         * the field as "Project name About the project name". The row is what
         * keeps the two on one line without putting one inside the other.
         */}
        <div className="mad-idline">
          <label className="mad-field-label" htmlFor={fieldId}>
            Project name
          </label>
          <InfoNote label="the project name">
            <p>What the development is known by. It is the name an operator would say out loud.</p>
            <p>It heads every operations screen for this project, and it can be changed later.</p>
          </InfoNote>
        </div>
        <input
          className="mad-input"
          id={fieldId}
          name="name"
          type="text"
          ref={nameRef}
          defaultValue={state.name}
          placeholder="ISTER TOWER"
          maxLength={200}
          autoComplete="off"
          spellCheck={false}
          aria-describedby={problem === null ? undefined : errorId}
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
         *
         * Ink, not accent. The blue in this system means "waiting for
         * MADSPACE", and a blue button would be the only place it did not, so
         * the fill comes from the portal's primary button rather than from
         * `mad-submit`'s own accent. `mad-submit` still carries the geometry.
         */}
        <button
          className="mad-submit mad-button"
          data-emphasis="primary"
          type="submit"
          disabled={pending}
        >
          {pending ? "Creating project…" : "Create project"}
        </button>
        {/*
         * What pressing the button does, under the button rather than beside
         * the heading. `obs-section-head` justifies its aside to the far edge,
         * which on a page whose form is capped at a readable measure left this
         * sentence stranded half a screen away from anything it described. It
         * is behind the `i` now for the further reason that the destination is
         * discovered by pressing the button, so the sentence was never the
         * answer to anything.
         */}
        <InfoNote label="what creating the project does">
          <p>Creating the project opens it, ready for its first source.</p>
        </InfoNote>
        <a className="mad-quiet" href="/madspace/projects">
          Cancel
        </a>
      </div>
    </form>
  );
}
