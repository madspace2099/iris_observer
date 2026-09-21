import { Fragment } from "react";

import { StatusChip, StatusMark } from "@/components/madspace/StatusMark";
import type { Reading } from "@/lib/madspace/format";

import type { LabScreenProps } from "../../lab-data";
import { labSourceRows, type LabSourceRow } from "../../lab-fields";

/**
 * VARIANT B. GRAPHITE CONSOLE. EVERY INSTALLATION IN THE ACCOUNT.
 *
 * The same surface as the two screens either side of it: deep graphite ground,
 * the raised colour for anything that LABELS, the panel colour for anything
 * that ANSWERS, one solid 1px line between them, no shadow, IRIS blue nowhere
 * but the focus ring.
 *
 * ## Answer first, then the list
 *
 * This direction's argument is that a console should tell you what to do before
 * it tells you what it holds. So the answer band comes first and states the one
 * actionable figure — how many installations are waiting on a person — and the
 * rows underneath are the evidence for it. A reader who only reads the band has
 * still read the true thing.
 *
 * ## Grouped by project, and that is the disagreement
 *
 * Variant A orders the same ten rows worst-first and flat, because its question
 * is "what needs me". This one groups them under the project that owns them,
 * because its question is "where am I going" — an operator who has to visit a
 * showroom is going to one site, and two failing machines in one project is one
 * trip rather than two problems. The band is drawn per project and states the
 * project's own share, so the grouping carries information rather than only
 * sorting.
 *
 * The projects themselves are ordered worst-first: the project holding the row
 * that most wants an operator is at the top. Grouping must not bury the thing
 * the answer band just named.
 *
 * ## Three states, three columns, never a health dot
 *
 * ACTIVATION, CONNECTION and INGESTION each get their own column with their own
 * word. The verdict is a fourth column and is not a summary of the other three:
 * it is a precedence, it answers "does anybody have work to do", and collapsing
 * the three into it would hide the state this product exists to surface — a
 * machine that is activated, connected, and has never proved an event lands.
 */
export function SourcesB({ estate, screenName, variantName }: LabScreenProps) {
  const rows = labSourceRows(estate.estate, estate.now);
  const wanting = rows.filter((row) => row.attention !== null).length;
  const silent = rows.filter((row) => row.health === "never_connected").length;
  const groups = byProject(rows);

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
            <p className="dlb-eyebrow">Account estate</p>
            <h1 className="dlb-title">Sources</h1>
            <div className="dlb-meta">
              <span className="dlb-meta-item">
                <span className="dlb-meta-key">Account</span>
                <span className="dlb-meta-value">{estate.accountName}</span>
              </span>
              <span className="dlb-meta-item">
                <span className="dlb-meta-key">Projects</span>
                <span className="dlb-meta-value">{String(groups.length)}</span>
              </span>
              <span className="dlb-meta-item">
                <span className="dlb-meta-key">Control plane</span>
                <span className="dlb-meta-value">
                  {estate.local ? "Local database" : "Hosted database"}
                </span>
              </span>
            </div>
          </div>

          <div>
            {/*
             * No control, and the note is why rather than an apology. A source
             * is created inside a project and activated from the machine
             * itself, so a "New source" button on an account-wide list would
             * open a path the product does not have.
             */}
            <p className="dlb-inert">
              Sources are created inside a project and activated from the machine. Nothing is
              created here.
            </p>
          </div>
        </div>

        <section className="dlb-section" aria-labelledby="dlb-sources-heading">
          <div className="dlb-sectionhead">
            <h2 className="dlb-h2" id="dlb-sources-heading">
              Every installation
            </h2>
            <p className="dlb-sectionnote">
              Whether installations work, not what they observed. There are no analytics here.
            </p>
          </div>

          <div className="dlb-hero">
            <div className="dlb-answerband">
              <div className="dlb-answerband-rail">
                <p className="dlb-spinelabel">Waiting on an operator</p>
                {/*
                 * The figure carries its denominator, for the reason every
                 * count on this direction does: "one" is not a fact and "1 of
                 * 10" is.
                 */}
                <p className="dlb-figure">
                  {String(wanting)}
                  <span className="dlb-of"> of {String(rows.length)}</span>
                </p>
              </div>
              <div className="dlb-answerband-body">
                <div>
                  <p className="dlb-answer">{answer(rows.length, wanting, silent)}</p>
                  <p className="dlb-answernote">
                    Waiting on an operator means offline, refusing events, or switched off
                    deliberately. An installation nobody has reached yet is not counted here: a
                    machine that has never spoken has not failed at anything, and counting it as a
                    fault is how a list of new installations comes to read as an incident.
                  </p>
                </div>
              </div>
            </div>

            <div className="dlb-table" data-columns="estate-sources">
              {/*
               * The column rail. `aria-hidden`, because every label it shows
               * also travels inside the cell it labels, visually hidden while
               * this is on screen. Below the collapse the in-cell labels are
               * what remains.
               */}
              <div className="dlb-thead" aria-hidden="true">
                <p className="dlb-th">Source</p>
                <p className="dlb-th">Activation</p>
                <p className="dlb-th">Connection</p>
                <p className="dlb-th">Ingestion</p>
                <p className="dlb-th">Pending</p>
                <p className="dlb-th">Verdict</p>
              </div>

              {groups.length === 0 ? (
                <div className="dlb-empty">
                  <p className="dlb-emptytitle">This account holds no sources</p>
                  <p className="dlb-emptynote">
                    A project with no sources still appears on Projects, so an empty list here means
                    no machine has been created anywhere in the account.
                  </p>
                </div>
              ) : (
                groups.map((group) => (
                  <Fragment key={group.project}>
                    <div className="dlb-band">
                      <p className="dlb-spinelabel">{group.project}</p>
                      <p className="dlb-bandnote">{groupNote(group.rows)}</p>
                    </div>
                    {group.rows.map((row) => (
                      <SourceRow key={row.id} row={row} />
                    ))}
                  </Fragment>
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

/* --- the sentences ------------------------------------------------------------------ */

const PLURALS = new Intl.PluralRules("en-GB");

function plural(value: number, one: string, other: string): string {
  return PLURALS.select(value) === "one" ? one : other;
}

/** What the band's figure means, in the words an operator would use. */
function answer(total: number, wanting: number, silent: number): string {
  if (total === 0) return "This account holds no installations yet.";

  const scale = `${String(total)} ${plural(total, "installation", "installations")}`;
  const never =
    silent === 0
      ? ""
      : ` ${String(silent)} of them ${plural(silent, "has", "have")} never been heard from and ` +
        `${plural(silent, "is", "are")} waiting on a first heartbeat rather than on you.`;

  if (wanting === 0) return `Nothing needs you. ${scale} in this account.${never}`;
  return (
    `${String(wanting)} of ${scale} ${plural(wanting, "needs", "need")} somebody.` + `${never}`
  );
}

/**
 * The project band's own line.
 *
 * It states the project's share rather than repeating the estate's, because the
 * band exists to make the grouping informative: a reader scanning bands should
 * be able to stop at the one that has work in it.
 */
function groupNote(rows: readonly LabSourceRow[]): string {
  const wanting = rows.filter((row) => row.attention !== null).length;
  const scale = `${String(rows.length)} ${plural(rows.length, "source", "sources")}`;
  if (wanting === 0) return `${scale}, none waiting on an operator`;
  return `${scale}, ${String(wanting)} waiting on an operator`;
}

/* --- the grouping ------------------------------------------------------------------- */

const NAMES = new Intl.Collator("en-GB");

interface Group {
  readonly project: string;
  readonly rows: readonly LabSourceRow[];
}

/**
 * By project, worst project first.
 *
 * A project's rank is its worst row: grouping must not bury the installation
 * the answer band just counted. Within a group the same precedence applies, so
 * the row that wants somebody is the first one under the band.
 *
 * Ties break on the name, so a set of quiet projects does not reshuffle between
 * renders and a reviewer comparing two captures is comparing the layout.
 */
function byProject(rows: readonly LabSourceRow[]): readonly Group[] {
  const groups = new Map<string, LabSourceRow[]>();
  for (const row of rows) {
    const held = groups.get(row.project);
    if (held === undefined) groups.set(row.project, [row]);
    else held.push(row);
  }

  return [...groups.entries()]
    .map(([project, held]) => ({
      project,
      rows: [...held].sort(
        (left, right) => severity(left) - severity(right) || NAMES.compare(left.name, right.name),
      ),
    }))
    .sort((left, right) => {
      const worst = Math.min(...left.rows.map(severity)) - Math.min(...right.rows.map(severity));
      return worst !== 0 ? worst : NAMES.compare(left.project, right.project);
    });
}

/** The precedence `classifyHealth` decided, as a number a sort can use. */
const WORST_FIRST = [
  "attention",
  "offline",
  "never_connected",
  "not_verified",
  "healthy",
  "suspended",
  "archived",
] as const;

function severity(row: LabSourceRow): number {
  const at = WORST_FIRST.indexOf(row.health as (typeof WORST_FIRST)[number]);
  /* An unrecognised verdict is somebody's work: it sorts above everything. */
  return at === -1 ? -1 : at;
}

/* --- a value, and the absence of one ------------------------------------------------ */

function Value({ reading }: { reading: Reading }) {
  if (reading.missing) {
    return (
      <span className="dlb-absent" data-scale="row">
        <StatusMark tone="none" />
        <span>{reading.text}</span>
      </span>
    );
  }
  return <span className="dlb-rowvalue">{reading.text}</span>;
}

/** A state cell: the mark, and the word that does not depend on it. */
function State({ word, tone }: { word: string; tone: LabSourceRow["healthTone"] }) {
  return (
    <p className="dlb-state">
      <StatusMark tone={tone} />
      <span className="dlb-stateword">{word}</span>
    </p>
  );
}

/* --- the row ------------------------------------------------------------------------ */

function SourceRow({ row }: { row: LabSourceRow }) {
  const [activation, connection, ingestion] = row.states;

  return (
    <article className="dlb-row">
      <div className="dlb-rowcell">
        <h3 className="dlb-rowname">{row.name}</h3>
        <div className="dlb-chips">
          <span className="dlb-rowmeta">{row.type}</span>
          <span className="dlb-rowmeta">{row.environment}</span>
        </div>
      </div>

      {/*
       * The three states travel as one group so they can become a strip of
       * three on a narrow viewport, the same way the three counts do on
       * Projects. `display: contents` above the breakpoint, so the wrapper does
       * not exist as far as the column grid is concerned.
       */}
      <div className="dlb-rowgroup">
        <div className="dlb-rowcell">
          <span className="dlb-rowlabel">Activation</span>
          {activation === undefined ? null : (
            <State word={activation.word} tone={activation.tone} />
          )}
        </div>
        <div className="dlb-rowcell">
          <span className="dlb-rowlabel">Connection</span>
          {connection === undefined ? null : (
            <State word={connection.word} tone={connection.tone} />
          )}
          {row.heartbeatAge === null ? (
            <p className="dlb-rownote">{row.heartbeat.text}</p>
          ) : (
            <p className="dlb-rownote">{row.heartbeatAge}</p>
          )}
        </div>
        <div className="dlb-rowcell">
          <span className="dlb-rowlabel">Ingestion</span>
          {ingestion === undefined ? null : <State word={ingestion.word} tone={ingestion.tone} />}
        </div>
      </div>

      <div className="dlb-rowcell">
        <span className="dlb-rowlabel">Pending</span>
        <Value reading={row.pendingEvents} />
        {/*
         * The oldest pending event, under the count. A queue of 128 that is
         * four seconds old and one that is four hours old are different
         * problems, and the count alone cannot tell them apart.
         */}
        <p className="dlb-rownote">
          {row.oldestPending.missing ? "Oldest not reported" : `Oldest ${row.oldestPending.text}`}
        </p>
      </div>

      <div className="dlb-rowcell">
        <span className="dlb-rowlabel">Verdict</span>
        <div className="dlb-chips">
          <StatusChip tone={row.healthTone}>{row.healthLabel}</StatusChip>
        </div>
        {row.attention === null ? null : <p className="dlb-rownote">{row.attention}</p>}
        {/*
         * Quarantine only where it was measured, and the two kinds apart. A
         * source whose counters were never reported has not told us it is
         * empty, so nothing is drawn rather than a zero.
         */}
        {row.quarantineUnmeasured ? null : (
          <p className="dlb-rownote">
            Quarantine {row.quarantine.text} local, {row.backendQuarantine.text} backend
          </p>
        )}
      </div>
    </article>
  );
}
