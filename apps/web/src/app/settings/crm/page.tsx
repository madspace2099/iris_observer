import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import {
  DEFAULT_LANGUAGE,
  type IrisLedSource,
  type ProjectSummary,
  type TenantSummary,
} from "@observer/readmodels";
import type { ConnectorKind } from "@observer/contracts";

import { repository } from "@/lib/repository";
import { requireAccount, requireViewer } from "@/lib/session";
import { companyOf, mayConnectCrm } from "@/lib/accounts";
import { mapToLines } from "@/lib/connectors/configs";
import { dynamicRoute } from "@/lib/href";
import { controlPlane } from "@/lib/sources/control-plane";
import { controlPlaneProjectFor } from "@/lib/directory/rows";
import { liveConnectorService } from "@/lib/connectors/live";
import type { ConnectorSummary, LastDealSync } from "@/lib/connectors/service";
import { encryptionConfigured } from "@/lib/credentials/envelope";
import { SettingsFrame, originFrom } from "../chrome";
import { CrmForm } from "./CrmForm";
import {
  connectMonday,
  connectRealpad,
  switchOff,
  uploadDealsCsv,
  uploadFlatsCsv,
} from "./actions";

export const metadata: Metadata = { title: "CRM" };

/**
 * ACCOUNT SETTINGS — CONNECT YOUR CRM (ADR-0049).
 *
 * The owner: "the user must be able to add their own CRM system, e.g. Realpad,
 * Monday.com, Google Sheet, other real estate CRMs". This is where. For every
 * project the account holds it says what the CRM state is — connected, not
 * connected, or the demonstration CRM — what it reads and when it last read,
 * and then offers the providers, each saying plainly what it supports.
 *
 * ## Only forms that work
 *
 * A form is drawn only where saving it would do something: the reader is the
 * admin of the company that develops the project (ADR-0043: admins act,
 * members read; an agency selling the project reads it too), or MADSPACE; the
 * project stands on this server's control plane; and — for a login or a token —
 * the server holds a credential key to seal it under. Anywhere else the tile
 * says why not. A demonstration project's CRM is built in, so it shows as
 * connected with what it reads, and no form. Google Sheets has no connector of its own: Observer
 * does not read a live sheet, so its tile says to download the sheet as CSV.
 *
 * ## Credentials
 *
 * Typed by the person, in uncontrolled password fields, posted to a server
 * action that hands them to the connector service and drops them. Nothing on
 * this page can show a stored credential: the service returns four characters.
 */
export default async function CrmSettings({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const account = await requireAccount();
  const viewer = await requireViewer();
  const raw = (await searchParams)["from"];
  const origin = await originFrom(viewer, Array.isArray(raw) ? raw[0] : raw);
  const company = companyOf(account);
  const admin = company.role === "admin";

  const plane = await controlPlane();
  const service = plane.ok ? await liveConnectorService() : null;
  const sealable = encryptionConfigured(process.env);

  const held: { readonly tenant: TenantSummary; readonly project: ProjectSummary }[] = [];
  for (const tenant of await repository.listTenants(viewer)) {
    for (const project of await repository.listProjects(viewer, tenant.id)) {
      held.push({ tenant, project });
    }
  }

  /* One read at a time: the repository holds each project's sources while it reads it. */
  const rows: ProjectRow[] = [];
  for (const { tenant, project } of held) {
    const view = await repository.getIrisLedSales({
      viewer,
      tenantSlug: tenant.slug,
      projectSlug: project.slug,
      period: "quarter_to_date",
      language: DEFAULT_LANGUAGE,
    });
    const uuid = service === null ? null : await controlPlaneProjectFor(project);
    rows.push({
      tenant,
      project,
      source: view.source,
      live: uuid !== null && service !== null,
      owner: mayConnectCrm(account, viewer, tenant),
      connectors: uuid === null || service === null ? [] : await service.list(uuid),
      deals: uuid === null || service === null ? new Map() : await service.dealSummary(uuid),
    });
  }

  return (
    <SettingsFrame
      displayName={account.displayName}
      roleWord={admin ? "Company admin" : "Member"}
      roleTitle={admin ? `Company admin, ${company.name}` : `Member, ${company.name}`}
      origin={origin}
      current="crm"
    >
      <div className="ox-head">
        <div className="ox-head-text">
          <p className="ox-kicker">Account settings · {company.name}</p>
          <h1 className="ox-title">Connect your CRM</h1>
          <p className="ox-lede">
            Your CRM says when a flat is reserved or sold. With it, Sales Flow shows which of those
            sales the IRIS showroom showed first, how often and how long before.{" "}
            {admin
              ? "As your company's admin you connect it here for each project your company develops."
              : `${company.adminName}, your company's admin, connects it; you can see what each project reads.`}
          </p>
        </div>
      </div>

      {plane.ok ? null : (
        <p className="os-note">
          This server has no control plane, so no CRM can be connected from it. A demonstration
          project&rsquo;s CRM is built in and needs none.
        </p>
      )}

      {rows.length === 0 ? (
        <p className="os-note">Your account holds no project yet, so there is no CRM to connect.</p>
      ) : (
        rows.map((row) => (
          <ProjectPanel
            key={`${row.tenant.slug}/${row.project.slug}`}
            row={row}
            adminName={company.adminName}
            companyName={company.name}
            sealable={sealable}
          />
        ))
      )}
    </SettingsFrame>
  );
}

interface ProjectRow {
  readonly tenant: TenantSummary;
  readonly project: ProjectSummary;
  readonly source: IrisLedSource | null;
  /** The project stands on this server's control plane: a form here would be saved. */
  readonly live: boolean;
  /** The reader may connect this project's CRM: its developer's admin, or MADSPACE (ADR-0049). */
  readonly owner: boolean;
  readonly connectors: readonly ConnectorSummary[];
  readonly deals: ReadonlyMap<string, LastDealSync>;
}

/** In the project's own zone, named, as every other date about the project is. */
function when(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  });
}

/** What a stored map looks like in a form: one line per entry, as the MADSPACE form draws it. */
const lines = (config: Record<string, unknown> | undefined, key: string): string =>
  mapToLines(config?.[key] as Record<string, unknown> | null | undefined);

function ProjectPanel({
  row,
  adminName,
  companyName,
  sealable,
}: {
  readonly row: ProjectRow;
  readonly adminName: string;
  readonly companyName: string;
  readonly sealable: boolean;
}) {
  const { project, source } = row;
  const demonstration = source?.connector === "synthetic";
  const headingId = `crm-${row.tenant.slug}-${project.slug}`;
  /* Forms where a save would land: the developer's admin (or MADSPACE), on a project the control plane holds. */
  const acts = row.owner && row.live && !demonstration;
  const connector = (kind: ConnectorKind) => row.connectors.find((c) => c.kind === kind) ?? null;
  const config = (kind: ConnectorKind) => connector(kind)?.config;
  const zone = project.timeZone;
  /* The CRM is another company's: the developer's, read here by the agency that sells for it. */
  const theirs = companyName !== row.tenant.name && !row.owner;
  const irisLed = `/${row.tenant.slug}/${project.slug}/flow/iris-led`;

  return (
    <section className="ox-panel ox-panel-pad os-column" aria-labelledby={headingId}>
      <div className="ox-section-head">
        <h2 className="ox-section-title" id={headingId}>
          {project.name}
        </h2>
      </div>

      <div className="os-provider">
        <div className="os-provider-head">
          <h3 className="os-provider-name">CRM</h3>
          <span className="os-provider-state" data-muted={source === null ? "true" : undefined}>
            <span className="os-dot" aria-hidden="true" />
            {source === null
              ? "Not connected"
              : demonstration
                ? "Demonstration CRM, connected"
                : `Connected · ${source.name}`}
          </span>
        </div>
        {source === null ? (
          <p className="os-note">
            Nothing is read yet, so Sales Flow cannot say which sales IRIS showed first.
            {!row.live
              ? " This project is not on this server's control plane; MADSPACE connects its CRM."
              : row.owner
                ? " Choose a provider below."
                : theirs
                  ? ` The admin of ${row.tenant.name} can connect one.`
                  : ` ${adminName} can connect one.`}
          </p>
        ) : (
          <>
            <p className="os-note">
              Reads {source.reads.join("; ")}.
              {source.readAtDisplay === null ? "" : ` Last read ${source.readAtDisplay}.`}
            </p>
            {demonstration ? (
              <p className="os-note">
                This is a demonstration project: its CRM is the demonstration CRM built into IRIS
                Observer, so there is nothing to connect. A live project connects its own CRM on
                this page.
              </p>
            ) : null}
            <p className="os-note">
              <Link href={dynamicRoute(`${irisLed}?period=quarter_to_date`)}>
                Open IRIS-led sales for {project.name}
              </Link>
            </p>
          </>
        )}
      </div>

      {/* --- Realpad ------------------------------------------------------------ */}
      <Provider
        name="Realpad"
        state={connector("realpad")}
        deals={row.deals.get("realpad") ?? null}
        zone={zone}
        supports="Reads the price list over REALPAD's API: every flat's availability, once when you save here, and once a day at 06:00 UTC where this server's scheduled sync is switched on. A flat that moves from available to reserved or sold between two reads is dated by the read that saw it, so the first read dates nothing. Deals, with the date of each stage, come from REALPAD's business-case export once its column ids are mapped with MADSPACE; a Data Takeout pair stored for them is kept when you replace the price-list pair here."
      >
        {!acts ? null : !sealable ? (
          <NoSeal />
        ) : (
          <CrmForm
            action={connectRealpad}
            tenant={row.tenant.slug}
            project={project.slug}
            submit="Save and read now"
          >
            <Field id={`${headingId}-rp-login`} name="login" label="Price-list login" />
            <Field
              id={`${headingId}-rp-password`}
              name="password"
              label="Price-list password"
              type="password"
            />
            <Field
              id={`${headingId}-rp-dev`}
              name="developerId"
              label="Developer id"
              numeric
              value={String(connector("realpad")?.config["developerId"] ?? "")}
            />
            <Field
              id={`${headingId}-rp-project`}
              name="realpadProjectId"
              label="Project id"
              numeric
              value={String(connector("realpad")?.config["projectId"] ?? "")}
            />
            <Field
              id={`${headingId}-rp-screen`}
              name="screenId"
              label="Screen id"
              numeric
              value={String(connector("realpad")?.config["screenId"] ?? "")}
            />
            <p className="os-note">
              The login and password REALPAD support issued for this project&rsquo;s price list.
              Leave both empty to keep the stored pair. Saving reads the price list once.
            </p>
          </CrmForm>
        )}
        {acts ? <Off kind="realpad" row={row} state={connector("realpad")} /> : null}
      </Provider>

      {/* --- Monday.com ---------------------------------------------------------- */}
      <Provider
        name="Monday.com"
        state={connector("monday")}
        deals={row.deals.get("monday") ?? null}
        zone={zone}
        supports="Reads a board with one item per flat and a status column for its availability, once when you save here, and once a day at 06:00 UTC where this server's scheduled sync is switched on. Deals come from a second board once its columns and stage words are mapped with MADSPACE."
      >
        {!acts ? null : !sealable ? (
          <NoSeal />
        ) : (
          <CrmForm
            action={connectMonday}
            tenant={row.tenant.slug}
            project={project.slug}
            submit="Save and read now"
          >
            <Field id={`${headingId}-md-token`} name="token" label="API token" type="password" />
            <Field
              id={`${headingId}-md-board`}
              name="boardId"
              label="Board id"
              value={String(connector("monday")?.config["boardId"] ?? "")}
            />
            <Lines
              id={`${headingId}-md-columns`}
              name="columns"
              label="Columns"
              value={lines(config("monday"), "columns")}
              hint="One per line: code=column id, status=column id. Code is required."
            />
            <Lines
              id={`${headingId}-md-status`}
              name="statusMap"
              label="Status words"
              value={lines(config("monday"), "statusMap")}
              hint="One per line: your label=available, reserved or sold."
            />
          </CrmForm>
        )}
        {acts ? <Off kind="monday" row={row} state={connector("monday")} /> : null}
      </Provider>

      {/* --- Google Sheets ------------------------------------------------------- */}
      <Provider
        name="Google Sheets"
        state={null}
        deals={null}
        supports="Not read directly: IRIS Observer has no Google connector and does not read a live sheet. Download the sheet as CSV (File, Download, Comma-separated values) and upload it under CSV upload. Each upload is compared with the last, so a flat whose status changed is dated by the upload that first saw it."
      />

      {/* --- CSV upload ---------------------------------------------------------- */}
      <Provider
        name="CSV upload"
        state={connector("csv")}
        deals={row.deals.get("csv") ?? null}
        zone={zone}
        supports="A flats sheet (a code column and a status column) and, if you keep one, a deals sheet (deal id, stage, flat code, and the date each stage was entered). A stage date needs a time and a zone, as in 2026-08-12T14:00+02:00: a date alone cannot be placed against a showing, and such a deal is counted as undated."
      >
        {acts ? (
          <>
            <CrmForm
              action={uploadFlatsCsv}
              tenant={row.tenant.slug}
              project={project.slug}
              submit="Upload flats"
            >
              <Lines
                id={`${headingId}-csv-columns`}
                name="columns"
                label="Flats columns"
                value={lines(config("csv"), "columns")}
                hint="One per line: code=header, status=header. Code is required."
              />
              <Lines
                id={`${headingId}-csv-status`}
                name="statusMap"
                label="Status words"
                value={lines(config("csv"), "statusMap")}
                hint="One per line: your word=available, reserved or sold."
              />
              <FileField id={`${headingId}-csv-file`} label="Flats sheet (.csv)" />
            </CrmForm>
            <CrmForm
              action={uploadDealsCsv}
              tenant={row.tenant.slug}
              project={project.slug}
              submit="Upload deals"
            >
              <Lines
                id={`${headingId}-csv-deals`}
                name="dealColumns"
                label="Deals columns"
                value={lines(config("csv"), "dealColumns")}
                hint="One per line: externalId=header, stage=header, unitCode=header, stageEnteredAt=header."
              />
              <Lines
                id={`${headingId}-csv-stages`}
                name="stageMap"
                label="Stage words"
                value={lines(config("csv"), "stageMap")}
                hint="One per line: your word=lead, meeting, negotiation, offer, reservation, purchase or lost."
              />
              <FileField id={`${headingId}-csv-deals-file`} label="Deals sheet (.csv)" />
            </CrmForm>
            <Off kind="csv" row={row} state={connector("csv")} />
          </>
        ) : null}
      </Provider>

      {/* --- Other --------------------------------------------------------------- */}
      <Provider
        name="Other real-estate CRM"
        state={null}
        deals={null}
        supports="Export its price list, and its deals if it keeps them, as CSV and upload them under CSV upload. Lomnio connects through MADSPACE with its API token and signed webhooks. There is no general webhook receiver: another CRM that pushes changes needs an adapter, which MADSPACE builds."
      />

      {acts || demonstration ? null : (
        <p className="os-note">
          {row.owner
            ? "Forms appear here once MADSPACE has put this project on the control plane."
            : theirs
              ? `This project's CRM belongs to ${row.tenant.name}: its admin connects it, and ${companyName} reads what it holds here.`
              : `Only ${adminName}, your company's admin, can connect a CRM.`}
        </p>
      )}
    </section>
  );
}

function Provider({
  name,
  state,
  deals,
  zone = "UTC",
  supports,
  children = null,
}: {
  readonly name: string;
  readonly state: ConnectorSummary | null;
  readonly deals: LastDealSync | null;
  /** The project's zone, for when it last read. */
  readonly zone?: string;
  readonly supports: string;
  readonly children?: ReactNode;
}) {
  const on = state?.enabled === true;
  return (
    <div className="os-provider">
      <div className="os-provider-head">
        <h3 className="os-provider-name">{name}</h3>
        {state === null || !state.configured ? null : (
          <span className="os-provider-state" data-muted={on ? undefined : "true"}>
            <span className="os-dot" aria-hidden="true" />
            {on ? "Switched on" : "Switched off"}
            {state.credentialTail === null ? null : (
              <>
                {" "}
                · <span className="os-mask">••••{state.credentialTail}</span>
              </>
            )}
          </span>
        )}
      </div>
      <p className="os-note">{supports}</p>
      {state?.lastSync == null ? null : (
        <p className="os-note">
          Flats last read <time dateTime={state.lastSync.at}>{when(state.lastSync.at, zone)}</time>:{" "}
          {state.lastSync.outcome === "ok"
            ? `${String(state.lastSync.fetched ?? 0)} flats.`
            : state.lastSync.detail}
        </p>
      )}
      {deals === null ? null : (
        <p className="os-note">
          Deals last read <time dateTime={deals.at}>{when(deals.at, zone)}</time>:{" "}
          {deals.outcome === "ok" ? `${String(deals.fetched)} deals.` : deals.detail}
        </p>
      )}
      {children}
    </div>
  );
}

function NoSeal() {
  return (
    <p className="os-note">
      This server holds no credential key, so a login or a token cannot be stored here. A CSV upload
      needs none.
    </p>
  );
}

function Off({
  kind,
  row,
  state,
}: {
  readonly kind: "realpad" | "monday" | "csv";
  readonly row: ProjectRow;
  readonly state: ConnectorSummary | null;
}) {
  if (state?.enabled !== true) return null;
  return (
    <CrmForm
      action={switchOff}
      tenant={row.tenant.slug}
      project={row.project.slug}
      submit="Switch off"
    >
      <input type="hidden" name="connector" value={kind} />
    </CrmForm>
  );
}

function Field({
  id,
  name,
  label,
  type = "text",
  numeric = false,
  value = "",
}: {
  readonly id: string;
  readonly name: string;
  readonly label: string;
  readonly type?: "text" | "password";
  readonly numeric?: boolean;
  readonly value?: string;
}) {
  return (
    <label className="ox-field" htmlFor={id}>
      <span className="ox-field-label">{label}</span>
      <input
        className="ox-input"
        id={id}
        name={name}
        type={type}
        defaultValue={type === "password" ? undefined : value}
        inputMode={numeric ? "numeric" : undefined}
        /* A CRM credential is not this reader's password for anything: nothing should save or fill it. */
        autoComplete="off"
        spellCheck={false}
        autoCapitalize="off"
      />
    </label>
  );
}

function Lines({
  id,
  name,
  label,
  value,
  hint,
}: {
  readonly id: string;
  readonly name: string;
  readonly label: string;
  /** What is stored now: a form sent back as drawn keeps it. */
  readonly value: string;
  readonly hint: string;
}) {
  return (
    <label className="ox-field" htmlFor={id}>
      <span className="ox-field-label">{label}</span>
      <textarea
        className="ox-input"
        id={id}
        name={name}
        rows={3}
        defaultValue={value}
        spellCheck={false}
        aria-describedby={`${id}-hint`}
      />
      <span className="os-note" id={`${id}-hint`}>
        {hint}
      </span>
    </label>
  );
}

function FileField({ id, label }: { readonly id: string; readonly label: string }) {
  return (
    <label className="ox-field" htmlFor={id}>
      <span className="ox-field-label">{label}</span>
      <input className="ox-input" id={id} name="file" type="file" accept=".csv,text/csv" required />
    </label>
  );
}
