import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Kicker, StateMessage } from "@observer/ui";
import { requireViewer } from "@/lib/session";
import { dynamicRoute } from "@/lib/href";
import {
  controlPlane,
  runningLocally,
  CONTROL_PLANE_ACCOUNT_NAME,
  HEALTH_LABEL,
} from "@/lib/sources/control-plane";
import {
  ageSince,
  bytes,
  count,
  environmentWord,
  instant,
  percent,
  sourceTypeWord,
} from "@/lib/madspace/format";
import {
  diagnosticsEstate,
  filterIsNarrowed,
  parseFilter,
  quarantineActivity,
  queuePressure,
  queueUnmeasured,
  recentErrorCodes,
  recentHeartbeats,
  recentVerifications,
  requiringAttention,
  RECENT_LIMIT,
  type DiagnosticSource,
  type DiagnosticsEstate,
  type DiagnosticsFilter,
} from "@/lib/madspace/diagnostics";
import { DiagnosticsFilters } from "@/components/madspace/DiagnosticsFilters";
import { ControlPlaneAbsent } from "@/components/madspace/ControlPlaneAbsent";

export const metadata: Metadata = { title: "Diagnostics" };

const ROUTE = "/madspace/diagnostics";

/**
 * Diagnostics — the operational state of every installation in the account.
 *
 * ## What this screen is for
 *
 * One question, asked on a bad day: **which source is wrong?** So the first
 * section is the only one that matters when something has broken, it is sorted
 * worst first, and every row on it states the REASON in words rather than in a
 * colour. Everything below it is corroboration — when a heartbeat last arrived,
 * when ingestion was last proved, how full the outboxes are, what has been
 * refused, and the last safe error code — and it is deliberately arranged as
 * ruled tables rather than as a field of cards, because six panels of one
 * figure each is a scrapbook and this has to be scanned.
 *
 * ## What it is not
 *
 * It is not the showroom HUD and it is not an observability product. There is
 * no timeline, no rate, no chart and no trend: the control plane persists
 * CURRENT operational state per source, so a graph here would be drawn from
 * numbers that do not exist. It also carries no analytics — what an
 * installation observed belongs to Observer; whether it observes at all belongs
 * here.
 *
 * ## What it is not allowed to show
 *
 * No visitor subject, no agent identity, no event property, no error message,
 * no stack, no credential, no verifier, no selector and no token. Every value
 * below comes from `SourceOperationsRow` or from `ProjectSummaryRow`, and the
 * last error is a CODE — `db.ts` keeps that column an enum-ish string precisely
 * so an exception dump with a visitor's name in it can never land in an
 * operational table, and this screen is the reason that guarantee is worth
 * having.
 */
export default async function MadspaceDiagnosticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await requireViewer();
  if (viewer.role !== "madspace_admin") redirect("/");

  const filter = parseFilter(await searchParams);
  const plane = await controlPlane();
  const now = new Date();
  const estate = plane.ok ? await diagnosticsEstate(plane.admin, filter, now) : null;

  return (
    <>
      <header className="mad-head">
        <div className="mad-head-text">
          <Kicker>MADSPACE operations</Kicker>
          <h1 className="mad-title">Diagnostics</h1>
          <p className="mad-lede">{lede(estate, filter)}</p>
          <p className="mad-note">
            Administering {CONTROL_PLANE_ACCOUNT_NAME} through the{" "}
            {runningLocally() ? "local development" : "hosted"} control plane. Every figure below is
            the state persisted for a source, read once for the whole account — not a rate, not a
            trend, and never an analytic.
          </p>
        </div>
      </header>

      {/*
       * The tally band runs the full width UNDER the head rather than beside it.
       * In the head's second column it became a sidebar — four figures set
       * against the sentence they summarise, competing with it — and its two
       * hairlines only spanned a third of the screen, so the one shape on this
       * page whose whole job is to be a continuous ruled plane was not one.
       */}
      {estate === null ? null : <Tallies estate={estate} />}

      {estate === null || !plane.ok ? (
        <section className="mad-plane">
          <ControlPlaneAbsent absence={plane.ok ? { kind: "not_enabled" } : plane.absence} />
        </section>
      ) : (
        <>
          <section className="mad-plane" aria-label="Narrow the estate">
            <DiagnosticsFilters
              action={ROUTE}
              project={filter.project}
              environment={filter.environment}
              health={filter.health}
              projects={estate.projects.map((project) => ({
                value: project.id,
                label: project.name,
              }))}
              environments={estate.environments.map((environment) => ({
                value: environment,
                label: environmentWord(environment),
              }))}
              healths={estate.healths.map((health) => ({
                value: health,
                label: HEALTH_LABEL[health],
              }))}
            />
          </section>

          <Attention estate={estate} filter={filter} now={now} />
          <Heartbeats estate={estate} now={now} />
          <Verifications estate={estate} now={now} />
          <Queues estate={estate} />
          <Quarantine estate={estate} />
          <ErrorCodes estate={estate} />
        </>
      )}
    </>
  );
}

/* --- the answer, before any table ---------------------------------------------------- */

/**
 * The whole screen in one sentence.
 *
 * It names the worst source rather than counting problems, because the
 * commonest reading of this page ends after this line and a count does not tell
 * anybody where to go. The filtered case says so explicitly: an operator who
 * has forgotten a narrowing and reads "nothing requires attention" has been
 * told something false about the estate.
 */
function lede(estate: DiagnosticsEstate | null, filter: DiagnosticsFilter): string {
  if (estate === null) {
    return "The control plane cannot be read right now, so no installation can be diagnosed. The reason is stated below rather than guessed at.";
  }
  if (estate.all.length === 0) {
    return "This account holds no sources, so there is nothing to diagnose. A source is registered against a project and then activated from the machine it runs on.";
  }

  const narrowed = filterIsNarrowed(filter);
  if (estate.shown.length === 0) {
    return "No source in this account matches the current filter. That is a statement about the filter and not about the estate — clear it to see every installation again.";
  }

  const attention = requiringAttention(estate);
  const scope = narrowed
    ? `${estate.shown.length} of ${estate.all.length} sources in view.`
    : `${estate.all.length} ${estate.all.length === 1 ? "source" : "sources"} in this account.`;

  const worst = attention[0];
  if (worst === undefined) {
    return `${scope} None is offline, refusing events or suspended, so nothing on this screen needs an operator right now.`;
  }

  return `${scope} ${attention.length} ${attention.length === 1 ? "requires" : "require"} attention, worst first — ${worst.row.display_label} is ${HEALTH_LABEL[worst.health].toLowerCase()}.`;
}

/**
 * Four counts on one ruled band.
 *
 * Each against the same denominator, because "two connected" is not a fact and
 * "two of six" is. They are counts of ROWS — how many sources are in a state —
 * which is why they are safe to render as figures: none of them is a
 * measurement a plugin might have failed to report.
 */
function Tallies({ estate }: { estate: DiagnosticsEstate }) {
  const shown = estate.shown.length;
  const attention = requiringAttention(estate).length;
  const fresh = estate.shown.filter((source) => source.heartbeatFresh).length;
  const verified = estate.shown.filter(
    (source) => source.row.ingestion_verified_at !== null,
  ).length;

  return (
    <dl className="mad-meta mad-meta--tallies">
      <div className="mad-meta-item">
        <dt className="mad-meta-label">In view</dt>
        <dd className="mad-meta-value">
          {shown}
          <span className="mad-tally-of"> of {estate.all.length}</span>
        </dd>
      </div>
      <div className="mad-meta-item">
        <dt className="mad-meta-label">Requiring attention</dt>
        <dd className="mad-meta-value" data-tone={attention > 0 ? "watch" : undefined}>
          {attention}
          <span className="mad-tally-of"> of {shown}</span>
        </dd>
      </div>
      <div className="mad-meta-item">
        <dt className="mad-meta-label">Heartbeat fresh</dt>
        <dd className="mad-meta-value">
          {fresh}
          <span className="mad-tally-of"> of {shown}</span>
        </dd>
      </div>
      <div className="mad-meta-item">
        <dt className="mad-meta-label">Ingestion verified</dt>
        <dd className="mad-meta-value">
          {verified}
          <span className="mad-tally-of"> of {shown}</span>
        </dd>
      </div>
    </dl>
  );
}

/* --- 1. sources requiring attention --------------------------------------------------- */

/** The rail colour agrees with the word beside it and carries nothing on its own. */
const ALERT_TONE: Readonly<Record<string, "weak" | "watch" | "unknown">> = {
  offline: "weak",
  attention: "watch",
  suspended: "unknown",
};

function Attention({
  estate,
  filter,
  now,
}: {
  estate: DiagnosticsEstate;
  filter: DiagnosticsFilter;
  now: Date;
}) {
  const alerts = requiringAttention(estate);

  return (
    <section className="mad-plane" aria-labelledby="attention-heading">
      <div className="mad-section-head">
        <h2 id="attention-heading">Sources requiring attention</h2>
        <p>
          Offline, refusing events, or switched off deliberately. Worst first, then production
          before staging, then whichever has been silent longest.
        </p>
      </div>

      {alerts.length === 0 ? (
        <StateMessage
          title={emptyAttentionTitle(estate)}
          detail={emptyAttentionDetail(estate, filter)}
        />
      ) : (
        <ol className="mad-alerts">
          {alerts.map((source) => (
            <Alert key={source.row.source_id} source={source} now={now} />
          ))}
        </ol>
      )}
    </section>
  );
}

/**
 * The empty state is a sentence about the estate, not a shrug.
 *
 * "No results" tells an operator nothing. What they need to know is which
 * proposition is now true — and, when a narrowing is in force, that it is true
 * only of the part they are looking at.
 */
function emptyAttentionTitle(estate: DiagnosticsEstate): string {
  if (estate.shown.length === 0) return "Nothing is in view to diagnose";
  return "Nothing requires attention";
}

function emptyAttentionDetail(estate: DiagnosticsEstate, filter: DiagnosticsFilter): string {
  if (estate.shown.length === 0) {
    return "The filter above matches no source in this account, so this section has nothing to judge. It is not a statement that the estate is healthy.";
  }

  const waiting = estate.shown.filter((source) => source.health === "never_connected").length;
  const unverified = estate.shown.filter((source) => source.health === "not_verified").length;

  const clauses: string[] = [
    `No source ${filterIsNarrowed(filter) ? "in view" : "in this account"} is offline, holding refused events or suspended.`,
  ];
  if (waiting > 0) {
    clauses.push(
      `${waiting} ${waiting === 1 ? "is" : "are"} still waiting for a first heartbeat, which is where a newly registered installation sits until somebody activates it — not a fault.`,
    );
  }
  if (unverified > 0) {
    clauses.push(
      `${unverified} ${unverified === 1 ? "has" : "have"} connected without yet proving an event reaches storage; that is worth watching and is not an outage.`,
    );
  }
  return clauses.join(" ");
}

function Alert({ source, now }: { source: DiagnosticSource; now: Date }) {
  const { row } = source;
  const last = instant(row.last_heartbeat_at);
  const age = ageSince(row.last_heartbeat_at, now);

  return (
    <li className="mad-alert" data-tone={ALERT_TONE[source.health] ?? "unknown"}>
      <div className="mad-alert-head">
        <span className="mad-alert-word">{HEALTH_LABEL[source.health]}</span>
        <h3 className="mad-alert-name">
          <Link href={dynamicRoute(`/madspace/sources/${row.source_id}`)}>{row.display_label}</Link>
        </h3>
        <ul className="mad-inline">
          <li>{source.projectName ?? "Project not named"}</li>
          <li>{environmentWord(row.environment)}</li>
          <li>{sourceTypeWord(row.source_type)}</li>
          {row.environment_mismatch ? <li>Environment mismatch</li> : null}
        </ul>
      </div>

      {/* The reason, in words. The word above says WHAT; this says WHY. */}
      <p className="mad-alert-reason">{source.reason}</p>

      <div className="mad-alert-when">
        <span className="mad-meta-label">Last heartbeat</span>
        <span className="mad-meta-value" data-missing={last.missing}>
          {last.text}
        </span>
        {age === null ? null : <span className="mad-note">{age}</span>}
      </div>
    </li>
  );
}

/* --- the ruled tables ------------------------------------------------------------------ */

/**
 * What a corroborating section says when it has no rows.
 *
 * A ruled band rather than the boxed `StateMessage`, and the reason is what the
 * seeded estate looks like on day one: every one of the five tables below is
 * empty, and five boxed panels stacked down the page is the card grid this
 * surface exists to avoid — five containers holding a sentence each, none of
 * them a figure. The band sits on the same two hairlines the table it replaces
 * would have sat on, so the page keeps its rhythm whether or not there is data.
 *
 * The boxed treatment is kept for section one alone, where the sentence IS the
 * answer rather than a note about an absent table.
 */
function Empty({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="mad-empty">
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  );
}

/**
 * A source, as a table cell: its label over its project.
 *
 * The project is on the row rather than in a column of its own because the two
 * are read together — "Main Showroom PC" means nothing without knowing which
 * building it is in — and a separate column would set the two facts apart by a
 * hairline for no reading benefit.
 */
function SourceCell({ source }: { source: DiagnosticSource }) {
  return (
    <th scope="row" className="mad-td-source">
      <Link href={dynamicRoute(`/madspace/sources/${source.row.source_id}`)}>
        {source.row.display_label}
      </Link>
      <span className="mad-td-sub">
        {source.projectName ?? "Project not named"} · {environmentWord(source.row.environment)}
      </span>
    </th>
  );
}

function Heartbeats({ estate, now }: { estate: DiagnosticsEstate; now: Date }) {
  const rows = recentHeartbeats(estate);
  const silent = estate.shown.filter((source) => source.row.last_heartbeat_at === null).length;

  return (
    <section className="mad-plane" aria-labelledby="heartbeats-heading">
      <div className="mad-section-head">
        <h2 id="heartbeats-heading">Recent heartbeats</h2>
        <p>
          Most recent first, {RECENT_LIMIT} at most. Freshness is judged against a fifteen-minute
          window — the plugin flushes every five seconds, so a source quiet for longer is not merely
          idle.
        </p>
      </div>

      {rows.length === 0 ? (
        <Empty
          title="No heartbeat has ever been accepted from a source in view"
          detail="Every installation here is still waiting for its first heartbeat. That is the state a source sits in between being registered and being activated on the machine it runs on."
        />
      ) : (
        <div className="mad-table-wrap">
          <table className="mad-table">
            <thead>
              <tr>
                <th scope="col">Source</th>
                <th scope="col">Last heartbeat (UTC)</th>
                <th scope="col">Freshness</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((source) => {
                const last = instant(source.row.last_heartbeat_at);
                const age = ageSince(source.row.last_heartbeat_at, now);
                return (
                  <tr key={source.row.source_id}>
                    <SourceCell source={source} />
                    <td className="mad-td-figure" data-missing={last.missing}>
                      {last.text}
                    </td>
                    <td>
                      {/* The word first, then the measurement that produced it. */}
                      <span
                        className="mad-word"
                        data-tone={source.heartbeatFresh ? "good" : "watch"}
                      >
                        {source.heartbeatFresh ? "Fresh" : "Stale"}
                      </span>
                      {age === null ? null : <span className="mad-td-sub">{age}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {silent === 0 ? null : (
        <p className="mad-note">
          {silent} {silent === 1 ? "source is" : "sources are"} absent from this table because{" "}
          {silent === 1 ? "it has" : "they have"} never been heard from at all — which is a
          different fact from an old heartbeat and is not shown as one.
        </p>
      )}
    </section>
  );
}

function Verifications({ estate, now }: { estate: DiagnosticsEstate; now: Date }) {
  const rows = recentVerifications(estate);
  const unproved = estate.shown.length - rows.length;

  return (
    <section className="mad-plane" aria-labelledby="verifications-heading">
      <div className="mad-section-head">
        <h2 id="verifications-heading">Recent ingestion verifications</h2>
        <p>
          When an event from this installation was last proved to reach storage. A heartbeat says
          the source can talk to us; only this says its data lands.
        </p>
      </div>

      {rows.length === 0 ? (
        <Empty
          title="No source in view has proved that an event reaches storage"
          detail="Ingestion is verified when a diagnostic event sent by the installation is found in storage. Until one is, a connected source has shown that it can reach us and nothing more."
        />
      ) : (
        <div className="mad-table-wrap">
          <table className="mad-table">
            <thead>
              <tr>
                <th scope="col">Source</th>
                <th scope="col">Verified (UTC)</th>
                <th scope="col">Age</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((source) => {
                const at = instant(source.row.ingestion_verified_at);
                const age = ageSince(source.row.ingestion_verified_at, now);
                return (
                  <tr key={source.row.source_id}>
                    <SourceCell source={source} />
                    <td className="mad-td-figure" data-missing={at.missing}>
                      {at.text}
                    </td>
                    <td className="mad-td-figure" data-missing={age === null}>
                      {age ?? "Not reported"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {unproved <= 0 ? null : (
        <p className="mad-note">
          {unproved} {unproved === 1 ? "source has" : "sources have"} never been verified. That is
          an absent proof rather than a failed one, and it is left off the table instead of being
          entered as a zero.
        </p>
      )}
    </section>
  );
}

function Queues({ estate }: { estate: DiagnosticsEstate }) {
  const rows = queuePressure(estate);
  const unmeasured = queueUnmeasured(estate);

  return (
    <section className="mad-plane" aria-labelledby="queues-heading">
      <div className="mad-section-head">
        <h2 id="queues-heading">Queue pressure</h2>
        <p>
          The outbox each installation is holding, against the ceiling it was configured with.
          Fullest first. A fill is shown only where both numbers were reported.
        </p>
      </div>

      {rows.length === 0 ? (
        <Empty
          title="No outbox measurement has been reported by a source in view"
          detail="Queue figures ride on the heartbeat and every field of it is optional, so an installation that cannot measure its outbox still reports that it is alive. Nothing here is at zero — nothing here has been measured."
        />
      ) : (
        <div className="mad-table-wrap">
          <table className="mad-table">
            <thead>
              <tr>
                <th scope="col">Source</th>
                <th scope="col">Used</th>
                <th scope="col">Ceiling</th>
                <th scope="col">Fill</th>
                <th scope="col">Events held</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((source) => {
                const used = bytes(source.row.queue_bytes_used);
                const ceiling = bytes(source.row.queue_bytes_ceiling);
                const fill = percent(source.queueFillPercent);
                const events = count(source.row.queue_event_count);
                const fillLevel =
                  source.queueFillPercent === null
                    ? undefined
                    : source.queueFillPercent >= 90
                      ? "weak"
                      : source.queueFillPercent >= 80
                        ? "watch"
                        : undefined;
                return (
                  <tr key={source.row.source_id}>
                    <SourceCell source={source} />
                    <td className="mad-td-figure" data-missing={used.missing}>
                      {used.text}
                    </td>
                    <td className="mad-td-figure" data-missing={ceiling.missing}>
                      {ceiling.text}
                    </td>
                    <td className="mad-td-figure" data-missing={fill.missing} data-tone={fillLevel}>
                      {fill.text}
                    </td>
                    <td className="mad-td-figure" data-missing={events.missing}>
                      {events.text}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {unmeasured === 0 ? null : (
        <p className="mad-note">
          {unmeasured} connected {unmeasured === 1 ? "source" : "sources"} reported no usable outbox
          measurement. An unmeasured queue is not an empty one, so it is left out of the ranking
          rather than placed at the bottom of it.
        </p>
      )}
    </section>
  );
}

function Quarantine({ estate }: { estate: DiagnosticsEstate }) {
  const rows = quarantineActivity(estate);

  return (
    <section className="mad-plane" aria-labelledby="quarantine-heading">
      <div className="mad-section-head">
        <h2 id="quarantine-heading">Quarantine activity</h2>
        <p>
          Events this account is not counting. Local quarantine is what the installation refused to
          send; backend quarantine is what we refused to accept. The two have different fixes.
        </p>
      </div>

      {rows.length === 0 ? (
        <Empty
          title="No source in view has reported a quarantined event"
          detail="Either nothing has been refused, or no installation has reported a quarantine count yet. Both are shown the same way here — an unreported counter is not evidence of a clean estate, and this table lists only counts that were actually reported."
        />
      ) : (
        <div className="mad-table-wrap">
          <table className="mad-table">
            <thead>
              <tr>
                <th scope="col">Source</th>
                <th scope="col">Local quarantine</th>
                <th scope="col">Backend quarantine</th>
                <th scope="col">Validation failures</th>
                <th scope="col">Capacity refusals</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((source) => {
                const local = count(source.row.quarantine_count);
                const backend = count(source.row.backend_quarantine_count);
                const validation = count(source.row.validation_failure_count);
                const capacity = count(source.row.capacity_refusal_count);
                return (
                  <tr key={source.row.source_id}>
                    <SourceCell source={source} />
                    <td
                      className="mad-td-figure"
                      data-missing={local.missing}
                      data-tone={(source.row.quarantine_count ?? 0) > 0 ? "watch" : undefined}
                    >
                      {local.text}
                    </td>
                    <td
                      className="mad-td-figure"
                      data-missing={backend.missing}
                      data-tone={
                        (source.row.backend_quarantine_count ?? 0) > 0 ? "weak" : undefined
                      }
                    >
                      {backend.text}
                    </td>
                    <td className="mad-td-figure" data-missing={validation.missing}>
                      {validation.text}
                    </td>
                    <td className="mad-td-figure" data-missing={capacity.missing}>
                      {capacity.text}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ErrorCodes({ estate }: { estate: DiagnosticsEstate }) {
  const rows = recentErrorCodes(estate);

  return (
    <section className="mad-plane" aria-labelledby="errors-heading">
      <div className="mad-section-head">
        <h2 id="errors-heading">Recent safe error codes</h2>
        <p>
          The last code each installation reported, most recently seen first. A code and never a
          message: the column is bounded so an exception body can never arrive in an operational
          table.
        </p>
      </div>

      {rows.length === 0 ? (
        <Empty
          title="No source in view has reported an error code"
          detail="The heartbeat carries at most one short code, and none of the installations here has sent one. Nothing is being hidden — there is no message behind this, because the field cannot hold one."
        />
      ) : (
        <div className="mad-table-wrap">
          <table className="mad-table">
            <thead>
              <tr>
                <th scope="col">Source</th>
                <th scope="col">Code</th>
                <th scope="col">Last seen (UTC)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((source) => {
                const seen = instant(source.row.last_seen_at);
                return (
                  <tr key={source.row.source_id}>
                    <SourceCell source={source} />
                    <td>
                      <span className="mad-code">{source.row.last_error_code}</span>
                    </td>
                    <td className="mad-td-figure" data-missing={seen.missing}>
                      {seen.text}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
