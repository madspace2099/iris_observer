"use client";

import { useActionState, useId } from "react";

import type { ConnectorKind } from "@observer/contracts";

import { InfoNote } from "@/components/madspace/InfoNote";
import { mapToLines } from "@/lib/connectors/configs";
import { saveConnectorAction, type SaveConnectorState } from "@/lib/madspace/connector-actions";

/**
 * One connector's settings and, where it has one, its credential.
 *
 * ## The credential fields are empty on purpose
 *
 * A stored credential is never shown, not even masked — the screen carries
 * four characters beside the form so an operator can tell which one is in.
 * Leaving the fields empty on save keeps what is stored; typing replaces it.
 * That is the same rule the provider-credential screen follows, and it is why
 * there is no "reveal" anywhere on this surface.
 *
 * ## Why mapping tables are typed as lines
 *
 * `raw=canonical` per line is what an operator can paste from a CRM's own
 * status list and read back a month later. A grid of selects for a vocabulary
 * nobody has seen yet would have to guess its size.
 */

export interface ConnectorFormProps {
  readonly projectId: string;
  readonly kind: ConnectorKind;
  readonly name: string;
  readonly configured: boolean;
  readonly enabled: boolean;
  readonly config: Record<string, unknown>;
  readonly hasCredential: boolean;
}

const IDLE: SaveConnectorState = { problem: null, field: null, saved: false };

function stringOf(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

export function ConnectorForm({
  projectId,
  kind,
  name,
  configured,
  enabled,
  config,
  hasCredential,
}: ConnectorFormProps) {
  const [state, submit, pending] = useActionState(saveConnectorAction, IDLE);
  const base = useId();
  const id = (field: string) => `${base}-${field}`;
  const invalid = (field: string) => (state.field === field ? "true" : undefined);

  const Field = ({
    field,
    label,
    type = "text",
    placeholder,
    defaultValue,
    hint,
    autoComplete = "off",
  }: {
    field: string;
    label: string;
    type?: "text" | "password";
    placeholder?: string;
    defaultValue?: string;
    hint?: string;
    autoComplete?: string;
  }) => (
    <div className="mad-field" data-invalid={invalid(field)}>
      <label className="mad-field-label" htmlFor={id(field)}>
        {label}
      </label>
      {hint === undefined ? null : <p className="mad-field-hint">{hint}</p>}
      <input
        className="mad-input"
        id={id(field)}
        name={field}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        autoComplete={autoComplete}
        spellCheck={false}
        aria-invalid={invalid(field) === undefined ? undefined : true}
      />
    </div>
  );

  const Lines = ({
    field,
    label,
    hint,
    placeholder,
    defaultValue,
  }: {
    field: string;
    label: string;
    hint: string;
    placeholder: string;
    defaultValue: string;
  }) => (
    <div className="mad-field" data-invalid={invalid(field)}>
      <label className="mad-field-label" htmlFor={id(field)}>
        {label}
      </label>
      <p className="mad-field-hint">{hint}</p>
      <textarea
        className="mad-input"
        id={id(field)}
        name={field}
        rows={5}
        defaultValue={defaultValue}
        placeholder={placeholder}
        spellCheck={false}
      />
    </div>
  );

  const credentialHint = hasCredential
    ? "A credential is stored. Leave these empty to keep it; type to replace it."
    : "No credential stored yet.";

  return (
    <form className="mad-form" action={submit} noValidate>
      <input type="hidden" name="project" value={projectId} />
      <input type="hidden" name="connector" value={kind} />

      {kind === "realpad" ? (
        <>
          <Field
            field="developerId"
            label="Developer id"
            defaultValue={stringOf(config["developerId"])}
            placeholder="3230279"
            hint="Issued with the pricelist credential. Numeric."
          />
          <Field
            field="realpadProjectId"
            label="REALPAD project id"
            defaultValue={stringOf(config["projectId"])}
            placeholder="3356887"
            hint="From list-projects, or from REALPAD support."
          />
          <Field
            field="screenId"
            label="Screen id"
            defaultValue={stringOf(config["screenId"])}
            placeholder="2"
            hint="A constant supplied together with the credential."
          />
          <div className="mad-field">
            <div className="mad-choice">
              <input
                type="checkbox"
                id={id("includeHidden")}
                name="includeHidden"
                defaultChecked={config["includeHidden"] === true}
              />
              <label className="mad-choice-name" htmlFor={id("includeHidden")}>
                Include hidden units
              </label>
              <span className="mad-choice-detail">
                Units REALPAD hides from the public pricelist are fetched too.
              </span>
            </div>
          </div>
          <div className="mad-field">
            <span className="mad-field-label">
              Credential
              <InfoNote label="what REALPAD issues and how it is kept">
                <p>
                  REALPAD issues a login and password per project and per use case. The pricelist
                  pair is the one this connector needs; it is sealed under this server&rsquo;s key
                  and never shown again.
                </p>
              </InfoNote>
            </span>
            <p className="mad-field-hint">{credentialHint}</p>
          </div>
          <Field
            field="login"
            label="Login"
            placeholder="project-name-pricelist"
            autoComplete="username"
          />
          <Field field="password" label="Password" type="password" autoComplete="new-password" />
        </>
      ) : null}

      {kind === "lomnio" ? (
        <>
          <div className="mad-field">
            <span className="mad-field-label">Credential</span>
            <p className="mad-field-hint">{credentialHint}</p>
          </div>
          <Field
            field="token"
            label="API token"
            type="password"
            autoComplete="new-password"
            hint="Project-scoped, with units:read. Never a browser key."
          />
          <Field
            field="signingSecret"
            label="Webhook signing secret"
            type="password"
            autoComplete="new-password"
            hint="Optional. Only needed when Lomnio pushes unit changes to Observer."
          />
          <Lines
            field="statusMap"
            label="Status words"
            hint="One per line, raw=canonical. Canonical: available, pre_reserved, reserved, sold, not_for_sale, delayed."
            placeholder={"rezervace=reserved\nprodano=sold"}
            defaultValue={mapToLines(config["statusMap"] as Record<string, unknown> | undefined)}
          />
        </>
      ) : null}

      {kind === "monday" ? (
        <>
          <Field
            field="boardId"
            label="Board id"
            defaultValue={stringOf(config["boardId"])}
            placeholder="1234567890"
            hint="The number in the board's URL."
          />
          <div className="mad-field">
            <span className="mad-field-label">Credential</span>
            <p className="mad-field-hint">{credentialHint}</p>
          </div>
          <Field
            field="token"
            label="API token"
            type="password"
            autoComplete="new-password"
            hint="A personal or app token. It mirrors that user's own permissions."
          />
          <Lines
            field="columns"
            label="Columns"
            hint="One per line, field=column id. Fields: code, building, floor, rooms, layout, unitType, interiorSqm, exteriorSqm, grossSqm, priceWithVat, priceWithoutVat, currency, orientation, status, availableFrom, updatedAt. The item's name is column id name."
            placeholder={"code=name\nrooms=numbers_1\npriceWithVat=numbers_2\nstatus=status"}
            defaultValue={mapToLines(config["columns"] as Record<string, unknown> | undefined)}
          />
          <Lines
            field="statusMap"
            label="Status words"
            hint="One per line, raw=canonical."
            placeholder={"Foglalt=reserved\nEladva=sold"}
            defaultValue={mapToLines(config["statusMap"] as Record<string, unknown> | undefined)}
          />
        </>
      ) : null}

      {kind === "csv" ? (
        <>
          <Lines
            field="columns"
            label="Columns"
            hint="One per line, field=header as it appears in the sheet. Fields: code, building, floor, rooms, layout, unitType, interiorSqm, exteriorSqm, grossSqm, priceWithVat, priceWithoutVat, currency, orientation, status, availableFrom, updatedAt."
            placeholder={"code=Kód\nrooms=Szobák\npriceWithVat=Ár (bruttó)\nstatus=Státusz"}
            defaultValue={mapToLines(config["columns"] as Record<string, unknown> | undefined)}
          />
          <Lines
            field="statusMap"
            label="Status words"
            hint="One per line, raw=canonical."
            placeholder={"szabad=available\nfoglalt=reserved\neladva=sold"}
            defaultValue={mapToLines(config["statusMap"] as Record<string, unknown> | undefined)}
          />
        </>
      ) : null}

      <Field
        field="currency"
        label="Currency"
        defaultValue={stringOf(config["currency"])}
        placeholder="EUR"
        hint="ISO 4217, three letters. Applied when the source does not name one."
      />

      <div className="mad-field">
        <div className="mad-choice">
          <input type="checkbox" id={id("enabled")} name="enabled" defaultChecked={enabled} />
          <label className="mad-choice-name" htmlFor={id("enabled")}>
            Enabled
          </label>
          <span className="mad-choice-detail">
            {kind === "csv"
              ? "An enabled spreadsheet connector is the one the catalogue reads."
              : "An enabled connector is synced on the daily schedule and by Sync now."}
          </span>
        </div>
      </div>

      {state.problem === null ? null : (
        <p className="mad-form-problem" role="alert">
          {state.problem}
        </p>
      )}
      {state.saved && state.problem === null ? (
        <p className="mad-said" role="status">
          Saved.
        </p>
      ) : null}

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
