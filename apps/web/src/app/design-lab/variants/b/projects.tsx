import { Fragment } from "react";

import { StatusChip, StatusMark, type MarkTone } from "@/components/madspace/StatusMark";
import type { ProjectSummary } from "@/lib/madspace/estate";
import { ageSince, count, instant, lifecycleWord, type Reading } from "@/lib/madspace/format";

import type { LabScreenProps } from "../../lab-data";

/**
 * VARIANT B. GRAPHITE CONSOLE. THE PROJECT INDEX.
 *
 * The same surface as Source detail, carried onto the screen above it: deep
 * graphite ground, the raised colour for anything that LABELS, the panel colour
 * for anything that ANSWERS, one solid 1px line dividing them, no shadow, and
 * IRIS blue nowhere but the focus ring.
 *
 * ## Why a ruled list and not a grid of cards
 *
 * The question this screen answers is comparative: how much of each project is
 * actually delivering? A card puts every project's figures in its own little
 * box, so the only way to compare four of them is to read four boxes and hold
 * three numbers in your head. The answer is a list whose COLUMNS line up, which
 * is the same argument Source detail's matrix makes one level down: the reading
 * has to work horizontally along a project and vertically down a column, and
 * subgrid is what keeps the second one true whatever a project is called.
 *
 * So the panel is built exactly as the hero there is. A rail of column names on
 * the raised colour, rows on the panel colour, a 1px row gap over the division
 * colour, and no vertical rules at all, because this is a list of projects
 * rather than a spreadsheet of cells.
 *
 * ## Three counts, one denominator
 *
 * Connected and Ingestion verified always print their denominator, because
 * "one connected" is not a fact and "1 of 7" is. The denominator may shrink and
 * dim; it may never be dropped. And the three counts are never summed into a
 * score, a percentage or a bar: a project with four connected sources and no
 * verified one is not "two thirds healthy", it is a project where nothing has
 * proved it can deliver.
 *
 * ## The ordering is drawn, not described
 *
 * Most recently active first, and a project never heard from sorts BELOW the
 * live ones rather than above them. That is easy to state in a caption nobody
 * reads, so the list states it structurally: the two groups are separated by a
 * labelled band on the raised colour, and the band is only drawn when both
 * groups exist.
 *
 * There are no analytics here and there never will be. This screen is about
 * whether installations work, not about what they observed.
 */

/**
 * Plural selection through `Intl`, with the locale pinned.
 *
 * The accessibility contract requires plurals through `Intl.PluralRules` rather
 * than a ternary on the number, and pinned for the same reason `format.ts` pins
 * its instants: these screens are server-rendered, so an unpinned formatter
 * prints whatever locale the host happens to run under.
 */
const PLURALS = new Intl.PluralRules("en-GB");

function plural(value: number, one: string, other: string): string {
  return PLURALS.select(value) === "one" ? one : other;
}

/**
 * Lifecycle to mark, one shape per value.
 *
 * Active is the filled circle, suspended the operator diamond, archived the
 * settled square, and these agree with `HEALTH_TONE` in `control-plane.ts` so a
 * project and an installation cannot disagree about what "Archived" looks like.
 *
 * A value none of the three recognises takes the triangle rather than the
 * neutral bar: the column holds SOMETHING, so no measurement is missing, and
 * somebody has to reconcile that value with this vocabulary. `lifecycleWord`
 * prints it beside the mark so the reader sees which one the row holds.
 */
function lifecycleTone(state: string): MarkTone {
  if (state === "active") return "good";
  if (state === "suspended") return "operator";
  if (state === "archived") return "settled";
  return "wrong";
}

/**
 * A measurement, or the fact that there is none.
 *
 * The same rule Source detail draws, at row scale. An absent value loses the
 * medium weight and the tabular figures and carries the neutral bar, which this
 * system draws for "no measurement exists" and never for a zero.
 */
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

/**
 * A count that is not a number is not a zero.
 *
 * `ProjectSummary` types its three counts as numbers, and they arrive from
 * `Number(row.source_count)` over a column this screen does not control. A
 * value that did not survive that conversion is an absent measurement, so it
 * takes the word rather than a confident numeral.
 */
function tally(value: number): Reading {
  return Number.isFinite(value) ? count(value) : count(null);
}

/**
 * A figure on its own, at the weight a scanned column needs.
 *
 * It goes through `Value` when the count is absent for the same reason every
 * other reading does: 700 weight and tabular figures are the treatment of a
 * measurement, and a word wearing them would read as one.
 */
function Count({ value }: { value: number }) {
  const reading = tally(value);
  if (reading.missing) return <Value reading={reading} />;
  return (
    <p className="dlb-tally">
      <span className="dlb-tallyfig">{reading.text}</span>
    </p>
  );
}

/** A figure and its denominator. The denominator may dim; it may never go. */
function Share({ part, whole }: { part: number; whole: number }) {
  const reading = tally(part);
  if (reading.missing) return <Value reading={reading} />;
  return (
    <p className="dlb-tally">
      <span className="dlb-tallyfig">{reading.text}</span>
      <span className="dlb-of"> of {tally(whole).text}</span>
    </p>
  );
}

/**
 * The estate in one sentence, composed from the counts and nothing else.
 *
 * The branches are the live screen's, so the two cannot answer the same
 * question differently. What is added is the third clause: how many
 * installations have never been heard from at all, which is the figure that
 * sends somebody to a showroom and the one an operator would otherwise work out
 * by subtracting two numbers in their head.
 */
function estateSentence(
  accountName: string,
  projects: number,
  sources: number,
  connected: number,
  verified: number,
): string {
  if (projects === 0) return `${accountName} holds no projects yet.`;
  if (sources === 0) return "These projects hold no sources yet.";

  const scale = `${tally(sources).text} ${plural(sources, "source", "sources")}`;
  if (connected === 0) return `None of the ${scale} has ever been heard from.`;
  if (connected === sources && verified === sources) {
    return `All ${scale} have connected, and all have proved an event reaches storage.`;
  }

  const never = sources - connected;
  const heard = `${tally(connected).text} of ${scale} ${plural(connected, "has", "have")} connected.`;
  const proved = `${tally(verified).text} of ${tally(sources).text} ${plural(verified, "has", "have")} proved an event reaches storage.`;
  const silent =
    never === 0
      ? ""
      : ` ${tally(never).text} ${plural(never, "has", "have")} never been heard from.`;
  return `${heard} ${proved}${silent}`;
}

/**
 * Which band a project belongs in, and where it sits inside it.
 *
 * A stored instant that no clock can read is NOT the same fact as an empty
 * column: the first is a row this screen cannot read, the second is a project
 * nothing has ever been heard from. So an unreadable instant stays in the band
 * of projects that HAVE reported, at the bottom of it, and `instant` prints
 * "Not readable" in the row. Sorting it into "Never heard from" would tell an
 * operator no installation ever reported when one did.
 */
function activityKey(value: string | null): number {
  if (value === null) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

/** Newest first. Compared rather than subtracted, so an unreadable pair is not NaN. */
function byActivity(left: ProjectSummary, right: ProjectSummary): number {
  const a = activityKey(left.lastActivity);
  const b = activityKey(right.lastActivity);
  if (a === b) return 0;
  return b > a ? 1 : -1;
}

function ProjectRow({ summary, now }: { summary: ProjectSummary; now: Date }) {
  const last = instant(summary.lastActivity, "No activity recorded");
  const age = ageSince(summary.lastActivity, now);

  return (
    <article className="dlb-row">
      <div className="dlb-rowcell">
        <h3 className="dlb-rowname">{summary.name}</h3>
        <div className="dlb-chips">
          {/*
           * The lifecycle, and only the lifecycle. It is not a judgement about
           * whether the project is delivering: that question belongs to the
           * counts beside it and to a source's health one screen down.
           */}
          <StatusChip tone={lifecycleTone(summary.status)}>
            {lifecycleWord(summary.status)}
          </StatusChip>
        </div>
      </div>

      {/*
       * The three counts travel as one group so they can become a strip of
       * three on a narrow viewport. `display: contents` above the breakpoint,
       * so the wrapper does not exist as far as the column grid is concerned.
       */}
      <div className="dlb-rowgroup">
        <div className="dlb-rowcell">
          <span className="dlb-rowlabel">Sources</span>
          <Count value={summary.sourceCount} />
        </div>
        <div className="dlb-rowcell">
          <span className="dlb-rowlabel">Connected</span>
          <Share part={summary.connectedCount} whole={summary.sourceCount} />
        </div>
        <div className="dlb-rowcell">
          <span className="dlb-rowlabel">Ingestion verified</span>
          <Share part={summary.verifiedCount} whole={summary.sourceCount} />
        </div>
      </div>

      <div className="dlb-rowcell">
        <span className="dlb-rowlabel">Last activity</span>
        <Value reading={last} />
        {age === null ? null : <p className="dlb-rownote">{age}</p>}
      </div>

      <div className="dlb-rowcell dlb-doorcell">
        {/*
         * The door. Bordered rather than filled, because the one filled control
         * on this view is New project, and inert like every control in the lab:
         * `type="button"` and no handler, on a server component that could not
         * carry one.
         */}
        <button className="dlb-btn" data-kind="secondary" type="button">
          Open project
        </button>
      </div>
    </article>
  );
}

export function ProjectsB({ estate, screenName, variantName }: LabScreenProps) {
  const projects = estate.projects;

  const sources = projects.reduce((total, project) => total + project.sourceCount, 0);
  const connected = projects.reduce((total, project) => total + project.connectedCount, 0);
  const verified = projects.reduce((total, project) => total + project.verifiedCount, 0);
  const sentence = estateSentence(
    estate.accountName,
    projects.length,
    sources,
    connected,
    verified,
  );

  /*
   * Two bands rather than one sorted list, because the ordering rule is a fact
   * about the estate and not a convention a reader should have to infer. The
   * band is drawn only when both groups exist: a heading over the whole list
   * would be a label rather than a division.
   */
  const heard = projects.filter((project) => project.lastActivity !== null).sort(byActivity);
  const silent = projects.filter((project) => project.lastActivity === null);
  const bands = [
    { key: "heard", label: "Heard from, most recent first", rows: heard },
    { key: "silent", label: "Never heard from", rows: silent },
  ].filter((band) => band.rows.length > 0);
  const banded = bands.length > 1;

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

      {/*
       * A div rather than a landmark, for the reason Source detail gives: the
       * MADSPACE shell already renders a main with this id, and a nested main
       * plus a duplicate id is a defect rather than a composition.
       */}
      <div className="dlb-width">
        <div className="dlb-masthead">
          <div>
            {/*
             * The scope, above the title. The rail already names the product
             * area, so the eyebrow spends its line on the one thing the rail
             * cannot say: whose estate these projects are.
             */}
            <p className="dlb-eyebrow">Account estate</p>
            <h1 className="dlb-title">Projects</h1>
            {/* The scope, in the frame. Every figure below is inside it. */}
            <div className="dlb-meta">
              <span className="dlb-meta-item">
                <span className="dlb-meta-key">Account</span>
                <span className="dlb-meta-value">{estate.accountName}</span>
              </span>
              <span className="dlb-meta-item">
                <span className="dlb-meta-key">Projects</span>
                <span className="dlb-meta-value">{tally(projects.length).text}</span>
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
            <div className="dlb-actions">
              <button className="dlb-btn" data-kind="primary" type="button">
                New project
              </button>
            </div>
            <p className="dlb-inert">Controls inert in the design lab</p>
          </div>
        </div>

        <section className="dlb-section" aria-labelledby="dlb-estate-heading">
          <div className="dlb-sectionhead">
            <h2 className="dlb-h2" id="dlb-estate-heading">
              The estate
            </h2>
            <p className="dlb-sectionnote">
              Whether installations work, not what they observed. There are no analytics here.
            </p>
          </div>

          <div className="dlb-hero">
            {/*
             * The answer band, on the same two-column geometry Source detail
             * uses: the rail states the denominator every figure below is
             * measured against, and the body states the shares. Neither is
             * derived from the other and neither is a verdict on the estate,
             * because an estate does not have one.
             */}
            <div className="dlb-answerband">
              <div className="dlb-answerband-rail">
                <p className="dlb-spinelabel">Sources in the estate</p>
                <p className="dlb-figure">{tally(sources).text}</p>
              </div>
              <div className="dlb-answerband-body">
                <div>
                  <p className="dlb-answer">{sentence}</p>
                  {/*
                   * The one definition this screen owes its reader, and it is a
                   * definition rather than an answer, so it sits under the
                   * sentence at caption size. CONNECTED is a count of
                   * installations a heartbeat has ever arrived from, and a
                   * reader who took it for "online now" would read the estate
                   * as healthier than it is.
                   */}
                  <p className="dlb-answernote">
                    Connected counts an installation a heartbeat has ever arrived from, not one that
                    is online now. Whether a source is online is a question its own screen answers.
                  </p>
                </div>
              </div>
            </div>

            <div className="dlb-table" data-columns="projects">
              {/*
               * The column rail. `aria-hidden`, because every label it shows
               * also travels inside the cell it labels, visually hidden while
               * this is on screen. A screen reader hears "Connected, 1 of 7"
               * beside the figure rather than a detached row of headings, and
               * below the collapse the labels are what remains.
               */}
              <div className="dlb-thead" aria-hidden="true">
                <p className="dlb-th">Project</p>
                <p className="dlb-th">Sources</p>
                <p className="dlb-th">Connected</p>
                <p className="dlb-th">Ingestion verified</p>
                <p className="dlb-th">Last activity</p>
                <p className="dlb-th" />
              </div>

              {bands.map((band) => (
                <Fragment key={band.key}>
                  {banded ? (
                    <div className="dlb-band">
                      <p className="dlb-spinelabel">{band.label}</p>
                    </div>
                  ) : null}
                  {band.rows.map((summary) => (
                    <ProjectRow key={summary.projectId} summary={summary} now={estate.now} />
                  ))}
                </Fragment>
              ))}
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
