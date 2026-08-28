/**
 * The curated Observer findings.
 *
 * ## Why the wording is constrained
 *
 * Every one of these describes a correlation, a sequence or a link, and the
 * difference between those three is the difference between a useful sales tool
 * and a machine that invents motives. The vocabulary is fixed:
 *
 *   Observed            it happened, in this order, and was recorded
 *   Associated with     two things move together; nothing about why
 *   May warrant review  a person should look
 *   Recommended         a suggested action, for a person to take or ignore
 *
 * And the words that are not available: caused, proves, wants, intends,
 * demonstrates intent. No finding infers anything about who a buyer is — no
 * age, no household, no income, no inferred demographic of any kind — because
 * Observer records what happened on a screen and a showroom table, and that is
 * all it can honestly speak about.
 *
 * One finding exists specifically to warn against a causal reading, because a
 * feed of findings that never says "do not conclude that" teaches the reader
 * that everything in it is safe to conclude.
 */

import type { ObserverInsight } from "./types";

export const DEMO_INSIGHTS: readonly ObserverInsight[] = Object.freeze([
  Object.freeze({
    id: "ins-01",
    title: "South-west high-floor units are drawing a rising share of detail views",
    evidence: "observed-sequence",
    status: "new",
    subject: "Floors 7–10 · SW and S orientation",
    topic: "demand",
    measurement:
      "Detail views on south and south-west units above floor 7 rose from 31% to 46% of all unit views between the previous 28 days and the current window.",
    whyItMatters:
      "The current release sequence lists these units last. Buyers are reaching them anyway, which means the ordering is working against observed interest.",
    recommendation:
      "Recommended follow-up: review the release ordering for floors 7–10 with the sales lead before the next showroom weekend.",
    strength:
      "Observed sequence across 1,412 sessions. The comparison window is the same length, so the shift is not an artefact of a longer period.",
    unitIds: ["ister-tower-0703", "ister-tower-0803", "ister-tower-1003"],
  }),
  Object.freeze({
    id: "ins-02",
    title: "North-facing units below floor 5 have fallen out of most journeys",
    evidence: "observed-sequence",
    status: "new",
    subject: "Floors 2–5 · N and NE orientation",
    topic: "demand",
    measurement:
      "Nine units received fewer than a quarter of the median unit's detail views in the current window, and eight of the nine face north or north-east below floor 5.",
    whyItMatters:
      "These are not units that cooled — they were never opened much. That is a different problem from a unit losing interest it used to hold, and it needs a different response.",
    recommendation:
      "Recommended follow-up: check whether the floor plans and daylight imagery for these units are present and current in both Web IRIS and the showroom.",
    strength:
      "Observed absence rather than a decline. Absence of views is weak evidence about a unit's appeal and strong evidence about its exposure.",
    unitIds: ["ister-tower-0201", "ister-tower-0301", "ister-tower-0401"],
  }),
  Object.freeze({
    id: "ins-03",
    title: "Showroom sessions that follow a web visit reach a meeting more often",
    evidence: "attributed-conversion",
    status: "reviewed",
    subject: "Cross-channel journeys · Web IRIS → Showroom",
    topic: "journey",
    measurement:
      "Of 63 journeys deterministically linked across both channels in the last 90 days, 41 reached a booked meeting. The showroom-only rate over the same period was lower.",
    whyItMatters:
      "The link is deterministic — the same booking reference appeared on both sides — so these are the same journeys rather than two populations that resemble each other.",
    recommendation:
      "Recommended follow-up: when a showroom appointment is booked, check whether a prior web journey exists and brief the agent with the units it covered.",
    strength:
      "Attributed conversion on an exact identifier match. It says these journeys progressed; it does not establish that the web visit is why they did.",
    unitIds: [],
  }),
  Object.freeze({
    id: "ins-04",
    title: "About a third of showroom activity cannot be linked to any web journey",
    evidence: "observed-sequence",
    status: "monitoring",
    subject: "Showroom · attribution coverage",
    topic: "attribution",
    measurement:
      "913 showroom sessions in the current window matched no web identity. They are counted as unattributed and are excluded from every cross-channel figure on the Overview.",
    whyItMatters:
      "Unattributed is a measurement, not a gap to be filled. Dividing it between the two channels would turn an honest unknown into two numbers that look like knowledge.",
    recommendation:
      "Recommended follow-up: confirm whether the showroom check-in step is being completed consistently; a fall in coverage changes what every channel comparison means.",
    strength:
      "Directly counted. The proportion is stable across the last three windows, which is why it reads as normal coverage rather than a fault.",
    unitIds: [],
  }),
  Object.freeze({
    id: "ins-05",
    title: "Favourites and later meetings move together — this is not a causal finding",
    evidence: "association",
    status: "monitoring",
    subject: "ISTER TOWER · whole project",
    topic: "data-quality",
    measurement:
      "Sessions that added at least one favourite reached a meeting more often than sessions that did not, across the last 90 days.",
    whyItMatters:
      "It is tempting to read this as favourites producing meetings, and to start prompting for favourites. The association is equally consistent with both being downstream of a buyer who had already decided to visit.",
    recommendation:
      "May warrant review as a segmentation signal. Recommended follow-up: do not treat a favourite as evidence of intent for an individual buyer, and do not report this as a conversion driver.",
    strength:
      "Statistical association only. No sequence is established, no mechanism is observed, and Observer records nothing that could distinguish the two explanations.",
    unitIds: [],
  }),
  Object.freeze({
    id: "ins-06",
    title: "Two reserved units are still among the most viewed",
    evidence: "observed-sequence",
    status: "new",
    subject: "Reserved inventory",
    topic: "demand",
    measurement:
      "Units 07.01 and 09.03 are marked reserved and remain in the top quartile of detail views for the current window.",
    whyItMatters:
      "Buyers are spending attention on inventory they cannot take. If the reservation state is not visible in both channels, that attention is being wasted.",
    recommendation:
      "Recommended follow-up: confirm the reservation state is showing in Web IRIS and on the showroom table, and consider whether a comparable available unit should be surfaced alongside.",
    strength:
      "Observed views against a known availability state. It does not establish that buyers were unaware of the reservation.",
    unitIds: ["ister-tower-0701", "ister-tower-0903"],
  }),
]);

export const EVIDENCE_LABEL: Readonly<Record<ObserverInsight["evidence"], string>> = Object.freeze({
  "observed-sequence": "Observed sequence",
  "attributed-conversion": "Attributed conversion",
  association: "Statistical association",
});

/** One line saying what each evidence type is worth. Shown, not assumed. */
export const EVIDENCE_MEANING: Readonly<Record<ObserverInsight["evidence"], string>> =
  Object.freeze({
    "observed-sequence": "Recorded events, in the order they occurred.",
    "attributed-conversion": "An outcome linked to a prior observation by an exact identifier.",
    association: "Two measurements moving together. No sequence and no mechanism.",
  });

export const STATUS_LABEL: Readonly<Record<ObserverInsight["status"], string>> = Object.freeze({
  new: "New",
  reviewed: "Reviewed",
  monitoring: "Monitoring",
});

export const TOPIC_LABEL: Readonly<Record<ObserverInsight["topic"], string>> = Object.freeze({
  demand: "Unit demand",
  attribution: "Attribution",
  journey: "Buyer journey",
  "data-quality": "Evidence quality",
});
