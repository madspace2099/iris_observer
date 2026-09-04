import type { ReactNode } from "react";
import Link from "next/link";
import { AGENT_MIN_SAMPLE } from "@observer/metrics";
import type { AgentProfile, PeriodPreset } from "@observer/readmodels";

import { DataTable, type DataColumn, type DataRow } from "@/components/product";
import { dynamicRoute } from "@/lib/href";
import { withPeriod } from "@/lib/period";
import { Missing, ShareFigure, isDash } from "./Rates";

/**
 * THE TEAM REGISTER — the thing that replaced four outcome doughnuts.
 *
 * The screen this supersedes drew one ring per agent, side by side, four across.
 * Three separate rules were against it and only the first is about taste.
 *
 * 1. **Four gauges in a row is on the doctrine's anti-slop list.** Identical
 *    repeated shapes read as decoration, and a ring is the hardest of all
 *    shapes to compare against another ring: the eye has no shared baseline, so
 *    a reader compares areas, which is the one visual judgement people are
 *    reliably bad at.
 * 2. **The question is a comparison and a ring cannot answer it.** "How does
 *    this team's work differ" is answered by reading DOWN a column — four
 *    figures on one scale, in one unit, in one place. A table is the shape that
 *    does that, and a register of a team is as tabular as a register of units.
 * 3. **A ring hides the denominator that matters here.** The count in the hole
 *    is the agent's meetings; the count the reader needs is how many of those
 *    meetings had an outcome recorded at all, since every rate silently drops
 *    the rest. That figure has a column of its own below and never had a place
 *    on the ring.
 *
 * The outcome MIX did not disappear. It moved to each agent's own page, where a
 * ring is the right form and there is nothing beside it to mis-compare it with
 * — parts of one whole, for one person, with the denominator in the middle.
 *
 * ## What makes this a register and not a leaderboard
 *
 * **The rows are in the read model's order and there is no sort control.**
 * Every other table in this product offers one; this one must not. An ordering
 * a reader can apply to a column of people is a ranking whatever the header
 * says, and `docs/01-foundation.md` is that the agent's own data supply is what
 * every upstream figure rests on — the fastest route to a better rank is to
 * record less. The caption says so in words, because a missing control explains
 * nothing on its own.
 *
 * **No column is a score.** Presentations is workload. Median presentation is a
 * duration. "Progressed" is a rate over the meetings that recorded an outcome,
 * and it carries its denominator. "Outcome not recorded" is a completeness
 * figure about the DATA, and it is the one this screen most wants read: a
 * missing outcome is a habit at the end of a meeting, not a quality of the
 * person who held it.
 *
 * **Below twenty meetings, nothing here is a verdict.** `AGENT_MIN_SAMPLE` is
 * imported from the metric registry rather than written as `20`, and the
 * reporting-sample column states the shortfall on the row itself so that a
 * reader scanning the rate column has already been told which rows are thin.
 */

/**
 * The one figure on this screen that had no read model behind it.
 *
 * `AgentOutcomeRing.slices` omits an outcome nobody recorded — `outcomeSlices`
 * filters `count > 0` — so the absence of a `skipped` slice means every meeting
 * had an outcome recorded, which is a real answer and is stated as one. Reading
 * the slice is a lookup, not a computation: the count and the share were both
 * produced by the read model and neither is derived here.
 */
function unrecordedOf(agent: AgentProfile): { readonly count: number } | null {
  const slice = agent.ring.slices.find((s) => s.outcome === "skipped");
  return slice === undefined ? null : { count: slice.count };
}

export function TeamRegister({
  agents,
  meetingCount,
  showRatings,
  locale,
  periodLabel,
  root,
  period,
}: {
  readonly agents: readonly AgentProfile[];
  /** Meetings on the project in the period. The denominator every row sits in. */
  readonly meetingCount: number;
  /** ADR-0029: the IRIS rating is MADSPACE-only and never reaches a developer. */
  readonly showRatings: boolean;
  readonly locale: string;
  readonly periodLabel: string;
  /** `/{tenant}/{project}`. The detail route is the app's, not a read model's. */
  readonly root: string;
  readonly period: PeriodPreset;
}) {
  const columns: readonly DataColumn[] = [
    { key: "agent", label: "Agent" },
    { key: "meetings", label: "Presentations", numeric: true },
    { key: "median", label: "Median presentation", numeric: true },
    { key: "progressed", label: "Progressed", numeric: true },
    { key: "unrecorded", label: "Outcome not recorded", numeric: true },
    { key: "sample", label: "Reporting sample" },
    { key: "signature", label: "Leans on" },
    ...(showRatings ? [{ key: "rating", label: "Rates IRIS", numeric: true }] : []),
  ];

  const rows: readonly DataRow[] = agents.map((agent) => {
    const unrecorded = unrecordedOf(agent);
    const noneDecided = unrecorded !== null && unrecorded.count === agent.meetings;
    const below = agent.meetings < AGENT_MIN_SAMPLE;

    const cells: Record<string, ReactNode> = {
      /*
       * The name is the route to the person's own page, and it goes through
       * `withPeriod` before `dynamicRoute` like every other internal link in
       * the product: a reader who chose "Last 28 days" and then opened an agent
       * used to be returned silently to the quarter.
       *
       * The href is assembled here rather than taken from `AgentProfile.href`,
       * which resolves to `…/agents?agent=<id>` — the roster's own focus
       * parameter, not the detail surface.
       */
      agent: (
        <Link href={dynamicRoute(withPeriod(`${root}/agents/${agent.agentId}`, period))}>
          {agent.name}
        </Link>
      ),

      meetings: (
        <span className="ox-value">
          <span className="ox-figure">{agent.meetings}</span>
          <span className="ox-of">of {meetingCount}</span>
        </span>
      ),

      /*
       * "—" from the read model is an absence, not a value, and is drawn as
       * one. Every meeting of theirs in the period came from the legacy
       * import, which records the order of a presentation and not its clock.
       */
      median: isDash(agent.medianDurationDisplay) ? (
        <Missing what="Not timed" />
      ) : (
        <span className="ox-value">
          <span className="ox-figure">{agent.medianDurationDisplay}</span>
        </span>
      ),

      /*
       * A rate whose denominator is the meetings that recorded an outcome, not
       * the meetings held. Where nothing was recorded there is no denominator
       * at all, and a zero there would read as "none of their meetings went
       * anywhere" when what happened is that nobody wrote down where they went.
       */
      progressed: noneDecided ? (
        <Missing what="No outcome recorded" />
      ) : (
        <ShareFigure
          share={agent.ring.progressedShare}
          sampleSize={agent.meetings}
          minimumSampleSize={AGENT_MIN_SAMPLE}
          locale={locale}
          qualifier="of meetings with an outcome"
        />
      ),

      unrecorded:
        unrecorded === null ? (
          <span className="ox-value">
            <span className="ox-figure">0</span>
            <span className="ox-of">every meeting recorded one</span>
          </span>
        ) : (
          <span className="ox-value">
            <span className="ox-figure">{unrecorded.count}</span>
            <span className="ox-of">of {agent.meetings}</span>
          </span>
        ),

      /*
       * The bar mark, which the stylesheet reserves for "unmeasured", rather
       * than the amber ring. A thin sample is a fact about how much has been
       * observed; drawing it as a warning would make it a fact about the
       * person, which is the one thing this screen may never say.
       */
      sample: below ? (
        <span className="ox-chip" data-tone="none">
          <span className="ox-chip-mark" aria-hidden="true" />
          {agent.meetings} of {AGENT_MIN_SAMPLE}
        </span>
      ) : (
        <span className="ox-chip" data-tone="settled">
          <span className="ox-chip-mark" aria-hidden="true" />
          Sample met
        </span>
      ),

      signature:
        agent.signature === null ? (
          <Missing what="No section stands out" />
        ) : (
          <span>
            {agent.signature.label}
            <span className="ox-n"> · {agent.signature.overIndex.toFixed(1)}× the team</span>
          </span>
        ),
    };

    /*
     * ADR-0029, and the one line of this file that is an access decision.
     *
     * The rating an agent gives IRIS at the end of a session is feedback on the
     * SOFTWARE. A developer reading it beside their agency's figures would take
     * it as feedback on the sales team. `showRatings` is set by the repository
     * from the viewer's role; the column is absent, not blank, when it is false.
     */
    if (showRatings) {
      cells["rating"] =
        agent.irisRating === null ? (
          <Missing what="No response" />
        ) : (
          <span className="ox-value">
            <span className="ox-figure">{agent.irisRating.mean.toFixed(1)}</span>
            <span className="ox-of">of 5 · {agent.irisRating.responses} responses</span>
          </span>
        );
    }

    return { key: agent.agentId, cells };
  });

  return (
    <DataTable
      caption={`Every agent who presented in ${periodLabel.toLowerCase()}, in the order the read model returns them. The table cannot be sorted: an ordering applied to a column of people is a ranking whatever the heading says, and this product does not rank its sales team.${showRatings ? " The IRIS rating is the agent's own score for the software and is visible to MADSPACE only." : ""}`}
      columns={columns}
      rows={rows}
      codeColumn="agent"
      period={period}
      empty={{
        title: "Nobody presented in this period",
        note: "No showroom session on this project was attributed to an agent within the selected period. The team is unchanged; the period is empty.",
      }}
    />
  );
}
