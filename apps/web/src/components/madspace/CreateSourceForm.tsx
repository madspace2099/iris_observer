"use client";

import { useActionState, useId, useRef, useState } from "react";
import type { FormEvent } from "react";

import { createSourceAction, type CreateSourceState } from "@/lib/madspace/create-actions";

/**
 * Registering one installation under a project.
 *
 * Three decisions, in the order an operator makes them: what to call it, what
 * it is, where it runs.
 *
 * ## Why the type is stated rather than chosen
 *
 * `SOURCE_TYPES` holds five values and only `showroom_ue5` has an activation
 * endpoint, a heartbeat and an ingestion path behind it. The other four are
 * omitted rather than shown disabled: a greyed-out "CRM" is a roadmap promise
 * rendered as an interface, and registering one would produce a row stuck for
 * ever at "never connected" — a source that looks broken and is really a
 * product that does not exist. So the field states the one fact it has instead
 * of offering a choice of one, which is a control that does nothing.
 *
 * ## Why the environment has no default
 *
 * It is the only value on this form the installation can never argue with. The
 * registered environment is authoritative for every event the source sends; a
 * build reporting something else is recorded as a mismatch rather than
 * believed. A preselected radio would let an operator create a production
 * source by not reading, so the choice is required and unmade.
 */

/** The four the schema accepts, ordered as an installation's life runs. */
const ENVIRONMENT_CHOICES = [
  {
    value: "development",
    name: "Development",
    detail: "A workstation or a build machine. Never a room a buyer stands in.",
  },
  {
    value: "staging",
    name: "Staging",
    detail: "A rehearsal of the showroom, running the build before it is signed off.",
  },
  {
    value: "production",
    name: "Production",
    detail: "The showroom itself. Everything this source sends counts as real activity.",
  },
  {
    value: "demo",
    name: "Demo",
    detail:
      "A sales or exhibition machine. Real software, and activity nobody should read as a lead.",
  },
] as const;

const IDLE: CreateSourceState = { problem: null, field: null, label: "", environment: "" };

export function CreateSourceForm({ projectId }: { projectId: string }) {
  const [state, submit, pending] = useActionState(createSourceAction, IDLE);
  /*
   * The client's own refusals, keyed by field and kept apart from the server's.
   * Merged, a corrected field would keep showing the sentence that was true one
   * round trip ago.
   */
  const [local, setLocal] = useState<{ readonly field: string; readonly problem: string } | null>(
    null,
  );
  const labelRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const base = useId();
  const labelId = `${base}-label`;
  const labelHintId = `${base}-label-hint`;
  const labelErrorId = `${base}-label-error`;
  const typeHintId = `${base}-type-hint`;
  const environmentHintId = `${base}-environment-hint`;
  const environmentErrorId = `${base}-environment-error`;

  const problemFor = (field: "label" | "environment"): string | null => {
    if (local !== null) return local.field === field ? local.problem : null;
    return state.field === field ? state.problem : null;
  };
  const labelProblem = problemFor("label");
  const environmentProblem = problemFor("environment");
  const formProblem = local === null && state.field === null ? state.problem : null;

  function check(event: FormEvent<HTMLFormElement>) {
    const typed = labelRef.current?.value.trim() ?? "";
    if (typed.length === 0) {
      event.preventDefault();
      setLocal({
        field: "label",
        problem: "Give the installation a display name before creating it.",
      });
      labelRef.current?.focus();
      return;
    }

    const chosen = formRef.current?.querySelector<HTMLInputElement>(
      'input[name="environment"]:checked',
    );
    if (chosen === null || chosen === undefined) {
      event.preventDefault();
      setLocal({
        field: "environment",
        problem:
          "Choose the environment this installation runs in. It cannot be changed from the installation afterwards.",
      });
      /* Focus the first radio: the group is the thing to answer, not the last one. */
      formRef.current?.querySelector<HTMLInputElement>('input[name="environment"]')?.focus();
      return;
    }

    setLocal(null);
  }

  return (
    <form className="mad-form" ref={formRef} action={submit} onSubmit={check} noValidate>
      {/*
       * The project the source lands in. Posted rather than closed over,
       * because the action validates it against this account's active projects
       * and refuses anything else — a tampered value is caught at the service
       * boundary rather than trusted at this one.
       */}
      <input type="hidden" name="project" value={projectId} />

      <div className="mad-field" data-invalid={labelProblem === null ? undefined : "true"}>
        <label className="mad-field-label" htmlFor={labelId}>
          Display name
        </label>
        <p className="mad-field-hint" id={labelHintId}>
          What an operator would call this machine — “Sales Suite, Level 3” or “Reception pod”. It
          is how the installation is told apart from the others in this project, so a room or a
          position beats a serial number.
        </p>
        <input
          className="mad-input"
          id={labelId}
          name="label"
          type="text"
          ref={labelRef}
          defaultValue={state.label}
          maxLength={200}
          autoComplete="off"
          spellCheck={false}
          aria-describedby={labelProblem === null ? labelHintId : `${labelHintId} ${labelErrorId}`}
          aria-invalid={labelProblem === null ? undefined : true}
          onChange={() => setLocal(null)}
        />
        {labelProblem === null ? null : (
          <p className="mad-field-error" id={labelErrorId} role="alert">
            {labelProblem}
          </p>
        )}
      </div>

      <div className="mad-field">
        <span className="mad-field-label">Source type</span>
        <p className="mad-stated">IRIS Showroom (UE5)</p>
        <p className="mad-field-hint" id={typeHintId}>
          The only type this control plane can register. It is the one with an activation exchange,
          a heartbeat and an ingestion path behind it — a source of any other kind would be created
          and then never able to send anything.
        </p>
      </div>

      <fieldset
        className="mad-fieldset"
        data-invalid={environmentProblem === null ? undefined : "true"}
        aria-describedby={
          environmentProblem === null
            ? environmentHintId
            : `${environmentHintId} ${environmentErrorId}`
        }
      >
        <legend className="mad-field-label">Environment</legend>
        <p className="mad-field-hint" id={environmentHintId}>
          The environment registered here is authoritative for every event this source ever sends: a
          build that reports a different one does not change it, it is recorded as a mismatch.
        </p>
        <div className="mad-choices">
          {ENVIRONMENT_CHOICES.map((choice) => (
            <label className="mad-choice" key={choice.value}>
              <input
                type="radio"
                name="environment"
                value={choice.value}
                defaultChecked={state.environment === choice.value}
                onChange={() => setLocal(null)}
              />
              <span className="mad-choice-name">{choice.name}</span>
              <span className="mad-choice-detail">{choice.detail}</span>
            </label>
          ))}
        </div>
        {environmentProblem === null ? null : (
          <p className="mad-field-error" id={environmentErrorId} role="alert">
            {environmentProblem}
          </p>
        )}
      </fieldset>

      {formProblem === null ? null : (
        <p className="mad-form-problem" role="alert">
          {formProblem}
        </p>
      )}

      <div className="mad-form-actions">
        <button className="mad-submit" type="submit" disabled={pending}>
          {pending ? "Creating source…" : "Create source"}
        </button>
        <a className="mad-quiet" href={`/madspace/projects/${projectId}`}>
          Cancel
        </a>
      </div>
    </form>
  );
}
