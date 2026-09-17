import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionLink, Kicker, StateMessage } from "@observer/ui";
import { requireViewer } from "@/lib/session";
import { dynamicRoute } from "@/lib/href";
import {
  CONTROL_PLANE_ACCOUNT,
  controlPlane,
  sourceViews,
  HEALTH_LABEL,
  HEALTH_TONE,
  type SourceHealth,
  type SourceView,
} from "@/lib/sources/control-plane";
import {
  ageSince,
  count,
  environmentWord,
  instant,
  lifecycleWord,
  NOT_REPORTED,
  reported,
  sourceTypeWord,
} from "@/lib/madspace/format";
import { CopyValue } from "@/components/madspace/CopyValue";
import { ControlPlaneAbsent } from "@/components/madspace/ControlPlaneAbsent";
import { InfoNote } from "@/components/madspace/InfoNote";
import { StatusChip, type MarkTone } from "@/components/madspace/StatusMark";

export const metadata: Metadata = { title: "Project" };

/**
 * Project detail — the sources under one project.
 *
 * One row per source, and the row carries the three states as three words
 * rather than as one summary, for the same reason Source Detail does: a
 * showroom whose plugin is healthy and whose events have never landed looks
 * identical to a working one behind a single green dot, and this list is where
 * an operator would first notice the difference.
 *
 * Deliberately no analytics. What was observed belongs to Observer; whether the
 * installation observes at all belongs here.
 */
export default async function MadspaceProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const viewer = await requireViewer();
  if (viewer.role !== "madspace_admin") redirect("/");

  const { projectId } = await params;
  const plane = await controlPlane();
  const now = new Date();
  const views = plane.ok ? await sourceViews(plane.admin, projectId, now) : null;
  /*
   * The project's own row, for its name and status. A separate read because the
   * facade that carries them is account-scoped rather than project-scoped — and
   * a project this account does not hold simply is not in the list, which is the
   * same refusal every other door here gives.
   */
  const projects = plane.ok
    ? await plane.admin.projectsForAccount({ account: CONTROL_PLANE_ACCOUNT })
    : null;
  const project =
    projects?.ok === true
      ? (projects.value.find((row) => row.project_id === projectId) ?? null)
      : null;

  /*
   * The figures, as measurements rather than as numerals.
   *
   * `views` is null in exactly one case: the control plane could not be read.
   * Every figure below therefore starts as `number | null`, and `count(null)`
   * renders the word instead of a zero. The three situations this keeps apart
   * are the three an operator most needs separated: a project holding no
   * sources, a project whose sources have all gone quiet, and a database that
   * would not open. All three used to arrive as "0" and "0 of 0" beside a lede
   * saying the control plane could not be read.
   */
  const total = views === null ? null : views.length;
  const connected = views === null ? null : views.filter((view) => view.states.connected).length;
  const verified =
    views === null ? null : views.filter((view) => view.states.ingestionVerified).length;
  /*
   * The party waited on, and the reason it is a figure of its own rather than
   * Connected subtracted from Sources. It answers "how many installations have
   * never been heard from at all", which is the question that sends somebody to
   * a showroom, and an operator doing the arithmetic in their head is not
   * reading it.
   */
  const never = views === null ? null : views.filter((view) => !view.states.connected).length;
  const sources = count(total);
  /*
   * The instant the head leads with: the newest heartbeat anywhere in the
   * project, so "when was this estate last alive" is answered before a row is
   * opened. "Never" and "Not reported" are different absences and both are
   * words. Nothing here renders an absent instant as a date or as a zero.
   */
  const heartbeat = views === null ? instant(null, NOT_REPORTED) : instant(newestHeartbeat(views));
  const status = projectState(project?.status ?? null);
  const sentence = lede(views);

  return (
    <>
      <header className="mad-head">
        <div className="mad-head-text">
          <Kicker>Project</Kicker>
          <h1 className="mad-title">{project?.name ?? "Unknown project"}</h1>
          {sentence === null ? null : <p className="mad-lede">{sentence}</p>}
        </div>

        {/*
         * `mad-tally` is the CONTAINER and `mad-tally-item` the figure, which is
         * the vocabulary the projects list already uses. An earlier version of
         * this header invented `mad-tallies` and used `mad-tally` as the item —
         * a class that exists nowhere, so the figures fell back to default `dl`
         * flow and stacked loosely down the right-hand side.
         */}
        {/*
         * A tally item is `<dt>` then `<dd>`, which is the order a `dl` requires
         * and the order source detail already writes. The class puts the figure
         * above its label visually, so the markup does not have to lie about
         * which of the two is the term.
         */}
        <dl className="mad-tally">
          <div className="mad-tally-item">
            <dt className="mad-tally-label">Status</dt>
            <dd className="mad-tally-value">
              <StatusChip tone={status.tone}>{status.word}</StatusChip>
            </dd>
          </div>
          <div className="mad-tally-item">
            <dt className="mad-tally-label">Sources</dt>
            <dd className="mad-tally-value" data-missing={sources.missing}>
              {sources.text}
            </dd>
          </div>
          <TallyShare part={connected} whole={total}>
            Connected
          </TallyShare>
          <TallyShare part={never} whole={total}>
            Never connected
          </TallyShare>
          <TallyShare part={verified} whole={total}>
            Ingestion verified
            {/*
             * The definition, behind the disclosure. What INGESTION VERIFIED
             * means is doctrine; how many sources hold it is the answer, and the
             * answer is the figure standing above this label.
             *
             * The accessible name says what the panel EXPLAINS rather than
             * repeating the label it sits beside. "About ingestion verified"
             * gave a screen reader the tally's own term a second time and told
             * it nothing about what was behind the control.
             */}
            <InfoNote label="what a source has proved to be counted here" align="end">
              <p>The sources that have proved an event reaches storage.</p>
            </InfoNote>
          </TallyShare>
        </dl>
      </header>

      {/*
       * The identifier sits BELOW the state, and it is shown rather than merely
       * copyable.
       *
       * `CopyValue` renders a button and a status message and no value, so this
       * pairs it with the identifier in a sibling span the way Source Detail
       * does: an operator reading a UUID down a phone line needs the UUID on the
       * screen. What it is FOR is a definition, so it moved behind the
       * disclosure. The sentence used to stand between the project's name and
       * its figures, which is explanation in front of the answer.
       */}
      <dl className="mad-meta">
        <div className="mad-meta-item">
          <dt className="mad-meta-label">Last heartbeat</dt>
          <dd className="mad-meta-value" data-missing={heartbeat.missing}>
            {heartbeat.text}
          </dd>
        </div>
        <div className="mad-meta-item mad-meta-item--quiet">
          <dt className="mad-meta-label">Project identifier</dt>
          <dd className="mad-meta-value">
            <span className="mad-idline">
              <span className="mad-id">{projectId}</span>
              <CopyValue value={projectId} label="Copy the project identifier" />
              <InfoNote label="the project identifier">
                <p>The identifier, for a support conversation or a plugin configuration.</p>
              </InfoNote>
            </span>
          </dd>
        </div>
      </dl>

      <section className="mad-plane" aria-labelledby="sources-heading">
        <div className="obs-section-head">
          <h2 id="sources-heading">Sources</h2>
          {/*
           * The action sits on the plane it changes rather than in the page
           * head. A source is added TO this list, and a reader who has just
           * counted six rows is standing where the seventh would go.
           */}
          <ActionLink href={`/madspace/projects/${projectId}/sources/new`} emphasis="primary">
            Add source
          </ActionLink>
        </div>

        <div className="mad-rows">
          {/*
           * Three outcomes, and they must not look like one. The control plane
           * being unreadable is not "no sources" — telling an operator their
           * estate is empty when the database would not open is the worst
           * possible answer, because it is the one they might believe.
           */}
          {!plane.ok ? (
            <ControlPlaneAbsent absence={plane.absence} />
          ) : views === null || views.length === 0 ? (
            /*
             * The title is the state. The two-step rule behind it, created here
             * and activated from the machine, is the difference between two
             * states that look alike, which is what the disclosure is for. The
             * act itself is already carried by the button above.
             */
            <StateMessage
              title="No sources yet"
              action={
                <InfoNote label="creating and activating a source">
                  <p>
                    A source is created here and then activated from the showroom machine itself.
                  </p>
                </InfoNote>
              }
            />
          ) : (
            views.map((view) => <SourceRow key={view.status.source_id} view={view} now={now} />)
          )}
        </div>
      </section>

      <section className="mad-plane" aria-labelledby="dashboard-heading">
        <div className="obs-section-head">
          <h2 id="dashboard-heading">Customer dashboard</h2>
          <ActionLink href={`/madspace/projects/${projectId}/dashboard`} emphasis="secondary">
            Address, access and presenters
          </ActionLink>
        </div>
        <p className="mad-lede">
          Where this project lives on the customer side, what it still waits for, who may open it,
          and what the people who present on it are called.
        </p>
      </section>

      <section className="mad-plane" aria-labelledby="integrations-heading">
        <div className="obs-section-head">
          <h2 id="integrations-heading">CRM, catalogue and showroom telemetry</h2>
          <ActionLink href={`/madspace/projects/${projectId}/integrations`} emphasis="secondary">
            Integrations
          </ActionLink>
        </div>
        {/*
         * The one door into two different panes, and the lede used to name only
         * one of them. Session sources (Akhilesh's Supabase feed today) live on
         * this same Integrations screen, in their own "Showroom telemetry"
         * section — but an operator reading "the CRM this project's catalogue is
         * pulled from" had no reason to click through looking for a Supabase
         * connection, because the sentence had already answered a narrower
         * question than the page underneath it does.
         */}
        <p className="mad-lede">
          The CRM this project&rsquo;s unit catalogue is pulled from, and what the showroom itself
          recorded: credentials, last sync, and the changes each pull found.
        </p>
      </section>
    </>
  );
}

/**
 * A figure, its denominator, and the word for an absence.
 *
 * `count` returns `{ text, missing }` so a caller cannot render an absent
 * measurement as a present one. Where there is no numerator there is no
 * denominator either, so the "of N" is dropped rather than printed as "of 0":
 * "Not reported of Not reported" would be worse than the zero it replaced.
 */
function TallyShare({
  part,
  whole,
  children,
}: {
  part: number | null;
  whole: number | null;
  children: ReactNode;
}) {
  const reading = count(part);
  return (
    <div className="mad-tally-item">
      {/* Term first, figure second, as in the head above and on source detail. */}
      <dt className="mad-tally-label">{children}</dt>
      <dd className="mad-tally-value" data-missing={reading.missing}>
        {reading.text}
        {reading.missing ? null : <span className="mad-tally-of"> of {count(whole).text}</span>}
      </dd>
    </div>
  );
}

/**
 * The head's sentence, for the two situations the figures cannot state.
 *
 * A refusal and an empty estate are answers a reader takes in one line, so they
 * stay prose. Where there ARE sources the figures beside the title carry every
 * number, and the sentence that used to recite them said the same four counts a
 * second time: deleted rather than shortened, because none of it survived the
 * comparison. The count of sources never heard from was the one fact it held
 * alone, and it is now a figure of its own in the tally.
 */
function lede(views: readonly SourceView[] | null): string | null {
  if (views === null) return "The control plane could not be read.";
  if (views.length === 0) return "No sources registered against this project yet.";
  return null;
}

/** The newest heartbeat anywhere in the project, or null when none has ever arrived. */
function newestHeartbeat(views: readonly SourceView[]): string | null {
  let newest: string | null = null;
  let newestAt = Number.NEGATIVE_INFINITY;
  for (const view of views) {
    const at = view.operations?.last_heartbeat_at ?? null;
    if (at === null) continue;
    const parsed = Date.parse(at);
    if (!Number.isFinite(parsed) || parsed <= newestAt) continue;
    newestAt = parsed;
    newest = at;
  }
  return newest;
}

/**
 * A lifecycle word and the mark that agrees with it.
 *
 * One function for the project's status and for a source's lifecycle, because
 * they are the same vocabulary read at two scales and a state that appeared as
 * a circle here and a square there is exactly the failure a shared mark exists
 * to prevent. Suspension takes the operator diamond: it is a decision a person
 * made and a person can undo, not a reading of the installation's health. A
 * status this screen does not know takes the bar, which means no measurement
 * exists rather than nothing is wrong.
 */
function lifecycleTone(state: string): MarkTone {
  if (state === "active") return "good";
  if (state === "suspended") return "operator";
  if (state === "archived") return "settled";
  return "none";
}

/**
 * The project's own status, or the fact that its row was not in the list.
 *
 * `lifecycleWord` rather than a local ternary: the previous rendering said
 * "Archived" for every status that was not "active", so a status the screen had
 * never heard of arrived as a confident and wrong word.
 */
function projectState(status: string | null): { word: string; tone: MarkTone } {
  if (status === null) return { word: "Unknown", tone: "none" };
  return { word: lifecycleWord(status), tone: lifecycleTone(status) };
}

/**
 * The middle state, in three words rather than two.
 *
 * "Offline" was doing duty for a source that connected and has gone quiet AND
 * for one that has never been heard from, with a badge colour the only thing
 * between them, which is the one substitution this surface may never make. They
 * are different situations with different next actions, so each keeps its own
 * word. `heartbeatFresh` is the input that separates them and it stays.
 *
 * Both wear the ring, because both are waits. That is the reading the shared
 * verdict table states for `offline` and `never_connected` alike, and a
 * showroom machine switched off overnight is offline with nothing wrong. The
 * triangle this used to give a stopped source said someone had work to do
 * before anyone knew whether they did, and it disagreed with the same
 * installation's mark on source detail.
 */
function connectionState(view: SourceView): { word: string; tone: MarkTone } {
  if (!view.states.connected) return { word: "Never connected", tone: "await" };
  return view.heartbeatFresh
    ? { word: "Connected", tone: "good" }
    : { word: "Offline", tone: "await" };
}

/**
 * The health verdict, unless another mark on this row has already said it.
 *
 * `classifyHealth` puts lifecycle above liveness deliberately: a suspended
 * source is switched off, not unhealthy. Rendering both slots printed
 * "Suspended · Suspended" and "Archived · Archived", so the deliberate
 * precedence read as a stutter. The lifecycle keeps the word, because it is the
 * operator's decision and the actionable fact, and the health slot stays silent
 * rather than repeating it as though it were a second finding.
 *
 * OFFLINE is that same case one column across: the connection state prints that
 * exact word beside these, so the verdict would be the third telling of it.
 * AWAITING FIRST HEARTBEAT stays, because it names the party waited on and
 * "Never connected" does not. Nothing is hidden by either silence — the state
 * is on the row, in the slot that owns it.
 *
 * The verdict is returned as the key rather than as its label so the caller
 * takes the word AND the mark from the one table in `control-plane`. Both used
 * to be decided per screen, and the screens disagreed.
 */
function healthVerdict(view: SourceView): SourceHealth | null {
  if (view.health === "suspended" || view.health === "archived") return null;
  if (view.health === "offline") return null;
  return view.health;
}

/**
 * The observed build, as one line.
 *
 * Four values a heartbeat MAY carry and often does not — a plugin that cannot
 * compute one of them must still be able to say it is alive. So each is
 * rendered individually as reported or not reported, and the line collapses to
 * a single sentence only when the source has reported nothing at all.
 */
function VersionLine({ view }: { view: SourceView }) {
  const operations = view.operations;
  const parts = [
    { label: "App", reading: reported(operations?.observed_app_version ?? null) },
    { label: "Plugin", reading: reported(operations?.observed_plugin ?? null) },
    { label: "Build", reading: reported(operations?.observed_build_id ?? null) },
    { label: "Engine", reading: reported(operations?.observed_engine ?? null) },
  ];

  if (parts.every((part) => part.reading.missing)) {
    return (
      <ul className="mad-inline mad-note">
        <li>No build reported</li>
      </ul>
    );
  }

  return (
    <ul className="mad-inline mad-note">
      {parts.map((part) => (
        <li key={part.label}>
          {part.label} <strong>{part.reading.text}</strong>
        </li>
      ))}
    </ul>
  );
}

function SourceRow({ view, now }: { view: SourceView; now: Date }) {
  const { status, operations, states } = view;
  const heartbeat = instant(operations?.last_heartbeat_at ?? null);
  const verification = instant(operations?.ingestion_verified_at ?? null);
  const age = ageSince(operations?.last_heartbeat_at ?? null, now);
  const connection = connectionState(view);
  const verdict = healthVerdict(view);

  return (
    <Link
      className="mad-row mad-row--source"
      href={dynamicRoute(`/madspace/sources/${status.source_id}`)}
    >
      <div className="mad-row-id">
        <span className="mad-tally-label">{sourceTypeWord(status.source_type)}</span>
        <h3 className="mad-row-name">{status.display_label}</h3>
        <ul className="mad-inline mad-note">
          <li>{environmentWord(status.environment)}</li>
          <li>
            <StatusChip tone={lifecycleTone(status.state)}>
              {lifecycleWord(status.state)}
            </StatusChip>
          </li>
          {/*
           * The verdict and the mismatch are states, so both wear a mark. They
           * were bare words in a quiet 13px list, which put a source refusing
           * events and a source running against the wrong backend at the same
           * weight as the word "Showroom" two items to the left.
           */}
          {verdict === null ? null : (
            <li>
              <StatusChip tone={HEALTH_TONE[verdict]}>{HEALTH_LABEL[verdict]}</StatusChip>
            </li>
          )}
          {/*
           * A mismatch is the triangle: the installation is running a build
           * pointed at another environment and somebody has work to do. Source
           * detail says the same thing at length in an alert; the row says it in
           * the two words that get an operator to open the row.
           */}
          {operations?.environment_mismatch === true ? (
            <li>
              <StatusChip tone="wrong">Environment mismatch</StatusChip>
            </li>
          ) : null}
        </ul>
      </div>

      <div className="mad-row-id">
        {/*
         * Three words, never one, and now three marks. The row is the first
         * place an operator would see that a healthy-looking installation has
         * never delivered anything, so the three stay three: no summary mark
         * across them, no ordering, and no percentage.
         *
         * AN UNMET STATE IS A WAIT, WHICH IS THE RING.
         *
         * The two readings of an unmet state are the ring (nothing is wrong and
         * we are waiting on the installation) and the bar (no measurement
         * exists). This screen takes the ring for all three columns, and source
         * detail's `absent` tone has to be read against that.
         *
         * Not activated is a wait because activation happens ON the showroom
         * machine: a source is created here and the machine completes it, which
         * is what the empty-list note above says in words. Not verified is a
         * wait because the source is connected and no event has yet proved the
         * path. Neither is an absent measurement — both are read from a
         * persisted column and both are known, and the bar means we have not
         * been told rather than that the answer is no.
         *
         * The shared verdict table agrees: `never_connected` and `not_verified`
         * are both `await` there, and its verdict prints inches from these
         * chips, so the bar here would put one fact on one row under two shapes.
         */}
        <div className="mad-badges">
          <StatusChip tone={states.activated ? "good" : "await"}>
            {states.activated ? "Activated" : "Not activated"}
          </StatusChip>
          <StatusChip tone={connection.tone}>{connection.word}</StatusChip>
          <StatusChip tone={states.ingestionVerified ? "good" : "await"}>
            {states.ingestionVerified ? "Verified" : "Not verified"}
          </StatusChip>
        </div>
        <VersionLine view={view} />
      </div>

      {/*
       * The two instants as a ruled data panel: a 1px grid over a
       * border-coloured ground, and a label that reserves two lines so the
       * values share a baseline whatever the column width does to the wrapping.
       */}
      <dl className="mad-datapanel">
        <div>
          <dt>Last heartbeat</dt>
          <dd data-missing={heartbeat.missing}>
            {heartbeat.text}
            {age === null ? null : <span className="mad-note"> · {age}</span>}
          </dd>
        </div>
        <div>
          <dt>Ingestion verified</dt>
          <dd data-missing={verification.missing}>{verification.text}</dd>
        </div>
      </dl>
    </Link>
  );
}
