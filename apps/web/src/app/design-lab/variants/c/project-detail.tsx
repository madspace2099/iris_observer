import { StatusChip, StatusMark, type MarkTone } from "@/components/madspace/StatusMark";
import {
  ageSince,
  count,
  environmentWord,
  instant,
  lifecycleWord,
  percent,
  sourceTypeWord,
  type Reading,
} from "@/lib/madspace/format";
import {
  HEALTH_LABEL,
  HEALTH_TONE,
  type SourceHealth,
  type SourceView,
} from "@/lib/sources/control-plane";

import type { LabScreenProps } from "../../lab-data";

/**
 * VARIANT C, PROJECT DETAIL. HYBRID EXECUTIVE.
 *
 * The bridge. Above the seam, on graphite, the thing the rows belong to: the
 * project's name, its lifecycle, the sentence its counts add up to and the one
 * control that changes it. Below the seam, on paper, what was measured: the
 * counts themselves, and one ruled row per source.
 *
 * ## The row is a door, and it is shaped like the screen behind it
 *
 * A source row here carries the three states in the same order, with the same
 * words and the same marks that Source detail gives them its whole hero for.
 * Opening a row should feel like the same three facts getting more room rather
 * than like arriving at an unrelated page, so nothing is renamed on the way
 * through and nothing is summarised on the way in.
 *
 * ## Three words, never one
 *
 * This is the first place an operator would notice that a healthy looking
 * installation has never delivered anything, and a single dot per row would
 * hide exactly that. So each row states Activation, Connection and Ingestion in
 * three separate cells, each with its own word and its own mark. They are never
 * collapsed into one dot, one percentage or one bar, and they are never
 * ordered as stages of one another.
 *
 * ## The verdict speaks only when it adds something
 *
 * `classifyHealth` puts lifecycle above liveness deliberately, so on a
 * suspended or archived source the verdict repeats the lifecycle chip word for
 * word, and on an offline one it repeats the connection word. Drawing both
 * printed "Offline" twice on one row and made a deliberate precedence read as a
 * stutter. The verdict is therefore rendered only where it says something the
 * row has not already said, and its word and its mark both come from the one
 * shared table rather than from a vocabulary of this screen's own.
 */

const PLURALS = new Intl.PluralRules("en-GB");

function plural(n: number, one: string, other: string): string {
  return PLURALS.select(n) === "one" ? one : other;
}

/**
 * Lifecycle to mark, one shape per value.
 *
 * The same table Source detail declares, keyed on the word `lifecycleWord`
 * returns. One function for the project's status and for a source's lifecycle,
 * because they are the same vocabulary read at two scales, and a state drawn as
 * a circle at one scale and a square at the other is the failure a shared mark
 * exists to prevent.
 */
const LIFECYCLE_TONE: Readonly<Record<string, MarkTone>> = {
  Active: "good",
  Suspended: "operator",
  Archived: "settled",
};

/** A value, or the word that stands where a value is not. */
function Value({ reading }: { reading: Reading }) {
  if (!reading.missing) return <span className="dlc-value">{reading.text}</span>;

  return (
    <span className="dlc-value" data-missing="true">
      <StatusMark tone="none" />
      <span>{reading.text}</span>
    </span>
  );
}

/** One count, and the whole it is a part of. The "of N" may dim, never vanish. */
function Tally({ label, part, whole }: { label: string; part: number; whole?: number }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        <span className="dlc-figure">{count(part).text}</span>
        {whole === undefined ? null : <span className="dlc-of">of {count(whole).text}</span>}
      </dd>
    </div>
  );
}

/** One labelled reading in a row's evidence column. */
function Fact({ label, reading, age }: { label: string; reading: Reading; age?: string | null }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        <Value reading={reading} />
        {age === undefined || age === null ? null : <span className="dlc-age">{age}</span>}
      </dd>
    </div>
  );
}

/**
 * The middle state, in three words rather than two.
 *
 * "Offline" was doing duty for a source that connected and has gone quiet AND
 * for one that has never been heard from, which is the one substitution this
 * surface may never make: they are different situations with different next
 * actions. Both wear the ring, because both are waits and nothing is wrong with
 * a showroom machine switched off overnight.
 */
function connectionState(view: SourceView): { word: string; tone: MarkTone } {
  if (!view.states.connected) return { word: "Never connected", tone: "await" };
  return view.heartbeatFresh
    ? { word: "Connected", tone: "good" }
    : { word: "Offline", tone: "await" };
}

/** The verdict, unless another mark on this row has already said its word. */
function healthVerdict(view: SourceView): SourceHealth | null {
  if (view.health === "suspended" || view.health === "archived") return null;
  if (view.health === "offline") return null;
  return view.health;
}

/**
 * What the project's sources add up to, in one sentence.
 *
 * Composed from the same rows the list below renders, so the sentence and the
 * rows cannot disagree. Every branch names the party waited on where there is
 * one, and none of them claims a state that a row does not carry.
 */
function projectAnswer(views: readonly SourceView[]): string {
  const total = views.length;
  if (total === 0) return "No sources are registered against this project yet.";

  const connected = views.filter((view) => view.states.connected).length;
  const verified = views.filter((view) => view.states.ingestionVerified).length;
  const noun = plural(total, "source", "sources");

  if (connected === 0) {
    return `${count(total).text} ${noun}, and none has ever been heard from. Waiting on the installations for a first heartbeat.`;
  }
  return `${count(connected).text} of ${count(total).text} ${noun} ${plural(connected, "has", "have")} connected, and ${count(verified).text} of ${count(total).text} ${plural(verified, "has", "have")} proved an event reaches storage.`;
}

function SourceRow({ view, now }: { view: SourceView; now: Date }) {
  const { status, operations, states } = view;
  const heartbeat = instant(operations?.last_heartbeat_at ?? null);
  const verification = instant(operations?.ingestion_verified_at ?? null);
  const age = ageSince(operations?.last_heartbeat_at ?? null, now);
  const connection = connectionState(view);
  const verdict = healthVerdict(view);
  const lifecycle = lifecycleWord(status.state);

  return (
    <article className="dlc-row">
      <div className="dlc-row-id">
        <p className="dlc-micro">{sourceTypeWord(status.source_type)}</p>
        <h3 className="dlc-row-name">{status.display_label}</h3>
        <div className="dlc-row-chips">
          {/*
           * The environment is authoritative and never what a client reported,
           * so it is a plain word rather than a state chip. A chip would put it
           * at the weight of the states beside it.
           */}
          <span className="dlc-tag">{environmentWord(status.environment)}</span>
          <StatusChip tone={LIFECYCLE_TONE[lifecycle] ?? "none"}>{lifecycle}</StatusChip>
          {verdict === null ? null : (
            <StatusChip tone={HEALTH_TONE[verdict]}>{HEALTH_LABEL[verdict]}</StatusChip>
          )}
          {/*
           * A mismatch is the triangle: the installation is running a build
           * pointed at another environment, and somebody has work to do.
           */}
          {operations?.environment_mismatch === true ? (
            <StatusChip tone="wrong">Environment mismatch</StatusChip>
          ) : null}
        </div>
      </div>

      {/*
       * THE THREE STATES, AS THREE WORDS IN THREE CELLS.
       *
       * Configured, reachable, delivering. Each answers a different question,
       * none implies the next, and every combination of the three occurs. An
       * unmet state here is the ring rather than the bar: activation happens on
       * the showroom machine and verification waits on an event, so both are
       * waits on the installation rather than measurements we were never given.
       */}
      <dl className="dlc-states">
        <div>
          <dt>Activation</dt>
          <dd>
            <StatusChip tone={states.activated ? "good" : "await"}>
              {states.activated ? "Activated" : "Not activated"}
            </StatusChip>
          </dd>
        </div>
        <div>
          <dt>Connection</dt>
          <dd>
            <StatusChip tone={connection.tone}>{connection.word}</StatusChip>
          </dd>
        </div>
        <div>
          <dt>Ingestion</dt>
          <dd>
            <StatusChip tone={states.ingestionVerified ? "good" : "await"}>
              {states.ingestionVerified ? "Verified" : "Not verified"}
            </StatusChip>
          </dd>
        </div>
      </dl>

      {/*
       * The evidence behind the three words. Every field here is optional in a
       * heartbeat, so each runs through `Value`: an outbox that was never
       * measured reads as a word with the bar mark and never as a zero per
       * cent, which would be a confident figure nobody would question.
       */}
      <dl className="dlc-when" data-stack="true">
        <Fact label="Last heartbeat" reading={heartbeat} age={age} />
        <Fact label="Ingestion verified" reading={verification} />
        <Fact label="Outbox fill" reading={percent(view.queueFillPercent)} />
      </dl>

      <div className="dlc-row-go">
        <button type="button" className="dlc-btn" data-kind="secondary">
          Open source
        </button>
      </div>
    </article>
  );
}

export function ProjectDetailC({ estate, variantName }: LabScreenProps) {
  const project = estate.project;
  const views = estate.sources;
  const name = variantName;

  /*
   * The counts come from the rows rather than from the project summary, so the
   * figures above the list and the rows in it are two renderings of one read.
   * `never` is a figure of its own rather than Connected subtracted from
   * Sources: it answers "how many installations have never been heard from at
   * all", which is the question that sends somebody to a showroom, and an
   * operator doing the arithmetic in their head is not reading it.
   */
  const total = views.length;
  const connected = views.filter((view) => view.states.connected).length;
  const verified = views.filter((view) => view.states.ingestionVerified).length;
  const never = total - connected;

  /*
   * The project's own status, or the fact that its row was not in the list.
   * `lifecycleWord` rather than a local ternary, so a status this surface has
   * never heard of arrives in words instead of as a confident wrong one.
   */
  const lifecycle = project === null ? "Unknown" : lifecycleWord(project.status);
  const lifecycleTone: MarkTone = project === null ? "none" : (LIFECYCLE_TONE[lifecycle] ?? "none");

  const identifier: Reading =
    project === null
      ? { text: "Not recorded", missing: true }
      : { text: project.projectId, missing: false };

  const readAt = instant(estate.now.toISOString());

  return (
    <div className="dlc-root dlc-graphite">
      <a className="dlc-skip" href="#dlc-work">
        Skip to the sources
      </a>

      <div className="dlc-frame">
        <div className="dlc-rail">
          <p className="dlc-rail-mark">
            IRIS Observer <span>MADSPACE operations</span>
          </p>
          <p className="dlc-rail-lab">Design lab &middot; Variant C &middot; {name}</p>
        </div>

        <header>
          <div className="dlc-mast-grid">
            <div className="dlc-mast-text">
              <p className="dlc-kicker">Project</p>
              <h1 className="dlc-title">{project?.name ?? "Unknown project"}</h1>
              <p className="dlc-answer">{projectAnswer(views)}</p>
              {/*
               * The verdict slot holds the project's LIFECYCLE, which is the
               * only single state a project has. It is a decision an operator
               * made, not a reading of whether the installations underneath it
               * are delivering, and the note says so where a reader would
               * otherwise assume the chip summarised the rows.
               */}
              <div className="dlc-verdict">
                <StatusChip tone={lifecycleTone}>{lifecycle}</StatusChip>
                <span className="dlc-verdict-note">
                  The project's own lifecycle, which a person sets. It is not a reading of whether
                  its installations are delivering; that belongs to each source below.
                </span>
              </div>
            </div>

            {/*
             * NON FUNCTIONAL, DELIBERATELY. One filled control per view, and it
             * is the one that adds the seventh row to the list a reader has just
             * finished counting.
             */}
            <div className="dlc-controls">
              <p className="dlc-controls-label">Project controls</p>
              <div className="dlc-controls-row">
                <button type="button" className="dlc-btn" data-kind="primary">
                  Add source
                </button>
              </div>
              <p className="dlc-controls-note">
                Inert in the design lab. The control is not wired to an action.
              </p>
            </div>
          </div>

          {/*
           * The scope band: whose estate this project sits in, when the estate
           * was read, and the identifier an operator reads down a phone line.
           * The identifier takes the widest cell and the quietest ink, because
           * it is wanted perhaps once a week.
           */}
          <dl className="dlc-scope" data-cells="3">
            <div>
              <dt>Account</dt>
              <dd>
                <span className="dlc-value">{estate.accountName}</span>
              </dd>
            </div>
            <div>
              <dt>Read at</dt>
              <dd>
                <Value reading={readAt} />
              </dd>
            </div>
            <div>
              <dt>Project identifier</dt>
              <dd>
                {identifier.missing ? (
                  <Value reading={identifier} />
                ) : (
                  <span className="dlc-id">{identifier.text}</span>
                )}
              </dd>
            </div>
          </dl>
        </header>

        <div id="dlc-work" className="dlc-plate dlc-paper">
          {/* --- what the project adds up to ------------------------------- */}
          <section className="dlc-region" aria-labelledby="dlc-delivering">
            <div className="dlc-region-head">
              <h2 id="dlc-delivering">What this project is delivering</h2>
              <p className="dlc-lede">
                Four counts against one denominator, read from the same rows as the list below.
                Connected and Ingestion verified are independent: a project can be fully connected
                and have proved nothing, which is why neither is drawn as a share of the other.
              </p>
            </div>

            <dl className="dlc-panel">
              <Tally label="Sources" part={total} />
              <Tally label="Connected" part={connected} whole={total} />
              <Tally label="Never connected" part={never} whole={total} />
              <Tally label="Ingestion verified" part={verified} whole={total} />
            </dl>
          </section>

          {/* --- the sources ------------------------------------------------ */}
          <section className="dlc-region" aria-labelledby="dlc-sources">
            <div className="dlc-region-head">
              <h2 id="dlc-sources">Sources</h2>
              <p className="dlc-lede">
                One row per installation, and every row states its three states as three words. This
                is the first place an operator would see that a healthy looking installation has
                never delivered anything, so nothing here is summarised into a single mark.
              </p>
              <details className="dlc-note">
                <summary>What each of the three states proves</summary>
                <dl className="dlc-note-body">
                  <div>
                    <dt>Activation</dt>
                    <dd>
                      A credential exists. It says nothing about whether the machine has ever run. A
                      source is created here and activated from the showroom machine itself, so an
                      unactivated source is a wait rather than a fault.
                    </dd>
                  </div>
                  <div>
                    <dt>Connection</dt>
                    <dd>
                      A heartbeat has been accepted, and the most recent one is recent enough to
                      still mean something. It says nothing about whether the machine's events land.
                    </dd>
                  </div>
                  <div>
                    <dt>Ingestion</dt>
                    <dd>
                      One event travelled the whole path into storage at least once. It is not a
                      rate and not a guarantee that the next one will.
                    </dd>
                  </div>
                  <div>
                    <dt>The verdict chip</dt>
                    <dd>
                      One word for the whole source, by strict precedence, and it is drawn only
                      where it says something the row has not already said.
                    </dd>
                  </div>
                </dl>
              </details>
            </div>

            {views.length === 0 ? (
              <div className="dlc-empty">
                <p className="dlc-empty-title">No sources yet</p>
                <p className="dlc-empty-note">
                  A source is created here and then activated from the showroom machine itself, so a
                  new one appears in this list before it has anything to report.
                </p>
              </div>
            ) : (
              <div className="dlc-list">
                {views.map((view) => (
                  <SourceRow key={view.status.source_id} view={view} now={estate.now} />
                ))}
              </div>
            )}
          </section>
        </div>

        <footer className="dlc-foot">
          <p>Development instrument. Nothing on this route writes to the control plane.</p>
        </footer>
      </div>
    </div>
  );
}
