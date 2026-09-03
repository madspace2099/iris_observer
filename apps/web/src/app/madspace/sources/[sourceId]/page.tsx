import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { CredentialStatusRow } from "@observer/sources";
import { Kicker, StateMessage } from "@observer/ui";
import { requireViewer } from "@/lib/session";
import { dynamicRoute } from "@/lib/href";
import {
  controlPlane,
  sourceViews,
  CONTROL_PLANE_ACCOUNT,
  CONTROL_PLANE_ACCOUNT_NAME,
  HEALTH_LABEL,
  HEALTH_TONE,
  HEARTBEAT_FRESH_MS,
  type SourceView,
} from "@/lib/sources/control-plane";
import { locateSource } from "@/lib/madspace/estate";
import {
  ageSeconds,
  ageSince,
  bytes,
  count,
  credentialWord,
  duration,
  environmentWord,
  installationAnswer,
  instant,
  lifecycleWord,
  percent,
  reported,
  sourceTypeWord,
  type Reading,
} from "@/lib/madspace/format";
import { ActivationCodeDialog } from "@/components/madspace/ActivationCodeDialog";
import { ControlPlaneAbsent } from "@/components/madspace/ControlPlaneAbsent";
import { CopyValue } from "@/components/madspace/CopyValue";
import { InfoNote } from "@/components/madspace/InfoNote";
import { SourceActions } from "@/components/madspace/SourceActions";
import { StatusChip, StatusMark, type MarkTone } from "@/components/madspace/StatusMark";
import { LifecycleDriver } from "@/components/madspace/LifecycleDriver";
import { localControlPlaneEnabled } from "@/lib/sources/local-db";

export const metadata: Metadata = { title: "Source" };

/** The freshness window, said in the same words everywhere on the screen. */
const FRESHNESS = duration(Math.round(HEARTBEAT_FRESH_MS / 1000));

/*
 * The mark each health verdict wears is decided once, beside the words, in
 * `control-plane`. This screen declared the table for itself and Diagnostics
 * declared another, and the two disagreed about three of the seven verdicts, so
 * one installation wore different shapes depending on which screen was open.
 */

/** Lifecycle is a decision, not a health reading, and its marks say so. */
const LIFECYCLE_TONE: Readonly<Record<string, MarkTone>> = {
  active: "good",
  suspended: "operator",
  archived: "settled",
};

function lifecycleTone(state: string): MarkTone {
  return LIFECYCLE_TONE[state] ?? "none";
}

/**
 * Source detail — one IRIS installation.
 *
 * The screen exists to answer one question in about two seconds: **is this
 * installation configured, connected and delivering valid analytics?** The
 * answer is a sentence under the title and three independent words beneath it,
 * in that order, and everything else on the page is the evidence for them.
 *
 * The three states are the whole design. They are three facts, not three stages
 * — all four combinations occur, and the one this product exists to make
 * visible is ACTIVATED AND NEVER CONNECTED, which a single dot or a progress
 * bar would hide completely. So there is no bar across them, no percentage over
 * them, and no fourth state derived from them; each carries its own word and
 * its own mark shape, because status is never communicated by colour alone.
 *
 * Everything that explains WHY a figure is shaped the way it is now sits behind
 * an `InfoNote`. The prose was in front of the answers it explained, which is
 * the one thing the design system's second principle forbids.
 */
export default async function MadspaceSourcePage({
  params,
}: {
  params: Promise<{ sourceId: string }>;
}) {
  const viewer = await requireViewer();
  if (viewer.role !== "madspace_admin") redirect("/");

  const { sourceId } = await params;
  const plane = await controlPlane();

  if (!plane.ok) {
    return (
      <>
        <Head kicker="Source" title="Source" />
        <section className="mad-plane" aria-labelledby="absent-heading">
          <h2 id="absent-heading" className="obs-sr">
            Control plane
          </h2>
          <ControlPlaneAbsent absence={plane.absence} />
        </section>
      </>
    );
  }

  const located = await locateSource(plane.admin, sourceId);
  if (located === null) {
    return (
      <>
        <Head kicker="Source" title="Source" />
        <section className="mad-plane" aria-labelledby="unreadable-heading">
          <h2 id="unreadable-heading" className="obs-sr">
            Source
          </h2>
          <StateMessage
            title="Unavailable. No source is readable under this identifier"
            detail="It does not exist, it belongs to another account, or it is not a well-formed identifier."
            action={
              <InfoNote label="the unavailable answer">
                <p>
                  The control plane answers all three the same way deliberately: telling them apart
                  would make this screen an existence oracle for somebody else&apos;s estate.
                </p>
              </InfoNote>
            }
          />
        </section>
      </>
    );
  }

  const now = new Date();
  const views = await sourceViews(plane.admin, located.project_id, now);
  const view = views.find((candidate) => candidate.status.source_id === sourceId);

  if (view === undefined) {
    return (
      <>
        <Head kicker="Source" title={located.display_label} />
        <section className="mad-plane" aria-labelledby="unread-identity-heading">
          <h2 id="unread-identity-heading" className="obs-sr">
            Source
          </h2>
          <StateMessage
            title="Unavailable. The source is listed, but its identity row could not be read"
            detail="Its operational row exists and its status row did not come back."
            action={
              <InfoNote label="the unread identity row">
                <p>
                  That is a control-plane inconsistency rather than a state of the installation, and
                  nothing is inferred from it here.
                </p>
              </InfoNote>
            }
          />
        </section>
      </>
    );
  }

  /*
   * The credential's own lifecycle, read directly rather than inferred. This is
   * the authoritative answer to "is this source ACTIVATED": deriving it from a
   * heartbeat would collapse two of the three states into one and hide the case
   * the operator most needs.
   */
  const credentialResult = await plane.admin.credentialStatus({
    account: CONTROL_PLANE_ACCOUNT,
    source: sourceId,
  });
  const credential = credentialResult.ok ? credentialResult.value : null;

  /*
   * The project's NAME, because "Project 9cc04ea5-915a-4726-a908-597decb07b9e"
   * is not an answer to "which project is this". The identifier is still the
   * link target and still copyable from the project's own page; what belongs at
   * the top of a source is the name an operator would say out loud.
   *
   * A separate read, and a tolerant one: the facade is account-scoped rather
   * than project-scoped, so this finds the row among the account's projects. A
   * failure falls back to the identifier rather than to nothing, because a
   * source whose project name cannot be read is still a source worth showing.
   */
  const projects = await plane.admin.projectsForAccount({ account: CONTROL_PLANE_ACCOUNT });
  const projectName =
    projects.ok === true
      ? (projects.value.find((row) => row.project_id === view.status.project_id)?.name ?? null)
      : null;

  const answer = installationAnswer(view, now);

  return (
    <>
      <header className="mad-head">
        <div className="mad-head-text">
          <Kicker>{sourceTypeWord(view.status.source_type)}</Kicker>
          <h1 className="mad-title">{view.status.display_label}</h1>
          {/*
           * The sentence is the answer; the note beside it is the reason that
           * answer is shaped the way it is. `installationAnswer` has written
           * one for nine of its branches all along, and nothing read it, so the
           * screen was computing the explanation and discarding it.
           */}
          <p className="mad-lede">
            {answer.sentence}
            {answer.note === null ? null : (
              <InfoNote label={answer.note.label}>
                <p>{answer.note.text}</p>
              </InfoNote>
            )}
          </p>
          {/*
           * Centred again, and it can be: the two-line note that used to run
           * beside the chip is behind the disclosure now, so there is one line
           * of content on this row and nothing left to top-align against. The
           * `--top` modifier existed only to keep the badge off the middle of
           * that note.
           */}
          <div className="mad-idline">
            <StatusChip tone={HEALTH_TONE[view.health]}>{HEALTH_LABEL[view.health]}</StatusChip>
            <InfoNote label="the one-word summary">
              <p>
                One word for the whole source, by strict precedence: lifecycle before liveness,
                liveness before refusals. The three states below are the detail it summarises.
              </p>
            </InfoNote>
          </div>
        </div>

        {/*
         * The three words an operator asks for before any figure: whose estate,
         * which environment, and whether the source is switched on at all.
         *
         * `.mad-head` is a two-column grid above 64rem, and this screen was the
         * only one of the three leaving the second column empty — so the hero of
         * the surface had a blank right half while the projects list and project
         * detail both carry a tally there. It is the same element in the same
         * place doing the same job; the values are words rather than counts,
         * which project detail's own Status figure already established.
         */}
        <dl className="mad-tally">
          <div className="mad-tally-item">
            {/*
             * `dt` before `dd`, which is what a name-value group is. The pair
             * used to be written the other way round to get the figure above
             * its label, and a reversed source order is not a layout tool.
             *
             * The name IS the way to the project. A separate "Open the project"
             * row below repeated the label and the name within a centimetre of
             * this one, which is two answers to a question asked once.
             */}
            <dt className="mad-tally-label">Project</dt>
            <dd className="mad-tally-value">
              <Link href={dynamicRoute(`/madspace/projects/${view.status.project_id}`)}>
                {projectName ?? "Unknown project"}
              </Link>
            </dd>
          </div>
          <div className="mad-tally-item">
            <dt className="mad-tally-label">Environment</dt>
            <dd className="mad-tally-value">{environmentWord(view.status.environment)}</dd>
          </div>
          <div className="mad-tally-item">
            <dt className="mad-tally-label">Lifecycle</dt>
            <dd className="mad-tally-value">
              <span className="mad-idline">
                <StatusMark tone={lifecycleTone(view.status.state)} />
                <span>{lifecycleWord(view.status.state)}</span>
              </span>
            </dd>
          </div>
        </dl>
      </header>

      <Identity view={view} sourceId={sourceId} now={now} />

      <ThreeStates view={view} credential={credential} now={now} />

      <OperationalHealth view={view} now={now} />

      <Operations view={view} credential={credential} />

      {/*
       * The driver is gated HERE, on the server, so a deployment never sends
       * the component to a browser at all. Gating it inside the component would
       * ship the buttons and hide them, which is a different and weaker claim.
       */}
      {localControlPlaneEnabled() ? <LifecycleDriver /> : null}
    </>
  );
}

function Head({ kicker, title }: { kicker: string; title: string }) {
  return (
    <header className="mad-head">
      <div className="mad-head-text">
        <Kicker>{kicker}</Kicker>
        <h1 className="mad-title">{title}</h1>
      </div>
    </header>
  );
}

/* --- section A: what this source is ------------------------------------------- */

function Identity({ view, sourceId, now }: { view: SourceView; sourceId: string; now: Date }) {
  const { status } = view;
  const created = instant(status.created_at, "Not recorded");
  const seen = instant(status.last_seen_at);
  const seenAge = ageSince(status.last_seen_at, now);

  /*
   * This strip carries what the head above does not already say. Project,
   * environment and lifecycle moved up into the head's tally, and repeating
   * them here would make the strip a second answer to a question answered a
   * centimetre higher. The source type went the same way, into the kicker
   * standing directly above the title. What is left is the two timestamps and
   * the identifier, and the identifier is last.
   *
   * A data panel rather than a row of loose facts: the labels reserve two lines
   * each, so "Created" and "Source identifier" put their values on one baseline
   * instead of one hanging a line below the other.
   */

  return (
    <dl className="mad-datapanel">
      <div>
        <dt>Created</dt>
        <dd data-missing={created.missing}>{created.text}</dd>
      </div>
      <div>
        <dt>Last seen</dt>
        <dd data-missing={seen.missing}>
          {seen.text}
          {seenAge === null ? null : <span className="mad-note"> · {seenAge}</span>}
        </dd>
      </div>
      {/*
       * Deliberately last.
       *
       * It is needed perhaps once a week — for a support conversation or a
       * plugin configuration — and it used to sit on its own full-width row,
       * which made the least-used value on the screen the most prominent one.
       * In the panel it is one cell of three and it is set in the identifier's
       * own quieter ink, so it is still selectable, still copyable, and no
       * longer shouting.
       */}
      <div>
        <dt>Source identifier</dt>
        <dd>
          <span className="mad-idline">
            <span className="mad-id">{sourceId}</span>
            <CopyValue value={sourceId} label="Copy the source identifier" />
          </span>
        </dd>
      </div>
    </dl>
  );
}

/* --- section B: the three states ----------------------------------------------- */

function Fact({ label, reading }: { label: string; reading: Reading }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd data-missing={reading.missing}>{reading.text}</dd>
    </div>
  );
}

/**
 * The rail tone of a state column, and the mark that agrees with it.
 *
 * `absent` takes the RING, not the bar, and this was the other way round until
 * two screens were compared side by side.
 *
 * The bar means no measurement exists. These three are not that: the credential
 * row was read and there is none, the heartbeat column was read and it is null,
 * the verification column was read and it is null. Every one is a definite
 * answer, and every one is a thing this surface is waiting for. The ring says
 * exactly that, and it says it without implying a fault, which is what the
 * triangle would have done.
 *
 * It also has to agree with `HEALTH_TONE`, which draws `never_connected` and
 * `not_verified` as the ring a few centimetres higher on the same page. One
 * installation wearing two shapes for one fact is the drift the single
 * verdict-to-mark table exists to prevent, and this column was producing it.
 */
const STATE_TONE: Readonly<Record<string, MarkTone>> = {
  affirmed: "good",
  pending: "await",
  absent: "await",
};

/** The eyebrow, the word and its mark. Three of these, and they never merge. */
function StateWord({ tone, children }: { tone: string; children: string }) {
  return (
    <h3 className="mad-state-word mad-idline">
      <StatusMark tone={STATE_TONE[tone] ?? "none"} />
      <span>{children}</span>
    </h3>
  );
}

function ThreeStates({
  view,
  credential,
  now,
}: {
  view: SourceView;
  credential: CredentialStatusRow | null;
  now: Date;
}) {
  const { states, operations, heartbeatFresh } = view;
  const heartbeatAge = ageSince(operations?.last_heartbeat_at ?? null, now);
  const cred = credential === null ? null : credentialWord(credential.state);
  const connectionTone = states.connected ? (heartbeatFresh ? "affirmed" : "pending") : "absent";
  /*
   * Three readings, not two. A source that has never spoken and a source that
   * connected and went quiet both read "Offline", which said the same thing
   * about a machine that has never reached us as about one that stopped, and
   * the first is the case this whole surface exists to make visible. Nothing
   * has gone offline; the first heartbeat is still awaited, in the words the
   * health verdict already uses for it.
   */
  const connectionWord = !states.connected
    ? "Awaiting first heartbeat"
    : heartbeatFresh
      ? "Connected"
      : "Offline";

  return (
    <section className="mad-plane" aria-labelledby="states-heading">
      <div className="obs-section-head">
        <div className="mad-idline">
          <h2 id="states-heading">The three states</h2>
          {/*
           * Named for what the panel explains, not for the section. The lede's
           * own note is labelled "the three states" on the healthy reading, and
           * two disclosures on one screen may not answer to the same name.
           */}
          <InfoNote label="why the three states are read separately">
            <p>Each is derived from one persisted column and nothing else.</p>
            <p>
              Three independent facts, read separately. All four combinations occur, and the one
              worth watching for is activated and never connected: a credential exists, and the
              installation has never reached us. Nothing here is a stage of anything else, so there
              is no order to complete and no percentage across them.
            </p>
          </InfoNote>
        </div>
      </div>

      <div className="mad-states">
        {/* ACTIVATION — a credential relationship exists. */}
        <section className="mad-state" data-tone={states.activated ? "affirmed" : "absent"}>
          <span className="mad-meta-label">Activation</span>
          <StateWord tone={states.activated ? "affirmed" : "absent"}>
            {states.activated ? "Activated" : "Not activated"}
          </StateWord>
          <dl className="mad-facts">
            <Fact
              label="Credential"
              reading={
                cred === null
                  ? { text: "None has ever been issued", missing: true }
                  : { text: cred.word, missing: false }
              }
            />
            <Fact
              label="Activated at"
              reading={instant(credential?.created_at ?? null, "Never activated")}
            />
            {credential === null ? null : (
              <Fact
                label="Expires"
                reading={
                  credential.expires_at === null
                    ? { text: "No expiry set", missing: false }
                    : instant(credential.expires_at)
                }
              />
            )}
            {credential?.revoked_at == null ? null : (
              <Fact label="Revoked at" reading={instant(credential.revoked_at)} />
            )}
            {credential?.superseded_at == null ? null : (
              <Fact label="Superseded at" reading={instant(credential.superseded_at)} />
            )}
          </dl>
        </section>

        {/* CONNECTION — a heartbeat has been accepted, and how long ago. */}
        <section className="mad-state" data-tone={connectionTone}>
          <span className="mad-meta-label">Connection</span>
          <StateWord tone={connectionTone}>{connectionWord}</StateWord>
          <dl className="mad-facts">
            <Fact
              label="Last heartbeat"
              reading={instant(operations?.last_heartbeat_at ?? null, "Never")}
            />
            <Fact
              label="Freshness"
              reading={
                !states.connected
                  ? { text: "No heartbeat has ever been accepted", missing: true }
                  : {
                      text: `${heartbeatAge ?? "Age unknown"}, ${heartbeatFresh ? "within" : "older than"} the ${FRESHNESS} window`,
                      missing: false,
                    }
              }
            />
            <Fact
              label="Observed app"
              reading={reported(operations?.observed_app_version ?? null)}
            />
            <Fact label="Observed plugin" reading={reported(operations?.observed_plugin ?? null)} />
            <Fact
              label="Observed build"
              reading={reported(operations?.observed_build_id ?? null)}
            />
            <Fact label="Observed engine" reading={reported(operations?.observed_engine ?? null)} />
            <Fact
              label="Reported environment"
              reading={
                operations?.environment_mismatch === true
                  ? {
                      text: `${reported(operations.observed_environment).text}, which does not match the configured ${environmentWord(view.status.environment)}`,
                      missing: false,
                    }
                  : reported(operations?.observed_environment ?? null)
              }
            />
          </dl>
          {operations?.environment_mismatch === true ? (
            <div className="obs-alert" data-severity="warning">
              <span className="obs-alert-rail" aria-hidden="true" />
              <div className="obs-alert-body">
                <span className="mad-idline">
                  <span className="obs-alert-title">Environment mismatch</span>
                  <InfoNote label="the environment mismatch">
                    <p>
                      The configured value is authoritative and is what every stored event is
                      grouped by, so this does not corrupt the data.
                    </p>
                  </InfoNote>
                </span>
                <p className="obs-alert-detail">
                  The installation reports one environment and is configured as another. It is
                  running a build pointed somewhere else.
                </p>
              </div>
            </div>
          ) : null}
        </section>

        {/* INGESTION — an event has provably reached storage. */}
        <section className="mad-state" data-tone={states.ingestionVerified ? "affirmed" : "absent"}>
          <span className="mad-meta-label">Ingestion</span>
          <div className="mad-idline">
            <StateWord tone={states.ingestionVerified ? "affirmed" : "absent"}>
              {states.ingestionVerified ? "Verified" : "Not verified"}
            </StateWord>
            <InfoNote label="what verifying ingestion proves">
              <p>
                {states.ingestionVerified
                  ? "A test event travelled the whole path into storage at least once."
                  : "No event from this source has yet been proved to reach storage."}
              </p>
            </InfoNote>
          </div>
          <dl className="mad-facts">
            <Fact
              label="Last verification"
              reading={instant(operations?.ingestion_verified_at ?? null, "Never verified")}
            />
            <Fact
              label="Last event accepted"
              reading={instant(view.status.last_ingest_at ?? null, "Never")}
            />
          </dl>
        </section>
      </div>
    </section>
  );
}

/* --- section C: operational health ---------------------------------------------- */

/**
 * One measurement, in a data-panel cell.
 *
 * `raised` is the figure's own state, and it reaches the screen as a mark, a
 * colour and a word rather than as a coloured numeral: a value tinted red on
 * paper says nothing to a greyscale printer or to a reader who cannot separate
 * the hues, and a figure worth noticing is worth saying so about.
 */
function Figure({
  label,
  reading,
  raised = false,
}: {
  label: string;
  reading: Reading;
  raised?: boolean;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd data-missing={reading.missing}>
        {reading.text}
        {raised ? (
          <>
            {" "}
            <StatusChip tone="wrong">Needs attention</StatusChip>
          </>
        ) : null}
      </dd>
    </div>
  );
}

/** Above zero is worth a mark; null is not, and neither is zero. */
function aboveZero(value: number | null): boolean {
  return value !== null && value > 0;
}

/** The fill level, as a shape that agrees with the word beside it. */
const QUEUE_TONE: Readonly<Record<string, MarkTone>> = {
  unknown: "none",
  normal: "good",
  high: "await",
  critical: "wrong",
};

function OperationalHealth({ view, now }: { view: SourceView; now: Date }) {
  const operations = view.operations;

  if (operations === null) {
    return (
      <section className="mad-plane" aria-labelledby="health-heading">
        <div className="obs-section-head">
          <div className="mad-idline">
            <h2 id="health-heading">Operational health</h2>
            <InfoNote label="the missing operational figures">
              <p>Queue depth, quarantine and refusal counts are facts a heartbeat carries.</p>
              <p>
                There is no operational row for this source yet, so there is nothing to show. That
                is different from every figure being zero.
              </p>
            </InfoNote>
          </div>
        </div>
        <StateMessage title="Not reported. This source has never sent a heartbeat" />
      </section>
    );
  }

  const fill = view.queueFillPercent;
  const level =
    fill === null ? "unknown" : fill >= 95 ? "critical" : fill >= 80 ? "high" : "normal";
  const queueWord =
    fill === null
      ? "The last heartbeat carried no outbox measurement"
      : fill >= 95
        ? "At the ceiling. Further events will be refused for capacity"
        : fill >= 80
          ? "Nearing the ceiling"
          : "Normal";

  const used = bytes(operations.queue_bytes_used);
  const ceiling = bytes(operations.queue_bytes_ceiling);
  const heartbeatAge = ageSince(operations.last_heartbeat_at, now);

  /*
   * "Not reported" is the transport's word for a value nobody sent. On an error
   * code the commonest reason there is nothing to show is that nothing went
   * wrong, so the field says so in its own words and still carries
   * `data-missing`: none was recorded, which is not the same as a zero.
   */
  const errorCode = reported(operations.last_error_code);
  const lastError = errorCode.missing ? { text: "None recorded", missing: true } : errorCode;

  return (
    <section className="mad-plane" aria-labelledby="health-heading">
      <div className="obs-section-head">
        <div className="mad-idline">
          <h2 id="health-heading">Operational health</h2>
          <InfoNote label="the operational figures">
            <p>
              <strong>Pending events.</strong> Held in the installation&apos;s outbox, not yet
              accepted.
            </p>
            <p>
              <strong>Oldest pending.</strong> How long the oldest unsent event has waited.
            </p>
            <p>
              <strong>Quarantine.</strong> Refused by the installation before it ever left.
            </p>
            <p>
              <strong>Backend quarantine.</strong> Accepted by transport, then refused by the
              backend.
            </p>
            <p>
              <strong>Validation failures.</strong> Events that did not match the wire contract.
            </p>
            <p>
              <strong>Capacity refusals.</strong> Events dropped because the outbox was full.
            </p>
            <p>
              <strong>Last error code.</strong> A code, never a message. Nothing from a payload
              reaches this screen.
            </p>
            <p>
              <strong>Lifecycle.</strong> Suspension and archival are operator decisions, not
              health.
            </p>
            <p>
              Every field above is optional in a heartbeat: a plugin that cannot measure its outbox
              must still be able to say it is alive. So a figure that was not measured reads not
              reported, and never zero. An empty quarantine and an unmeasured one are different
              facts.
            </p>
          </InfoNote>
        </div>
        <p className="obs-dim">
          {heartbeatAge === null
            ? "No heartbeat has arrived, so nothing below was reported by the installation."
            : `As reported ${heartbeatAge}.`}
        </p>
      </div>

      {/*
       * The outbox, as a fill against its own ceiling — a proportion of a real
       * limit, not a chart. It is drawn only when both numbers exist; a bar at
       * zero percent standing in for an unmeasured queue is the exact lie the
       * doctrine names.
       */}
      <div className="mad-queue" data-level={level}>
        <div className="mad-queue-head">
          <div className="mad-meta-item">
            <span className="mad-meta-label">Outbox</span>
            {/*
             * The ceiling clause appears only when there IS a ceiling. With
             * one number missing this read "0 B of Not reported", which is not
             * a proportion and not a sentence — and the two halves are
             * genuinely independent, because a plugin may measure its outbox
             * without knowing the limit it is measured against.
             */}
            <span className="mad-queue-value" data-missing={used.missing}>
              {used.text}
              {ceiling.missing ? null : <span className="mad-tally-of"> of {ceiling.text}</span>}
            </span>
          </div>
          <div className="mad-meta-item">
            <span className="mad-meta-label">Fill</span>
            <span className="mad-queue-value" data-missing={fill === null}>
              {percent(fill).text}
              <span className="mad-tally-of">
                {" · "}
                <StatusMark tone={QUEUE_TONE[level] ?? "none"} /> {queueWord}
              </span>
            </span>
          </div>
        </div>
        {fill === null ? null : (
          <>
            <div className="mad-queue-track" aria-hidden="true">
              {/* The exact proportion. A minimum width would draw an empty
                  outbox as a sliver of something. */}
              <div className="mad-queue-fill" style={{ width: `${fill}%` }} />
            </div>
            <div className="mad-queue-scale">
              <span>0</span>
              <span>{ceiling.text}</span>
            </div>
          </>
        )}
      </div>

      {/*
       * Two panels of four rather than one of eight.
       *
       * The data panel is a 1px grid over its own ground, and the ground shows
       * wherever a row does not divide evenly: eight cells across seven columns
       * leaves six empty cells painted in the border colour. Four to a panel
       * divides at every width the panel is a grid at.
       */}
      <dl className="mad-datapanel">
        <Figure label="Pending events" reading={count(operations.queue_event_count)} />
        <Figure
          label="Oldest pending"
          reading={ageSeconds(operations.oldest_pending_age_seconds)}
        />
        <Figure
          label="Quarantine"
          reading={count(operations.quarantine_count)}
          raised={aboveZero(operations.quarantine_count)}
        />
        <Figure
          label="Backend quarantine"
          reading={count(operations.backend_quarantine_count)}
          raised={aboveZero(operations.backend_quarantine_count)}
        />
      </dl>

      <dl className="mad-datapanel">
        <Figure
          label="Validation failures"
          reading={count(operations.validation_failure_count)}
          raised={aboveZero(operations.validation_failure_count)}
        />
        <Figure
          label="Capacity refusals"
          reading={count(operations.capacity_refusal_count)}
          raised={aboveZero(operations.capacity_refusal_count)}
        />
        <Figure label="Last error code" reading={lastError} raised={!lastError.missing} />
        <div>
          <dt>Lifecycle</dt>
          {/*
           * The one figure here that is a decision rather than a measurement,
           * so it wears the operator diamond when it is suspended and never a
           * fault colour. Suspension is not a health state.
           */}
          <dd>
            <StatusChip tone={lifecycleTone(view.status.state)}>
              {lifecycleWord(view.status.state)}
            </StatusChip>
          </dd>
        </div>
      </dl>
    </section>
  );
}

/* --- what may be done to it ------------------------------------------------------- */

interface Operation {
  readonly name: string;
  /** What it does and what it leaves behind. Null when the whole line was doctrine. */
  readonly detail: string | null;
  /**
   * The reason behind the `i`, or null when there is nothing to explain.
   *
   * The label carries its own words rather than reusing `name`: the operation
   * names are imperatives, so a disclosure labelled from one announced as
   * "About Issue an activation code", which is the button's instruction said
   * twice and tells a reader nothing about what the panel would say.
   */
  readonly note: { readonly label: string; readonly text: string } | null;
}

/**
 * The operations valid in THIS state, and no others.
 *
 * Archival is terminal, so an archived source offers nothing; a suspended
 * source can still be issued a code, because the client has to be able to come
 * back after it is resumed and refusing here would make suspension a one-way
 * door while pretending to be reversible.
 *
 * Each entry is split in two: what the operator acts on stays on the surface,
 * and the reason the operation is shaped as it is goes behind the disclosure.
 */
function operationsFor(view: SourceView, credential: CredentialStatusRow | null): Operation[] {
  const state = view.status.state;
  if (state === "archived") return [];

  const list: Operation[] = [];

  list.push(
    view.states.activated
      ? {
          name: "Issue a reactivation code",
          detail: null,
          note: {
            label: "the difference between an activation and a reactivation",
            text: "A machine that was reimaged and came back produces the same credential row as a first activation and means something very different, so the purpose is recorded server-side.",
          },
        }
      : {
          name: "Issue an activation code",
          detail: null,
          note: {
            label: "how long an activation code lives",
            text: "Single-use, and short-lived by design: it is accepted unauthenticated and mints a long-lived credential.",
          },
        },
  );

  if (credential !== null && credential.state === "active") {
    list.push({
      name: "Revoke the credential",
      detail: "Ends the credential relationship. The source stays Activated in the record.",
      note: {
        label: "what a revocation leaves in the record",
        text: "Activated then revoked has to look different from never activated.",
      },
    });
  }

  if (state === "active") {
    list.push({
      name: "Suspend",
      /*
       * Reversibility stays in front. It is the fact an operator weighs before
       * pressing a switch that stops a machine in a building. That suspension
       * is not a health state is doctrine, and it is already behind the
       * disclosure on the Lifecycle figure above rather than repeated here.
       */
      detail: "Switches the installation off deliberately. Reversible.",
      note: null,
    });
  }

  if (state === "suspended") {
    list.push({
      name: "Resume",
      /*
       * Resume is only ever offered from `suspended`, so the operator reading
       * this is not looking at an archived source and never was.
       */
      detail: "Returns the source to active.",
      note: null,
    });
  }

  list.push({
    name: "Archive",
    detail: "Terminal. An archived source cannot be resumed and cannot be issued a code.",
    note: null,
  });

  return list;
}

function Operations({
  view,
  credential,
}: {
  view: SourceView;
  credential: CredentialStatusRow | null;
}) {
  const operations = operationsFor(view, credential);

  return (
    <section className="mad-plane" aria-labelledby="operations-heading">
      <div className="obs-section-head">
        <h2 id="operations-heading">Operations</h2>
        <p className="obs-dim">Valid in the {lifecycleWord(view.status.state)} state.</p>
      </div>

      {/*
       * The scope, in front and not behind the `i`.
       *
       * These controls do not edit a record. They reach a credential, a
       * boundary and a machine standing somewhere outside this page, and the
       * party a write reaches is the one class of sentence that may never move
       * behind a disclosure. Ink as a surface is the signal that what follows
       * is scoped wider than the screen.
       */}
      <div className="mad-scope-band">
        <p className="mad-scope-band-kicker">These operations reach</p>
        <p className="mad-scope-band-title">
          {CONTROL_PLANE_ACCOUNT_NAME}, {view.status.display_label}
        </p>
        <p className="mad-scope-band-detail">
          The installation itself, not this record: the credential it holds, whether the boundary
          accepts what it sends, and the events it is still holding.
        </p>
      </div>

      {operations.length === 0 ? (
        <StateMessage
          title="None. Archival is terminal"
          action={
            /*
             * The name says what the panel explains. "About archival" was the
             * noun already standing in the title beside it, which is the one
             * shape a disclosure's name may not take: it repeats the title
             * rather than telling a reader what is behind the control. The
             * lede's own note on this branch answers to "the Archived state",
             * so the two do not collide.
             */
            <InfoNote label="what archiving a source forecloses">
              <p>
                An archived source cannot be resumed, cannot be issued an activation code and cannot
                be suspended.
              </p>
              <p>Its record is kept; nothing further is done to it.</p>
            </InfoNote>
          }
        />
      ) : (
        <ul className="mad-ops">
          {operations.map((operation) => (
            <li key={operation.name}>
              <span className="mad-idline">
                <span className="mad-op-name">{operation.name}</span>
                {operation.note === null ? null : (
                  <InfoNote label={operation.note.label}>
                    <p>{operation.note.text}</p>
                  </InfoNote>
                )}
              </span>
              {operation.detail === null ? null : (
                <p className="mad-op-detail">{operation.detail}</p>
              )}
            </li>
          ))}
        </ul>
      )}

      {/*
       * Offered as well as described. The controls are mounted here rather than
       * beside each list entry so the reading — what is valid in this state —
       * and the doing stay separable; only the operations valid in the current
       * lifecycle render a control at all.
       */}
      <ActivationCodeDialog
        sourceId={view.status.source_id}
        sourceLabel={view.status.display_label}
        activated={view.states.activated}
        lifecycle={view.status.state}
        credentialCreatedAt={credential?.created_at ?? null}
        credentialRevokedAt={credential?.revoked_at ?? null}
      />

      <SourceActions
        sourceId={view.status.source_id}
        lifecycle={view.status.state}
        credentialActive={credential?.state === "active"}
      />
    </section>
  );
}
