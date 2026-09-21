import {
  OUTCOME_LABELS,
  SESSION_CHANNEL_LABELS,
  outcomeIsUnknown,
  type ShowroomSession,
} from "@observer/contracts";
import type {
  AskAnswer,
  AskHistoryView,
  AskThread,
  AskThreadSummary,
  AskTurn,
  ViewContext,
} from "@observer/readmodels";
import { clockLabel, count, dayLabel, evidenceRef, percent } from "./format";
import { presenterName } from "./showroom/sessions";

/**
 * Previous Ask Observer conversations, for a surface that has no history yet.
 *
 * Nobody has held these conversations. They exist so the history screen can be
 * built, reviewed and screenshotted before there is a real one, and every shape
 * that carries them is stamped `demonstration` — a single-member union, so no
 * component can compare its way into presenting one as somebody's own past
 * question (see `ASK_THREAD_ORIGINS`).
 *
 * What is *not* invented is the content. Every figure in every answer is
 * computed from this project's session slice at read time, so a demonstration
 * thread about ISTER TOWER states ISTER TOWER's numbers and one about Riverside
 * states that Riverside has no outcomes at all. A history of plausible
 * sentences with made-up figures would be the exact failure the product exists
 * to argue against, and it would be indistinguishable from the real thing on
 * screen.
 *
 * The timestamps are offsets from `context.generatedAt`, which is the world's
 * fixed today. Nothing here reads a clock.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

const NOTICE =
  "These conversations are a demonstration of what Ask Observer answers and how it shows its evidence. They were not held by anyone, and nothing here is a record of a question this account asked.";

function share(part: number, whole: number): number {
  return whole === 0 ? 0 : part / whole;
}

function stampDisplay(iso: string, locale: string, timeZone: string): string {
  return `${dayLabel(iso, locale, timeZone)} · ${clockLabel(iso, locale, timeZone)}`;
}

/**
 * The busiest unit in the slice, by time spent rather than by opens.
 *
 * Total dwell is the same measure the unit surfaces rank on, so the answer a
 * thread gives and the row a reader lands on cannot name two different flats.
 */
function busiestUnit(
  sessions: readonly ShowroomSession[],
): { code: string; seconds: number; meetings: number } | null {
  const totals = new Map<string, { seconds: number; meetings: number }>();
  for (const session of sessions) {
    for (const touch of session.units) {
      const entry = totals.get(touch.unitCode) ?? { seconds: 0, meetings: 0 };
      entry.seconds += touch.dwellSeconds;
      entry.meetings += 1;
      totals.set(touch.unitCode, entry);
    }
  }
  const best = [...totals.entries()].sort((a, b) => b[1].seconds - a[1].seconds)[0];
  return best === undefined
    ? null
    : { code: best[0], seconds: best[1].seconds, meetings: best[1].meetings };
}

interface ThreadPlan {
  readonly id: string;
  /** Whole days back from the world's today. */
  readonly daysAgo: number;
  /**
   * Minutes further back, so five threads do not carry the same clock time.
   *
   * A history stamped 09:00 five times reads as generated, which is exactly
   * what it is — and the point of the surface is to show what a real one would
   * look like.
   */
  readonly minutesAgo: number;
  readonly pinned: boolean;
  readonly selectionLabel: string | null;
  readonly answers: readonly AskAnswer[];
}

/**
 * The threads for one project, in one place.
 *
 * Built by both the list and the single-thread read, so a title in the list and
 * the first question inside the thread are the same string by construction
 * rather than by two authors agreeing.
 */
function plans(context: ViewContext, sessions: readonly ShowroomSession[]): readonly ThreadPlan[] {
  const locale = context.project.locale;
  const root = `/${context.tenant.slug}/${context.project.slug}`;
  const slug = context.project.slug;
  const period = context.period.label.toLowerCase();
  const n = sessions.length;
  if (n === 0) return [];

  const out: ThreadPlan[] = [];

  /* --- what is drawing attention ------------------------------------------ */

  const busiest = busiestUnit(sessions);
  if (busiest !== null) {
    const minutes = Math.round(busiest.seconds / 60);
    out.push({
      id: `ask_${slug}_attention`,
      daysAgo: 1,
      minutesAgo: 137,
      pinned: true,
      selectionLabel: busiest.code,
      answers: [
        {
          question: "Which unit is drawing the most attention this period?",
          answer: `${busiest.code} holds the most time of any unit — ${count(minutes, locale)} minutes across ${count(busiest.meetings, locale)} openings ${period}.`,
          figures: [
            { label: "Unit", value: busiest.code, note: "by total time spent" },
            {
              label: "Time spent",
              value: `${count(minutes, locale)} min`,
              note: `across ${count(busiest.meetings, locale)} openings`,
            },
            { label: "Meetings in period", value: count(n, locale), note: context.period.label },
          ],
          evidence: evidenceRef(
            `ask-history-${slug}-attention`,
            "observed_sequence",
            `${root}/units?unit=${busiest.code}`,
            busiest.meetings,
          ),
          actionLabel: "Open the unit",
          actionHref: `${root}/units?unit=${busiest.code}`,
          followUps: [
            "Was it shortlisted, or only shown?",
            "Which agents opened it most often?",
            "How does it compare with the units it was placed beside?",
          ],
          caveat:
            "Time spent is the measure here. A unit opened often for a few seconds each time will rank lower than one examined twice.",
        },
        {
          question: "Was it shortlisted, or only shown?",
          answer: `${busiest.code} was shortlisted in ${count(
            sessions.filter((s) => s.units.some((u) => u.unitCode === busiest.code && u.favourited))
              .length,
            locale,
          )} of the ${count(busiest.meetings, locale)} meetings that opened it.`,
          figures: [
            {
              label: "Shortlisted",
              value: count(
                sessions.filter((s) =>
                  s.units.some((u) => u.unitCode === busiest.code && u.favourited),
                ).length,
                locale,
              ),
              /*
               * The denominator, on the figure itself — not only in the prose
               * sentence above it. This is structurally the same shape of claim
               * as "Time spent" in the prior turn (a count that is really a
               * share of a stated total), and that figure's own `note` already
               * carries its denominator inline; this one previously did not.
               */
              note: `of ${count(busiest.meetings, locale)} meetings that opened it`,
            },
          ],
          evidence: evidenceRef(
            `ask-history-${slug}-shortlist`,
            "observed_sequence",
            `${root}/units?unit=${busiest.code}`,
            busiest.meetings,
          ),
          actionLabel: "See those meetings",
          actionHref: `${root}/meetings`,
          followUps: ["Which of them recorded a follow-up?"],
          caveat: null,
        },
      ],
    });
  }

  /* --- where the record stops --------------------------------------------- */

  const crm = context.project.connectedSources.includes("crm");
  const unrecorded = sessions.filter((s) => outcomeIsUnknown(s.outcome)).length;
  out.push({
    id: `ask_${slug}_outcomes`,
    daysAgo: 3,
    minutesAgo: 41,
    pinned: false,
    selectionLabel: null,
    answers: [
      {
        question: "How many meetings ended without an outcome?",
        answer: crm
          ? `${count(unrecorded, locale)} of ${count(n, locale)} presentations ${period} ended with no outcome recorded — ${percent(share(unrecorded, n), locale)} of the period.`
          : `All ${count(n, locale)} presentations ${period} are without an outcome: no CRM is connected to this project, so there is no outcome to record against them.`,
        figures: [
          {
            label: "No outcome recorded",
            value: crm ? count(unrecorded, locale) : count(n, locale),
            note: crm ? `of ${count(n, locale)}` : "no CRM connected",
          },
          {
            label: "Recorded",
            value: crm ? count(n - unrecorded, locale) : "—",
            note: crm ? "meetings" : "unavailable on this project",
          },
        ],
        evidence: evidenceRef(
          `ask-history-${slug}-outcomes`,
          "observed_sequence",
          `${root}/meetings`,
          n,
        ),
        actionLabel: "Open the meeting list",
        actionHref: `${root}/meetings`,
        followUps: ["Which agents does this affect most?", "What can still be read without them?"],
        caveat:
          "Every rate that uses an outcome drops these meetings silently. The presentations themselves are fully observed.",
      },
    ],
  });

  /* --- who is presenting -------------------------------------------------- */

  const byAgent = new Map<string, number>();
  for (const session of sessions) {
    byAgent.set(session.agentId, (byAgent.get(session.agentId) ?? 0) + 1);
  }
  const roster = [...byAgent.entries()].sort((a, b) => b[1] - a[1]);
  if (roster.length > 0) {
    out.push({
      id: `ask_${slug}_team`,
      daysAgo: 8,
      minutesAgo: 318,
      pinned: false,
      selectionLabel: null,
      answers: [
        {
          question: "Who is presenting this project, and how much has each of them done?",
          answer: `${count(roster.length, locale)} people presented ${count(n, locale)} meetings ${period}.`,
          figures: roster.map(([id, meetings]) => ({
            label: presenterName(context.project.id as string, id),
            value: count(meetings, locale),
            note: `${percent(share(meetings, n), locale)} of the period`,
          })),
          evidence: evidenceRef(
            `ask-history-${slug}-team`,
            "observed_sequence",
            `${root}/agents`,
            n,
          ),
          actionLabel: "Open Sales Agents",
          actionHref: `${root}/agents`,
          followUps: [
            "Which of them can be read as a verdict?",
            "How do they present differently?",
          ],
          caveat:
            "A count is not a comparison. Below twenty meetings, this product shows an agent's figures and draws no verdict from them.",
        },
      ],
    });
  }

  /* --- the channel split, where there is one ------------------------------ */

  const webiris = sessions.filter((s) => s.channel === "webiris").length;
  if (webiris > 0 && webiris < n) {
    out.push({
      id: `ask_${slug}_channel`,
      daysAgo: 15,
      minutesAgo: 92,
      pinned: true,
      selectionLabel: SESSION_CHANNEL_LABELS.webiris,
      answers: [
        {
          question: "How much of this is running on WEB IRIS rather than in the showroom?",
          answer: `${count(webiris, locale)} of ${count(n, locale)} presentations ${period} ran on WEB IRIS — ${percent(share(webiris, n), locale)} of the period.`,
          figures: [
            { label: SESSION_CHANNEL_LABELS.webiris, value: count(webiris, locale), note: null },
            {
              label: SESSION_CHANNEL_LABELS.showroom,
              value: count(n - webiris, locale),
              note: null,
            },
          ],
          evidence: evidenceRef(
            `ask-history-${slug}-channel`,
            "observed_sequence",
            `${root}/meetings`,
            n,
          ),
          actionLabel: "Filter the meeting list",
          actionHref: `${root}/meetings?channel=webiris`,
          followUps: ["Do the two channels present differently?"],
          caveat:
            "Time in a browser tab and time in front of the installation are two measurements. Any median that mixes them is a mixed figure.",
        },
      ],
    });
  }

  /* --- the report somebody always asks for -------------------------------- */

  const decided = sessions.filter((s) => !outcomeIsUnknown(s.outcome));
  out.push({
    id: `ask_${slug}_report`,
    daysAgo: 22,
    minutesAgo: 226,
    pinned: false,
    selectionLabel: null,
    answers: [
      {
        question: "Can you put this period into a one-page report?",
        answer: `A report for ${period} would cover ${count(n, locale)} presentations${
          decided.length === 0
            ? " and would carry no outcome section, since none of them has a recorded outcome"
            : ` and ${count(decided.length, locale)} recorded outcomes`
        }.`,
        figures: [
          { label: "Period", value: context.period.label, note: context.period.baselineLabel },
          { label: "Presentations", value: count(n, locale), note: null },
          {
            label: "Recorded outcomes",
            value: decided.length === 0 ? "—" : count(decided.length, locale),
            note: decided.length === 0 ? "no CRM connected" : OUTCOME_LABELS.purchase,
          },
        ],
        evidence: evidenceRef(
          `ask-history-${slug}-report`,
          "observed_sequence",
          `${root}/report`,
          n,
        ),
        actionLabel: "See what a report would contain",
        actionHref: `${root}/report`,
        followUps: ["Which sections would be blank?", "Can I have one meeting instead?"],
        caveat:
          "Nothing generates a document yet. The report surface states, section by section, what one would hold.",
      },
    ],
  });

  return out;
}

function summarise(context: ViewContext, plan: ThreadPlan): AskThreadSummary {
  const locale = context.project.locale;
  const timeZone = context.project.timeZone;
  const askedAt = new Date(
    Date.parse(context.generatedAt) - plan.daysAgo * DAY_MS - plan.minutesAgo * 60 * 1000,
  ).toISOString();
  const first = plan.answers[0];
  return {
    threadId: plan.id,
    // The opening question, not a generated name. A title written by a model is
    // a title nobody can check against what is inside the thread.
    title: first?.question ?? "Ask Observer",
    askedAt,
    askedAtDisplay: stampDisplay(askedAt, locale, timeZone),
    projectLabel: context.project.name,
    periodLabel: context.period.label,
    selectionLabel: plan.selectionLabel,
    pinned: plan.pinned,
    turnCount: plan.answers.length,
    origin: "demonstration",
    href: `/${context.tenant.slug}/${context.project.slug}/ask/${plan.id}`,
  };
}

export function buildAskHistory(
  context: ViewContext,
  sessions: readonly ShowroomSession[],
): AskHistoryView {
  const root = `/${context.tenant.slug}/${context.project.slug}`;
  const summaries = plans(context, sessions)
    .map((plan) => summarise(context, plan))
    .sort((a, b) => Date.parse(b.askedAt) - Date.parse(a.askedAt));

  return {
    context,
    threads: summaries,
    pinned: summaries.filter((t) => t.pinned),
    origin: "demonstration",
    demonstrationNotice: NOTICE,
    emptyState: `No presentations were recorded on ${context.project.name} in ${context.period.label.toLowerCase()}, so there is nothing for these questions to be answered against.`,
    evidence: evidenceRef("ask-history", "observed_sequence", `${root}/ask`, sessions.length),
  };
}

export function buildAskThread(
  context: ViewContext,
  sessions: readonly ShowroomSession[],
  threadId: string,
): AskThread | null {
  const locale = context.project.locale;
  const timeZone = context.project.timeZone;
  const root = `/${context.tenant.slug}/${context.project.slug}`;
  const plan = plans(context, sessions).find((p) => p.id === threadId);
  if (plan === undefined) return null;

  const summary = summarise(context, plan);
  const opened = Date.parse(summary.askedAt);

  /*
   * Turns are minutes apart, not days.
   *
   * A follow-up question is asked while the reader is still looking at the
   * answer, so the second turn carries the first turn's day. Spacing them by a
   * fixed offset keeps the thread readable without claiming a duration anybody
   * measured.
   */
  const turns: readonly AskTurn[] = plan.answers.map((answer, index) => {
    const at = new Date(opened + index * 4 * 60 * 1000).toISOString();
    return {
      id: `${plan.id}_${index + 1}`,
      askedAtDisplay: stampDisplay(at, locale, timeZone),
      answer,
    } satisfies AskTurn;
  });

  return {
    context,
    summary,
    turns,
    origin: "demonstration",
    demonstrationNotice: NOTICE,
    evidence: evidenceRef(
      `ask-thread-${plan.id}`,
      "observed_sequence",
      `${root}/ask/${plan.id}`,
      sessions.length,
    ),
  };
}
