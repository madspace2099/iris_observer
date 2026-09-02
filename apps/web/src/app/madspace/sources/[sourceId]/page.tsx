import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { CredentialStatusRow } from "@observer/sources";
import { Badge, Kicker, StateMessage } from "@observer/ui";
import { requireViewer } from "@/lib/session";
import { dynamicRoute } from "@/lib/href";
import {
  controlPlane,
  sourceViews,
  CONTROL_PLANE_ACCOUNT,
  HEALTH_LABEL,
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
import { ControlPlaneAbsent } from "@/components/madspace/ControlPlaneAbsent";
import { CopyValue } from "@/components/madspace/CopyValue";

export const metadata: Metadata = { title: "Source" };

/** The freshness window, said in the same words everywhere on the screen. */
const FRESHNESS = duration(Math.round(HEARTBEAT_FRESH_MS / 1000));

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
 * them, and no fourth state derived from them; each carries its own word,
 * because status is never communicated by colour alone.
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
        <section className="mad-plane">
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
        <section className="mad-plane">
          <StateMessage
            title="Unavailable — no source is readable under this identifier"
            detail="It does not exist, it belongs to another account, or it is not a well-formed identifier. The control plane answers all three the same way deliberately: telling them apart would make this screen an existence oracle for somebody else's estate."
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
        <section className="mad-plane">
          <StateMessage
            title="Unavailable — the source is listed but its identity row could not be read"
            detail="Its operational row exists and its status row did not come back. That is a control-plane inconsistency rather than a state of the installation, and nothing is inferred from it here."
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

  const answer = installationAnswer(view, now);

  return (
    <>
      <header className="mad-head">
        <div className="mad-head-text">
          <Kicker>{sourceTypeWord(view.status.source_type)}</Kicker>
          <h1 className="mad-title">{view.status.display_label}</h1>
          <p className="mad-lede">{answer.sentence}</p>
          <div className="mad-idline">
            <Badge state={answer.tone}>{HEALTH_LABEL[view.health]}</Badge>
            <span className="mad-note">
              One word for the whole source, by strict precedence: lifecycle before liveness,
              liveness before refusals. The three states below are the detail it summarises.
            </span>
          </div>
        </div>
      </header>

      <Identity view={view} sourceId={sourceId} now={now} />

      <ThreeStates view={view} credential={credential} now={now} />

      <OperationalHealth view={view} now={now} />

      <Operations view={view} credential={credential} />
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
  const created = instant(status.created_at);
  const seen = instant(status.last_seen_at);
  const seenAge = ageSince(status.last_seen_at, now);

  return (
    <dl className="mad-meta">
      <div className="mad-meta-item">
        <dt className="mad-meta-label">Project</dt>
        <dd className="mad-meta-value">
          <Link className="mad-id" href={dynamicRoute(`/madspace/projects/${status.project_id}`)}>
            {status.project_id}
          </Link>
        </dd>
      </div>
      <div className="mad-meta-item">
        <dt className="mad-meta-label">Source type</dt>
        <dd className="mad-meta-value">{sourceTypeWord(status.source_type)}</dd>
      </div>
      <div className="mad-meta-item">
        <dt className="mad-meta-label">Environment</dt>
        <dd className="mad-meta-value">{environmentWord(status.environment)}</dd>
      </div>
      <div className="mad-meta-item">
        <dt className="mad-meta-label">Lifecycle</dt>
        <dd className="mad-meta-value">{lifecycleWord(status.state)}</dd>
      </div>
      <div className="mad-meta-item">
        <dt className="mad-meta-label">Created</dt>
        <dd className="mad-meta-value" data-missing={created.missing}>
          {created.text}
        </dd>
      </div>
      <div className="mad-meta-item">
        <dt className="mad-meta-label">Last seen</dt>
        <dd className="mad-meta-value" data-missing={seen.missing}>
          {seen.text}
          {seenAge === null ? null : <span className="mad-note"> · {seenAge}</span>}
        </dd>
      </div>
      <div className="mad-meta-item">
        <dt className="mad-meta-label">Source identifier</dt>
        <dd className="mad-meta-value">
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

  return (
    <section className="mad-plane" aria-labelledby="states-heading">
      <div className="obs-section-head">
        <h2 id="states-heading">The three states</h2>
        <p className="obs-dim">Each is derived from one persisted column and nothing else.</p>
      </div>

      <div className="mad-states">
        {/* ACTIVATION — a credential relationship exists. */}
        <section className="mad-state" data-tone={states.activated ? "affirmed" : "absent"}>
          <h3 className="mad-state-label">Activation</h3>
          <p className="mad-state-word">{states.activated ? "Activated" : "Not activated"}</p>
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
        <section
          className="mad-state"
          data-tone={states.connected ? (heartbeatFresh ? "affirmed" : "pending") : "absent"}
        >
          <h3 className="mad-state-label">Connection</h3>
          <p className="mad-state-word">
            {states.connected && heartbeatFresh ? "Connected" : "Offline"}
          </p>
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
                      text: `${heartbeatAge ?? "Age unknown"} — ${heartbeatFresh ? "within" : "older than"} the ${FRESHNESS} window`,
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
                      text: `${reported(operations.observed_environment).text} — does not match the configured ${environmentWord(view.status.environment)}`,
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
                <span className="obs-alert-title">Environment mismatch</span>
                <p className="obs-alert-detail">
                  The installation reports one environment and is configured as another. The
                  configured value is authoritative and is what every stored event is grouped by, so
                  this does not corrupt the data — it means the machine is running a build pointed
                  somewhere else.
                </p>
              </div>
            </div>
          ) : null}
        </section>

        {/* INGESTION — an event has provably reached storage. */}
        <section className="mad-state" data-tone={states.ingestionVerified ? "affirmed" : "absent"}>
          <h3 className="mad-state-label">Ingestion</h3>
          <p className="mad-state-word">{states.ingestionVerified ? "Verified" : "Not verified"}</p>
          <dl className="mad-facts">
            <Fact
              label="Last verification"
              reading={instant(operations?.ingestion_verified_at ?? null, "Never verified")}
            />
            <Fact
              label="Last event accepted"
              reading={instant(view.status.last_ingest_at ?? null, "Never")}
            />
            <Fact
              label="What it proves"
              reading={{
                text: states.ingestionVerified
                  ? "A test event travelled the whole path into storage at least once."
                  : "No event from this source has yet been proved to reach storage.",
                missing: !states.ingestionVerified,
              }}
            />
          </dl>
        </section>
      </div>

      <p className="mad-note">
        Three independent facts, read separately. All four combinations occur, and the one worth
        watching for is activated and never connected: a credential exists, and the installation has
        never reached us. Nothing here is a stage of anything else, so there is no order to complete
        and no percentage across them.
      </p>
    </section>
  );
}

/* --- section C: operational health ---------------------------------------------- */

function Figure({
  label,
  reading,
  note,
  tone,
}: {
  label: string;
  reading: Reading;
  note: string;
  tone?: "watch" | "weak";
}) {
  return (
    <div className="mad-figure">
      <span className="mad-figure-label">{label}</span>
      <span className="mad-figure-value" data-missing={reading.missing} data-tone={tone}>
        {reading.text}
      </span>
      <span className="mad-figure-note">{note}</span>
    </div>
  );
}

/** Above zero is worth a colour; null is not, and neither is zero. */
function raised(value: number | null, tone: "watch" | "weak"): "watch" | "weak" | undefined {
  return value !== null && value > 0 ? tone : undefined;
}

function OperationalHealth({ view, now }: { view: SourceView; now: Date }) {
  const operations = view.operations;

  if (operations === null) {
    return (
      <section className="mad-plane" aria-labelledby="health-heading">
        <div className="obs-section-head">
          <h2 id="health-heading">Operational health</h2>
        </div>
        <StateMessage
          title="Not reported — this source has never sent a heartbeat"
          detail="Queue depth, quarantine and refusal counts are facts a heartbeat carries. There is no operational row for this source yet, so there is nothing to show — which is different from every figure being zero, and is shown as such."
        />
      </section>
    );
  }

  const fill = view.queueFillPercent;
  const level =
    fill === null ? "unknown" : fill >= 95 ? "critical" : fill >= 80 ? "high" : "normal";
  const queueWord =
    fill === null
      ? "Not reported — the last heartbeat carried no outbox measurement"
      : fill >= 95
        ? "At the ceiling — further events will be refused for capacity"
        : fill >= 80
          ? "Nearing the ceiling"
          : "Normal";

  const used = bytes(operations.queue_bytes_used);
  const ceiling = bytes(operations.queue_bytes_ceiling);
  const heartbeatAge = ageSince(operations.last_heartbeat_at, now);

  return (
    <section className="mad-plane" aria-labelledby="health-heading">
      <div className="obs-section-head">
        <h2 id="health-heading">Operational health</h2>
        <p className="obs-dim">
          {heartbeatAge === null
            ? "As last reported by the installation."
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
            <span className="mad-queue-value" data-missing={used.missing}>
              {used.text}
              <span className="mad-tally-of"> of {ceiling.text}</span>
            </span>
          </div>
          <div className="mad-meta-item">
            <span className="mad-meta-label">Fill</span>
            <span className="mad-queue-value" data-missing={fill === null}>
              {percent(fill).text}
              <span className="mad-tally-of"> · {queueWord}</span>
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

      <div className="mad-figures">
        <Figure
          label="Pending events"
          reading={count(operations.queue_event_count)}
          note="Held in the installation's outbox, not yet accepted."
        />
        <Figure
          label="Oldest pending"
          reading={ageSeconds(operations.oldest_pending_age_seconds)}
          note="How long the oldest unsent event has waited."
        />
        <Figure
          label="Quarantine"
          reading={count(operations.quarantine_count)}
          note="Refused by the installation before it ever left."
          tone={raised(operations.quarantine_count, "weak")}
        />
        <Figure
          label="Backend quarantine"
          reading={count(operations.backend_quarantine_count)}
          note="Accepted by transport, then refused by the backend."
          tone={raised(operations.backend_quarantine_count, "weak")}
        />
        <Figure
          label="Validation failures"
          reading={count(operations.validation_failure_count)}
          note="Events that did not match the wire contract."
          tone={raised(operations.validation_failure_count, "watch")}
        />
        <Figure
          label="Capacity refusals"
          reading={count(operations.capacity_refusal_count)}
          note="Events dropped because the outbox was full."
          tone={raised(operations.capacity_refusal_count, "watch")}
        />
        <Figure
          label="Last error code"
          reading={reported(operations.last_error_code)}
          note="A code, never a message. Nothing from a payload reaches this screen."
          tone={operations.last_error_code === null ? undefined : "watch"}
        />
        <Figure
          label="Lifecycle"
          reading={{ text: lifecycleWord(view.status.state), missing: false }}
          note="Suspension and archival are operator decisions, not health."
        />
      </div>

      <p className="mad-note">
        Every field above is optional in a heartbeat: a plugin that cannot measure its outbox must
        still be able to say it is alive. So a figure that was not measured reads not reported, and
        never zero — an empty quarantine and an unmeasured one are different facts.
      </p>
    </section>
  );
}

/* --- what may be done to it ------------------------------------------------------- */

interface Operation {
  readonly name: string;
  readonly detail: string;
}

/**
 * The operations valid in THIS state, and no others.
 *
 * Archival is terminal, so an archived source offers nothing; a suspended
 * source can still be issued a code, because the client has to be able to come
 * back after it is resumed and refusing here would make suspension a one-way
 * door while pretending to be reversible.
 */
function operationsFor(view: SourceView, credential: CredentialStatusRow | null): Operation[] {
  const state = view.status.state;
  if (state === "archived") return [];

  const list: Operation[] = [];

  list.push({
    name: view.states.activated ? "Issue a reactivation code" : "Issue an activation code",
    detail: view.states.activated
      ? "A machine that was reimaged and came back produces the same credential row as a first activation and means something very different, so the purpose is recorded server-side."
      : "Single-use, and short-lived by design: it is accepted unauthenticated and mints a long-lived credential.",
  });

  if (credential !== null && credential.state === "active") {
    list.push({
      name: "Revoke the credential",
      detail:
        "Ends the credential relationship. The source stays Activated in the record — activated then revoked has to look different from never activated.",
    });
  }

  if (state === "active") {
    list.push({
      name: "Suspend",
      detail: "Switches the installation off deliberately. Reversible, and not a health state.",
    });
  }

  if (state === "suspended") {
    list.push({
      name: "Resume",
      detail: "Returns the source to active. Archived sources cannot be resumed.",
    });
  }

  list.push({
    name: "Archive",
    detail: "Terminal. An archived source cannot be resumed and cannot be issued a code.",
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

      {operations.length === 0 ? (
        <StateMessage
          title="None — archival is terminal"
          detail="An archived source cannot be resumed, cannot be issued an activation code and cannot be suspended. Its record is kept; nothing further is done to it."
        />
      ) : (
        <ul className="mad-ops">
          {operations.map((operation) => (
            <li key={operation.name}>
              <span className="mad-op-name">{operation.name}</span>
              <p className="mad-op-detail">{operation.detail}</p>
            </li>
          ))}
        </ul>
      )}

      <p className="mad-note">
        Described, not offered. The module that performs these operations is not present in this
        build, and a button that does nothing teaches an operator something false about the estate —
        so the list says what is valid here and stops.
      </p>
    </section>
  );
}
