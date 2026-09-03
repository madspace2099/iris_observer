import { StatusChip, StatusMark, type MarkTone } from "@/components/madspace/StatusMark";
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
  percent,
  reported,
  sourceTypeWord,
  type Reading,
} from "@/lib/madspace/format";

import type { LabScreenProps } from "../../lab-data";

/**
 * VARIANT B. GRAPHITE CONSOLE. THE PROJECT, AND THE INSTALLATIONS UNDER IT.
 *
 * The bridge screen, and it is built out of the two halves either side of it.
 * The head is the Projects row it was opened from, opened out: the same name,
 * the same lifecycle chip, the same three counts against the same denominator.
 * The list below is Source detail's matrix, compressed: the same three columns
 * in the same order, ACTIVATION, CONNECTION, INGESTION, each carrying a word
 * and the evidence under it. A reader who arrives here from either side is
 * looking at furniture they have already met.
 *
 * ## Three words per row, never one
 *
 * This is the first place an operator would notice that a healthy-looking
 * installation has never delivered anything, and a single green dot per row
 * would hide exactly that. So the three states each get their own column, their
 * own mark and their own spelled-out word, and there is no summary mark across
 * them, no ordering, no percentage and no bar. The three columns are equal for
 * the same reason they are equal one screen down: none of them implies another,
 * and all four combinations occur.
 *
 * ## Why the row is a door and looks like one
 *
 * The row is the step between project context and source operations, so it ends
 * in a real control rather than a chevron: a bordered Open source button, the
 * secondary treatment the masthead uses, which strengthens as the row lights
 * up. The outbox column is the operational hook that makes opening it worth
 * doing, and it is a figure rather than a meter here: the ratio is drawn as a
 * bar exactly once in this direction, on the screen that owns it, so a bar in a
 * row can never be mistaken for a summary of the three states beside it.
 *
 * Deliberately no analytics. What was observed belongs to Observer; whether the
 * installation observes at all belongs here.
 */

/**
 * Lifecycle to mark, one shape per value. The same table the project index
 * uses, and it agrees with `HEALTH_TONE`: a suspended source is an operator's
 * standing decision, an archived one is terminal and accepted, and a value this
 * vocabulary does not know is somebody's work rather than a missing
 * measurement.
 */
function lifecycleTone(state: string): MarkTone {
  if (state === "active") return "good";
  if (state === "suspended") return "operator";
  if (state === "archived") return "settled";
  return "wrong";
}

/**
 * The middle state, in three words rather than two.
 *
 * "Offline" cannot do duty for a source that connected and has gone quiet AND
 * for one that has never been heard from: they are different situations with
 * different next actions. Both wear the ring, because both are waits, which is
 * what the shared verdict table says for `offline` and `never_connected` alike.
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
 * Suspended and Archived are printed by the lifecycle chip and Offline by the
 * connection column, so repeating any of them would read as a second finding
 * rather than as a verdict. AWAITING FIRST HEARTBEAT stays, because it names
 * the party waited on and "Never connected" does not. Nothing is hidden by
 * either silence: the state is on the row, in the slot that owns it.
 *
 * The verdict is returned as the key rather than as its label so the caller
 * takes the word AND the mark from the one table in `control-plane`.
 */
function healthVerdict(view: SourceView): SourceHealth | null {
  if (view.health === "suspended" || view.health === "archived") return null;
  if (view.health === "offline") return null;
  return view.health;
}

/** The newest heartbeat anywhere in the project, or null when none has arrived. */
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
 * A measurement, or the fact that there is none.
 *
 * The same pair of treatments Source detail draws. An absent value loses the
 * medium weight and the tabular figures and carries the neutral bar, which this
 * system draws for "no measurement exists" and never for a zero.
 *
 * Three scales, because a reading is not always the answer of the cell it sits
 * in. In a ledger cell it is the value. In the outbox column it is the value.
 * In a state column the WORD is the value and the instant beside it is the
 * evidence, so it takes the caption size and recedes behind the chip rather
 * than competing with it.
 */
const PRESENT: Readonly<Record<string, string>> = {
  row: "dlb-rowvalue",
  note: "dlb-rowevidence",
};

function Value({ reading, scale }: { reading: Reading; scale?: "row" | "note" }) {
  if (reading.missing) {
    return (
      <span className="dlb-absent" data-scale={scale}>
        <StatusMark tone="none" />
        <span>{reading.text}</span>
      </span>
    );
  }
  return <span className={(scale && PRESENT[scale]) || "dlb-value"}>{reading.text}</span>;
}

/** A count that did not survive its conversion is an absent measurement, not a zero. */
function tally(value: number): Reading {
  return Number.isFinite(value) ? count(value) : count(null);
}

/** One ledger cell: a figure, its denominator, and what it counts. */
function ShareCell({
  label,
  part,
  whole,
  note,
}: {
  label: string;
  part: number;
  whole: number;
  note: string;
}) {
  const reading = tally(part);
  return (
    <div className="dlb-cell">
      <p className="dlb-cell-label">{label}</p>
      <p className="dlb-cell-value">
        <Value reading={reading} />
        {/* The denominator may shrink and dim. It may never be dropped. */}
        {reading.missing ? null : <span className="dlb-of"> of {tally(whole).text}</span>}
      </p>
      <p className="dlb-cell-note">{note}</p>
    </div>
  );
}

function SourceRow({ view, now }: { view: SourceView; now: Date }) {
  const { status, operations, states } = view;
  const connection = connectionState(view);
  const verdict = healthVerdict(view);
  const heartbeat = instant(operations?.last_heartbeat_at ?? null);
  const verified = instant(operations?.ingestion_verified_at ?? null, "Never verified");
  const age = ageSince(operations?.last_heartbeat_at ?? null, now);

  return (
    <article className="dlb-row">
      <div className="dlb-rowcell">
        <p className="dlb-eyebrow">{sourceTypeWord(status.source_type)}</p>
        <h3 className="dlb-rowname">{status.display_label}</h3>
        <div className="dlb-chips">
          <span className="dlb-rownote">{environmentWord(status.environment)}</span>
          <StatusChip tone={lifecycleTone(status.state)}>{lifecycleWord(status.state)}</StatusChip>
          {/*
           * The verdict and the mismatch are states, so both wear a mark rather
           * than sitting as bare words in a quiet caption beside the word
           * "Production".
           */}
          {verdict === null ? null : (
            <StatusChip tone={HEALTH_TONE[verdict]}>{HEALTH_LABEL[verdict]}</StatusChip>
          )}
          {operations?.environment_mismatch === true ? (
            <StatusChip tone="wrong">Environment mismatch</StatusChip>
          ) : null}
        </div>
      </div>

      {/*
       * The three states, as three columns of one row. They travel as a group
       * so they can become a strip of three on a narrow viewport without ever
       * becoming a summary: `display: contents` above the breakpoint, so the
       * wrapper does not exist as far as the column grid is concerned.
       *
       * AN UNMET STATE IS A WAIT, WHICH IS THE RING. The bar means no
       * measurement exists, and all three of these are read from a persisted
       * column: not activated is a wait on the installer, not verified is a
       * wait on an event that reaches storage. The shared verdict table agrees,
       * and its chip prints inches away on this same row.
       */}
      <div className="dlb-rowgroup">
        <div className="dlb-rowcell">
          <span className="dlb-rowlabel">Activation</span>
          <StatusChip tone={states.activated ? "good" : "await"}>
            {states.activated ? "Activated" : "Not activated"}
          </StatusChip>
          <p className="dlb-rownote">
            {states.activated ? "A credential exists" : "No credential has been issued"}
          </p>
        </div>

        <div className="dlb-rowcell">
          <span className="dlb-rowlabel">Connection</span>
          <StatusChip tone={connection.tone}>{connection.word}</StatusChip>
          <Value reading={heartbeat} scale="note" />
          {age === null ? null : <p className="dlb-rownote">{age}</p>}
        </div>

        <div className="dlb-rowcell">
          <span className="dlb-rowlabel">Ingestion</span>
          <StatusChip tone={states.ingestionVerified ? "good" : "await"}>
            {states.ingestionVerified ? "Verified" : "Not verified"}
          </StatusChip>
          <Value reading={verified} scale="note" />
        </div>
      </div>

      <div className="dlb-rowcell">
        <span className="dlb-rowlabel">Outbox fill</span>
        {/*
         * The one ratio a row carries, and it is a figure rather than a bar.
         * `queueFill` returns null when either byte count is missing, so this is
         * "Not reported" rather than a measured zero whenever the installation
         * did not report both.
         */}
        <Value reading={percent(view.queueFillPercent)} scale="row" />
      </div>

      <div className="dlb-rowcell dlb-doorcell">
        <button className="dlb-btn" data-kind="secondary" type="button">
          Open source
        </button>
      </div>
    </article>
  );
}

export function ProjectDetailB({ estate, screenName, variantName }: LabScreenProps) {
  const project = estate.project;
  const sources = estate.sources;

  /*
   * The counts are computed from the rows this screen actually renders rather
   * than taken from the project summary's own columns. Both are true, and two
   * true answers to one question is how a header and a list start disagreeing:
   * the head must count exactly what is drawn under it.
   */
  const total = sources.length;
  const connected = sources.filter((view) => view.states.connected).length;
  const verified = sources.filter((view) => view.states.ingestionVerified).length;
  const never = total - connected;

  const heartbeat = instant(newestHeartbeat(sources), "No heartbeat has ever arrived");
  const heartbeatAge = ageSince(newestHeartbeat(sources), estate.now);
  const identifier = reported(project?.projectId ?? null);

  return (
    <div className="dlb-root">
      <header className="dlb-rail">
        <div className="dlb-width dlb-rail-inner">
          <p className="dlb-rail-name">
            MADSPACE Operations <span>{screenName}</span>
          </p>
          <p className="dlb-rail-tag">Design lab / Variant B / {variantName}</p>
        </div>
      </header>

      <div className="dlb-width">
        <div className="dlb-masthead">
          <div>
            <p className="dlb-eyebrow">Project</p>
            <h1 className="dlb-title">{project?.name ?? "Unknown project"}</h1>
            <div className="dlb-meta">
              <span className="dlb-meta-item">
                <span className="dlb-meta-key">Account</span>
                <span className="dlb-meta-value">{estate.accountName}</span>
              </span>
              <span className="dlb-meta-item">
                <span className="dlb-meta-key">Lifecycle</span>
                {/*
                 * A project whose row was not in the account's list has no
                 * lifecycle to state, and the neutral bar is the honest mark for
                 * that: no measurement exists, rather than a status this screen
                 * has decided on the project's behalf.
                 */}
                {project === null ? (
                  <StatusChip tone="none">Unknown</StatusChip>
                ) : (
                  <StatusChip tone={lifecycleTone(project.status)}>
                    {lifecycleWord(project.status)}
                  </StatusChip>
                )}
              </span>
            </div>
          </div>

          <div>
            <div className="dlb-actions">
              <button className="dlb-btn" data-kind="primary" type="button">
                Add source
              </button>
            </div>
            <p className="dlb-inert">Controls inert in the design lab</p>
          </div>
        </div>

        {/* --- the counts, and the record they are counted from --- */}
        <section className="dlb-section" aria-labelledby="dlb-project-heading">
          <div className="dlb-sectionhead">
            <h2 className="dlb-h2" id="dlb-project-heading">
              The project
            </h2>
            <p className="dlb-sectionnote">
              Four counts against one denominator, and the record behind them.
            </p>
          </div>

          <div className="dlb-ledger">
            <div className="dlb-cell">
              <p className="dlb-cell-label">Sources</p>
              <p className="dlb-cell-value">
                <Value reading={tally(total)} />
              </p>
              <p className="dlb-cell-note">
                Registered under this project, archived ones included.
              </p>
            </div>

            <ShareCell
              label="Connected"
              part={connected}
              whole={total}
              note="A heartbeat has been accepted at least once."
            />
            <ShareCell
              label="Ingestion verified"
              part={verified}
              whole={total}
              note="An event has been proved to reach storage."
            />
            <ShareCell
              label="Never heard from"
              part={never}
              whole={total}
              note="No heartbeat has ever arrived from these installations."
            />

            <div className="dlb-cell dlb-span2">
              <p className="dlb-cell-label">Newest heartbeat</p>
              <p className="dlb-cell-value">
                <Value reading={heartbeat} />
              </p>
              <p className="dlb-cell-note">
                {heartbeatAge === null
                  ? "The newest heartbeat anywhere in this project."
                  : `The newest anywhere in this project, ${heartbeatAge}.`}
              </p>
            </div>

            <div className="dlb-cell dlb-span2">
              <p className="dlb-cell-label">Project identifier</p>
              <p className="dlb-cell-value">
                <Value reading={identifier} />
              </p>
              <p className="dlb-cell-note">Issued by the control plane. It never changes.</p>
            </div>
          </div>
        </section>

        {/* --- the installations --- */}
        <section className="dlb-section" aria-labelledby="dlb-sources-heading">
          <div className="dlb-sectionhead">
            <h2 className="dlb-h2" id="dlb-sources-heading">
              Sources
            </h2>
            <p className="dlb-sectionnote">
              Three independent states per installation, as three words. None of them implies
              another.
            </p>
          </div>

          <div className="dlb-hero">
            <div className="dlb-table" data-columns="sources">
              {/*
               * The column rail, `aria-hidden` for the reason Source detail's
               * spine is: every label it shows also travels inside the cell it
               * labels, visually hidden while this is on screen, and it is what
               * remains once the columns collapse.
               */}
              <div className="dlb-thead" aria-hidden="true">
                <p className="dlb-th">Source</p>
                <p className="dlb-th">Activation</p>
                <p className="dlb-th">Connection</p>
                <p className="dlb-th">Ingestion</p>
                <p className="dlb-th">Outbox fill</p>
                <p className="dlb-th" />
              </div>

              {sources.length === 0 ? (
                <div className="dlb-empty">
                  <p className="dlb-emptytitle">No sources yet</p>
                  <p className="dlb-rownote">
                    A source is created here and then activated from the showroom machine itself.
                  </p>
                </div>
              ) : (
                sources.map((view) => (
                  <SourceRow key={view.status.source_id} view={view} now={estate.now} />
                ))
              )}
            </div>
          </div>
        </section>
      </div>

      <footer className="dlb-foot">
        <div className="dlb-width dlb-foot-inner">
          <span>Design lab / {screenName} / Variant B</span>
          <span>{variantName}</span>
        </div>
      </footer>
    </div>
  );
}
