import type { LabScreenProps } from "../../lab-data";
import type { ProjectSummary } from "@/lib/madspace/estate";
import { ageSince, count, instant, lifecycleWord, type Reading } from "@/lib/madspace/format";
import { StatusChip, StatusMark, type MarkTone } from "@/components/madspace/StatusMark";

/**
 * VARIANT A, THE ESTATE. CANONICAL LIGHT, ON PAPER.
 *
 * The same direction as Source detail and deliberately the same parts: one
 * masthead, one gutter, a head whose first line is the subject and whose second
 * is the answer, a colophon rail of three quiet facts, a section head at
 * 18rem/1fr, and one bordered panel divided by hairlines. Nothing new is
 * invented here; what changes is what the panel holds.
 *
 * ## Why a list and not a grid of cards
 *
 * The screen answers one question per project: how much of this is actually
 * delivering? That is a comparison, and a comparison needs a shared edge. Four
 * cards put four denominators at four different x positions, so an operator
 * reads them one at a time and compares nothing. One panel, hairline-divided,
 * puts every SOURCES, CONNECTED and INGESTION VERIFIED figure on the same three
 * verticals, and the eye runs down a column instead of hunting round a grid.
 *
 * ## Why every count carries its denominator
 *
 * Four connected is not a fact. Four of six is. The denominator may shrink and
 * dim, and it may never be dropped, which is why it is rendered as its own
 * quieter span rather than composed into the numeral.
 *
 * ## What is deliberately absent
 *
 * No analytics, no trend, no score across the three counts. This screen is
 * about whether installations work, not about what they observed, and a single
 * figure spanning the three would be the collapse the whole product exists to
 * refuse.
 */
export function ProjectsA({ estate, screenName, variantName }: LabScreenProps) {
  const projects = byActivity(estate.projects);
  const latest = instant(newestActivity(estate.projects), "No activity recorded");

  return (
    <div className="dla-root">
      <header className="dla-masthead">
        <div className="dla-gutter dla-masthead-row">
          <span className="dla-masthead-mark">IRIS Observer</span>
          <span className="dla-masthead-where">MADSPACE operations</span>
          {/*
           * The lab's own label names the SCREEN as well as the direction. A
           * reviewer holds fifteen screenshots at the end of this round, and
           * the one line already reserved for the lab is where that belongs.
           */}
          <span className="dla-masthead-lab">
            {screenName}, variant A, {variantName}
          </span>
        </div>
      </header>

      {/*
       * A div, not a `main`, for the reason Source detail states: the route
       * above already owns the document outline, and two elements answering to
       * one landmark is a broken outline whichever of them is right.
       */}
      <div className="dla-gutter">
        <header className="dla-head">
          <div className="dla-head-top">
            <p className="dla-kicker">Estate</p>
          </div>

          <div className="dla-head-grid">
            <div>
              <h1 className="dla-title">Projects</h1>
              {/*
               * The answer, in the second line of the page. It is the same
               * sentence the live screen composes, from the same three sums,
               * because the scale of the estate and the share of it that is
               * delivering is what a reader came for.
               */}
              <p className="dla-answer">{estateAnswer(estate.projects, estate.accountName)}</p>
            </div>

            {/*
             * One filled control on the page, drawn and inert. The note beside
             * it states the two-step rule rather than describing the button,
             * exactly as the action note on Source detail does.
             */}
            <div className="dla-actions">
              <button type="button" className="dla-btn" data-kind="primary">
                New project
              </button>
              <p className="dla-actions-note">
                A project is created here. Its sources are created inside it and activated from the
                machine itself.
              </p>
            </div>
          </div>

          {/*
           * The colophon rail: whose estate this is, where the figures were
           * read from, and when the estate was last alive. The account scope
           * belongs in the frame rather than in a sentence, because it
           * qualifies every figure below it and not one paragraph.
           */}
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
              <dt>Last activity</dt>
              <dd>
                <Value reading={latest} />
              </dd>
            </div>
          </dl>
        </header>

        <section className="dla-section" aria-labelledby="dla-estate-heading">
          <div className="dla-section-head">
            <h2 id="dla-estate-heading">The estate</h2>
            <p className="dla-section-lede">
              One row per project, most recently active first. A project that has never been heard
              from sorts below the live ones rather than above them. The three counts on every row
              are read against the same denominator, because four connected is not a fact and four
              of six is.
            </p>
          </div>

          <div className="dla-panel" data-shape="rows">
            {projects.length === 0 ? (
              <div className="dla-empty">
                <p className="dla-empty-title">This account holds no projects</p>
                <p className="dla-empty-note">
                  A project holding no sources still appears here, so an empty list means the
                  account is empty rather than that its sources are quiet.
                </p>
              </div>
            ) : (
              projects.map((summary) => (
                <ProjectRow key={summary.projectId} summary={summary} now={estate.now} />
              ))
            )}
          </div>
        </section>
      </div>

      <div className="dla-gutter dla-foot">
        <p>
          Development instrument. The whole estate, read through the same control plane the live
          screen reads. Every control here is drawn and inert, so the hierarchy can be judged
          without anything being changed.
        </p>
      </div>
    </div>
  );
}

/* --- the sentence in the second line ---------------------------------------------- */

/**
 * Plurals through `Intl`, with the locale pinned.
 *
 * Pinned for the reason `format.ts` pins its instants: these screens are
 * server-rendered, so an unpinned selector would follow whatever locale the
 * host happens to run under. Every NUMERAL in the sentences below still comes
 * from `count()`; this decides a noun and nothing else.
 */
const PLURALS = new Intl.PluralRules("en-GB");

function plural(value: number, one: string, other: string): string {
  return PLURALS.select(value) === "one" ? one : other;
}

function total(projects: readonly ProjectSummary[], of: (row: ProjectSummary) => number): number {
  return projects.reduce((sum, row) => sum + of(row), 0);
}

/**
 * The estate in one sentence, composed from the counts and nothing else.
 *
 * The same three branches the live screen composes, so the lab cannot be
 * showing a reader a claim the product does not make. The scale comes first
 * because it sets the denominator every figure below is read against.
 */
function estateAnswer(projects: readonly ProjectSummary[], account: string): string {
  if (projects.length === 0) return `${account} holds no projects yet.`;

  const sources = total(projects, (row) => row.sourceCount);
  const connected = total(projects, (row) => row.connectedCount);
  const verified = total(projects, (row) => row.verifiedCount);
  const scale =
    `${count(sources).text} ${plural(sources, "source", "sources")} across ` +
    `${count(projects.length).text} ${plural(projects.length, "project", "projects")}.`;

  if (connected === 0) return `${scale} None of them has ever been heard from.`;
  if (connected === sources && verified === sources) {
    return `${scale} All of them have connected, and all have proved an event reaches storage.`;
  }
  return (
    `${scale} ${count(connected).text} of ${count(sources).text} have connected; ` +
    `${count(verified).text} of ${count(sources).text} have proved an event reaches storage.`
  );
}

/* --- the order of the list ---------------------------------------------------------- */

/** Names, compared with the locale pinned, for the one case where activity ties. */
const NAMES = new Intl.Collator("en-GB");

/**
 * When a project was last heard from, as a number a sort can use.
 *
 * A project with no activity and a project whose instant cannot be read both
 * sort to the bottom, which is the honest place for them: neither is evidence
 * that anything happened. It is emphatically NOT a zero anywhere it is
 * rendered, and this value never is rendered.
 */
function activityAt(value: string | null): number {
  if (value === null) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

/**
 * Most recently active first, and a project never heard from below the live
 * ones rather than above them.
 *
 * The read already returns this order; it is restated here because the ordering
 * is one of the things being judged, and a list whose order depends on a facade
 * two layers away cannot be read as a decision. Ties break on the name so the
 * six silent installations do not shuffle between renders.
 */
function byActivity(projects: readonly ProjectSummary[]): readonly ProjectSummary[] {
  return [...projects].sort((left, right) => {
    const a = activityAt(left.lastActivity);
    const b = activityAt(right.lastActivity);
    if (a === b) return NAMES.compare(left.name, right.name);
    return b - a;
  });
}

/** The newest activity anywhere in the estate, or null when there has been none. */
function newestActivity(projects: readonly ProjectSummary[]): string | null {
  let newest: string | null = null;
  let newestAt = Number.NEGATIVE_INFINITY;
  for (const row of projects) {
    const at = activityAt(row.lastActivity);
    if (at === Number.NEGATIVE_INFINITY || at <= newestAt) continue;
    newestAt = at;
    newest = row.lastActivity;
  }
  return newest;
}

/* --- a value, and the absence of one ------------------------------------------------ */

/**
 * The honesty rule, in one component, identical to Source detail's.
 *
 * A measurement is a figure: 19px, weight 500, ink, tabular. An absence is a
 * word matched to its field, and it changes size, weight, colour and figure
 * style at once so it cannot be mistaken for one. It also takes the neutral BAR
 * mark, which in this system means no measurement exists and is drawn nothing
 * like a zero.
 *
 * `found` raises a numeral to 700, which is what every count in a row takes:
 * the whole point of the row is that an operator finds the figure without
 * reading the label first.
 */
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

/* --- a count against its denominator ------------------------------------------------ */

/**
 * One figure, and what it is a share of.
 *
 * The denominator is a span of its own at caption size, so it recedes without
 * disappearing. Dropping it is the failure this screen exists to avoid, and
 * SOURCES is the one cell with none because it IS the denominator.
 */
function Tally({ label, part, whole }: { label: string; part: number; whole: number | null }) {
  return (
    <div>
      <dt className="dla-micro">{label}</dt>
      <dd>
        <Value reading={count(part)} found />
        {whole === null ? null : <span className="dla-tally-of">of {count(whole).text}</span>}
      </dd>
    </div>
  );
}

/* --- the row ------------------------------------------------------------------------ */

/**
 * Lifecycle to mark, one shape per value, agreeing with `HEALTH_TONE`.
 *
 * A project and an installation must not disagree about what Archived looks
 * like, so these are the three the shared verdict table already draws that way:
 * the filled circle for a state that is true and current, the diamond for a
 * decision a person made and can undo, the square for something terminal and
 * accepted. A value none of the three recognises takes the triangle rather than
 * the neutral bar: the column holds something, so no measurement is missing,
 * and somebody has to reconcile it with this vocabulary.
 */
function lifecycleTone(state: string): MarkTone {
  if (state === "active") return "good";
  if (state === "suspended") return "operator";
  if (state === "archived") return "settled";
  return "wrong";
}

function ProjectRow({ summary, now }: { summary: ProjectSummary; now: Date }) {
  const last = instant(summary.lastActivity, "No activity recorded");
  const age = ageSince(summary.lastActivity, now);

  return (
    <article className="dla-row" data-shape="project">
      <div className="dla-row-id">
        {/*
         * The eyebrow names the CLASS of the thing, which is the slot Source
         * detail gives to the source type above its title. Here every row is a
         * project, and the word is what makes the row's stack read the same way
         * on all three screens.
         */}
        <p className="dla-micro">Project</p>
        <h3 className="dla-row-name">{summary.name}</h3>
        <div className="dla-row-line">
          {/*
           * The word comes from `lifecycleWord`, which prints the column's own
           * value rather than relabelling everything that is not active. It is
           * not a judgement about whether the project is delivering: that
           * question belongs to a source's health, and the three counts beside
           * it are where this screen answers it.
           */}
          <StatusChip tone={lifecycleTone(summary.status)}>
            {lifecycleWord(summary.status)}
          </StatusChip>
        </div>
      </div>

      <dl className="dla-tally">
        <Tally label="Sources" part={summary.sourceCount} whole={null} />
        <Tally label="Connected" part={summary.connectedCount} whole={summary.sourceCount} />
        <Tally
          label="Ingestion verified"
          part={summary.verifiedCount}
          whole={summary.sourceCount}
        />
      </dl>

      <dl className="dla-rowfacts">
        <div>
          <dt className="dla-micro">Last activity</dt>
          <dd>
            <Value reading={last} />
            {age === null ? null : <span className="dla-field-note">{age}</span>}
          </dd>
        </div>
      </dl>

      {/*
       * The door. Inert by instruction, so it is a button rather than a link:
       * in the product the whole row is the anchor, and the row's hover here is
       * what says so. It keeps the tertiary treatment because the one filled
       * control on this screen is already spent on New project.
       */}
      <div className="dla-row-open">
        <button type="button" className="dla-btn" data-kind="tertiary">
          Open project
        </button>
      </div>
    </article>
  );
}
