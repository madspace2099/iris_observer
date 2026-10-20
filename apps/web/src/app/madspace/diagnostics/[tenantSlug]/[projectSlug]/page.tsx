import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Kicker } from "@observer/ui";
import type { DiagnosisWindow, ProjectDiagnostics } from "@observer/readmodels";

import { requireViewer } from "@/lib/session";
import { dynamicRoute } from "@/lib/href";
import { controlPlane, HEALTH_LABEL, HEALTH_TONE } from "@/lib/sources/control-plane";
import { diagnosticsEstate, type DiagnosticSource } from "@/lib/madspace/diagnostics";
import { ageSince, count, instant } from "@/lib/madspace/format";
import { FEEDS, hoursAgo, portfolioProject } from "@/lib/madspace/portfolio";
import { InfoNote } from "@/components/madspace/InfoNote";
import { StatusChip } from "@/components/madspace/StatusMark";
import { TableWrap } from "@/components/madspace/TableWrap";

export const metadata: Metadata = { title: "Project diagnostics" };

const figure = (n: number): string => count(n).text;
const of = (n: number, total: number): string => `${figure(n)} of ${figure(total)}`;

/**
 * ONE CLIENT PROJECT, DIAGNOSED, WITH THE EVIDENCE BEHIND EVERY LINE (ADR-0047).
 *
 * The drill-down of a Diagnostics row: who of the roster presented, what the
 * meetings carry, which feed went quiet and when, what the CRM and the
 * catalogue hold, and the installations the control plane keeps for it. Each
 * line says what it was counted from, and each section ends in what to do.
 * Presenters are counted and never named, so nothing here ranks a client's
 * people.
 */
export default async function ProjectDiagnosticsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; projectSlug: string }>;
}) {
  const viewer = await requireViewer();
  if (viewer.role !== "madspace_admin") redirect("/");

  const { tenantSlug, projectSlug } = await params;
  const found = await portfolioProject(viewer, tenantSlug, projectSlug);
  if (found === null) notFound();

  const { company, project } = found;
  const d = project.diagnostics;
  const root = `/${tenantSlug}/${projectSlug}`;
  const cp = project.controlPlaneId;
  const plane = cp === null ? null : await controlPlane();
  const now = new Date();
  const installations =
    cp === null || plane === null || !plane.ok
      ? null
      : (
          await diagnosticsEstate(
            plane.admin,
            { project: cp, environment: null, health: null },
            now,
          )
        ).shown;

  return (
    <>
      <header className="mad-head">
        <div className="mad-head-text">
          <Kicker>{`Diagnostics · ${company}`}</Kicker>
          <h1 className="mad-title">{project.name}</h1>
          <p className="mad-lede">
            {d === null
              ? "Its diagnosis could not be read."
              : `${project.status.word}, as of ${instant(d.asOf).text}, the day this project runs on.`}
          </p>
          <div className="mad-idline">
            <StatusChip tone={project.status.tone}>{project.status.word}</StatusChip>
            <span className="mad-code">{root}</span>
          </div>
        </div>
        <div className="mad-head-actions">
          <Link className="ox-btn" data-weight="primary" href={dynamicRoute(`${root}/project`)}>
            Open in Observer
          </Link>
          {cp === null ? null : (
            <>
              <Link className="ox-btn" href={dynamicRoute(`/madspace/projects/${cp}`)}>
                Sources
              </Link>
              <Link className="ox-btn" href={dynamicRoute(`/madspace/projects/${cp}/sources/new`)}>
                Onboard a source
              </Link>
            </>
          )}
        </div>
      </header>

      {d === null ? null : (
        <>
          <Presenters d={d} />
          <Meetings d={d} />
          <Feeds d={d} />
          <CrmAndCatalogue d={d} />
        </>
      )}

      <section className="mad-plane" aria-labelledby="installations-heading">
        <div className="mad-section-head">
          <h2 id="installations-heading">Installations on the control plane</h2>
          <p>
            {cp === null
              ? "No installation is registered for this project on the control plane. Its feeds above are the demonstration's own."
              : plane === null || !plane.ok
                ? "The control plane did not answer, so its installations cannot be read."
                : "Activation and heartbeat, as the control plane persists them for each source."}
          </p>
        </div>
        {installations === null ? null : installations.length === 0 ? (
          <div className="mad-empty">
            <strong>No source registered yet</strong>
            <span>Onboard a source to give this project an installation to activate.</span>
          </div>
        ) : (
          <TableWrap labelledBy="installations-heading">
            <table className="mad-table">
              <thead>
                <tr>
                  <th scope="col">Source</th>
                  <th scope="col">State</th>
                  <th scope="col">Why</th>
                  <th scope="col">Last heartbeat</th>
                </tr>
              </thead>
              <tbody>
                {installations.map((source) => (
                  <Installation key={source.row.source_id} source={source} now={now} />
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </section>
    </>
  );
}

/* --- the sections ---------------------------------------------------------------------- */

function windowEvidence(w: DiagnosisWindow): string {
  return `Counted from the ${figure(w.meetings)} meetings recorded in the ${w.period.label.toLowerCase()}.`;
}

function Presenters({ d }: { d: ProjectDiagnostics }) {
  return (
    <section className="mad-plane" aria-labelledby="presenters-heading">
      <div className="mad-section-head">
        <div className="mad-idline">
          <h2 id="presenters-heading">Who presents</h2>
          <InfoNote label="how presenters are counted">
            <p>A presenter counts once they held at least one meeting in the window.</p>
            <p>They are counted, never named or ranked.</p>
          </InfoNote>
        </div>
        <p>
          {d.roster === null
            ? "This project keeps no roster, so presenters are counted from its meetings alone."
            : `${figure(d.roster)} on the roster.`}
        </p>
      </div>
      <ul className="mad-evidence">
        {d.windows.map((w) => (
          <li key={w.period.preset}>
            <strong>
              {d.roster === null || w.rosterPresenting === null
                ? `${figure(w.presenters)} presented in the ${w.period.label.toLowerCase()}`
                : `${of(w.rosterPresenting, d.roster)} on the roster presented in the ${w.period.label.toLowerCase()}`}
              {w.offRoster !== null && w.offRoster > 0
                ? `, and ${figure(w.offRoster)} not on the roster`
                : ""}
            </strong>
            <span>{windowEvidence(w)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Meetings({ d }: { d: ProjectDiagnostics }) {
  const last = instant(d.lastMeetingAt, "No meeting recorded");
  return (
    <section className="mad-plane" aria-labelledby="meetings-heading">
      <div className="mad-section-head">
        <h2 id="meetings-heading">Meetings</h2>
        <p>
          {`Last meeting ${last.text}. ${figure(d.recorded)} recorded to date, of which ${figure(d.legacyImports)} are legacy imports without per-step timing.`}
        </p>
      </div>
      <TableWrap labelledBy="meetings-heading">
        <table className="mad-table">
          <thead>
            <tr>
              <th scope="col">Window</th>
              <th scope="col">Meetings</th>
              <th scope="col">Outcome recorded</th>
              <th scope="col">Without timing</th>
              <th scope="col">Through WEB IRIS</th>
            </tr>
          </thead>
          <tbody>
            {d.windows.map((w) =>
              w.meetings === 0 ? (
                <tr key={w.period.preset}>
                  <th scope="row">{w.period.label}</th>
                  <td className="mad-td-figure">{figure(0)}</td>
                  <td colSpan={3} data-missing="true">
                    No meeting to count from
                  </td>
                </tr>
              ) : (
                <tr key={w.period.preset}>
                  <th scope="row">{w.period.label}</th>
                  <td className="mad-td-figure">{figure(w.meetings)}</td>
                  <td>{of(w.outcomeRecorded, w.meetings)}</td>
                  <td>{of(w.timingUnavailable, w.meetings)}</td>
                  <td>{of(w.webiris, w.meetings)}</td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </TableWrap>
    </section>
  );
}

function Feeds({ d }: { d: ProjectDiagnostics }) {
  return (
    <section className="mad-plane" aria-labelledby="feeds-heading">
      <div className="mad-section-head">
        <h2 id="feeds-heading">Feeds</h2>
        <p>Each feed&rsquo;s own last-seen record, against the day this project runs on.</p>
      </div>
      <TableWrap labelledBy="feeds-heading">
        <table className="mad-table">
          <thead>
            <tr>
              <th scope="col">Feed</th>
              <th scope="col">Kind</th>
              <th scope="col">Last seen</th>
              <th scope="col">State</th>
            </tr>
          </thead>
          <tbody>
            {d.sources.map((source) => {
              const seen = instant(source.lastSeenAt, "Never seen");
              const kind = FEEDS.find((f) => f.kind === source.kind)?.label ?? source.kind;
              return (
                <tr key={`${source.kind}:${source.name}`}>
                  <th scope="row">{source.name}</th>
                  <td>{kind}</td>
                  <td data-missing={seen.missing}>
                    {seen.text}
                    {source.ageHours === null ? null : (
                      <span className="mad-td-sub">{hoursAgo(source.ageHours)}</span>
                    )}
                  </td>
                  <td>
                    {!source.connected ? (
                      <StatusChip tone="none">Not connected</StatusChip>
                    ) : source.ageHours === null ? (
                      <StatusChip tone="await">Connected, never seen</StatusChip>
                    ) : source.stale ? (
                      <StatusChip tone="wrong">Stale, over 24 h</StatusChip>
                    ) : (
                      <StatusChip tone="good">Fresh</StatusChip>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableWrap>
    </section>
  );
}

function CrmAndCatalogue({ d }: { d: ProjectDiagnostics }) {
  const [recent] = d.windows;
  const fetched = instant(d.crm.fetchedAt, "Never");
  return (
    <section className="mad-plane" aria-labelledby="crm-heading">
      <div className="mad-section-head">
        <h2 id="crm-heading">CRM and catalogue</h2>
      </div>
      <ul className="mad-evidence">
        <li>
          <strong>
            {d.crm.deals !== null
              ? `${figure(d.crm.deals)} deals from the CRM`
              : d.crm.connected
                ? "The CRM is connected and has delivered no deals"
                : "No CRM is connected, so no outcome can be recorded"}
          </strong>
          <span>
            {d.crm.deals !== null
              ? `As the CRM last delivered them, ${fetched.text}.`
              : "From the project's own source list."}
          </span>
        </li>
        <li>
          <strong>
            {d.catalogueUnits === null
              ? "No catalogue is connected"
              : recent === undefined
                ? `${figure(d.catalogueUnits)} units in the catalogue`
                : `${of(recent.unitsOpened, d.catalogueUnits)} catalogue units opened in the ${recent.period.label.toLowerCase()}`}
          </strong>
          <span>
            {d.catalogueUnits === null
              ? "From the project's own source list."
              : "Counted from the units the window's meetings opened that the catalogue holds."}
          </span>
        </li>
      </ul>
    </section>
  );
}

function Installation({ source, now }: { source: DiagnosticSource; now: Date }) {
  const last = instant(source.row.last_heartbeat_at);
  const age = ageSince(source.row.last_heartbeat_at, now);
  return (
    <tr>
      <th scope="row" className="mad-td-source">
        <Link href={dynamicRoute(`/madspace/sources/${source.row.source_id}`)}>
          {source.row.display_label}
        </Link>
      </th>
      <td>
        <StatusChip tone={HEALTH_TONE[source.health]}>{HEALTH_LABEL[source.health]}</StatusChip>
      </td>
      <td>{source.reason ?? "Nothing to report."}</td>
      <td data-missing={last.missing}>
        {last.text}
        {age === null ? null : <span className="mad-td-sub">{age}</span>}
      </td>
    </tr>
  );
}
