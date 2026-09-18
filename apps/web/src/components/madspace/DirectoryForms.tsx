"use client";

import { useActionState, useId, useState } from "react";

import {
  createDeveloperAction,
  grantViewerAction,
  nameAgentAction,
  setProjectSettingsAction,
  withdrawAgentNameAction,
} from "@/lib/madspace/directory-actions";
import { slugFrom } from "@/lib/madspace/slug";
import { InfoNote } from "@/components/madspace/InfoNote";

/**
 * THE FOUR FORMS THAT MAKE A PROJECT A CUSTOMER'S DASHBOARD.
 *
 * One file because they are one vocabulary: a labelled field, one message slot
 * under it that either the server or nobody writes to, and a button that says
 * what it is doing while it does it. The server validates everything again;
 * nothing here is a gate.
 */

const IDLE = { problem: null, field: null, values: {}, done: null } as const;

type State = Awaited<ReturnType<typeof createDeveloperAction>>;

function Problem({ state, field, id }: { state: State; field: string; id: string }) {
  if (state.field !== field || state.problem === null) return null;
  return (
    <p className="mad-field-error" id={id} role="alert">
      {state.problem}
    </p>
  );
}

function FormProblem({ state }: { state: State }) {
  if (state.field !== null || state.problem === null) return null;
  return (
    <p className="mad-form-problem" role="alert">
      {state.problem}
    </p>
  );
}

function Done({ state }: { state: State }) {
  if (state.done === null) return null;
  return (
    <p className="mad-note" role="status">
      {state.done}
    </p>
  );
}

/* --- a developer ---------------------------------------------------------------------- */

export function DeveloperForm() {
  const [state, submit, pending] = useActionState(createDeveloperAction, IDLE);
  const [name, setName] = useState(state.values["name"] ?? "");
  /* The address follows the name until somebody types in it; then it is theirs. */
  const [slug, setSlug] = useState<string | null>(null);
  const id = useId();
  const address = slug ?? slugFrom(name, 64) ?? "";

  return (
    <form className="mad-form" action={submit} noValidate>
      <div className="mad-field" data-invalid={state.field === "name" ? "true" : undefined}>
        <label className="mad-field-label" htmlFor={`${id}-name`}>
          Developer
        </label>
        <input
          className="mad-input"
          id={`${id}-name`}
          name="name"
          type="text"
          value={name}
          placeholder="Alder Homes"
          maxLength={200}
          autoComplete="off"
          aria-describedby={state.field === "name" ? `${id}-name-error` : undefined}
          onChange={(event) => setName(event.target.value)}
        />
        <Problem state={state} field="name" id={`${id}-name-error`} />
      </div>

      <div className="mad-field" data-invalid={state.field === "slug" ? "true" : undefined}>
        <div className="mad-idline">
          <label className="mad-field-label" htmlFor={`${id}-slug`}>
            Address
          </label>
          <InfoNote label="a developer's address">
            <p>The first part of every link to this developer&rsquo;s projects.</p>
            <p>It cannot be changed afterwards, because links will have been sent.</p>
          </InfoNote>
        </div>
        <input
          className="mad-input"
          id={`${id}-slug`}
          name="slug"
          type="text"
          value={address}
          placeholder="alder-homes"
          maxLength={64}
          autoComplete="off"
          spellCheck={false}
          aria-describedby={state.field === "slug" ? `${id}-slug-error` : undefined}
          onChange={(event) => setSlug(event.target.value)}
        />
        <Problem state={state} field="slug" id={`${id}-slug-error`} />
      </div>

      <FormProblem state={state} />
      <div className="mad-form-actions">
        <button
          className="mad-submit mad-button"
          data-emphasis="primary"
          type="submit"
          disabled={pending}
        >
          {pending ? "Registering…" : "Register developer"}
        </button>
        <Done state={state} />
      </div>
    </form>
  );
}

/* --- a project's address and settings ---------------------------------------------------- */

export interface SettingsFormProps {
  readonly projectId: string;
  readonly projectName: string;
  readonly developers: readonly {
    readonly id: string;
    readonly name: string;
    readonly slug: string;
  }[];
  /** What is saved already. A developer and an address, once set, are stated and not asked again. */
  readonly saved: {
    readonly tenantId: string | null;
    readonly slug: string | null;
    readonly currency: string | null;
    readonly locale: string | null;
    readonly timeZone: string | null;
  };
  readonly currencies: readonly string[];
  readonly timeZones: readonly string[];
}

export function ProjectSettingsForm(props: SettingsFormProps) {
  const { projectId, projectName, developers, saved, currencies, timeZones } = props;
  const [state, submit, pending] = useActionState(setProjectSettingsAction, IDLE);
  const id = useId();

  const attached = saved.tenantId !== null;
  const developer = developers.find((d) => d.id === saved.tenantId) ?? null;
  const [tenant, setTenant] = useState(state.values["tenant"] ?? saved.tenantId ?? "");
  const [slug, setSlug] = useState(
    state.values["slug"] ?? saved.slug ?? slugFrom(projectName) ?? "",
  );
  const chosen = developers.find((d) => d.id === tenant) ?? null;

  const field = (name: string) => ({
    "data-invalid": state.field === name ? ("true" as const) : undefined,
  });

  return (
    <form className="mad-form" action={submit} noValidate>
      <input type="hidden" name="project" value={projectId} />

      {attached ? (
        <>
          <input type="hidden" name="tenant" value={saved.tenantId ?? ""} />
          <input type="hidden" name="slug" value={saved.slug ?? ""} />
          <div className="mad-field">
            <span className="mad-field-label">Address</span>
            <p className="mad-stated">
              /{developer?.slug ?? "…"}/{saved.slug}
            </p>
            <p className="mad-field-hint">
              Fixed. {developer?.name ?? "The developer"} and this address were set when the project
              was completed, and links to it have been sent.
            </p>
          </div>
        </>
      ) : (
        <>
          <div className="mad-field" {...field("tenant")}>
            <label className="mad-field-label" htmlFor={`${id}-tenant`}>
              Developer
            </label>
            {/*
             * `defaultValue`, not `value`. React resets a form's fields when its
             * action returns, and it does not put a controlled select back: after
             * one refusal this read "Choose a developer" while the line under the
             * address still named the developer that had been chosen. A default
             * taken from what the action returned is what the reset restores, and
             * the key remounts the select so that default is marked on its option:
             * React writes `defaultSelected` when a select mounts and never again.
             * The state beside it exists only to draw that line.
             */}
            <select
              key={state.values["tenant"] ?? "unchosen"}
              className="mad-input"
              id={`${id}-tenant`}
              name="tenant"
              defaultValue={state.values["tenant"] ?? saved.tenantId ?? ""}
              aria-describedby={state.field === "tenant" ? `${id}-tenant-error` : undefined}
              onChange={(event) => setTenant(event.target.value)}
            >
              <option value="">Choose a developer</option>
              {developers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <Problem state={state} field="tenant" id={`${id}-tenant-error`} />
          </div>

          <div className="mad-field" {...field("slug")}>
            <div className="mad-idline">
              <label className="mad-field-label" htmlFor={`${id}-slug`}>
                Address
              </label>
              <InfoNote label="a project's address">
                <p>The last part of the link a customer opens.</p>
                <p>It cannot be changed after saving, because links will have been sent.</p>
              </InfoNote>
            </div>
            <input
              className="mad-input"
              id={`${id}-slug`}
              name="slug"
              type="text"
              value={slug}
              placeholder="alder-court"
              maxLength={120}
              autoComplete="off"
              spellCheck={false}
              aria-describedby={`${id}-slug-preview`}
              onChange={(event) => setSlug(event.target.value)}
            />
            <p className="mad-field-hint" id={`${id}-slug-preview`}>
              Customers will open /{chosen?.slug ?? "developer"}/
              {slug.length === 0 ? "project" : slug}
            </p>
            <Problem state={state} field="slug" id={`${id}-slug-error`} />
          </div>
        </>
      )}

      <div className="mad-field" {...field("currency")}>
        <label className="mad-field-label" htmlFor={`${id}-currency`}>
          Currency
        </label>
        <input
          className="mad-input"
          id={`${id}-currency`}
          name="currency"
          type="text"
          list={`${id}-currencies`}
          defaultValue={state.values["currency"] ?? saved.currency ?? ""}
          placeholder="EUR"
          maxLength={3}
          autoComplete="off"
          spellCheck={false}
          aria-describedby={state.field === "currency" ? `${id}-currency-error` : undefined}
        />
        <datalist id={`${id}-currencies`}>
          {currencies.map((code) => (
            <option key={code} value={code} />
          ))}
        </datalist>
        <Problem state={state} field="currency" id={`${id}-currency-error`} />
      </div>

      <div className="mad-field" {...field("locale")}>
        <div className="mad-idline">
          <label className="mad-field-label" htmlFor={`${id}-locale`}>
            Locale
          </label>
          <InfoNote label="what the locale decides">
            <p>How figures, money and dates are written on this project&rsquo;s screens.</p>
          </InfoNote>
        </div>
        <input
          className="mad-input"
          id={`${id}-locale`}
          name="locale"
          type="text"
          defaultValue={state.values["locale"] ?? saved.locale ?? ""}
          placeholder="sk-SK"
          maxLength={35}
          autoComplete="off"
          spellCheck={false}
          aria-describedby={state.field === "locale" ? `${id}-locale-error` : undefined}
        />
        <Problem state={state} field="locale" id={`${id}-locale-error`} />
      </div>

      <div className="mad-field" {...field("timeZone")}>
        <div className="mad-idline">
          <label className="mad-field-label" htmlFor={`${id}-zone`}>
            Time zone
          </label>
          <InfoNote label="what the time zone decides">
            <p>Where a day, a week and a quarter begin and end for this project.</p>
          </InfoNote>
        </div>
        <input
          className="mad-input"
          id={`${id}-zone`}
          name="timeZone"
          type="text"
          list={`${id}-zones`}
          defaultValue={state.values["timeZone"] ?? saved.timeZone ?? ""}
          placeholder="Europe/Bratislava"
          maxLength={64}
          autoComplete="off"
          spellCheck={false}
          aria-describedby={state.field === "timeZone" ? `${id}-zone-error` : undefined}
        />
        <datalist id={`${id}-zones`}>
          {timeZones.map((zone) => (
            <option key={zone} value={zone} />
          ))}
        </datalist>
        <Problem state={state} field="timeZone" id={`${id}-zone-error`} />
      </div>

      <FormProblem state={state} />
      <div className="mad-form-actions">
        <button
          className="mad-submit mad-button"
          data-emphasis="primary"
          type="submit"
          disabled={pending}
        >
          {pending ? "Saving…" : attached ? "Save settings" : "Save and fix the address"}
        </button>
        <Done state={state} />
      </div>
    </form>
  );
}

/* --- who may see it ----------------------------------------------------------------------- */

export function GrantViewerForm({
  projectId,
  accounts,
}: {
  readonly projectId: string;
  readonly accounts: readonly { readonly accountId: string; readonly label: string }[];
}) {
  const [state, submit, pending] = useActionState(grantViewerAction, IDLE);
  const id = useId();

  return (
    <form className="mad-form" action={submit} noValidate>
      <input type="hidden" name="project" value={projectId} />
      <div className="mad-field" data-invalid={state.field === "viewer" ? "true" : undefined}>
        <label className="mad-field-label" htmlFor={`${id}-viewer`}>
          Give this project to
        </label>
        <select
          className="mad-input"
          id={`${id}-viewer`}
          name="viewer"
          defaultValue=""
          aria-describedby={state.field === "viewer" ? `${id}-viewer-error` : undefined}
        >
          <option value="">Choose an account</option>
          {accounts.map((account) => (
            <option key={account.accountId} value={account.accountId}>
              {account.label}
            </option>
          ))}
        </select>
        <Problem state={state} field="viewer" id={`${id}-viewer-error`} />
      </div>
      <FormProblem state={state} />
      <div className="mad-form-actions">
        <button
          className="mad-submit mad-button"
          data-emphasis="primary"
          type="submit"
          disabled={pending}
        >
          {pending ? "Granting…" : "Grant access"}
        </button>
        <Done state={state} />
      </div>
    </form>
  );
}

/* --- the name of somebody who presents ------------------------------------------------------ */

export function AgentNameForm({
  projectId,
  agentRef,
  name,
}: {
  readonly projectId: string;
  readonly agentRef: string;
  readonly name: string | null;
}) {
  const [state, submit, pending] = useActionState(nameAgentAction, IDLE);
  const id = useId();

  return (
    <form className="mad-form" action={submit} noValidate>
      <input type="hidden" name="project" value={projectId} />
      <input type="hidden" name="agent" value={agentRef} />
      <div className="mad-field" data-invalid={state.field === "name" ? "true" : undefined}>
        <label className="mad-field-label" htmlFor={`${id}-name`}>
          Name shown on meetings
        </label>
        <input
          className="mad-input"
          id={`${id}-name`}
          name="name"
          type="text"
          defaultValue={state.values["name"] ?? name ?? ""}
          placeholder="Monika Kováčová"
          maxLength={120}
          autoComplete="off"
          aria-describedby={state.field === "name" ? `${id}-name-error` : undefined}
        />
        <Problem state={state} field="name" id={`${id}-name-error`} />
      </div>
      <FormProblem state={state} />
      <div className="mad-form-actions">
        <button className="mad-submit mad-button" type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save name"}
        </button>
        {name === null ? null : (
          /*
           * A SECOND VERB ON THE SAME ROW, not a second form.
           *
           * `formAction` sends this button's press to the removal instead of the
           * save, with the project and agent already in the hidden fields above.
           * Its answer does not come back through `useActionState` — there is
           * nothing to say that the re-rendered row does not — so the button
           * offers no "Removed." of its own, and the name simply goes.
           *
           * Only where there is a name: a control that would do nothing is the
           * one this product forbids most plainly.
           */
          <button
            className="mad-button"
            type="submit"
            formAction={withdrawAgentNameAction}
            disabled={pending}
          >
            Remove name
          </button>
        )}
        <Done state={state} />
      </div>
    </form>
  );
}
