import { OUTCOME_LABELS, outcomeIsUnknown, type ShowroomSession } from "@observer/contracts";
import { DEFAULT_IRIS_ASSIST_POLICY } from "@observer/metrics";
import type { AskAnswer, AskSession, ViewContext } from "@observer/readmodels";

import { buildAssistedSales, dealsFor } from "./deals";
import { count, evidenceRef } from "./format";
import { catalogueFor } from "./pulse";
import { presentersIn, sessionsForProject } from "./showroom/sessions";

/**
 * ASK IRIS ANSWERS THAT ARE COMPUTED, NOT SCRIPTED.
 *
 * The landing's prepared answers (`buildAskSession`) are the synthetic
 * scenario's own prose: "viewings held at 46, offers fell from 17 to 12". That
 * is what a scenario is for, and it is a fabrication the moment it is printed
 * over a project whose meetings are its own showroom's — which is what the
 * landing did, under a marker reading "Live meetings", until this file.
 *
 * So a project a session source delivers for gets only what can be worked out
 * from what was delivered: counts with their denominators, in the period on
 * screen, and nothing that reads as a verdict. Four questions, not forty. The
 * rest of what Ask IRIS can say about real data is the tool layer's
 * (`apps/web/src/lib/ai/tools.ts`), which reads the same repository.
 *
 * The IRIS-assisted answer is offered on any project with a CRM, scripted or
 * delivered, because it was never scripted: it is `buildAssistedSales`' own
 * headline and note (ADR-0039).
 */

const meetingsWord = (n: number, locale: string): string =>
  `${count(n, locale)} presentation${n === 1 ? "" : "s"}`;

/** "Which sales followed a showing in IRIS?", or null where no CRM is connected. */
export function assistedSalesAnswer(context: ViewContext): AskAnswer | null {
  const root = `/${context.tenant.slug}/${context.project.slug}`;
  const project = context.project.id as string;
  const assisted = buildAssistedSales(
    dealsFor(project),
    sessionsForProject(project),
    DEFAULT_IRIS_ASSIST_POLICY,
    context.project.locale,
    context.project.timeZone,
    (code) =>
      catalogueFor(project).some((u) => u.code === code)
        ? `${root}/units/${encodeURIComponent(code)}`
        : null,
    (meetingId) => `${root}/meetings/${encodeURIComponent(meetingId)}`,
  );
  if (assisted.source !== "crm") return null;

  return {
    question: "Which sales followed a showing in IRIS?",
    answer: assisted.headline,
    figures: [
      {
        label: `Within ${String(assisted.windowHours)} hours of a showing`,
        value: `${String(assisted.assisted)} of ${String(assisted.datedSales)}`,
        note: assisted.shareDisplay ?? `a share needs ${String(assisted.minimumSales)} dated sales`,
      },
      { label: "Shown earlier than that", value: String(assisted.shownEarlier), note: null },
      { label: "Not opened in IRIS before the date", value: String(assisted.notShown), note: null },
    ],
    evidence: evidenceRef(
      "ask.iris-assisted",
      "observed_sequence",
      `${root}/flow`,
      assisted.datedSales,
    ),
    actionLabel: "Open the sales on Sales Flow",
    actionHref: `${root}/flow`,
    followUps: [],
    caveat: assisted.note,
  };
}

/** The Ask IRIS session of a project whose meetings were delivered by its own source. */
export function buildDeliveredAskSession(
  context: ViewContext,
  sessions: readonly ShowroomSession[],
  selectionLabel: string | null,
): AskSession {
  const locale = context.project.locale;
  const root = `/${context.tenant.slug}/${context.project.slug}`;
  const period = context.period.label.toLowerCase();
  const n = sessions.length;
  const answers: AskAnswer[] = [];

  /* --- how many, and how they ended ------------------------------------------ */
  const recorded = sessions.filter((s) => !outcomeIsUnknown(s.outcome));
  const byOutcome = new Map<ShowroomSession["outcome"], number>();
  for (const s of recorded) byOutcome.set(s.outcome, (byOutcome.get(s.outcome) ?? 0) + 1);
  answers.push({
    question: "How many presentations were recorded, and how did they end?",
    answer:
      n === 0
        ? `No presentation was recorded on ${context.project.name} in ${period}.`
        : `${meetingsWord(n, locale)} ${n === 1 ? "was" : "were"} recorded on ${context.project.name} in ${period}, and the agent recorded an outcome at the end of ${count(recorded.length, locale)} of them.`,
    figures: [...byOutcome.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([outcome, k]) => ({
        label: OUTCOME_LABELS[outcome],
        value: `${count(k, locale)} of ${count(n, locale)}`,
        note: null,
      })),
    evidence: evidenceRef("ask.delivered.meetings", "observed_sequence", `${root}/meetings`, n),
    actionLabel: "Open the meetings",
    actionHref: `${root}/meetings`,
    followUps: ["Which apartments were opened most?", "Who presented, and how many meetings each?"],
    caveat:
      "A recorded outcome is what the agent selected in the room. It labels the presentation and is not a verified sale.",
  });

  /* --- which apartments -------------------------------------------------------- */
  const opened = new Map<string, number>();
  for (const s of sessions) {
    for (const code of new Set(s.units.map((u) => u.unitCode))) {
      opened.set(code, (opened.get(code) ?? 0) + 1);
    }
  }
  const ranked = [...opened.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const top = ranked[0];
  answers.push({
    question: "Which apartments were opened most?",
    answer:
      top === undefined
        ? n === 0
          ? `No presentation was recorded in ${period}, so no apartment was opened.`
          : `No apartment was opened in any of the ${meetingsWord(n, locale)} in ${period}.`
        : `${top[0]} was opened in ${count(top[1], locale)} of ${meetingsWord(n, locale)} in ${period}; ${count(ranked.length, locale)} different apartment${ranked.length === 1 ? " was" : "s were"} opened in all.`,
    figures: ranked.slice(0, 3).map(([code, k]) => ({
      label: code,
      value: `${count(k, locale)} of ${count(n, locale)}`,
      note: "presentations that opened it",
    })),
    evidence: evidenceRef("ask.delivered.units", "observed_sequence", `${root}/units`, n),
    actionLabel: "Open the unit register",
    actionHref: `${root}/units`,
    followUps: ["How many presentations were recorded, and how did they end?"],
    caveat:
      "Opened means the unit's view was entered during a presentation. It says nothing about who asked for it.",
  });

  /* --- who presented ------------------------------------------------------------- */
  const presenters = presentersIn(sessions)
    .map((p) => ({ name: p.name, meetings: sessions.filter((s) => s.agentId === p.id).length }))
    .filter((p) => p.meetings > 0)
    .sort((a, b) => b.meetings - a.meetings || a.name.localeCompare(b.name));
  answers.push({
    question: "Who presented, and how many meetings each?",
    answer:
      presenters.length === 0
        ? `Nobody presented on ${context.project.name} in ${period}.`
        : `${count(presenters.length, locale)} ${presenters.length === 1 ? "person" : "people"} presented the ${meetingsWord(n, locale)} in ${period}.`,
    figures: presenters.slice(0, 3).map((p) => ({
      label: p.name,
      value: `${count(p.meetings, locale)} of ${count(n, locale)}`,
      note: null,
    })),
    evidence: evidenceRef("ask.delivered.agents", "observed_sequence", `${root}/agents`, n),
    actionLabel: "Open Sales Agents",
    actionHref: `${root}/agents`,
    followUps: ["How many presentations were recorded, and how did they end?"],
    caveat:
      "How many, not how well. Volume is a workload figure, and nobody is compared below twenty meetings each.",
  });

  const assisted = assistedSalesAnswer(context);
  if (assisted !== null) answers.push(assisted);

  return {
    context: {
      projectLabel: context.project.name,
      periodLabel: context.period.label,
      selectionLabel,
    },
    suggestions: answers.map((a) => a.question),
    answers,
  };
}
