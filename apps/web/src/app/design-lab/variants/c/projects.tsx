import { StatusChip, StatusMark, type MarkTone } from "@/components/madspace/StatusMark";
import type { ProjectSummary } from "@/lib/madspace/estate";
import { ageSince, count, instant, lifecycleWord, type Reading } from "@/lib/madspace/format";

import type { LabScreenProps } from "../../lab-data";

/**
 * VARIANT C, PROJECTS. HYBRID EXECUTIVE.
 *
 * The same frame as Source detail, carrying a different subject. Graphite holds
 * what we CONCLUDE about the estate and what a person may DO to it; the paper
 * plate holds what was MEASURED, which here is one ruled row per project.
 *
 * ## Why a list and not a grid of cards
 *
 * The question this screen answers is comparative: how much of each project is
 * actually delivering? A grid of cards asks the reader to hold one project's
 * three counts in their head while their eye travels to the next card, because
 * a card's figures are positioned by its own content. A list puts every
 * project's counts on the same vertical, so the shortfall is read by scanning a
 * column rather than by remembering. That is the whole argument for the shape,
 * and it is why the row grid is declared once and shared by every row, and why
 * the divider is the 1px rule the panels already use rather than a gap between
 * floating boxes.
 *
 * ## The denominator never leaves
 *
 * "Four connected" is not a fact. Every count that can be short of the whole is
 * drawn as `n of N`, and the denominator is the project's own source count. The
 * three are independent readings and are never summed, averaged, ranked or
 * drawn as a proportion of one another: a project may be connected and never
 * have delivered anything, and a bar across the three would hide exactly that.
 *
 * ## What is deliberately absent
 *
 * No analytics, no sparkline, no trend and no score. This screen is about
 * whether installations work, never about what they observed. The disclosure in
 * the region head says so in words, because it is doctrine rather than an
 * answer.
 *
 * The row's control is `type="button"` with no handler, exactly as the three
 * lifecycle controls on Source detail are. Nothing on this route navigates.
 */

/**
 * Plurals through `Intl`, with the locale pinned.
 *
 * Pinned for the reason `format.ts` pins its own formatters: these screens are
 * server-rendered, so an unpinned selector prints whatever locale the host
 * happens to run under. The count itself still comes from `count()`, so no
 * numeral on this screen is produced by string concatenation.
 */
const PLURALS = new Intl.PluralRules("en-GB");

function plural(n: number, one: string, other: string): string {
  return PLURALS.select(n) === "one" ? one : other;
}

/**
 * Lifecycle is a decision rather than a health reading, and its marks say so.
 *
 * The same table Source detail declares, keyed on the word `lifecycleWord`
 * produces, because that word is all a screen in this lab is handed. A state
 * this table does not know falls to the neutral bar rather than to a guess.
 *
 * It is emphatically NOT the health verdict. A project's lifecycle says nothing
 * about whether its installations are delivering, and the counts beside it are
 * what answer that.
 */
const LIFECYCLE_TONE: Readonly<Record<string, MarkTone>> = {
  Active: "good",
  Suspended: "operator",
  Archived: "settled",
};

/**
 * A value, or the word that stands where a value is not.
 *
 * The same branch Source detail draws, and for the same reason: a reading that
 * was never measured drops a size, drops to regular weight, drops to the
 * metadata ink and takes the bar mark in front of it, so it cannot be mistaken
 * for a figure at a glance or in greyscale. `missing` is never ignored and
 * never becomes a dash.
 */
function Value({ reading }: { reading: Reading }) {
  if (!reading.missing) return <span className="dlc-value">{reading.text}</span>;

  return (
    <span className="dlc-value" data-missing="true">
      <StatusMark tone="none" />
      <span>{reading.text}</span>
    </span>
  );
}

/**
 * One count, and the whole it is a part of.
 *
 * `whole` is omitted only for the total itself, which is its own denominator.
 * Everywhere else the "of N" travels with the figure and may dim but may never
 * be dropped, because the figure alone is not a fact.
 *
 * The numerals are `number` rather than `number | null` here: `projectSummaries`
 * computes them in the same scan that finds the project, so a project holding
 * nothing counts zero and there is no absence to represent. They still run
 * through `count()`, which is what puts them through `Intl`.
 */
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

/**
 * The estate in one sentence, composed from the counts and nothing else.
 *
 * It sits on graphite because it is a conclusion drawn from the rows on the
 * paper below it, which is the rule that makes the seam legible without a
 * caption. There is no branch here that states anything the rows do not.
 */
function estateAnswer(projects: readonly ProjectSummary[], accountName: string): string {
  if (projects.length === 0) return `${accountName} holds no projects yet.`;

  const sources = projects.reduce((total, project) => total + project.sourceCount, 0);
  const connected = projects.reduce((total, project) => total + project.connectedCount, 0);
  const verified = projects.reduce((total, project) => total + project.verifiedCount, 0);

  const scale = `${count(sources).text} ${plural(sources, "source", "sources")} across ${count(projects.length).text} ${plural(projects.length, "project", "projects")}.`;

  if (connected === 0) return `${scale} None of them has ever been heard from.`;
  if (connected === sources && verified === sources) {
    return `${scale} All have connected, and all have proved an event reaches storage.`;
  }
  return `${scale} ${count(connected).text} of ${count(sources).text} ${plural(connected, "has", "have")} connected, and ${count(verified).text} of ${count(sources).text} ${plural(verified, "has", "have")} proved an event reaches storage.`;
}

function ProjectRow({ summary, now }: { summary: ProjectSummary; now: Date }) {
  /*
   * "No activity recorded" rather than a dash and rather than a date. A project
   * nothing has ever been heard from is the commonest row in this estate, and
   * the word plus the bar mark is what stops it reading as a measurement.
   */
  const last = instant(summary.lastActivity, "No activity recorded");
  const age = ageSince(summary.lastActivity, now);
  const word = lifecycleWord(summary.status);

  return (
    <article className="dlc-row">
      <div className="dlc-row-id">
        <p className="dlc-micro">Project</p>
        <h3 className="dlc-row-name">{summary.name}</h3>
        <div className="dlc-row-chips">
          <StatusChip tone={LIFECYCLE_TONE[word] ?? "none"}>{word}</StatusChip>
        </div>
      </div>

      {/*
       * THREE COUNTS, ONE DENOMINATOR, NO SUMMARY ACROSS THEM.
       *
       * Connected and Ingestion verified are independent readings of the same
       * population, not two stages of one. Nothing here ranks them, subtracts
       * one from the other or draws them as a proportion, because a project
       * whose sources have all connected and none of which has ever delivered
       * is a real and important state that any of those would hide.
       */}
      <dl className="dlc-tally">
        <Tally label="Sources" part={summary.sourceCount} />
        <Tally label="Connected" part={summary.connectedCount} whole={summary.sourceCount} />
        <Tally
          label="Ingestion verified"
          part={summary.verifiedCount}
          whole={summary.sourceCount}
        />
      </dl>

      <dl className="dlc-when">
        <div>
          <dt>Last activity</dt>
          <dd>
            <Value reading={last} />
            {age === null ? null : <span className="dlc-age">{age}</span>}
          </dd>
        </div>
      </dl>

      {/*
       * The door, and it is inert. A link on this route would lead out of the
       * lab or nowhere at all, and a control that pretends to navigate is
       * furniture pretending to be a way out. The row lifts on hover and on
       * focus so the button reads as acting on the whole row rather than on the
       * cell it sits in.
       */}
      <div className="dlc-row-go">
        <button type="button" className="dlc-btn" data-kind="secondary">
          Open project
        </button>
      </div>
    </article>
  );
}

export function ProjectsC({ estate, variantName }: LabScreenProps) {
  /*
   * The estate arrives whole and this screen takes the project summaries from
   * it. Every screen in the lab receives the same single prop, so no two can be
   * handed different readings of the same moment.
   */
  const projects = estate.projects;
  const name = variantName;

  /*
   * `estate.now` rather than a clock of this component's own. Every age on
   * every screen of the lab is measured from the instant the estate was read,
   * so two screens cannot disagree about how long ago something happened.
   */
  const readAt = instant(estate.now.toISOString());
  const answer = estateAnswer(projects, estate.accountName);

  return (
    <div className="dlc-root dlc-graphite">
      <a className="dlc-skip" href="#dlc-work">
        Skip to the estate
      </a>

      <div className="dlc-frame">
        {/*
         * The identity rail, unchanged from Source detail. It is the only
         * navigation the lab can honestly show, and the variant names itself
         * here so a screenshot of the composition is identifiable without the
         * layout carrying a badge.
         */}
        <div className="dlc-rail">
          <p className="dlc-rail-mark">
            IRIS Observer <span>MADSPACE operations</span>
          </p>
          <p className="dlc-rail-lab">Design lab &middot; Variant C &middot; {name}</p>
        </div>

        <header>
          <div className="dlc-mast-grid">
            <div className="dlc-mast-text">
              <p className="dlc-kicker">Estate</p>
              <h1 className="dlc-title">Projects</h1>
              <p className="dlc-answer">{answer}</p>
              {/*
               * The verdict slot, and what stands in it here.
               *
               * Source detail puts one health word for one installation in this
               * position. An ESTATE has no such word: seven sources in four
               * projects do not share a state, and any single chip here would be
               * an average of things that are not comparable. So the slot keeps
               * its place in the composition and says what it is not, which is
               * more honest than a badge.
               */}
              <div className="dlc-verdict">
                <span className="dlc-verdict-note">
                  There is no one state for an estate. Every state on this screen belongs to a
                  project or to one of its sources, and is drawn on the row that owns it.
                </span>
              </div>
            </div>

            {/*
             * NON FUNCTIONAL, DELIBERATELY. `type="button"`, no handler, and
             * nothing imported from an action module. One filled control per
             * view, as the system specifies, and the line beneath it says on the
             * screen that it is inert.
             */}
            <div className="dlc-controls">
              <p className="dlc-controls-label">Estate controls</p>
              <div className="dlc-controls-row">
                <button type="button" className="dlc-btn" data-kind="primary">
                  New project
                </button>
              </div>
              <p className="dlc-controls-note">
                Inert in the design lab. The control is not wired to an action.
              </p>
            </div>
          </div>

          {/*
           * The scope band: whose estate this is, which control plane answered,
           * and when. It is the last graphite element, it shares the plate's
           * outer edge, and it is what the paper is seated against.
           *
           * No count sits here. Counts were measured, and measurements belong on
           * the paper below the seam.
           */}
          <dl className="dlc-scope" data-cells="3">
            <div>
              <dt>Account</dt>
              <dd>
                <span className="dlc-value">{estate.accountName}</span>
              </dd>
            </div>
            <div>
              <dt>Control plane</dt>
              <dd>
                <span className="dlc-value">{estate.local ? "Local" : "Remote"}</span>
              </dd>
            </div>
            <div>
              <dt>Read at</dt>
              <dd>
                <Value reading={readAt} />
              </dd>
            </div>
          </dl>
        </header>

        {/*
         * A div rather than a `main`, for the reason Source detail gives: the
         * skip link needs a target, and a second document landmark would leave a
         * screen reader with two documents to choose between.
         */}
        <div id="dlc-work" className="dlc-plate dlc-paper">
          <section className="dlc-region" aria-labelledby="dlc-estate">
            <div className="dlc-region-head">
              <h2 id="dlc-estate">The estate</h2>
              <p className="dlc-lede">
                One row per project, most recently active first, and each row answers one question:
                how much of this project is actually delivering? The three counts always stand
                against the same denominator, because four connected is not a fact and four of six
                is.
              </p>
              {/*
               * Definitions and doctrine only. The design system permits the
               * reason a figure is shaped the way it is behind a disclosure, and
               * forbids the state, the date or a refusal from going there. Every
               * count and every instant is on the surface; only what each one
               * counts, and how the list is ordered, is behind this control.
               */}
              <details className="dlc-note">
                <summary>How this list is ordered, and what the counts mean</summary>
                <dl className="dlc-note-body">
                  <div>
                    <dt>The order</dt>
                    <dd>
                      Most recently active first. A project that has never been heard from sorts
                      below the live ones rather than above them, because a brand new project at the
                      top of an operations list is noise rather than news.
                    </dd>
                  </div>
                  <div>
                    <dt>Sources</dt>
                    <dd>
                      Every source registered under the project, including archived ones. It is the
                      denominator the other two counts are read against.
                    </dd>
                  </div>
                  <div>
                    <dt>Connected</dt>
                    <dd>
                      Sources whose heartbeat has been accepted at least once. Whether the most
                      recent one is still fresh is judged on each source, not here.
                    </dd>
                  </div>
                  <div>
                    <dt>Ingestion verified</dt>
                    <dd>
                      Sources that have proved an event reaches storage. It is independent of
                      Connected: a project can be fully connected and have delivered nothing.
                    </dd>
                  </div>
                  <div>
                    <dt>What this screen never shows</dt>
                    <dd>
                      No analytics, and there never will be any. This screen is about whether
                      installations work, not about what they observed.
                    </dd>
                  </div>
                </dl>
              </details>
            </div>

            {projects.length === 0 ? (
              <div className="dlc-empty">
                <p className="dlc-empty-title">This account holds no projects</p>
                <p className="dlc-empty-note">
                  The list is read through the account, so a project holding no sources would still
                  appear here. Nothing is being hidden by a short list.
                </p>
              </div>
            ) : (
              <div className="dlc-list">
                {projects.map((summary) => (
                  <ProjectRow key={summary.projectId} summary={summary} now={estate.now} />
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
