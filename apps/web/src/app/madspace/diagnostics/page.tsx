import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Kicker } from "@observer/ui";
import { requireViewer } from "@/lib/session";
import { dynamicRoute } from "@/lib/href";
import { controlPlane, HEALTH_LABEL, HEALTH_TONE } from "@/lib/sources/control-plane";
import {
  ageSince,
  bytes,
  count,
  day,
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
import {
  diagnosisSentence,
  portfolio,
  staleFeeds,
  type Portfolio,
  type PortfolioProject,
} from "@/lib/madspace/portfolio";
import { DiagnosticsFilters } from "@/components/madspace/DiagnosticsFilters";
import { ControlPlaneAbsent } from "@/components/madspace/ControlPlaneAbsent";
import { InfoNote } from "@/components/madspace/InfoNote";
import { StatusChip } from "@/components/madspace/StatusMark";
import { TableWrap } from "@/components/madspace/TableWrap";

export const metadata: Metadata = { title: "Diagnostics" };

const ROUTE = "/madspace/diagnostics";

/* --- figures and forms, through Intl ------------------------------------------------- */

/**
 * A figure printed inside a sentence.
 *
 * It goes through `count`, which holds the one `Intl.NumberFormat` these
 * screens share, rather than through a second formatter declared here: a
 * thousand sources should be grouped the same way in a sentence and in a table
 * cell, and two instances is how that stops being true.
 */
function figure(value: number): string {
  return count(value).text;
}

/**
 * The plural form, selected rather than guessed.
 *
 * `n === 1 ? "source" : "sources"` is correct in English and in no language
 * that has a dual or a paucal. `Intl.PluralRules` is the only part of this that
 * has to change when a second locale arrives.
 */
const PLURALS = new Intl.PluralRules("en-GB");

function plural(value: number, one: string, other: string): string {
  return PLURALS.select(value) === "one" ? one : other;
}

/* --- the explanations, written once ---------------------------------------------------- */

/**
 * The two quarantine columns explain themselves, on both of them.
 *
 * The sentence is a contrast, so it cannot be halved between the two headers
 * without destroying it. One fragment, mounted twice, is how each column
 * carries the whole distinction without the copy being written twice.
 *
 * The BODY is shared; the two accessible names are not. Both mounts once said
 * "the difference between local and backend quarantine", so a reader tabbing
 * the header row heard the identical button name twice and could not tell which
 * column the second one belonged to. Each names its own column instead.
 */
const QUARANTINE_COLUMNS = (
  <>
    <p>
      Local quarantine is what the installation refused to send; backend quarantine is what we
      refused to accept.
    </p>
    <p>The two have different fixes.</p>
  </>
);

/**
 * Why the error column holds a code and never a message.
 *
 * Mounted on the column header when there is a table, and on the empty state
 * when there is not, because a disclosure nobody can reach is a deletion with
 * extra steps.
 */
const CODE_COLUMN = (
  <>
    <p>
      A code and never a message: the column is bounded so an exception body can never arrive in an
      operational table.
    </p>
    <p>There is no message behind this, because the field cannot hold one.</p>
  </>
);

/**
 * Diagnostics: every client project, then every installation (ADR-0047).
 *
 * ## What this screen is for
 *
 * The owner: "here we could diagnose our clients' projects, e.g. we would see
 * all CLARITY client projects here, such as Shark Residence, and useful
 * diagnosable information about each project, e.g. how many of their agents use
 * it". So it opens on one row per client project, from the repository's
 * `ProjectDiagnostics`: who of the roster presented, meetings in two named
 * windows, how many carry an outcome, which feed went stale, the CRM's deals.
 * Each row opens a drill-down with the evidence behind every line.
 *
 * Below it is what was here before: the operational state of every
 * installation on the control plane, asked on a bad day as "which source is
 * wrong?", sorted worst first with the REASON in words. Every definition sits
 * behind the `i` beside its heading, as the design system's second principle
 * asks.
 *
 * ## What it is not allowed to show
 *
 * No visitor subject, no agent identity, no event property, no error message,
 * no stack, no credential, no verifier, no selector and no token, and no
 * ranking of a client's people: the project rows count presenters, they never
 * name one. The installation rows come from `SourceOperationsRow` and
 * `ProjectSummaryRow`, and the last error is a CODE, never a message.
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
  const [estate, projects] = await Promise.all([
    plane.ok ? diagnosticsEstate(plane.admin, filter, now) : Promise.resolve(null),
    portfolio(viewer),
  ]);

  return (
    <>
      <header className="mad-head">
        <div className="mad-head-text">
          <Kicker>MADSPACE administration</Kicker>
          {/*
           * The disclosure is a SIBLING of the heading, never a child of it: a
           * button inside the `h1` joins that heading's accessible name.
           */}
          <div className="mad-idline">
            <h1 className="mad-title">Diagnostics</h1>
            <InfoNote label="what the figures on this screen are">
              <p>
                A client project&rsquo;s figures are counted the way its own screens count them, on
                the day it runs on. A feed is stale when it was last heard from more than 24 hours
                before that day.
              </p>
              <p>
                An installation&rsquo;s figures are the state persisted for its source, read once
                for the whole account. They are not a rate, not a trend, and never an analytic.
              </p>
            </InfoNote>
          </div>
          <p className="mad-lede">{diagnosisSentence(projects)}</p>
        </div>
      </header>

      <ClientProjects projects={projects} />

      <section className="mad-plane" aria-labelledby="installations-heading">
        <div className="mad-section-head">
          <h2 id="installations-heading">Installations on the control plane</h2>
          <p>{lede(estate, filter)}</p>
          <p>
            Every installation below covers every project, every environment and every source in
            this account.
          </p>
        </div>
        {/*
         * The tally band runs the full width under the section head rather than
         * beside it, so the one shape whose job is to be a continuous ruled
         * plane is one.
         */}
        {estate === null ? null : <Tallies estate={estate} />}
      </section>

      {estate === null || !plane.ok ? (
        <section className="mad-plane" aria-labelledby="plane-heading">
          {/*
           * The absence gets a heading like every other section, because a
           * landmark with no accessible name is a region a reader can neither
           * name nor navigate to.
           */}
          <div className="mad-section-head">
            <h2 id="plane-heading">The control plane</h2>
          </div>
          <ControlPlaneAbsent absence={plane.ok ? { kind: "not_enabled" } : plane.absence} />
        </section>
      ) : (
        <>
          {/*
           * A plane rather than a labelled `section`: the three selects carry
           * their own labels, which is what a filter band actually needs.
           */}
          <div className="mad-plane">
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
          </div>

          <Attention estate={estate} filter={filter} now={now} />
          {nothingReported(estate) ? (
            <NothingReported estate={estate} />
          ) : (
            <>
              <Heartbeats estate={estate} now={now} />
              <Verifications estate={estate} now={now} />
              <Queues estate={estate} />
              <Quarantine estate={estate} />
              <ErrorCodes estate={estate} />
            </>
          )}
        </>
      )}
    </>
  );
}

/* --- the client projects ------------------------------------------------------------- */

/**
 * One row per client project in Observer, each with its denominator.
 *
 * Presenters are counted, never named, so the table cannot become a league
 * table of a client's people. A project the control plane holds but Observer
 * does not yet is not here: it has nothing to diagnose until it has an address,
 * and the Projects home lists it as needing setup.
 */
function ClientProjects({ projects }: { projects: Portfolio }) {
  const rows = projects.companies.flatMap((company) =>
    company.projects.flatMap((project) =>
      project.address === null ? [] : [{ company: company.name, project }],
    ),
  );

  return (
    <section className="mad-plane" aria-labelledby="clients-heading">
      <div className="mad-section-head">
        <div className="mad-idline">
          <h2 id="clients-heading">Client projects</h2>
          <InfoNote label="what each column counts">
            <p>
              Presenters: of the project&rsquo;s roster, how many held at least one meeting in the
              last 28 days.
            </p>
            <p>
              Meetings: held in the last 28 days, with the quarter to date beneath. Outcome
              recorded: of the quarter&rsquo;s meetings, how many carry an outcome from the CRM.
              Without a CRM none can.
            </p>
            <p>The last meeting and the CRM&rsquo;s deals are on each project&rsquo;s page.</p>
          </InfoNote>
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="mad-empty">
          <strong>No client project in Observer yet</strong>
          <span>A project appears here once it has a developer and an address.</span>
        </div>
      ) : (
        <TableWrap labelledBy="clients-heading">
          {/*
           * Four figures a row, not seven: the last meeting and the CRM's deals
           * are on each project's drill-down, and nine columns ran 1,901px
           * inside a 1,366px frame. Below 64rem the table stacks into records
           * (`data-stack`), each cell naming its own column.
           */}
          <table className="mad-table" data-stack="">
            <thead>
              <tr>
                <th scope="col">Project</th>
                <th scope="col">Status</th>
                <th scope="col">Presenters, 28 days</th>
                <th scope="col">Meetings, 28 days</th>
                <th scope="col">Outcome recorded, quarter</th>
                <th scope="col">Stale feeds</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ company, project }) => (
                <ClientRow key={project.key} company={company} project={project} />
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
    </section>
  );
}

function ClientRow({ company, project }: { company: string; project: PortfolioProject }) {
  const d = project.diagnostics;
  const address = project.address;
  const head = (
    <th scope="row" className="mad-td-source">
      {address === null ? null : (
        <Link
          href={dynamicRoute(`/madspace/diagnostics/${address.tenantSlug}/${address.projectSlug}`)}
        >
          {project.name}
        </Link>
      )}
      <span className="mad-td-sub">{company}</span>
    </th>
  );

  if (d === null) {
    return (
      <tr>
        {head}
        <td data-label="Status">
          <StatusChip tone={project.status.tone}>{project.status.word}</StatusChip>
        </td>
        <td colSpan={4} data-missing="true">
          Its diagnosis could not be read.
        </td>
      </tr>
    );
  }

  const [recent, quarter] = d.windows;
  const feeds = staleFeeds(d);
  return (
    <tr>
      {head}
      <td data-label="Status">
        <StatusChip tone={project.status.tone}>{project.status.word}</StatusChip>
        <span className="mad-td-sub">Counted to {day(d.asOf)}</span>
      </td>
      {recent === undefined || recent.meetings === null ? (
        /* One cell for the three columns a project without a meeting feed cannot fill. */
        <td colSpan={3} data-label="Meetings" data-missing="true">
          {NO_MEETING_FEED}
        </td>
      ) : (
        <>
          <td data-label="Presenters, 28 days">
            {d.roster === null || recent.rosterPresenting === null
              ? `${figure(recent.presenters)} presented, no roster kept`
              : `${figure(recent.rosterPresenting)} of ${figure(d.roster)}`}
          </td>
          <td data-label="Meetings, 28 days" className="mad-td-figure">
            {figure(recent.meetings)}
            {quarter === undefined || quarter.meetings === null ? null : (
              <span className="mad-td-sub">{figure(quarter.meetings)} this quarter</span>
            )}
          </td>
          <td data-label="Outcome recorded, quarter">
            {quarter === undefined || quarter.meetings === null
              ? NO_MEETING_FEED
              : quarter.outcomeRecorded === null
                ? "No CRM connected"
                : quarter.meetings === 0
                  ? "No meeting to record"
                  : `${figure(quarter.outcomeRecorded)} of ${figure(quarter.meetings)}`}
          </td>
        </>
      )}
      <td data-label="Stale feeds" data-tone={feeds.stale > 0 ? "weak" : undefined}>
        {feeds.connected > 0
          ? `${figure(feeds.stale)} of ${figure(feeds.connected)}`
          : d.sources.some((s) => s.connected)
            ? "Age not tracked"
            : "No feed connected"}
      </td>
    </tr>
  );
}

const NO_MEETING_FEED = "No showroom or WEB IRIS connected";

/* --- the answer, before any table ---------------------------------------------------- */

/**
 * The whole screen in one sentence.
 *
 * It names the worst source rather than counting problems, because the
 * commonest reading of this page ends after this line and a count does not tell
 * anybody where to go. The filtered case says so explicitly: an operator who
 * has forgotten a narrowing and reads "nothing requires attention" has been
 * told something false about the estate.
 *
 * The lifecycle definitions this sentence used to carry are behind the `i`
 * beside the title. What is left is the state, the count and the name.
 */
function lede(estate: DiagnosticsEstate | null, filter: DiagnosticsFilter): string {
  if (estate === null) {
    return "The control plane cannot be read right now, so no installation can be diagnosed.";
  }
  if (estate.all.length === 0) {
    return "This account holds no sources, so there is nothing to diagnose.";
  }

  const narrowed = filterIsNarrowed(filter);
  if (estate.shown.length === 0) {
    return "No source in this account matches the current filter. Clear it to see every installation again.";
  }

  const attention = requiringAttention(estate);
  const scope = narrowed
    ? `${figure(estate.shown.length)} of ${figure(estate.all.length)} sources in view.`
    : `${figure(estate.all.length)} ${plural(estate.all.length, "source", "sources")} in this account.`;

  const worst = attention[0];
  if (worst === undefined) {
    return `${scope} None is offline, refusing events or suspended, so nothing on this screen needs an operator right now.`;
  }

  return `${scope} ${figure(attention.length)} ${plural(attention.length, "requires", "require")} attention, worst first. ${worst.row.display_label} is ${HEALTH_LABEL[worst.health].toLowerCase()}.`;
}

/**
 * Four counts on one ruled data panel.
 *
 * Each against the same denominator, because "two connected" is not a fact and
 * "two of six" is. They are counts of ROWS — how many sources are in a state —
 * which is why they are safe to render as figures: none of them is a
 * measurement a plugin might have failed to report.
 *
 * Heartbeat fresh and Ingestion verified stay two separate cells. They are two
 * independent states, and a single "health" figure across them would be the
 * collapse this whole surface exists to prevent.
 */
function Tallies({ estate }: { estate: DiagnosticsEstate }) {
  const shown = estate.shown.length;
  const attention = requiringAttention(estate).length;
  const fresh = estate.shown.filter((source) => source.heartbeatFresh).length;
  const verified = estate.shown.filter(
    (source) => source.row.ingestion_verified_at !== null,
  ).length;

  return (
    <dl className="mad-datapanel">
      <div>
        <dt>In view</dt>
        <dd>
          {figure(shown)}
          <span className="mad-tally-of"> of {figure(estate.all.length)}</span>
        </dd>
      </div>
      <div>
        <dt>Requiring attention</dt>
        <dd>
          {figure(attention)}
          <span className="mad-tally-of"> of {figure(shown)}</span>{" "}
          {/*
           * A word and a shape beside the figure, never the colour alone.
           *
           * The nothing-in-view case is deliberately NOT the green one. Zero of
           * zero under a filter says nothing about the estate, and a green mark
           * there is the quiet lie this screen is built to refuse.
           */}
          {/*
           * Nor is "nothing heard yet": green beside "Heartbeat fresh 0 of 1"
           * read as a contradiction.
           */}
          {shown === 0 ? (
            <StatusChip tone="none">Nothing in view</StatusChip>
          ) : attention > 0 ? (
            <StatusChip tone="wrong">Needs an operator</StatusChip>
          ) : fresh === 0 ? (
            <StatusChip tone="await">
              {estate.shown.every((source) => source.row.last_heartbeat_at === null)
                ? "Waiting for first heartbeat"
                : "No fresh heartbeat"}
            </StatusChip>
          ) : (
            <StatusChip tone="good">No operator needed</StatusChip>
          )}
        </dd>
      </div>
      <div>
        <dt>Heartbeat fresh</dt>
        <dd>
          {figure(fresh)}
          <span className="mad-tally-of"> of {figure(shown)}</span>
        </dd>
      </div>
      <div>
        <dt>Ingestion verified</dt>
        <dd>
          {figure(verified)}
          <span className="mad-tally-of"> of {figure(shown)}</span>
        </dd>
      </div>
    </dl>
  );
}

/* --- 1. sources requiring attention --------------------------------------------------- */

/**
 * The rail colour agrees with the word beside it and carries nothing on its own.
 *
 * Which means it has to follow `HEALTH_TONE`, not run beside it. The rail used
 * to paint OFFLINE red and NEEDS ATTENTION amber, which is the mapping the
 * shared table was created to overturn: offline is us WAITING on a machine
 * somebody may simply have switched off, and needs-attention is the one where
 * something is refusing and a person has work to do. A red rail beside an amber
 * chip would restate the deleted table in colour.
 *
 * `watch` is the wait-client hue the `await` chip uses and `weak` is the late
 * hue the `wrong` chip uses, so rail and chip are now literally the same token.
 * SUSPENDED keeps the neutral rail: there is no rail colour for the operator
 * diamond, and neutral is the honest one for a decision rather than a fault.
 */
const ALERT_TONE: Readonly<Record<string, "weak" | "watch" | "unknown">> = {
  offline: "watch",
  attention: "weak",
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
        {/*
         * The disclosure is a sibling of the `h2`, the way it is a sibling of
         * the `h1` at the top of the screen, and every section below follows
         * this shape.
         *
         * Wrapping the words in a span and pointing `aria-labelledby` at the
         * span fixed the SECTION's name and left the HEADING's alone, so a
         * reader moving by heading still heard "Sources requiring attention
         * About what puts a source in this section". With the control outside,
         * the id can sit on the `h2` itself and one element carries both names.
         */}
        <div className="mad-idline">
          <h2 id="attention-heading">Sources requiring attention</h2>
          <InfoNote label="what puts a source in this section">
            <p>Offline, refusing events, or switched off deliberately.</p>
            <p>
              Worst first, then production before staging, then whichever has been silent longest.
            </p>
          </InfoNote>
        </div>
      </div>

      {alerts.length === 0 ? (
        <Answer
          title={emptyAttentionTitle(estate)}
          detail={emptyAttentionDetail(estate, filter)}
          info={emptyAttentionInfo(estate)}
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
    return "The filter above matches no source in this account, so this section has nothing to judge.";
  }

  const waiting = estate.shown.filter((source) => source.health === "never_connected").length;
  const unverified = estate.shown.filter((source) => source.health === "not_verified").length;

  const clauses: string[] = [
    `No source ${filterIsNarrowed(filter) ? "in view" : "in this account"} is offline, holding refused events or suspended.`,
  ];
  if (waiting > 0) {
    clauses.push(
      `${figure(waiting)} ${plural(waiting, "is", "are")} still waiting for a first heartbeat.`,
    );
  }
  if (unverified > 0) {
    clauses.push(
      `${figure(unverified)} ${plural(unverified, "has", "have")} connected without yet proving an event reaches storage.`,
    );
  }
  return clauses.join(" ");
}

/**
 * What each of those states MEANS, behind the control.
 *
 * The counts and the state words stay on the page; the two distinctions move,
 * because "not a fault" and "not an outage" are the difference between two
 * states that look alike rather than the answer to anything.
 */
function emptyAttentionInfo(estate: DiagnosticsEstate): ReactNode {
  if (estate.shown.length === 0) {
    return (
      <InfoNote label="an empty section under a filter">
        <p>It is not a statement that the estate is healthy.</p>
      </InfoNote>
    );
  }

  const waiting = estate.shown.filter((source) => source.health === "never_connected").length;
  const unverified = estate.shown.filter((source) => source.health === "not_verified").length;
  if (waiting === 0 && unverified === 0) return null;

  return (
    <InfoNote label="the states named beside this">
      {waiting === 0 ? null : (
        <p>
          Waiting for a first heartbeat is where a newly registered installation sits until somebody
          activates it, and it is not a fault.
        </p>
      )}
      {unverified === 0 ? null : (
        <p>
          Connecting without yet proving an event reaches storage is worth watching, and it is not
          an outage.
        </p>
      )}
    </InfoNote>
  );
}

function Alert({ source, now }: { source: DiagnosticSource; now: Date }) {
  const { row } = source;
  const last = instant(row.last_heartbeat_at);
  const age = ageSince(row.last_heartbeat_at, now);

  return (
    <li className="mad-alert" data-tone={ALERT_TONE[source.health] ?? "unknown"}>
      <div className="mad-alert-head">
        {/*
         * The state as a chip: shape, colour and the spelled-out word together.
         * The wrapper is what keeps the chip at its own width — a bare chip in a
         * column flex box stretches to the full row and stops reading as a mark.
         */}
        <div className="mad-badges">
          <StatusChip tone={HEALTH_TONE[source.health]}>{HEALTH_LABEL[source.health]}</StatusChip>
        </div>
        <h3 className="mad-alert-name">
          <Link href={dynamicRoute(`/madspace/sources/${row.source_id}`)}>{row.display_label}</Link>
        </h3>
        {/*
         * `mad-note` rides along for its size only: 12px is the system's
         * uppercase micro step, and these are sentence-case facts, which the
         * type scale sets at the 13px caption.
         */}
        <ul className="mad-inline mad-note">
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
 * The boxed answer for section one, with room for the disclosure.
 *
 * The shared `StateMessage` takes its title as a string, and the system puts
 * the `i` beside the title rather than under the sentence, so this restates the
 * same two elements rather than pushing the control somewhere it does not
 * belong. Nothing else about the shape differs.
 */
function Answer({ title, detail, info }: { title: string; detail: string; info?: ReactNode }) {
  return (
    <div className="obs-state" role="status">
      <strong>
        {title}
        {info}
      </strong>
      <span>{detail}</span>
    </div>
  );
}

/**
 * What a corroborating section says when it has no rows.
 *
 * A ruled band rather than the boxed answer above, and the reason is what the
 * seeded estate looks like on day one: every one of the five tables below is
 * empty, and five boxed panels stacked down the page is the card grid this
 * surface exists to avoid — five containers holding a sentence each, none of
 * them a figure. The band sits on the same two hairlines the table it replaces
 * would have sat on, so the page keeps its rhythm whether or not there is data.
 *
 * The boxed treatment is kept for section one alone, where the sentence IS the
 * answer rather than a note about an absent table.
 *
 * `detail` is optional because two of these bands now say everything a reader
 * has to act on in the title alone, and a second line repeating it would be
 * prose added back for the sake of a slot.
 */
function Empty({ title, detail, info }: { title: string; detail?: string; info?: ReactNode }) {
  return (
    <div className="mad-empty">
      <strong>
        {title}
        {info}
      </strong>
      {detail === undefined ? null : <span>{detail}</span>}
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
      <span className="mad-td-sub mad-note">
        {source.projectName ?? "Project not named"} · {environmentWord(source.row.environment)}
      </span>
    </th>
  );
}

/** No source in view has reported anything the five tables below would list. */
function nothingReported(estate: DiagnosticsEstate): boolean {
  return (
    recentHeartbeats(estate).length === 0 &&
    recentVerifications(estate).length === 0 &&
    queuePressure(estate).length === 0 &&
    quarantineActivity(estate).length === 0 &&
    recentErrorCodes(estate).length === 0
  );
}

/**
 * The five corroborating tables, when none has a row: one ruled band.
 *
 * Five bands each saying "nothing reported" filled a viewport and a half on an
 * estate whose installations have not yet been activated. The one sentence
 * says the same of all five, and its count says how many are waiting.
 */
function NothingReported({ estate }: { estate: DiagnosticsEstate }) {
  const silent = estate.shown.filter((source) => source.row.last_heartbeat_at === null).length;
  return (
    <section className="mad-plane" aria-labelledby="telemetry-heading">
      <div className="mad-section-head">
        <h2 id="telemetry-heading">Installation telemetry</h2>
      </div>
      <Empty
        title="No heartbeat, verification, queue, quarantine or error code reported yet"
        detail={
          silent === 0
            ? undefined
            : `${figure(silent)} of ${figure(estate.shown.length)} ${plural(estate.shown.length, "source", "sources")} waiting for a first heartbeat.`
        }
        info={
          <InfoNote label="what this section lists once a source reports">
            <p>
              Recent heartbeats, ingestion verifications, queue pressure, quarantine activity and
              safe error codes, each as its own table once one source in view reports it.
            </p>
            <p>
              A source sits here between being registered and being activated on the machine it runs
              on. An unreported counter is not a zero, so nothing is shown as one.
            </p>
          </InfoNote>
        }
      />
    </section>
  );
}

function Heartbeats({ estate, now }: { estate: DiagnosticsEstate; now: Date }) {
  const rows = recentHeartbeats(estate);
  const silent = estate.shown.filter((source) => source.row.last_heartbeat_at === null).length;

  return (
    <section className="mad-plane" aria-labelledby="heartbeats-heading">
      <div className="mad-section-head">
        <div className="mad-idline">
          <h2 id="heartbeats-heading">Recent heartbeats</h2>
          <InfoNote label="what the heartbeat table lists">
            <p>Most recent first, {figure(RECENT_LIMIT)} at most.</p>
            <p>
              Never heard from is a different fact from an old heartbeat, and it is not shown as
              one.
            </p>
          </InfoNote>
        </div>
      </div>

      {rows.length === 0 ? (
        <Empty
          title="No heartbeat has ever been accepted from a source in view"
          detail="Every installation here is still waiting for its first heartbeat."
          info={
            <InfoNote label="the state between registration and activation">
              <p>
                That is the state a source sits in between being registered and being activated on
                the machine it runs on.
              </p>
            </InfoNote>
          }
        />
      ) : (
        <div className="mad-table-wrap">
          <table className="mad-table">
            <thead>
              <tr>
                <th scope="col">Source</th>
                <th scope="col">Last heartbeat (UTC)</th>
                <th scope="col">
                  Freshness
                  <InfoNote label="the fifteen-minute freshness window" align="end">
                    <p>
                      Freshness is judged against a fifteen-minute window. The plugin flushes every
                      five seconds, so a source quiet for longer is not merely idle.
                    </p>
                  </InfoNote>
                </th>
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
                      {/* The word and its shape first, then the measurement that produced it. */}
                      <StatusChip tone={source.heartbeatFresh ? "good" : "await"}>
                        {source.heartbeatFresh ? "Fresh" : "Stale"}
                      </StatusChip>
                      {age === null ? null : <span className="mad-td-sub mad-note">{age}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {silent === 0 ? null : (
        <p className="mad-field-hint">
          {figure(silent)} {plural(silent, "source is", "sources are")} absent from this table
          because {plural(silent, "it has", "they have")} never been heard from at all.
        </p>
      )}
    </section>
  );
}

function Verifications({ estate, now }: { estate: DiagnosticsEstate; now: Date }) {
  const rows = recentVerifications(estate);
  /*
   * Counted over the estate, not subtracted from the table.
   *
   * `rows` is sliced to RECENT_LIMIT, so `shown.length - rows.length` reported
   * every verified source past the eighth as never verified — a false statement
   * about the estate made by the screen whose job is to refuse exactly that.
   * Heartbeats has always counted its own absence this way; so does this now.
   */
  const unproved = estate.shown.filter(
    (source) => source.row.ingestion_verified_at === null,
  ).length;

  return (
    <section className="mad-plane" aria-labelledby="verifications-heading">
      <div className="mad-section-head">
        <div className="mad-idline">
          <h2 id="verifications-heading">Recent ingestion verifications</h2>
          <InfoNote label="what an ingestion verification proves">
            <p>When an event from this installation was last proved to reach storage.</p>
            <p>A heartbeat says the source can talk to us; only this says its data lands.</p>
            <p>
              A source that has never been verified is an absent proof rather than a failed one, and
              it is left off the table instead of being entered as a zero.
            </p>
          </InfoNote>
        </div>
      </div>

      {rows.length === 0 ? (
        <Empty
          title="No source in view has proved that an event reaches storage"
          info={
            <InfoNote label="what ingestion verified means">
              <p>
                Ingestion is verified when a diagnostic event sent by the installation is found in
                storage.
              </p>
              <p>
                Until one is, a connected source has shown that it can reach us and nothing more.
              </p>
            </InfoNote>
          }
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
        <p className="mad-field-hint">
          {figure(unproved)} {plural(unproved, "source has", "sources have")} never been verified.
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
        <div className="mad-idline">
          <h2 id="queues-heading">Queue pressure</h2>
          <InfoNote label="what queue pressure measures">
            <p>
              The outbox each installation is holding, against the ceiling it was configured with.
            </p>
            <p>Fullest first.</p>
            <p>
              An unmeasured queue is not an empty one, so it is left out of the ranking rather than
              placed at the bottom of it.
            </p>
          </InfoNote>
        </div>
      </div>

      {rows.length === 0 ? (
        <Empty
          title="No outbox measurement has been reported by a source in view"
          info={
            <InfoNote label="why an outbox measurement can be missing">
              <p>
                Queue figures ride on the heartbeat and every field of it is optional, so an
                installation that cannot measure its outbox still reports that it is alive.
              </p>
              <p>Nothing here is at zero. Nothing here has been measured.</p>
            </InfoNote>
          }
        />
      ) : (
        <div className="mad-table-wrap">
          <table className="mad-table">
            <thead>
              <tr>
                <th scope="col">Source</th>
                <th scope="col">Used</th>
                <th scope="col">Ceiling</th>
                <th scope="col">
                  Fill
                  <InfoNote label="when a fill is shown">
                    <p>A fill is shown only where both numbers were reported.</p>
                  </InfoNote>
                </th>
                <th scope="col">Events held</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((source) => {
                const used = bytes(source.row.queue_bytes_used);
                const ceiling = bytes(source.row.queue_bytes_ceiling);
                const fill = percent(source.queueFillPercent);
                const events = count(source.row.queue_event_count);
                /*
                 * The percentage alone was the whole signal, in colour. The
                 * word and the shape are what survive greyscale and the amber
                 * nobody can separate from the green.
                 */
                const pressure =
                  source.queueFillPercent === null
                    ? null
                    : source.queueFillPercent >= 90
                      ? ({ tone: "wrong", word: "Near ceiling", level: "weak" } as const)
                      : source.queueFillPercent >= 80
                        ? ({ tone: "await", word: "Filling", level: "watch" } as const)
                        : null;
                return (
                  <tr key={source.row.source_id}>
                    <SourceCell source={source} />
                    <td className="mad-td-figure" data-missing={used.missing}>
                      {used.text}
                    </td>
                    <td className="mad-td-figure" data-missing={ceiling.missing}>
                      {ceiling.text}
                    </td>
                    <td
                      className="mad-td-figure"
                      data-missing={fill.missing}
                      data-tone={pressure?.level}
                    >
                      {fill.text}{" "}
                      {pressure === null ? null : (
                        <StatusChip tone={pressure.tone}>{pressure.word}</StatusChip>
                      )}
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
        <p className="mad-field-hint">
          {figure(unmeasured)} connected {plural(unmeasured, "source", "sources")} reported no
          usable outbox measurement.
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
        <div className="mad-idline">
          <h2 id="quarantine-heading">Quarantine activity</h2>
          <InfoNote label="what quarantine activity counts">
            <p>Events this account is not counting.</p>
          </InfoNote>
        </div>
      </div>

      {rows.length === 0 ? (
        <Empty
          title="No source in view has reported a quarantined event"
          detail="Either nothing has been refused, or no installation has reported a quarantine count yet."
          info={
            <InfoNote label="why the two cases look the same here">
              <p>
                Both are shown the same way here. An unreported counter is not evidence of a clean
                estate, and this table lists only counts that were actually reported.
              </p>
            </InfoNote>
          }
        />
      ) : (
        <div className="mad-table-wrap">
          <table className="mad-table">
            <thead>
              <tr>
                <th scope="col">Source</th>
                <th scope="col">
                  Local quarantine
                  <InfoNote label="what local quarantine holds">{QUARANTINE_COLUMNS}</InfoNote>
                </th>
                <th scope="col">
                  Backend quarantine
                  <InfoNote label="what backend quarantine holds">{QUARANTINE_COLUMNS}</InfoNote>
                </th>
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
                /*
                 * `?? 0` reads as a count only where one was reported: a null
                 * counter takes neither the colour nor the word, because an
                 * unreported quarantine is not an empty one.
                 */
                const held = (source.row.quarantine_count ?? 0) > 0;
                const refused = (source.row.backend_quarantine_count ?? 0) > 0;
                return (
                  <tr key={source.row.source_id}>
                    <SourceCell source={source} />
                    <td
                      className="mad-td-figure"
                      data-missing={local.missing}
                      data-tone={held ? "watch" : undefined}
                    >
                      {local.text} {held ? <StatusChip tone="await">Held</StatusChip> : null}
                    </td>
                    <td
                      className="mad-td-figure"
                      data-missing={backend.missing}
                      data-tone={refused ? "weak" : undefined}
                    >
                      {backend.text}{" "}
                      {refused ? <StatusChip tone="wrong">Refused</StatusChip> : null}
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
        <div className="mad-idline">
          <h2 id="errors-heading">Recent safe error codes</h2>
          <InfoNote label="what the error code table lists">
            <p>The last code each installation reported, most recently seen first.</p>
          </InfoNote>
        </div>
      </div>

      {rows.length === 0 ? (
        <Empty
          title="No source in view has reported an error code"
          detail="The heartbeat carries at most one short code, and none of the installations here has sent one."
          info={
            <InfoNote label="why the column holds a code and never a message">
              {CODE_COLUMN}
            </InfoNote>
          }
        />
      ) : (
        <div className="mad-table-wrap">
          <table className="mad-table">
            <thead>
              <tr>
                <th scope="col">Source</th>
                <th scope="col">
                  Code
                  <InfoNote label="why the column holds a code and never a message">
                    {CODE_COLUMN}
                  </InfoNote>
                </th>
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
