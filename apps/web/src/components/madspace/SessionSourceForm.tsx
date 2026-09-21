"use client";

import { useActionState, useId } from "react";

import type { ShowroomSourceKind } from "@observer/contracts";

import { AUTHORISED_SUPABASE_SHOWROOM_URL } from "@/lib/connectors/session-source-configs";
import {
  saveSessionSourceAction,
  type SaveSessionSourceState,
} from "@/lib/madspace/session-source-actions";

/**
 * One showroom-telemetry source's settings and its credential — the mirror of
 * `ConnectorForm`, deliberately smaller. A CRM connector asks an operator to
 * type a project id, a screen id, a column map; this source has exactly one
 * authorised project, so the URL is shown rather than asked for, and the only
 * thing an operator types is the anon key.
 *
 * The credential field is empty on load for the same reason `ConnectorForm`
 * leaves its own empty: a stored credential is never shown, not even masked,
 * and typing replaces it while leaving it blank keeps what is stored.
 */

const FIELDS = ["url", "token"] as const;

export interface SessionSourceFormProps {
  readonly projectId: string;
  readonly kind: ShowroomSourceKind;
  readonly name: string;
  readonly configured: boolean;
  readonly enabled: boolean;
  readonly hasCredential: boolean;
}

const IDLE: SaveSessionSourceState = { problem: null, field: null, saved: false };

export function SessionSourceForm({
  projectId,
  kind,
  name,
  configured,
  enabled,
  hasCredential,
}: SessionSourceFormProps) {
  const [state, submit, pending] = useActionState(saveSessionSourceAction, IDLE);
  const base = useId();
  const id = (field: string) => `${base}-${field}`;
  const failing = FIELDS.includes(state.field as (typeof FIELDS)[number])
    ? (state.field as (typeof FIELDS)[number])
    : null;
  const invalid = (field: string) => (failing === field ? "true" : undefined);
  const Problem = ({ field }: { field: string }) =>
    failing === field && state.problem !== null ? (
      <p className="mad-field-error" id={`${id(field)}-problem`} role="alert">
        {state.problem}
      </p>
    ) : null;

  const credentialHint = hasCredential
    ? "A credential is stored. Leave this empty to keep it; type to replace it."
    : "No credential stored yet.";

  return (
    <form className="mad-form" action={submit} noValidate>
      <input type="hidden" name="project" value={projectId} />
      <input type="hidden" name="kind" value={kind} />
      {/*
       * A hidden field, not a disabled input: a disabled control is never
       * submitted, which would post no `url` at all and read as a missing
       * field rather than the one fixed value this source accepts. Shown to
       * the operator as read-only text just below, so nothing about the
       * connection is invisible.
       */}
      <input type="hidden" name="url" value={AUTHORISED_SUPABASE_SHOWROOM_URL} />

      <div className="mad-field">
        <span className="mad-field-label">Project URL</span>
        <p className="mad-field-hint">
          The one Supabase project this source is authorised for. Not editable here: a different
          project needs its own source kind.
        </p>
        <p className="mad-code">{AUTHORISED_SUPABASE_SHOWROOM_URL}</p>
        <Problem field="url" />
      </div>

      <div className="mad-field">
        <span className="mad-field-label">Credential</span>
        <p className="mad-field-hint">{credentialHint}</p>
      </div>
      <div className="mad-field" data-invalid={invalid("token")}>
        <label className="mad-field-label" htmlFor={id("token")}>
          Anon API key
        </label>
        <p className="mad-field-hint">
          The project&rsquo;s own anon-role key, issued for read access under row-level security.
          Never a service-role key.
        </p>
        <input
          className="mad-input"
          id={id("token")}
          name="token"
          type="password"
          autoComplete="new-password"
          spellCheck={false}
          aria-invalid={invalid("token") === undefined ? undefined : true}
          aria-describedby={invalid("token") === undefined ? undefined : `${id("token")}-problem`}
        />
        <Problem field="token" />
      </div>

      <div className="mad-field">
        <div className="mad-choice">
          <input type="checkbox" id={id("enabled")} name="enabled" defaultChecked={enabled} />
          <label className="mad-choice-name" htmlFor={id("enabled")}>
            Enabled
          </label>
          <span className="mad-choice-detail">
            An enabled source is the one Sync now reads and the one Observer&rsquo;s product pages
            draw sessions from.
          </span>
        </div>
      </div>

      {state.problem === null || failing !== null ? null : (
        <p className="mad-form-problem" role="alert">
          {state.problem}
        </p>
      )}
      <p className="mad-said" role="status" aria-live="polite">
        {state.saved && state.problem === null ? "Saved." : ""}
      </p>

      <div className="mad-form-actions">
        <button
          className="mad-submit mad-button"
          data-emphasis="primary"
          type="submit"
          disabled={pending}
        >
          {pending ? "Saving…" : configured ? `Save ${name} settings` : `Connect ${name}`}
        </button>
      </div>
    </form>
  );
}
