import { StatusChip, StatusMark } from "@/components/madspace/StatusMark";
import type { Reading } from "@/lib/madspace/format";

import type { LabScreenProps } from "../../lab-data";
import { labSourceRows, type LabSourceRow } from "../../lab-fields";

/**
 * VARIANT A, THE INSTALLATIONS. CANONICAL LIGHT, ON PAPER.
 *
 * The account's machines, all of them, on one ruled surface. It is the third
 * list in this direction and it is built from the same parts as the other two:
 * one masthead, one gutter, a head whose first line is the subject and whose
 * second is the answer, a colophon rail of three quiet facts, and one bordered
 * panel divided by hairlines.
 *
 * ## Why this screen exists beside Projects
 *
 * Projects answers "how much of each project is delivering". It cannot answer
 * "which machine do I go and look at", because a project row is a sum and the
 * machine is what somebody drives to. Ten installations under four projects is
 * already past the point where opening four project pages to find one offline
 * showroom is reasonable, and the estate only grows.
 *
 * ## Worst first, and flat
 *
 * Not grouped by project. Grouping is the right shape when the question is
 * "what is the state of this project", and this screen's question is "what
 * needs me" — which crosses projects by definition. So the order is the verdict
 * precedence `classifyHealth` already establishes, then project, then name; a
 * row that wants an operator is at the top whichever project holds it, and the
 * project travels in the row rather than in a heading above it.
 *
 * Variant B groups the same rows by project and Variant C leads with the
 * exception. The three orders are the argument between the directions, and they
 * read the same ten rows.
 *
 * ## Three states, never one
 *
 * Every row carries ACTIVATION, CONNECTION and INGESTION as three separate
 * cells with three separate words, plus the verdict as a fourth thing. The
 * verdict is a precedence — one word for the row — and it is not a summary of
 * the three: a source can be activated, connected and never verified, and a
 * single health dot would call that green or amber and lose which of the three
 * is missing. The triad is the same `dla-triad` the project's own source list
 * draws, so a machine looks identical on both screens.
 */
export function SourcesA({ estate, screenName, variantName }: LabScreenProps) {
  const rows = ordered(labSourceRows(estate.estate, estate.now));
  const wanting = rows.filter((row) => row.attention !== null).length;

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
          <div className="dla-head-top">
            <p className="dla-kicker">Estate</p>
          </div>

          <div className="dla-head-grid">
            <div>
              <h1 className="dla-title">Sources</h1>
              <p className="dla-answer">{answer(rows, wanting, estate.accountName)}</p>
            </div>

            {/*
             * No "New source" control, and its absence is the product rather
             * than an omission. A source is created inside a project and
             * activated from the machine itself; a button here would promise a
             * path that does not exist. The note says so instead.
             */}
            <div className="dla-actions">
              <p className="dla-actions-note">
                A source is created inside its project and activated from the machine itself. This
                screen is where they are read, not where they are made.
              </p>
            </div>
          </div>

          <dl className="dla-rail">
            <div>
              <dt>Account</dt>
              <dd>{estate.accountName}</dd>
            </div>
            <div>
              <dt>Control plane</dt>
              <dd>{estate.local ? "Local development database" : "Hosted database"}</dd>
            </div>
            <div>
              <dt>Projects represented</dt>
              <dd>
                <span className="dla-figure" data-weight="value">
                  {String(new Set(rows.map((row) => row.project)).size)}
                </span>
              </dd>
            </div>
          </dl>
        </header>

        <section className="dla-section" aria-labelledby="dla-sources-heading">
          <div className="dla-section-head">
            <h2 id="dla-sources-heading">Every installation</h2>
            <p className="dla-section-lede">
              One row per machine, across every project in the account. Ordered by what the row
              needs rather than by where it lives: anything wanting an operator is at the top, then
              the rest by project and name. Activation, connection and ingestion are three separate
              readings on every row, because all four combinations occur and a single indicator
              would hide the one that matters.
            </p>
          </div>

          <div className="dla-panel" data-shape="rows">
            {rows.length === 0 ? (
              <div className="dla-empty">
                <p className="dla-empty-title">This account holds no sources</p>
                <p className="dla-empty-note">
                  A project with no sources still appears on Projects, so an empty list here means
                  no machine has been created anywhere in the account rather than that they are
                  quiet.
                </p>
              </div>
            ) : (
              rows.map((row) => <SourceRow key={row.id} row={row} />)
            )}
          </div>
        </section>
      </div>

      <div className="dla-gutter dla-foot">
        <p>
          Development instrument. Every installation in the account, read through the same control
          plane the live screens read. Every control here is drawn and inert, so the hierarchy can
          be judged without anything being changed.
        </p>
      </div>
    </div>
  );
}

/* --- the sentence in the second line ---------------------------------------------- */

const PLURALS = new Intl.PluralRules("en-GB");

function plural(value: number, one: string, other: string): string {
  return PLURALS.select(value) === "one" ? one : other;
}

/**
 * The estate's installations in one sentence.
 *
 * Scale first, because it is the denominator every figure below is read
 * against; then the one fact that decides whether anybody has to do anything
 * today. The three-way branch avoids the two sentences that would be false in
 * the common cases: "all healthy" when nine have never been reached, and "one
 * needs attention" when there is nothing to attend to.
 */
function answer(rows: readonly LabSourceRow[], wanting: number, account: string): string {
  if (rows.length === 0) return `${account} holds no sources yet.`;

  const scale = `${String(rows.length)} ${plural(rows.length, "installation", "installations")}`;
  const silent = rows.filter((row) => row.health === "never_connected").length;

  const waiting =
    silent === 0
      ? ""
      : ` ${String(silent)} ${plural(silent, "has", "have")} never been heard from.`;

  if (wanting === 0) return `${scale} in this account. None is waiting on an operator.${waiting}`;
  return (
    `${scale} in this account. ${String(wanting)} ${plural(wanting, "wants", "want")} ` +
    `an operator.${waiting}`
  );
}

/* --- the order ---------------------------------------------------------------------- */

/**
 * Worst first, by the precedence the control plane already decided.
 *
 * The array IS the order, so it can be read as one: a row refusing events comes
 * before a row that has gone quiet, which comes before a row nobody has reached
 * yet, which comes before a row that is merely unproved. Healthy last, because
 * a screen that opens on what is working is a screen an operator scrolls past.
 *
 * Suspended and archived sit below the healthy rows rather than above them:
 * both are decisions somebody made, and neither is asking for anything.
 */
const WORST_FIRST = [
  "attention",
  "offline",
  "never_connected",
  "not_verified",
  "healthy",
  "suspended",
  "archived",
] as const;

const NAMES = new Intl.Collator("en-GB");

function rank(row: LabSourceRow): number {
  const at = WORST_FIRST.indexOf(row.health as (typeof WORST_FIRST)[number]);
  /*
   * A verdict this list has never heard of sorts to the very top rather than
   * the bottom. An unrecognised value is somebody's work either way, and the
   * top is where work is read.
   */
  return at === -1 ? -1 : at;
}

function ordered(rows: readonly LabSourceRow[]): readonly LabSourceRow[] {
  return [...rows].sort((left, right) => {
    const byRank = rank(left) - rank(right);
    if (byRank !== 0) return byRank;
    const byProject = NAMES.compare(left.project, right.project);
    if (byProject !== 0) return byProject;
    return NAMES.compare(left.name, right.name);
  });
}

/* --- a value, and the absence of one ------------------------------------------------ */

/**
 * The honesty rule, identical to the one Projects and Source detail draw.
 *
 * A measurement is a figure: weight, ink, tabular. An absence is a word matched
 * to its field, and it changes size, weight, colour and figure style at once so
 * it cannot be mistaken for one — and takes the neutral bar, which in this
 * system means no measurement exists and is drawn nothing like a zero.
 */
function Value({ reading }: { reading: Reading }) {
  if (reading.missing) {
    return (
      <span className="dla-absent">
        <StatusMark tone="none" />
        <span>{reading.text}</span>
      </span>
    );
  }
  return (
    <span className="dla-figure" data-weight="value">
      {reading.text}
    </span>
  );
}

/* --- the row ------------------------------------------------------------------------ */

function SourceRow({ row }: { row: LabSourceRow }) {
  return (
    <article className="dla-row" data-shape="installation">
      <div className="dla-row-id">
        <p className="dla-micro">{row.type}</p>
        <h3 className="dla-row-name">{row.name}</h3>
        <div className="dla-row-line">
          {/*
           * The project, in the row rather than in a heading above a group.
           * This list is ordered by what a row needs, so the project cannot be
           * inferred from position and has to travel with the machine.
           */}
          <span className="dla-row-where" data-unnamed={row.projectUnnamed}>
            {row.project}
          </span>
          <span className="dla-row-where">{row.environment}</span>
          <StatusChip tone={row.healthTone}>{row.healthLabel}</StatusChip>
        </div>
      </div>

      {/*
       * The same triad the project's own source list draws, so one machine
       * looks identical on both screens.
       */}
      <dl className="dla-triad">
        {row.states.map((cell) => (
          <div key={cell.key} className="dla-triad-cell" data-holds={cell.holds}>
            <dt className="dla-micro">{cell.column}</dt>
            <dd className="dla-triad-word">
              <StatusMark tone={cell.tone} />
              <span>{cell.word}</span>
            </dd>
          </div>
        ))}
      </dl>

      <dl className="dla-rowfacts" data-shape="installation">
        <div>
          <dt className="dla-micro">Last heartbeat</dt>
          <dd>
            <Value reading={row.heartbeat} />
            {row.heartbeatAge === null ? null : (
              <span className="dla-field-note">{row.heartbeatAge}</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="dla-micro">Pending events</dt>
          <dd>
            <Value reading={row.pendingEvents} />
          </dd>
        </div>
        <div>
          <dt className="dla-micro">Oldest pending</dt>
          <dd>
            <Value reading={row.oldestPending} />
          </dd>
        </div>
        <div>
          <dt className="dla-micro">Quarantine</dt>
          <dd>
            {/*
             * Local and backend, side by side and never summed: one is what the
             * installation refused to send and the other is what we refused to
             * accept, and they have different fixes. When neither was reported
             * the cell says so once rather than printing two absences.
             */}
            {row.quarantineUnmeasured ? (
              <Value reading={{ text: "Not reported", missing: true }} />
            ) : (
              <>
                <Value reading={row.quarantine} />
                <span className="dla-field-note">local</span>
                <Value reading={row.backendQuarantine} />
                <span className="dla-field-note">backend</span>
              </>
            )}
          </dd>
        </div>
      </dl>

      {/*
       * The reason, drawn only where there is one. A row that is merely waiting
       * gets nothing here: a reassuring sentence on nine rows nobody has ever
       * reached would be the screen talking rather than reporting.
       */}
      {row.attention === null ? null : (
        <p className="dla-row-reason">
          <StatusMark tone={row.healthTone} />
          <span>{row.attention}</span>
        </p>
      )}

      <div className="dla-row-open">
        <button type="button" className="dla-btn" data-kind="tertiary">
          Open source
        </button>
      </div>
    </article>
  );
}
