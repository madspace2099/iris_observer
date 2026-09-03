import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ActionLink, Kicker, StateMessage } from "@observer/ui";
import { requireViewer } from "@/lib/session";
import { controlPlane, CONTROL_PLANE_ACCOUNT_NAME } from "@/lib/sources/control-plane";
import { projectSummaries, type ProjectSummary } from "@/lib/madspace/estate";
import { ageSince, instant, lifecycleWord } from "@/lib/madspace/format";
import { ControlPlaneAbsent } from "@/components/madspace/ControlPlaneAbsent";
import { BuildEstate } from "@/components/madspace/BuildEstate";
import { InfoNote } from "@/components/madspace/InfoNote";
import { StatusChip, type MarkTone } from "@/components/madspace/StatusMark";
import { localControlPlaneEnabled } from "@/lib/sources/local-db";

export const metadata: Metadata = { title: "Projects" };

/*
 * Numbers and plurals through `Intl`, with the locale pinned.
 *
 * Pinned for the same reason `format.ts` pins its instants: these pages are
 * server-rendered, so an unpinned formatter would print whatever the host's
 * locale happens to be, which on Vercel is not the operator's and on a
 * development machine is not the same as on Vercel.
 */
const NUMBERS = new Intl.NumberFormat("en-GB");
const PLURALS = new Intl.PluralRules("en-GB");

function plural(count: number, one: string, other: string): string {
  return PLURALS.select(count) === "one" ? one : other;
}

/**
 * Projects — the estate, one row per project.
 *
 * The row answers one question: how much of this project is actually
 * delivering? So the three counts are always shown against the same
 * denominator, because "four connected" is not a fact and "four of six" is.
 *
 * There are no analytics here, and there should never be. This screen is about
 * whether installations work, not about what they observed.
 */
export default async function MadspaceProjectsPage() {
  const viewer = await requireViewer();
  if (viewer.role !== "madspace_admin") redirect("/");

  const plane = await controlPlane();
  /*
   * Read before the header renders, because the header's own sentence is the
   * answer rather than an introduction to it. A page whose first line describes
   * what the page is has spent its best line on the reader's least useful
   * question.
   */
  const summaries = plane.ok ? await projectSummaries(plane.admin) : null;
  const answer = lede(summaries);

  return (
    <>
      <header className="mad-head">
        <div className="mad-head-text">
          <Kicker>MADSPACE operations</Kicker>
          {/*
           * The scope sits behind the disclosure, and the account and the
           * control plane are not restated here at all: the shell header names
           * both on every screen under /madspace, so a sentence saying it again
           * was the third telling of two facts already on the page.
           */}
          <div className="mad-idline">
            <h1 className="mad-title">Projects</h1>
            <InfoNote label="the scope of these figures">
              <p>Every figure on this screen is scoped to {CONTROL_PLANE_ACCOUNT_NAME}.</p>
            </InfoNote>
          </div>
          <p className="mad-lede">
            {answer.sentence}
            {answer.note === null ? null : (
              <InfoNote label="what being heard from means">
                <p>{answer.note}</p>
              </InfoNote>
            )}
          </p>
        </div>

        {/*
         * The one write on this screen, and it sits beside the sentence that
         * says how much of the estate there is. It is offered whether or not
         * the control plane opened: the form behind it states the absence
         * itself, which is a better answer than a button that has silently
         * disappeared.
         */}
        <div className="mad-head-actions">
          <ActionLink href="/madspace/projects/new" emphasis="primary">
            New project
          </ActionLink>
        </div>
      </header>

      {plane.ok ? (
        <Estate summaries={summaries ?? []} />
      ) : (
        <section className="mad-plane" aria-labelledby="plane-heading">
          <div className="obs-section-head">
            <h2 id="plane-heading">The control plane</h2>
          </div>
          <ControlPlaneAbsent absence={plane.absence} />
        </section>
      )}
    </>
  );
}

/**
 * The estate in one sentence, composed from the counts and nothing else.
 *
 * Written so the commonest reading of this screen — a glance — lands on the
 * number that decides whether anybody has work to do today.
 */
interface Lede {
  /** The answer. Always in front of the reader, never behind the disclosure. */
  readonly sentence: string;
  /**
   * The one clause that may hide: a definition of what being heard from means.
   * It explains the shape of a figure rather than being one, which is the only
   * thing the disclosure is allowed to hold. Null in every other branch,
   * because a refusal, a state and a pair of counts are all answers.
   */
  readonly note: string | null;
}

function lede(summaries: readonly ProjectSummary[] | null): Lede {
  if (summaries === null) {
    return {
      sentence: `The estate of ${CONTROL_PLANE_ACCOUNT_NAME} cannot be read right now.`,
      note: null,
    };
  }
  if (summaries.length === 0) {
    return { sentence: `${CONTROL_PLANE_ACCOUNT_NAME} holds no projects yet.`, note: null };
  }

  const sources = summaries.reduce((total, project) => total + project.sourceCount, 0);
  const connected = summaries.reduce((total, project) => total + project.connectedCount, 0);
  const verified = summaries.reduce((total, project) => total + project.verifiedCount, 0);
  const scale = `${NUMBERS.format(sources)} ${plural(sources, "source", "sources")} across ${NUMBERS.format(summaries.length)} ${plural(summaries.length, "project", "projects")}.`;

  if (connected === 0) {
    return {
      sentence: `${scale} None has ever been heard from.`,
      note: "No heartbeat has been accepted from any of them.",
    };
  }
  if (connected === sources && verified === sources) {
    return {
      sentence: `${scale} All of them have connected, and all have proved an event reaches storage.`,
      note: null,
    };
  }
  return {
    sentence: `${scale} ${NUMBERS.format(connected)} of ${NUMBERS.format(sources)} have connected; ${NUMBERS.format(verified)} of ${NUMBERS.format(sources)} have proved an event reaches storage.`,
    note: null,
  };
}

function Estate({ summaries }: { summaries: readonly ProjectSummary[] }) {
  if (summaries.length === 0) {
    return (
      <section className="mad-plane" aria-labelledby="estate-heading">
        <div className="obs-section-head">
          <h2 id="estate-heading">The estate</h2>
        </div>
        {/*
         * "No projects", not "no sources".
         *
         * The list is read through `observer_projects_for_account`, so a
         * project holding nothing at all still appears. The older wording said
         * the estate was enumerated through its sources, which would have told
         * an operator that a short list might be hiding projects it cannot see
         * — the absent-versus-zero confusion this product exists to prevent,
         * pointed the wrong way.
         */}
        <StateMessage title="This account holds no projects" detail="Create a project to see it." />
        {/*
         * The way out of this screen, on this screen. Every other route into
         * the demonstration estate runs through Source Detail, which is reached
         * only through the list above — so an empty list was a dead end, and
         * the reset `seed.ts` recommends in its own error message led straight
         * into it.
         */}
        {localControlPlaneEnabled() ? <BuildEstate /> : null}
      </section>
    );
  }

  return (
    <section className="mad-plane" aria-labelledby="estate-heading">
      <div className="obs-section-head">
        {/*
         * "The estate" rather than "Projects": the h1 already carries that
         * word, and an outline that names the same thing twice tells a screen
         * reader nothing about where it has arrived.
         */}
        <div className="mad-idline">
          <h2 id="estate-heading">The estate</h2>
          <InfoNote label="how this list is ordered">
            <p>
              Most recently active first. A project that has never been heard from sorts below the
              live ones rather than above them.
            </p>
          </InfoNote>
        </div>
      </div>

      <div className="mad-rows">
        {summaries.map((summary) => (
          <ProjectRow key={summary.projectId} summary={summary} />
        ))}
      </div>
    </section>
  );
}

/**
 * Lifecycle to mark, one shape per value.
 *
 * Every project used to wear the operator diamond, so Active and Archived drew
 * the identical shape on the identical tint and the mark carried nothing the
 * word beside it had not already said. Only one of the three values is an
 * operator's standing decision:
 *
 *   active      the state is true and current, so the filled circle. Nobody
 *               suspended it and nobody retired it.
 *   suspended   a person decided this and a person can undo it: the diamond.
 *   archived    terminal and accepted, nothing further expected: the square.
 *
 * These agree with `HEALTH_TONE` in `control-plane.ts`, which draws a suspended
 * and an archived SOURCE exactly this way. A project and an installation must
 * not disagree about what "Archived" looks like.
 *
 * A value none of the three recognises takes the triangle rather than the
 * neutral bar: the column holds something, so no measurement is missing — the
 * surface simply cannot vouch for a lifecycle it does not know, and somebody
 * has to reconcile the column with this vocabulary. `lifecycleWord` prints that
 * value in words beside the mark, so the reader sees which one the row holds.
 */
function lifecycleTone(state: string): MarkTone {
  if (state === "active") return "good";
  if (state === "suspended") return "operator";
  if (state === "archived") return "settled";
  return "wrong";
}

function ProjectRow({ summary }: { summary: ProjectSummary }) {
  const last = instant(summary.lastActivity, "No activity recorded");
  const age = ageSince(summary.lastActivity, new Date());

  return (
    <article className="mad-row mad-row--project">
      <div className="mad-row-id">
        <span className="mad-tally-label">Project</span>
        {/*
         * The visible micro-label above is the only one. It used to be doubled
         * by a screen-reader-only "Project " inside the heading, so the row was
         * announced as "Project Project ISTER TOWER".
         */}
        <h3 className="mad-row-name">{summary.name}</h3>
        <div className="mad-idline">
          {/*
           * The word comes from `lifecycleWord`, which returns the column's own
           * value rather than relabelling everything that is not "active" as
           * "Archived". The shape comes from `lifecycleTone` beside it, which is
           * where the reason each lifecycle wears the mark it does is written.
           * Neither is a judgement about whether the project is delivering: that
           * question belongs to a source's health, not to a project's lifecycle.
           */}
          <StatusChip tone={lifecycleTone(summary.status)}>
            {lifecycleWord(summary.status)}
          </StatusChip>
        </div>
      </div>

      {/*
       * The three counts, in ruled cells with their labels above them.
       *
       * They are three independent states, not three stages: a source can be
       * connected and never verified, and nothing here may collapse them into
       * one dot, one percentage or one bar. `mad-facts` is carried alongside
       * `mad-datapanel` only for the `margin: 0` a bare `<dl>` needs; every
       * visual rule below comes from the data panel.
       */}
      <dl className="mad-facts mad-datapanel">
        <div>
          <dt>Sources</dt>
          <dd>{NUMBERS.format(summary.sourceCount)}</dd>
        </div>
        <div>
          <dt>Connected</dt>
          <dd>
            {NUMBERS.format(summary.connectedCount)}
            {/* The denominator may shrink and dim; it may never be dropped. */}
            <span className="mad-tally-of"> of {NUMBERS.format(summary.sourceCount)}</span>
          </dd>
        </div>
        <div>
          <dt>Ingestion verified</dt>
          <dd>
            {NUMBERS.format(summary.verifiedCount)}
            <span className="mad-tally-of"> of {NUMBERS.format(summary.sourceCount)}</span>
          </dd>
        </div>
      </dl>

      <dl className="mad-facts">
        <div className="mad-meta-item">
          <dt className="mad-meta-label">Last activity</dt>
          {/*
           * `data-missing` travels with the word, because an absent instant is
           * not a zero and not a blank: the reading says "No activity recorded"
           * and the attribute is what stops it being styled as a measurement
           * somebody took.
           */}
          <dd className="mad-meta-value" data-missing={last.missing}>
            {last.text}
          </dd>
          {age === null ? null : <dd className="mad-note">{age}</dd>}
        </div>
      </dl>

      <ActionLink href={`/madspace/projects/${summary.projectId}`}>Open project</ActionLink>
    </article>
  );
}
