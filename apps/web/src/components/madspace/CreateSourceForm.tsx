"use client";

import { useActionState, useId, useRef, useState } from "react";
import type { FormEvent } from "react";

import { InfoNote } from "@/components/madspace/InfoNote";
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
 *
 * ## What stayed on the surface, and what moved behind an `i`
 *
 * The two field descriptions that explain the shape of a field are definitions
 * and sit behind a disclosure. The environment's is NOT: it states that the
 * value being chosen right now is authoritative for the rest of the source's
 * life, which is the basis of the decision rather than a note about it. Hidden,
 * a demonstration machine registered as Production would book its activity as
 * real and nothing on the screen would have said so.
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
  const labelErrorId = `${base}-label-error`;
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
        {/*
         * The disclosure is a sibling of the <label>, not a child of it. A
         * button inside a `label for` is folded into the accessible name of the
         * input it labels, and the operator would hear the explanation's title
         * read out as part of the field's own name.
         */}
        <div>
          <label className="mad-field-label" htmlFor={labelId}>
            Display name
          </label>
          <InfoNote label="what the display name is for">
            <p>
              What an operator would call this machine, for example &ldquo;Sales Suite, Level
              3&rdquo; or &ldquo;Reception pod&rdquo;.
            </p>
            <p>
              It is how the installation is told apart from the others in this project, so a room or
              a position beats a serial number.
            </p>
          </InfoNote>
        </div>
        <input
          className="mad-input"
          id={labelId}
          name="label"
          type="text"
          ref={labelRef}
          defaultValue={state.label}
          /* An example, never the label. The label is above and stays there. */
          placeholder="Sales Suite, Level 3"
          maxLength={200}
          autoComplete="off"
          spellCheck={false}
          aria-describedby={labelProblem === null ? undefined : labelErrorId}
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
        {/*
         * A plain <span>, so the disclosure can sit inside it: this names a
         * stated fact rather than labelling a control, and there is no
         * accessible name for the button to be folded into.
         */}
        <span className="mad-field-label">
          Source type
          <InfoNote label="why the source type is stated rather than chosen">
            <p>
              The only type this control plane can register. It is the one with an activation
              exchange, a heartbeat and an ingestion path behind it. A source of any other kind
              would be created and then never able to send anything.
            </p>
          </InfoNote>
        </span>
        <p className="mad-stated">IRIS Showroom (UE5)</p>
      </div>

      <fieldset
        className="mad-fieldset"
        data-invalid={environmentProblem === null ? undefined : "true"}
        aria-invalid={environmentProblem === null ? undefined : true}
        aria-describedby={
          environmentProblem === null
            ? environmentHintId
            : `${environmentHintId} ${environmentErrorId}`
        }
      >
        <legend className="mad-field-label">Environment</legend>
        {/*
         * This one stays in front of the choice. It is not a description of the
         * field, it is the consequence of the answer, and the operator has to
         * hold it while reading the four options.
         */}
        <p className="mad-field-hint" id={environmentHintId}>
          The environment registered here is authoritative for every event this source ever sends. A
          build that reports a different one does not change it. It is recorded as a mismatch.
        </p>
        <div className="mad-choices">
          {ENVIRONMENT_CHOICES.map((choice) => {
            const choiceId = `${base}-environment-${choice.value}`;
            const detailId = `${choiceId}-detail`;
            /*
             * The row is a <div> and the <label> sits BESIDE the input rather
             * than around it.
             *
             * One label wrapping the input, the name and the detail made the
             * whole detail sentence part of the radio's accessible name, so the
             * first option announced as "Development A workstation or a build
             * machine. Never a room a buyer stands in." The label now holds the
             * name alone and is tied by `for` and `id`, which is what the
             * accessibility contract asks of every input, and the detail is a
             * description read after the name instead of inside it.
             */
            return (
              <div className="mad-choice" key={choice.value}>
                <input
                  type="radio"
                  id={choiceId}
                  name="environment"
                  value={choice.value}
                  defaultChecked={state.environment === choice.value}
                  /*
                   * The refusal rides on every radio, not on the fieldset
                   * alone. An operator who tabs straight to the third option
                   * after a refused submit never enters the group at its start,
                   * and a state carried only by the fieldset is never read to
                   * them. The hint stays on the fieldset, where it is heard
                   * once for the group rather than four times over.
                   */
                  aria-invalid={environmentProblem === null ? undefined : true}
                  aria-describedby={
                    environmentProblem === null ? detailId : `${detailId} ${environmentErrorId}`
                  }
                  onChange={() => setLocal(null)}
                />
                <label className="mad-choice-name" htmlFor={choiceId}>
                  {choice.name}
                </label>
                <span className="mad-choice-detail" id={detailId}>
                  {choice.detail}
                </span>
              </div>
            );
          })}
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
        {/*
         * Two classes, and the second is the one that decides the colour.
         * `mad-submit` carries the geometry a commit control on this form
         * needs; the portal's primary weight paints it ink, because blue on
         * this surface is a status colour meaning "waiting for MADSPACE" and a
         * blue button would be the single place it did not mean that.
         *
         * Cancel stays a link. Two controls of equal weight side by side is how
         * an operator registers the source they meant to abandon.
         */}
        <button
          className="mad-submit mad-button"
          data-emphasis="primary"
          type="submit"
          disabled={pending}
        >
          {pending ? "Creating source…" : "Create source"}
        </button>
        <a className="mad-quiet" href={`/madspace/projects/${projectId}`}>
          Cancel
        </a>
      </div>
    </form>
  );
}
