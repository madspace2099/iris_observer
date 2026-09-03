import type { LabScreenProps } from "../../lab-data";
import {
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
  reported,
  sourceTypeWord,
  type Reading,
} from "@/lib/madspace/format";
import { StatusChip, StatusMark, type MarkTone } from "@/components/madspace/StatusMark";

/**
 * VARIANT A, ONE PROJECT AND ITS INSTALLATIONS.
 *
 * The bridge screen, and it is built from the same parts as the two either side
 * of it: the masthead and gutter of the estate, the head and colophon rail of
 * Source detail, the hairline-divided panel of the estate's list.
 *
 * ## What makes it a bridge
 *
 * Upward, the head is the thing the rows belong to: the project's name at
 * display size, its lifecycle as a mark and a word beside the kicker, and four
 * counts under one rule that are all shares of the same denominator.
 *
 * Downward, every row wears the three states under the SAME three eyebrows the
 * hero on Source detail uses, in the same order: Activation, Connection,
 * Ingestion. A reader who opens a row meets the three words again, at display
 * size, with their evidence and their dates. The row is the summary of that
 * page and it is drawn to look like one.
 *
 * ## Why three words and never one dot
 *
 * The three states are independent and all of the combinations occur. This list
 * is the first place an operator would notice that a healthy-looking
 * installation has never delivered anything, and a single green dot per row
 * would hide exactly that. So the row carries three words, each with its own
 * shape and its own colour, and there is no summary mark across them, no
 * ordering that would make one a stage of another, and no percentage.
 */
export function ProjectDetailA({ estate, screenName, variantName }: LabScreenProps) {
  const project = estate.project;
  const views = byHeartbeat(estate.sources);
  const shares = countStates(estate.sources);
  const status = projectState(project?.status ?? null);
  /*
   * The identifier, from the project row where there is one and from the
   * sources otherwise. `reported()` rather than a hand-written fallback, so an
   * identifier this screen does not hold arrives as a word rather than as an
   * empty span.
   */
  const identifier = reported(
    project?.projectId ?? estate.sources.at(0)?.status.project_id ?? null,
  );

  return (
    <div className="dla-root">
      <header className="dla-masthead">
        <div className="dla-gutter dla-masthead-row">
          <span className="dla-masthead-mark">IRIS Observer</span>
          <span className="dla-masthead-where">MADSPACE operations</span>
          <span className="dla-masthead-lab">
            {screenName}, variant A, {variantName}
          </span>
        </div>
      </header>

      <div className="dla-gutter">
        <header className="dla-head">
          {/*
           * The state sits in the first line, beside the kicker, because
           * principle 02 asks a screen to lead with it. The identifier takes
           * the far end of the same line, which is the slot the masthead above
           * already uses for the quiet label nobody reads twice: it is needed
           * once a week, for a support call, and never before the name.
           */}
          <div className="dla-head-top">
            <p className="dla-kicker">Project</p>
            <StatusChip tone={status.tone}>{status.word}</StatusChip>
            <p className="dla-headid">
              <span className="dla-headid-label">Project identifier</span>
              {identifier.missing ? (
                <Value reading={identifier} />
              ) : (
                <span className="dla-identifier">{identifier.text}</span>
              )}
            </p>
          </div>

          <div className="dla-head-grid">
            <div>
              <h1 className="dla-title">{project?.name ?? "Unknown project"}</h1>
              {/*
               * The answer names the state and the party waited on, and it
               * carries no numerals at all. The four figures under it are the
               * counts, and a sentence reciting them would be the same facts
               * twice in six inches.
               */}
              <p className="dla-answer">{projectAnswer(shares)}</p>
            </div>

            <div className="dla-actions">
              <button type="button" className="dla-btn" data-kind="primary">
                Add source
              </button>
              <p className="dla-actions-note">
                A source is created here and then activated from the showroom machine itself.
              </p>
            </div>
          </div>

          {/*
           * Four counts under one rule, and every one of them a share of the
           * same denominator. SOURCES is the denominator, so it stands alone;
           * the other three are the three independent states, in the order the
           * rows and the Source detail hero use, so the head and the list count
           * the same thing in the same sequence.
           */}
          <dl className="dla-rail" data-cells="4">
            <div>
              <dt>Sources</dt>
              <dd>
                <Value reading={count(shares.total)} found />
              </dd>
            </div>
            <Share label="Activated" part={shares.activated} whole={shares.total} />
            <Share label="Connected" part={shares.connected} whole={shares.total} />
            <Share label="Ingestion verified" part={shares.verified} whole={shares.total} />
          </dl>
        </header>

        <section className="dla-section" aria-labelledby="dla-sources-heading">
          <div className="dla-section-head">
            <h2 id="dla-sources-heading">Sources</h2>
            <p className="dla-section-lede">
              One row per installation, most recently heard from first. Each row carries the three
              states as three words under the three headings Source detail opens them with, because
              a machine that looks healthy and has never delivered anything is the combination this
              list exists to make visible.
            </p>
          </div>

          <div className="dla-panel" data-shape="rows">
            {views.length === 0 ? (
              <div className="dla-empty">
                <p className="dla-empty-title">No sources yet</p>
                <p className="dla-empty-note">
                  A source is created here and then activated from the showroom machine itself, so a
                  project waits in this state until somebody reaches the machine.
                </p>
              </div>
            ) : (
              views.map((view) => (
                <SourceRow key={view.status.source_id} view={view} now={estate.now} />
              ))
            )}
          </div>
        </section>
      </div>

      <div className="dla-gutter dla-foot">
        <p>
          Development instrument. One project and its installations, read through the same control
          plane the live screen reads. Every control here is drawn and inert, so the hierarchy can
          be judged without anything being changed.
        </p>
      </div>
    </div>
  );
}

/* --- the counts ---------------------------------------------------------------------- */

interface Shares {
  readonly total: number;
  readonly activated: number;
  readonly connected: number;
  readonly verified: number;
  /** Connected before, and silent for longer than the freshness window. */
  readonly offline: number;
  /** Never heard from at all, which is a different wait with a different fix. */
  readonly waiting: number;
}

/**
 * The four figures in the head, each counted from its own state and nothing
 * else.
 *
 * Counted from the source views rather than from the project row, so the head
 * and the rows below it are reading one list at one moment. `activated` is the
 * count the project summary cannot supply at all, and it is the one that
 * separates six machines waiting for an installer from six machines that were
 * activated and never spoke.
 */
function countStates(views: readonly SourceView[]): Shares {
  return {
    total: views.length,
    activated: views.filter((view) => view.states.activated).length,
    connected: views.filter((view) => view.states.connected).length,
    verified: views.filter((view) => view.states.ingestionVerified).length,
    offline: views.filter((view) => view.states.connected && !view.heartbeatFresh).length,
    waiting: views.filter((view) => !view.states.connected).length,
  };
}

/**
 * The head's sentence: the state, and the party waited on.
 *
 * No numerals, by design. The rail directly below carries all four counts, and
 * a sentence that repeated them would be the third telling of two facts. What
 * prose can say and a figure cannot is WHO the project is waiting on, which is
 * the thing that decides whether anybody has work to do today.
 */
function projectAnswer(shares: Shares): string {
  if (shares.total === 0) return "No sources are registered against this project yet.";

  if (shares.activated === 0) {
    return "Nothing here has been activated. Waiting on the client's installer at each machine: issue an activation code and enter it in the plugin.";
  }
  if (shares.connected === 0) {
    return "Activated, and never connected. Waiting on the installations for a first heartbeat.";
  }
  if (shares.offline > 0 && shares.connected === shares.offline) {
    return "Everything that has connected here is silent, with a last heartbeat older than the freshness window this screen judges Connected by. Waiting on the installations for the next one.";
  }
  if (shares.verified === 0) {
    return "Connected, and no analytics verified. Waiting on the installations for an event that reaches storage.";
  }
  if (shares.waiting > 0 || shares.offline > 0) {
    return "Part of this project is delivering and part of it is waiting. The counts are shares of one denominator, and the rows say which installation is which.";
  }
  return "Configured, connected and delivering verified analytics. Nothing is waited on.";
}

/**
 * A figure and what it is a share of.
 *
 * The denominator recedes to caption size and it is never dropped: connected is
 * not a fact, and one of six is.
 */
function Share({ label, part, whole }: { label: string; part: number; whole: number }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        <Value reading={count(part)} found />
        <span className="dla-tally-of">of {count(whole).text}</span>
      </dd>
    </div>
  );
}

/* --- the order of the list ------------------------------------------------------------ */

const NAMES = new Intl.Collator("en-GB");

function heartbeatAt(view: SourceView): number {
  const at = view.operations?.last_heartbeat_at ?? null;
  if (at === null) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(at);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

/**
 * Most recently heard from first, and a source never heard from below the live
 * ones rather than above them.
 *
 * The same rule the estate list is ordered by, at one scale down, so a reader
 * arriving from Projects does not have to learn a second ordering. Ties break
 * on the label, which is what keeps six silent installations from shuffling
 * between renders.
 */
function byHeartbeat(views: readonly SourceView[]): readonly SourceView[] {
  return [...views].sort((left, right) => {
    const a = heartbeatAt(left);
    const b = heartbeatAt(right);
    if (a === b) return NAMES.compare(left.status.display_label, right.status.display_label);
    return b - a;
  });
}

/* --- a value, and the absence of one -------------------------------------------------- */

/** Identical to Source detail's. A measurement is a figure; an absence is a word. */
function Value({ reading, found = false }: { reading: Reading; found?: boolean }) {
  if (reading.missing) {
    return (
      <span className="dla-absent">
        <StatusMark tone="none" />
        <span>{reading.text}</span>
      </span>
    );
  }
  return (
    <span className="dla-figure" data-weight={found ? "found" : "value"}>
      {reading.text}
    </span>
  );
}

/* --- the vocabulary a row and its head share -------------------------------------------- */

/** Lifecycle to mark, agreeing with `HEALTH_TONE` and with the estate list. */
function lifecycleTone(state: string): MarkTone {
  if (state === "active") return "good";
  if (state === "suspended") return "operator";
  if (state === "archived") return "settled";
  return "wrong";
}

/**
 * The project's own status, or the fact that its row was not in the list.
 *
 * `lifecycleWord` rather than a local ternary: a rendering that said Archived
 * for every status that was not active would print a confident and wrong word
 * for a value it had never heard of.
 */
function projectState(status: string | null): { word: string; tone: MarkTone } {
  if (status === null) return { word: "Unknown", tone: "none" };
  return { word: lifecycleWord(status), tone: lifecycleTone(status) };
}

/**
 * The middle state, in three words rather than two.
 *
 * Offline was doing duty for a source that connected and has gone quiet AND for
 * one that has never been heard from, with a colour the only thing between
 * them. They are different situations with different next actions, so each
 * keeps its own word. Both wear the ring, because both are waits and a showroom
 * machine switched off overnight is offline with nothing wrong.
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
 * `classifyHealth` puts lifecycle above liveness deliberately, so rendering
 * both slots printed Suspended beside Suspended and read as a stutter rather
 * than as a precedence. Offline is that same case one column across: the
 * connection state prints that exact word inches away. Awaiting first heartbeat
 * stays, because it names the party waited on and Never connected does not.
 *
 * The verdict is returned as the key rather than as its label, so the caller
 * takes the word AND the mark from the one table in `control-plane`.
 */
function healthVerdict(view: SourceView): SourceHealth | null {
  if (view.health === "suspended" || view.health === "archived") return null;
  if (view.health === "offline") return null;
  return view.health;
}

interface TriadCell {
  readonly key: string;
  readonly column: string;
  readonly word: string;
  readonly holds: boolean;
  readonly tone: MarkTone;
}

/**
 * The three states, under the three headings Source detail opens them with.
 *
 * The order is the argument, and it is the hero's order: configured, then
 * reachable, then delivering. None of them implies the next, all of the
 * combinations occur, and nothing here sums them.
 */
function triad(view: SourceView): readonly TriadCell[] {
  const connection = connectionState(view);
  const { states } = view;
  return [
    {
      key: "activation",
      column: "Activation",
      word: states.activated ? "Activated" : "Not activated",
      holds: states.activated,
      tone: states.activated ? "good" : "await",
    },
    {
      key: "connection",
      column: "Connection",
      word: connection.word,
      holds: states.connected && view.heartbeatFresh,
      tone: connection.tone,
    },
    {
      key: "ingestion",
      column: "Ingestion",
      word: states.ingestionVerified ? "Verified" : "Not verified",
      holds: states.ingestionVerified,
      tone: states.ingestionVerified ? "good" : "await",
    },
  ];
}

/* --- the row --------------------------------------------------------------------------- */

function SourceRow({ view, now }: { view: SourceView; now: Date }) {
  const { status, operations } = view;
  const heartbeat = instant(operations?.last_heartbeat_at ?? null);
  const verification = instant(operations?.ingestion_verified_at ?? null, "Never verified");
  const age = ageSince(operations?.last_heartbeat_at ?? null, now);
  const verdict = healthVerdict(view);

  return (
    <article className="dla-row" data-shape="source">
      <div className="dla-row-id">
        <p className="dla-micro">{sourceTypeWord(status.source_type)}</p>
        <h3 className="dla-row-name">{status.display_label}</h3>
        <div className="dla-row-line">
          {/* Authoritative, and never what the installation reported about itself. */}
          <span className="dla-row-where">{environmentWord(status.environment)}</span>
          <StatusChip tone={lifecycleTone(status.state)}>{lifecycleWord(status.state)}</StatusChip>
          {verdict === null ? null : (
            <StatusChip tone={HEALTH_TONE[verdict]}>{HEALTH_LABEL[verdict]}</StatusChip>
          )}
          {/*
           * A mismatch is the triangle: the installation is running a build
           * pointed at another environment and somebody has work to do.
           */}
          {operations?.environment_mismatch === true ? (
            <StatusChip tone="wrong">Environment mismatch</StatusChip>
          ) : null}
        </div>
      </div>

      <dl className="dla-triad">
        {triad(view).map((cell) => (
          <div key={cell.key} className="dla-triad-cell" data-holds={cell.holds}>
            <dt className="dla-micro">{cell.column}</dt>
            <dd className="dla-triad-word">
              <StatusMark tone={cell.tone} />
              <span>{cell.word}</span>
            </dd>
          </div>
        ))}
      </dl>

      <dl className="dla-rowfacts">
        <div>
          <dt className="dla-micro">Last heartbeat</dt>
          <dd>
            <Value reading={heartbeat} />
            {age === null ? null : <span className="dla-field-note">{age}</span>}
          </dd>
        </div>
        <div>
          <dt className="dla-micro">Ingestion verified</dt>
          <dd>
            <Value reading={verification} />
          </dd>
        </div>
      </dl>

      {/*
       * The door to Source detail. Inert by instruction, so it is a button
       * rather than a link; in the product the whole row is the anchor, and the
       * row's own hover is what says so here.
       */}
      <div className="dla-row-open">
        <button type="button" className="dla-btn" data-kind="tertiary">
          Open source
        </button>
      </div>
    </article>
  );
}
