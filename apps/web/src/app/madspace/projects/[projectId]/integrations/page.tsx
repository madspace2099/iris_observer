import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Kicker } from "@observer/ui";

import { requireViewer } from "@/lib/session";
import { CONTROL_PLANE_ACCOUNT, controlPlane } from "@/lib/sources/control-plane";
import { liveConnectorService } from "@/lib/connectors/live";
import { CREDENTIAL_WORDS } from "@/lib/connectors/configs";
import type { ConnectorSummary, LastDealSync } from "@/lib/connectors/service";
import { ageSince, instant } from "@/lib/madspace/format";
import { ConnectorForm } from "@/components/madspace/ConnectorForm";
import { ConnectorSync } from "@/components/madspace/ConnectorSync";
import { ControlPlaneAbsent } from "@/components/madspace/ControlPlaneAbsent";
import { CsvUpload } from "@/components/madspace/CsvUpload";
import { InfoNote } from "@/components/madspace/InfoNote";
import { StatusChip, type MarkTone } from "@/components/madspace/StatusMark";
import { TableWrap } from "@/components/madspace/TableWrap";

export const metadata: Metadata = { title: "Integrations" };

/**
 * Integrations — the CRM behind one project, and the catalogue it delivers.
 *
 * Four connectors, one enabled at a time in practice: REALPAD, Lomnio, Monday
 * and a spreadsheet. Each plane leads with its state — connected, credential
 * held, last sync and its verdict — before the form that changes it, per
 * principle 02. Nothing here shows a credential, a config secret or a CRM
 * response body; a refusal is a category and a sentence.
 */
export default async function IntegrationsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const viewer = await requireViewer();
  if (viewer.role !== "madspace_admin") redirect("/");

  const { projectId } = await params;
  const plane = await controlPlane();
  const projects = plane.ok
    ? await plane.admin.projectsForAccount({ account: CONTROL_PLANE_ACCOUNT })
    : null;
  const project =
    projects?.ok === true
      ? (projects.value.find((row) => row.project_id === projectId) ?? null)
      : null;

  const service = plane.ok ? await liveConnectorService() : null;
  const connectors = service === null ? null : await service.list(projectId);
  const changes = service === null ? [] : await service.recentChanges(projectId, 20);
  const dealSyncs = service === null ? new Map() : await service.dealSummary(projectId);
  const stageChanges = service === null ? [] : await service.recentDealChanges(projectId, 20);
  /*
   * How much of each delivered catalogue Project can draw. Only for a
   * connector whose last sync succeeded: a refused sync has nothing to place.
   */
  const placements = new Map<string, PlacementSummary>();
  if (service !== null && connectors !== null) {
    for (const c of connectors) {
      if (c.lastSync?.outcome === "ok")
        placements.set(c.kind, await service.placement(projectId, c.kind));
    }
  }
  const now = new Date();

  const active = connectors?.filter((c) => c.enabled) ?? [];
  const configured = connectors?.filter((c) => c.configured && !c.enabled) ?? [];
  /*
   * The situation in one sentence, per principle 02. A connector that is
   * configured but switched off is neither "connected" nor "not connected",
   * and saying the first would hide the switch; saying the second would hide
   * the work already done. So it is named as what it is.
   */
  const synthetic =
    "The catalogue on this project is the synthetic one until a connector is enabled and synced.";
  const lede =
    connectors === null
      ? "The control plane could not be read."
      : active.length > 0
        ? `${active.map((c) => c.name).join(", ")} enabled.`
        : configured.length > 0
          ? `${configured.map((c) => c.name).join(", ")} configured, not enabled. ${synthetic}`
          : `No CRM is connected. ${synthetic}`;

  return (
    <>
      <header className="mad-head">
        <div className="mad-head-text">
          <Kicker>Integrations</Kicker>
          <h1 className="mad-title">{project?.name ?? "Unknown project"}</h1>
          <p className="mad-lede">
            {lede}
            <InfoNote label="how a CRM connection works" align="start">
              <p>
                Every client hands over one credential for their CRM. Observer pulls the whole unit
                catalogue on a schedule, keeps the current snapshot, and records every addition,
                change and withdrawal it finds between two pulls. A CRM that can push changes only
                brings the next pull forward.
              </p>
              <p>
                Status words are the client&rsquo;s own vocabulary and are mapped by a person here
                before a connector is switched on. A word the mapping does not cover is recorded as
                unknown, never guessed.
              </p>
            </InfoNote>
          </p>
        </div>
      </header>

      {!plane.ok ? (
        <ControlPlaneAbsent absence={plane.absence} />
      ) : connectors === null ? (
        <p className="mad-form-problem" role="alert">
          The catalogue store is unavailable on this server.
        </p>
      ) : (
        connectors.map((connector) => (
          <ConnectorPlane
            key={connector.kind}
            projectId={projectId}
            connector={connector}
            placement={placements.get(connector.kind) ?? null}
            deals={(dealSyncs as ReadonlyMap<string, LastDealSync>).get(connector.kind) ?? null}
            now={now}
          />
        ))
      )}

      <section className="mad-plane" aria-labelledby="stages-heading">
        <div className="obs-section-head">
          <h2 id="stages-heading">Recent stage changes</h2>
        </div>
        {stageChanges.length === 0 ? (
          <p className="mad-empty">
            No stage changes recorded yet. The first deal sync records every deal as opened.
          </p>
        ) : (
          <TableWrap labelledBy="stages-heading">
            <table className="mad-table">
              <thead>
                <tr>
                  <th scope="col">Deal</th>
                  <th scope="col">Change</th>
                  <th scope="col">Stage</th>
                  <th scope="col">Unit</th>
                  <th scope="col">Source</th>
                  <th scope="col">At</th>
                </tr>
              </thead>
              {/*
               * Rows keyed by what they show, not by the event id: a key is
               * serialised into the page, and a sixty-four-hex digest in the
               * HTML is indistinguishable from a subject key to any scan. The
               * event id stays in the store, where it does its work.
               */}
              <tbody>
                {stageChanges.map((change) => (
                  <tr
                    key={`${change.external_id}·${change.kind}·${change.to_raw ?? ""}·${change.at}`}
                  >
                    <td className="mad-td-source">
                      <span className="mad-code">{change.external_id}</span>
                    </td>
                    <td>
                      <StatusChip tone={stageTone(change.kind)}>
                        {stageWord(change.kind)}
                      </StatusChip>
                    </td>
                    <td>
                      <span className="mad-td-sub">{stageMove(change)}</span>
                    </td>
                    <td>
                      <span className="mad-td-sub">{change.unit_code ?? "Not stated"}</span>
                    </td>
                    <td>{change.connector}</td>
                    <td className="mad-td-figure">{instant(change.at).text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </section>

      <section className="mad-plane" aria-labelledby="changes-heading">
        <div className="obs-section-head">
          <h2 id="changes-heading">Recent catalogue changes</h2>
        </div>
        {changes.length === 0 ? (
          <p className="mad-empty">
            No changes recorded yet. The first sync records every unit as added.
          </p>
        ) : (
          <TableWrap labelledBy="changes-heading">
            <table className="mad-table">
              <thead>
                <tr>
                  <th scope="col">Unit</th>
                  <th scope="col">Change</th>
                  <th scope="col">Fields</th>
                  <th scope="col">Source</th>
                  <th scope="col">Recorded</th>
                </tr>
              </thead>
              <tbody>
                {changes.map((change, index) => (
                  <tr key={`${change.recorded_at}-${change.code}-${String(index)}`}>
                    <td className="mad-td-source">
                      <span className="mad-code">{change.code}</span>
                    </td>
                    <td>
                      <StatusChip tone={changeTone(change.kind)}>
                        {changeWord(change.kind)}
                      </StatusChip>
                    </td>
                    <td className="mad-td-sub">
                      {Array.isArray(change.changed_fields) && change.changed_fields.length > 0
                        ? change.changed_fields.map(String).join(", ")
                        : change.kind === "added"
                          ? "Every field"
                          : "None"}
                    </td>
                    <td>{change.connector}</td>
                    <td className="mad-td-figure">{instant(change.recorded_at).text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </section>
    </>
  );
}

function changeWord(kind: string): string {
  if (kind === "added") return "Added";
  if (kind === "withdrawn") return "Withdrawn";
  return "Changed";
}

function changeTone(kind: string): MarkTone {
  if (kind === "added") return "good";
  if (kind === "withdrawn") return "settled";
  return "operator";
}

function stageWord(kind: string): string {
  if (kind === "opened") return "Opened";
  if (kind === "withdrawn") return "Withdrawn";
  return "Moved";
}

function stageTone(kind: string): MarkTone {
  if (kind === "opened") return "good";
  if (kind === "withdrawn") return "settled";
  return "operator";
}

/** "meeting → offer" in canonical words, with the source's own word where none is mapped. */
function stageMove(change: {
  readonly from_stage: string | null;
  readonly from_raw: string | null;
  readonly to_stage: string | null;
  readonly to_raw: string | null;
}): string {
  const word = (stage: string | null, raw: string | null) =>
    stage ?? (raw === null ? "none" : `${raw} (not mapped)`);
  if (change.from_raw === null) return word(change.to_stage, change.to_raw);
  if (change.to_raw === null) return `${word(change.from_stage, change.from_raw)} to none`;
  return `${word(change.from_stage, change.from_raw)} to ${word(change.to_stage, change.to_raw)}`;
}

/** Which CRMs this product can pull deals from. REALPAD's arrive as an Excel export, read the same way. */
const DEALS_PULLED: readonly string[] = ["lomnio", "monday", "realpad"];

function syncTone(outcome: string): MarkTone {
  if (outcome === "ok") return "good";
  if (outcome === "rate_limited") return "await";
  return "wrong";
}

function syncWord(outcome: string): string {
  switch (outcome) {
    case "ok":
      return "Synced";
    case "unauthorised":
      return "Credential refused";
    case "rate_limited":
      return "Rate limited";
    case "unavailable":
      return "Source unavailable";
    case "malformed":
      return "Unreadable answer";
    case "misconfigured":
      return "Settings refused";
    default:
      return outcome;
  }
}

interface PlacementSummary {
  readonly total: number;
  readonly placed: number;
  readonly reasons: readonly { readonly reason: string; readonly count: number }[];
  /** What the drawn units are shown without, counted; said on Project in words. */
  readonly gaps: readonly { readonly reason: string; readonly count: number }[];
}

const counted = (list: readonly { readonly reason: string; readonly count: number }[]) =>
  list
    .slice(0, 3)
    .map((r) => `${String(r.count)} ${r.reason}`)
    .join("; ");

function ConnectorPlane({
  projectId,
  connector,
  placement,
  deals,
  now,
}: {
  readonly projectId: string;
  readonly connector: ConnectorSummary;
  readonly placement: PlacementSummary | null;
  /** The last deal sync for this connector, or null when none ran. */
  readonly deals: LastDealSync | null;
  readonly now: Date;
}) {
  const dealsConfigured =
    connector.kind === "lomnio"
      ? true
      : typeof connector.config["dealColumns"] === "object" &&
        connector.config["dealColumns"] !== null;
  const dealsAge = deals === null ? null : ageSince(deals.at, now);
  const state: { word: string; tone: MarkTone } = !connector.configured
    ? { word: "Not connected", tone: "none" }
    : !connector.enabled
      ? { word: "Disabled", tone: "operator" }
      : connector.kind !== "csv" && !connector.hasCredential
        ? { word: "No credential", tone: "await" }
        : { word: "Enabled", tone: "good" };
  const last = connector.lastSync;
  const lastAge = last === null ? null : ageSince(last.at, now);

  return (
    <section className="mad-plane" aria-labelledby={`${connector.kind}-heading`}>
      <div className="obs-section-head">
        <h2 id={`${connector.kind}-heading`}>{connector.name}</h2>
        <StatusChip tone={state.tone}>{state.word}</StatusChip>
      </div>

      <dl className="mad-meta">
        <div className="mad-meta-item">
          <dt className="mad-meta-label">Credential</dt>
          <dd
            className="mad-meta-value"
            data-missing={connector.hasCredential ? undefined : "true"}
          >
            {connector.kind === "csv"
              ? "None needed"
              : connector.hasCredential
                ? `Stored · ends ${connector.credentialTail ?? "····"}`
                : `Not stored. Needs ${CREDENTIAL_WORDS[connector.kind]}.`}
          </dd>
        </div>
        {connector.kind === "lomnio" ? (
          <div className="mad-meta-item">
            <dt className="mad-meta-label">Webhook address</dt>
            <dd className="mad-meta-value">
              <span className="mad-code">{`/api/observer/connectors/lomnio/${projectId}`}</span> on
              this deployment&rsquo;s address. Lomnio signs every delivery with the signing secret
              stored beside the token; an unsigned or wrongly signed delivery is refused.
            </dd>
          </div>
        ) : null}
        <div className="mad-meta-item">
          <dt className="mad-meta-label">Last sync</dt>
          <dd className="mad-meta-value" data-missing={last === null ? "true" : undefined}>
            {last === null ? (
              "Never"
            ) : (
              <>
                <StatusChip tone={syncTone(last.outcome)}>{syncWord(last.outcome)}</StatusChip>{" "}
                {lastAge === null ? instant(last.at).text : lastAge}
                {last.outcome === "ok" && last.fetched !== null
                  ? ` · ${String(last.fetched)} units`
                  : ""}
                {last.outcome !== "ok" && last.detail.length > 0 ? ` · ${last.detail}` : ""}
              </>
            )}
          </dd>
        </div>
        <div className="mad-meta-item">
          <dt className="mad-meta-label">Deals</dt>
          <dd
            className="mad-meta-value"
            data-missing={deals === null || deals.outcome !== "ok" ? "true" : undefined}
          >
            {!dealsConfigured ? (
              connector.kind === "csv" ? (
                "No deals sheet named."
              ) : connector.kind === "realpad" ? (
                "No export columns named."
              ) : (
                "No deals board named."
              )
            ) : deals === null ? (
              "Never"
            ) : (
              <>
                <StatusChip tone={syncTone(deals.outcome)}>{syncWord(deals.outcome)}</StatusChip>{" "}
                {dealsAge ?? instant(deals.at).text}
                {deals.outcome === "ok" ? ` · ${String(deals.fetched)} deals` : ""}
                {deals.outcome !== "ok" && deals.detail.length > 0 ? ` · ${deals.detail}` : ""}
                {deals.unmappedStages.length === 0
                  ? ""
                  : ` · ${String(deals.unmappedStages.length)} stage word(s) not mapped: ${deals.unmappedStages.slice(0, 5).join(", ")}`}
              </>
            )}
          </dd>
        </div>
        {placement === null ? null : (
          <div className="mad-meta-item">
            <dt className="mad-meta-label">On Project</dt>
            <dd
              className="mad-meta-value"
              data-missing={placement.placed === 0 ? "true" : undefined}
            >
              {`${String(placement.placed)} of ${String(placement.total)} units drawn`}
              {placement.reasons.length === 0 ? "" : `. Not drawn: ${counted(placement.reasons)}`}
              {placement.gaps.length === 0 ? "" : `. Gaps: ${counted(placement.gaps)}`}
            </dd>
          </div>
        )}
      </dl>

      <ConnectorSync
        projectId={projectId}
        kind={connector.kind}
        name={connector.name}
        canSync={connector.configured && connector.kind !== "csv" && connector.hasCredential}
        canSyncDeals={DEALS_PULLED.includes(connector.kind) && dealsConfigured}
        hasCredential={connector.hasCredential}
      />

      {/*
       * The settings sit behind a native disclosure, closed until asked for.
       * The state row above answers the operator's question; the form changes
       * once and would otherwise stand four screens tall in front of the next
       * connector's state. The same `<details>` the rules disclosure and Ask
       * IRIS already use; nothing is scripted.
       */}
      <details className="mad-fold">
        <summary className="mad-button" data-emphasis="secondary">
          {`${connector.name} settings`}
        </summary>
        <ConnectorForm
          projectId={projectId}
          kind={connector.kind}
          name={connector.name}
          configured={connector.configured}
          enabled={connector.enabled}
          config={connector.config}
          hasCredential={connector.hasCredential}
        />
      </details>

      {connector.kind === "csv" && connector.configured ? (
        <CsvUpload projectId={projectId} />
      ) : null}
      {connector.kind === "csv" && connector.configured && dealsConfigured ? (
        <CsvUpload projectId={projectId} sheet="deals" />
      ) : null}
    </section>
  );
}
