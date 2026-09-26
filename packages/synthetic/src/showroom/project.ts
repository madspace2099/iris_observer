import {
  CORE_SECTION_IDS,
  OUTCOME_LABELS,
  SECTION_IDS,
  SHOWROOM_SECTIONS,
  hasProgressed,
  outcomeIsUnknown,
  sectionLabel,
  type InsightSource,
  type MeetingOutcome,
  type SectionId,
  type ShowroomSession,
} from "@observer/contracts";
import type {
  BehaviourChange,
  EvidenceRef,
  MeetingReplay,
  MeetingSummary,
  PresentationComparison,
  PresentationCoverage,
  PresentationDifference,
  PresentationIntelligence,
  PresentationLane,
  PresentationLaneStep,
  PresentationTransition,
  ReplayStep,
  ShowroomFinding,
  ShowroomOverview,
  StorytellingIntelligence,
  UnitAttentionDetail,
  UnitAttentionRow,
  UnitAttentionView,
  ViewContext,
  EnvironmentUsage,
} from "@observer/readmodels";
import { catalogueFor, type RawUnit } from "../pulse";
import {
  MEETINGS,
  TIMES,
  areaWord,
  aspectWord,
  duration,
  plural,
  roomsWord,
  sentence,
  type Language,
  type PluralForms,
  type Sentence,
} from "@observer/readmodels";
import type { OrientationInterest, UnitsViewedSummary } from "@observer/readmodels";
import type { ShowroomUnitInteraction } from "@observer/contracts";
import {
  clockLabel,
  count,
  dayLabel,
  evidenceRef,
  moneyOr,
  movement,
  ok,
  percent,
  signedPercent,
} from "../format";
import { AGENT_MIN_SAMPLE, insufficient } from "@observer/metrics";
import { agentById, presenterName, presentersIn, SYNTHETIC_AGENTS } from "./sessions";
/* The one definition of "time the source could time" — the agent lane's, not a second one. */
import { fullyTimed, sectionSeconds, totalSeconds } from "./views3";

/*
 * The words this file counts in, beside the sentences that use them. The
 * Slovak and Hungarian forms are the ones a count takes standing alone or as a
 * subject; a sentence that governs another case chooses its forms when it is
 * translated.
 */

/** The two verbs of one clause, agreeing with the same count, so they are one entry. */
export const PROJECT_NO_OUTCOME: PluralForms = {
  en: { one: "has no recorded outcome and stands", other: "have no recorded outcome and stand" },
  sk: {
    one: "nemá zaznamenaný výsledok a nepatrí",
    few: "nemajú zaznamenaný výsledok a nepatria",
    other: "nemá zaznamenaný výsledok a nepatrí",
  },
  hu: {
    one: "nincs rögzített kimenetele, és nem tartozik",
    other: "nincs rögzített kimenetele, és nem tartozik",
  },
};

export const PROJECT_UNITS_OPENED: PluralForms = {
  en: { one: "unit opened", other: "units opened" },
  sk: { one: "jednotka otvorená", few: "jednotky otvorené", other: "jednotiek otvorených" },
  hu: { one: "egység megnyitva", other: "egység megnyitva" },
};

export const PROJECT_VIEWS: PluralForms = {
  en: { one: "view", other: "views" },
  sk: { one: "zobrazenie", few: "zobrazenia", other: "zobrazení" },
  hu: { one: "megtekintés", other: "megtekintés" },
};

/*
 * The sentences, each written once per language in that language's own order.
 * A count of meetings in a subject is the shared `MEETINGS`, occasions the
 * shared `TIMES`; a count the sentence puts in another case takes that case's
 * forms here, as its own.
 */

/** "3 meetings in the period have no recorded outcome and stand in neither cohort." */
export const PROJECT_NO_OUTCOME_SENTENCE: Sentence = {
  en: {
    text: "{count} {meetings|n} in the period {noOutcome|n} in neither cohort.",
    words: { meetings: MEETINGS.en, noOutcome: PROJECT_NO_OUTCOME.en },
  },
  sk: {
    text: "{count} {meetings|n} v tomto období {noOutcome|n} do žiadnej kohorty.",
    words: { meetings: MEETINGS.sk, noOutcome: PROJECT_NO_OUTCOME.sk },
  },
  hu: {
    text: "{count} találkozónak ebben az időszakban nincs rögzített kimenetele, és nem tartozik egyik csoportba sem.",
  },
};

/** "3 units opened: 2 with 2 rooms, 1 not in the catalogue; 1 shortlisted." Its parts follow it. */
export const PROJECT_UNITS_VIEWED_SENTENCE: Sentence = {
  en: {
    text: "{count} {opened|count}: {parts}; {shortlist}.",
    words: { opened: PROJECT_UNITS_OPENED.en },
  },
  sk: {
    text: "{count} {opened|count}: {parts}; {shortlist}.",
    words: { opened: PROJECT_UNITS_OPENED.sk },
  },
  hu: { text: "{count} egység megnyitva: {parts}; {shortlist}." },
};

/** A band of opened units by room count: "2 with 2 rooms". Slovak and Hungarian name the flat by its rooms. */
export const PROJECT_UNITS_BY_ROOMS: Sentence = {
  en: { text: "{count} with {rooms}" },
  sk: { text: "{count} × {r}-izbová" },
  hu: { text: "{count} db {r} szobás" },
};

export const PROJECT_UNITS_ROOMS_UNSTATED: Sentence = {
  en: { text: "{count} with rooms not stated" },
  sk: { text: "{count} bez uvedeného počtu izieb" },
  hu: { text: "{count} db szobaszám nélkül" },
};

export const PROJECT_UNITS_NOT_IN_CATALOGUE: Sentence = {
  en: { text: "{count} not in the catalogue" },
  sk: { text: "{count} mimo katalógu" },
  hu: { text: "{count} db nem szerepel a katalógusban" },
};

export const PROJECT_UNITS_SHORTLISTED: Sentence = {
  en: { text: "{count} shortlisted" },
  sk: {
    text: "{count} {chosen|count}",
    words: { chosen: { one: "vybraná", few: "vybrané", other: "vybraných" } },
  },
  hu: { text: "{count} kiválasztva" },
};

export const PROJECT_UNITS_NONE_SHORTLISTED: Sentence = {
  en: { text: "nothing was shortlisted" },
  sk: { text: "nič nebolo vybrané" },
  hu: { text: "semmi sem került kiválasztásra" },
};

/** "A-101 was opened in 3 meetings, with a median look of 1m 45s." */
export const PROJECT_UNIT_OPENED_SENTENCE: Sentence = {
  en: {
    text: "{unit} was opened in {count} {meetings|n}, with a median look of {look}.",
    words: { meetings: MEETINGS.en },
  },
  sk: {
    text: "Jednotka {unit} bola otvorená v {count} {meetings|n}, medián dĺžky pohľadu bol {look}.",
    /* After "v": the locative. */
    words: { meetings: { one: "stretnutí", few: "stretnutiach", other: "stretnutiach" } },
  },
  hu: {
    text: "{Az:unit} egységet {count} találkozón nyitották meg, a megtekintés hosszának mediánja {look} volt.",
  },
};

/** "Shortlisted 3 times, floor plan opened 5 times." */
export const PROJECT_INTENT_SENTENCE: Sentence = {
  en: {
    text: "Shortlisted {favourites} {times|f}, floor plan opened {pdfOpens} {times|p}.",
    words: { times: TIMES.en },
  },
  sk: {
    text: "Zaradená do výberu {favourites} {times|f}, pôdorys otvorený {pdfOpens} {times|p}.",
    words: { times: TIMES.sk },
  },
  hu: {
    text: "{favourites} alkalommal került a kiválasztottak közé, az alaprajzot {pdfOpens} alkalommal nyitották meg.",
  },
};

/**
 * Projections — canonical showroom facts to the shapes the surfaces read.
 *
 * Everything here is deterministic and derived. No figure is stored; each is
 * recomputed from the session stream, which is exactly the property the legacy
 * dashboard lacks and the reason a new metric can be applied to old meetings.
 *
 * Two rules run through the whole file:
 *
 *  - **Association, never cause.** Comparisons state both sides, both sample
 *    sizes and a disclaimer. No function in this file may produce a sentence
 *    containing "because", "caused", "drives" or "leads to"; a test asserts it.
 *  - **Absence is not zero.** Where the source cannot answer, the read model
 *    carries a null and a stated reason rather than a comfortable number.
 */

const OBSERVED: readonly InsightSource[] = ["IRIS_SHOWROOM_OBSERVED"];
const DERIVED: readonly InsightSource[] = ["IRIS_SHOWROOM_OBSERVED", "IRIS_SHOWROOM_DERIVED"];
const WITH_OUTCOME: readonly InsightSource[] = [
  "IRIS_SHOWROOM_OBSERVED",
  "IRIS_SHOWROOM_DERIVED",
  "CRM_OUTCOME_CONTEXT",
];

/** Below this, a section was opened and left rather than presented. ADR-0016. */
const MEANINGFUL_DWELL_SECONDS = 15;

/* --- small helpers --------------------------------------------------------- */

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2
    : (sorted[mid] as number);
}

function share(part: number, whole: number): number {
  return whole === 0 ? 0 : part / whole;
}

function orderOf(session: ShowroomSession): SectionId[] {
  return session.steps.map((s) => s.sectionId);
}

function reached(session: ShowroomSession, sectionId: SectionId): boolean {
  return session.steps.some((s) => s.sectionId === sectionId);
}

/** Whether the section landed in the opening third of the presentation. */
function reachedEarly(session: ShowroomSession, sectionId: SectionId): boolean {
  const order = orderOf(session);
  const index = order.indexOf(sectionId);
  return index >= 0 && index < Math.max(1, Math.ceil(order.length / 3));
}

function usedCompare(session: ShowroomSession): boolean {
  return reached(session, "compare");
}

function returnedBeforeEnd(session: ShowroomSession): boolean {
  return session.steps.some((s) => s.isReturn);
}

/* --- coverage -------------------------------------------------------------- */

export function coverageOf(sessions: readonly ShowroomSession[]): PresentationCoverage {
  const coreCounts = sessions.map(
    (s) => CORE_SECTION_IDS.filter((id) => reached(s, id)).length / CORE_SECTION_IDS.length,
  );
  const allCounts = sessions.map((s) => new Set(orderOf(s)).size);

  const routinelySkipped = SECTION_IDS.map((id) => {
    const skipped = sessions.filter((s) => !reached(s, id)).length;
    return { sectionId: id, label: sectionLabel(id), skipRate: share(skipped, sessions.length) };
  })
    .filter((row) => row.skipRate > 0.3)
    .sort((a, b) => b.skipRate - a.skipRate);

  return {
    coreReached:
      coreCounts.length === 0 ? 0 : coreCounts.reduce((a, b) => a + b, 0) / coreCounts.length,
    coreTotal: CORE_SECTION_IDS.length,
    sectionsReached: Math.round(median(allCounts)),
    sectionsTotal: SECTION_IDS.length,
    routinelySkipped,
    medianDepth: median(sessions.map((s) => s.steps.length)),
  };
}

/* --- lanes ----------------------------------------------------------------- */

export function buildLane(
  id: string,
  label: string,
  sessions: readonly ShowroomSession[],
): PresentationLane {
  const steps: PresentationLaneStep[] = SECTION_IDS.map((sectionId) => {
    const withSection = sessions.filter((s) => reached(s, sectionId));
    const positions = withSection.map((s) => {
      const order = orderOf(s);
      return order.length <= 1 ? 0 : order.indexOf(sectionId) / (order.length - 1);
    });
    const returns = withSection.filter((s) =>
      s.steps.some((step) => step.sectionId === sectionId && step.isReturn),
    ).length;

    const dwells = withSection
      .flatMap((s) => s.steps.filter((step) => step.sectionId === sectionId))
      .map((step) => step.dwellSeconds)
      .filter((d): d is number => d !== null);

    return {
      sectionId,
      label: sectionLabel(sectionId),
      position:
        positions.length === 0 ? 0 : positions.reduce((a, b) => a + b, 0) / positions.length,
      reachRate: share(withSection.length, sessions.length),
      returnRate: share(returns, Math.max(1, withSection.length)),
      // Null, not zero, when no session in this lane could report timing.
      medianDwellSeconds: dwells.length === 0 ? null : Math.round(median(dwells)),
      availability: dwells.length === 0 ? "requires_ue5_v2_event" : "legacy_available",
    } satisfies PresentationLaneStep;
  })
    .filter((s) => s.reachRate > 0)
    .sort((a, b) => a.position - b.position);

  const outcomeCounts = new Map<MeetingOutcome, number>();
  for (const s of sessions) outcomeCounts.set(s.outcome, (outcomeCounts.get(s.outcome) ?? 0) + 1);

  const timed = sessions.filter((s) => !s.timingUnavailable);

  return {
    id,
    label,
    meetingCount: sessions.length,
    steps,
    coverage: coverageOf(sessions).coreReached,
    medianDurationSeconds:
      timed.length === 0 ? null : Math.round(median(timed.map((s) => s.durationSeconds))),
    outcomeMix: [...outcomeCounts.entries()].map(([outcome, n]) => ({ outcome, count: n })),
  };
}

export function buildTransitions(sessions: readonly ShowroomSession[]): PresentationTransition[] {
  const pairs = new Map<string, number>();
  const outOf = new Map<SectionId, number>();

  for (const session of sessions) {
    const order = orderOf(session);
    for (let i = 0; i < order.length - 1; i += 1) {
      const from = order[i] as SectionId;
      const to = order[i + 1] as SectionId;
      if (from === to) continue;
      pairs.set(`${from}>${to}`, (pairs.get(`${from}>${to}`) ?? 0) + 1);
      outOf.set(from, (outOf.get(from) ?? 0) + 1);
    }
  }

  return [...pairs.entries()]
    .map(([key, n]) => {
      const [from, to] = key.split(">") as [SectionId, SectionId];
      /* Set in the same pass as the pair, so the fallback is only for the type. */
      const out = outOf.get(from) ?? n;
      return { from, to, count: n, share: share(n, out), outOf: out };
    })
    .sort((a, b) => b.count - a.count);
}

/* --- differences ----------------------------------------------------------- */

/**
 * What actually differs between two lanes.
 *
 * Computed, not narrated. Each behaviour is a named predicate over sessions, so
 * a difference is a pair of rates with their samples — there is no room for a
 * sentence to overstate what was measured.
 */
const BEHAVIOURS: readonly {
  id: string;
  behaviour: string;
  test: (s: ShowroomSession) => boolean;
  /**
   * Which sessions can answer the question at all. Absent, every session can.
   * A session that cannot answer is outside the rate on both sides — not a
   * "no" in the denominator, which is what `?? 0` made of it.
   */
  answers?: (s: ShowroomSession) => boolean;
  note?: string;
}[] = [
  {
    id: "surroundings_early",
    behaviour: "Reaches Surroundings in the opening third",
    test: (s) => reachedEarly(s, "surroundings"),
  },
  { id: "compare_used", behaviour: "Uses Compare mode", test: usedCompare },
  {
    id: "returns_before_end",
    behaviour: "Returns to a section before closing",
    test: returnedBeforeEnd,
  },
  {
    id: "amenities_skipped",
    behaviour: "Skips Amenities entirely",
    test: (s) => !reached(s, "amenities"),
  },
  { id: "shortlist_used", behaviour: "Opens the Shortlist", test: (s) => reached(s, "shortlist") },
  {
    id: "environment_used",
    behaviour: "Changes time of day or weather",
    test: (s) => s.environment.length > 0,
  },
  {
    id: "long_opening",
    behaviour: "Spends over a minute on Home",
    test: (s) =>
      s.steps.some(
        (step) => step.sectionId === "home" && step.dwellSeconds !== null && step.dwellSeconds > 60,
      ),
    /*
     * The note promised this exclusion for as long as it existed; the code
     * counted a timing-blind session as "did not", lowering the rate instead.
     * Ten timed meetings, five over a minute, beside ten the source could not
     * time: the note said 50%, the code printed 25%. `fullyTimed` is the one
     * definition of "the source could time it", the same the agent lane uses.
     */
    answers: fullyTimed,
    note: "Timing-blind sessions cannot answer this and are excluded from both sides.",
  },
  {
    id: "four_plus_units",
    behaviour: "Opens four or more units",
    test: (s) => s.units.length >= 4,
  },
];

/**
 * Both sides at or over the floor when this is called — the caller refuses
 * the whole comparison otherwise, in one sentence. What remains is the floor
 * per behaviour: a behaviour only some sessions can answer has a smaller
 * sample than the lane, and under the floor it is withheld by name rather
 * than drawn from five meetings, or from none as 0%.
 */
export function buildDifferences(
  left: readonly ShowroomSession[],
  right: readonly ShowroomSession[],
): { differences: PresentationDifference[]; withheld: string[] } {
  const differences: PresentationDifference[] = [];
  const withheld: string[] = [];
  for (const b of BEHAVIOURS) {
    const el = b.answers === undefined ? left : left.filter(b.answers);
    const er = b.answers === undefined ? right : right.filter(b.answers);
    if (el.length < AGENT_MIN_SAMPLE || er.length < AGENT_MIN_SAMPLE) {
      withheld.push(
        `${b.behaviour}: fewer than ${AGENT_MIN_SAMPLE} meetings on a side could answer it — ${el.length} and ${er.length} — so it is not compared.`,
      );
      continue;
    }
    const lRate = share(el.filter(b.test).length, el.length);
    const rRate = share(er.filter(b.test).length, er.length);
    differences.push({
      id: b.id,
      behaviour: b.behaviour,
      leftDisplay: `${Math.round(lRate * 100)}%`,
      rightDisplay: `${Math.round(rRate * 100)}%`,
      magnitude: Math.abs(lRate - rRate),
      sampleLeft: el.length,
      sampleRight: er.length,
      sources: DERIVED,
      note: b.note ?? null,
    } satisfies PresentationDifference);
  }
  return {
    differences: differences
      .filter((d) => d.magnitude > 0.04)
      .sort((a, b) => b.magnitude - a.magnitude),
    withheld,
  };
}

const DISCLAIMER =
  "These are differences in observed behaviour at the stated sample sizes. They are associations, not evidence that one way of presenting produces a different outcome.";

/* --- A. Showroom Overview -------------------------------------------------- */

export function buildShowroomOverview(
  context: ViewContext,
  sessions: readonly ShowroomSession[],
  previous: readonly ShowroomSession[],
): ShowroomOverview {
  const locale = context.project.locale;
  const n = sessions.length;
  const coverage = coverageOf(sessions);
  const previousCoverage = coverageOf(previous);
  const base = `/${context.tenant.slug}/${context.project.slug}`;

  const meaningfulSections = sessions.flatMap((s) =>
    s.steps.filter((step) => (step.dwellSeconds ?? 0) >= MEANINGFUL_DWELL_SECONDS),
  );
  const glances = sessions.flatMap((s) =>
    s.steps.filter(
      (step) => step.dwellSeconds !== null && step.dwellSeconds < MEANINGFUL_DWELL_SECONDS,
    ),
  );

  const unitOpens = sessions.reduce((sum, s) => sum + s.units.length, 0);
  const compareRate = share(sessions.filter(usedCompare).length, n);
  const previousCompareRate = share(previous.filter(usedCompare).length, previous.length);

  const surroundingsEarly = share(
    sessions.filter((s) => reachedEarly(s, "surroundings")).length,
    n,
  );

  /*
   * The verdict leads with a gap in the *core* story if there is one.
   *
   * A core section that goes unshown is a hole in the argument the project paid
   * to build. An optional section going unshown is a choice, and joining the two
   * with "and" — "reached 89% of the core story and Compare was skipped 71% of
   * the time" — reads as one sentence making two unrelated claims.
   */
  const coreSkipped = coverage.routinelySkipped.filter((s) =>
    (CORE_SECTION_IDS as readonly SectionId[]).includes(s.sectionId),
  );
  const skipped = coreSkipped[0] ?? coverage.routinelySkipped[0] ?? null;

  const verdict =
    coreSkipped[0] !== undefined
      ? `${count(n, locale)} presentations this period, and ${percent(coreSkipped[0].skipRate, locale)} of them never opened ${coreSkipped[0].label} — a core part of the story.`
      : skipped === null
        ? `${count(n, locale)} presentations this period, reaching ${percent(coverage.coreReached, locale)} of the core story.`
        : `${count(n, locale)} presentations this period reached ${percent(coverage.coreReached, locale)} of the core story. Beyond it, ${skipped.label} went unopened in ${percent(skipped.skipRate, locale)}.`;

  const figures = [
    ok({
      metricId: "showroom.presentations",
      label: "Presentations",
      display: count(n, locale),
      raw: n,
      qualifier: `${count(previous.length, locale)} in the previous period`,
      minimumSampleSize: 5,
      drillHref: `${base}/presentation`,
    }),
    ok({
      metricId: "showroom.core_coverage",
      label: "Core coverage",
      display: percent(coverage.coreReached, locale),
      raw: coverage.coreReached,
      qualifier: `${coverage.coreTotal} core sections`,
      minimumSampleSize: 5,
      comparison: {
        baselineLabel: "previous period",
        deltaDisplay: signedPercent(coverage.coreReached - previousCoverage.coreReached, locale),
        direction:
          coverage.coreReached > previousCoverage.coreReached
            ? "up"
            : coverage.coreReached < previousCoverage.coreReached
              ? "down"
              : "flat",
        better: "up",
        refusedReason: null,
      },
      drillHref: `${base}/presentation`,
    }),
    ok({
      metricId: "showroom.median_depth",
      label: "Median depth",
      display: `${coverage.medianDepth} steps`,
      raw: coverage.medianDepth,
      qualifier: `of ${coverage.sectionsTotal} sections`,
      minimumSampleSize: 5,
      drillHref: `${base}/presentation`,
    }),
    ok({
      metricId: "showroom.units_opened",
      label: "Units opened",
      display: count(unitOpens, locale),
      raw: unitOpens,
      qualifier: `${count(new Set(sessions.flatMap((s) => s.units.map((u) => u.unitCode))).size, locale)} distinct`,
      minimumSampleSize: 5,
      drillHref: `${base}/units`,
    }),
  ];

  const findings: ShowroomFinding[] = [];

  // 1. The strongest coverage gap.
  if (skipped !== null) {
    findings.push({
      id: "coverage_gap",
      statement: `${skipped.label} was never opened in ${percent(skipped.skipRate, locale)} of presentations.`,
      baseline: `${percent(share(previous.filter((s) => !reached(s, skipped.sectionId)).length, Math.max(1, previous.length)), locale)} in the previous period`,
      soWhat: `It is one of ${SECTION_IDS.length} sections the project paid to build, and a buyer who never sees it cannot weigh it.`,
      nextStep: { label: "Open Presentation Intelligence", href: `${base}/presentation` },
      evidence: evidenceRef(
        `coverage-${skipped.sectionId}`,
        "observed_sequence",
        `${base}/presentation`,
        n,
      ),
      sampleSize: n,
      sources: DERIVED,
      caveat: null,
    });
  }

  /*
   * 2. The widest behavioural spread between the people presenting.
   *
   * Always computable, and the question the product exists to answer: two
   * agents sell the same building from the same software and their meetings do
   * not look alike. This states the largest gap and sends the reader to the
   * comparison rather than drawing a conclusion from it.
   */
  const perAgent = presentersIn(sessions)
    .map((agent) => ({
      agent,
      sessions: sessions.filter((s) => s.agentId === agent.id),
    }))
    .filter((a) => a.sessions.length >= 8);

  if (perAgent.length >= 2) {
    const spreads = BEHAVIOURS.map((behaviour) => {
      const rates = perAgent
        .map((a) => ({
          name: a.agent.name,
          id: a.agent.id,
          rate: share(a.sessions.filter(behaviour.test).length, a.sessions.length),
          n: a.sessions.length,
        }))
        .sort((x, y) => y.rate - x.rate);
      const top = rates[0];
      const bottom = rates[rates.length - 1];
      return top === undefined || bottom === undefined
        ? null
        : { behaviour, top, bottom, spread: top.rate - bottom.rate };
    })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => b.spread - a.spread);

    const widest = spreads[0];
    if (widest !== undefined && widest.spread > 0.15) {
      findings.push({
        id: "agent_spread",
        statement: `${widest.behaviour.behaviour} — ${widest.top.name} in ${percent(widest.top.rate, locale)} of their meetings, ${widest.bottom.name} in ${percent(widest.bottom.rate, locale)}.`,
        baseline: `${count(widest.top.n, locale)} and ${count(widest.bottom.n, locale)} meetings`,
        soWhat:
          "The same building, the same software, two different presentations. Worth a look side by side before deciding whether either is wrong.",
        nextStep: {
          label: `Compare ${widest.top.name.split(" ")[0]} and ${widest.bottom.name.split(" ")[0]}`,
          href: `${base}/presentation?mode=agents&left=${widest.top.id}&right=${widest.bottom.id}`,
        },
        evidence: evidenceRef(
          `agent-spread-${widest.behaviour.id}`,
          "observed_sequence",
          `${base}/presentation`,
          widest.top.n + widest.bottom.n,
        ),
        sampleSize: widest.top.n + widest.bottom.n,
        sources: DERIVED,
        caveat: widest.behaviour.note ?? null,
      });
    }
  }

  // 3. Attention that is real versus attention that is a glance.
  if (glances.length > 0) {
    const glanceRate = share(glances.length, glances.length + meaningfulSections.length);
    findings.push({
      id: "glance_rate",
      statement: `${percent(glanceRate, locale)} of section visits lasted under ${MEANINGFUL_DWELL_SECONDS} seconds.`,
      baseline: `${MEANINGFUL_DWELL_SECONDS}s is the meaningful-dwell threshold for the showroom (ADR-0016)`,
      soWhat:
        "A section opened and left is a click, not a presentation, and counting it as engagement flatters the numbers.",
      nextStep: { label: "See section usage", href: `${base}/storytelling` },
      evidence: evidenceRef(
        "glance-rate",
        "observed_sequence",
        `${base}/storytelling`,
        glances.length,
      ),
      sampleSize: n,
      sources: DERIVED,
      caveat: sessions.some((s) => s.timingUnavailable)
        ? `${count(sessions.filter((s) => s.timingUnavailable).length, locale)} sessions carry no per-step timing and are excluded.`
        : null,
    });
  }

  // 4. The behaviour-and-outcome association, stated as an association.
  const both = sessions.filter((s) => reachedEarly(s, "surroundings") && usedCompare(s));
  const rest = sessions.filter((s) => !(reachedEarly(s, "surroundings") && usedCompare(s)));
  const scored = (xs: readonly ShowroomSession[]) =>
    share(
      xs.filter((s) => hasProgressed(s.outcome)).length,
      xs.filter((s) => !outcomeIsUnknown(s.outcome)).length,
    );
  if (both.length >= 10 && rest.length >= 10) {
    const lift = scored(rest) === 0 ? null : scored(both) / scored(rest);
    findings.push({
      id: "behaviour_outcome_association",
      statement:
        lift === null
          ? `${count(both.length, locale)} meetings reached Surroundings early and used Compare.`
          : `Meetings that reached Surroundings early and used Compare progressed ${lift.toFixed(1)}× as often as the rest.`,
      baseline: `${percent(scored(both), locale)} of ${count(both.length, locale)} against ${percent(scored(rest), locale)} of ${count(rest.length, locale)}`,
      soWhat:
        "Worth looking at in Presentation Intelligence, where the two groups can be put side by side and the exceptions inspected.",
      nextStep: { label: "Compare the cohorts", href: `${base}/presentation?compare=cohorts` },
      evidence: evidenceRef(
        "behaviour-outcome",
        "statistical_association",
        `${base}/presentation`,
        n,
      ),
      sampleSize: n,
      sources: WITH_OUTCOME,
      caveat:
        "An association at this sample size, not a cause. Buyers who arrive ready are both easier to progress and easier to present to thoroughly.",
    });
  }

  const changes: BehaviourChange[] = [
    {
      id: "compare_use",
      label: "Compare mode",
      detail: `Used in ${percent(compareRate, locale)} of presentations`,
      ...movement(compareRate - previousCompareRate, locale),
      sources: OBSERVED,
      sampleSize: n,
      href: `${base}/presentation`,
    },
    {
      id: "surroundings_position",
      label: "Surroundings, early",
      detail: `Opened in the first third of ${percent(surroundingsEarly, locale)} of presentations`,
      ...movement(
        surroundingsEarly -
          share(
            previous.filter((s) => reachedEarly(s, "surroundings")).length,
            Math.max(1, previous.length),
          ),
        locale,
      ),
      sources: DERIVED,
      sampleSize: n,
      href: `${base}/presentation`,
    },
    {
      id: "depth",
      label: "Presentation depth",
      detail: `Median ${coverage.medianDepth} steps`,
      direction:
        coverage.medianDepth > previousCoverage.medianDepth
          ? "up"
          : coverage.medianDepth < previousCoverage.medianDepth
            ? "down"
            : "flat",
      deltaDisplay:
        coverage.medianDepth === previousCoverage.medianDepth
          ? "no change"
          : `${coverage.medianDepth > previousCoverage.medianDepth ? "+" : "−"}${Math.abs(coverage.medianDepth - previousCoverage.medianDepth)} steps`,
      sources: DERIVED,
      sampleSize: n,
      href: `${base}/storytelling`,
    },
  ];

  const outcomeCounts = new Map<MeetingOutcome, number>();
  for (const s of sessions) outcomeCounts.set(s.outcome, (outcomeCounts.get(s.outcome) ?? 0) + 1);

  return {
    context,
    verdict,
    verdictDetail: `Median presentation ${duration(median(sessions.map((s) => s.durationSeconds)), context.language)}, ${coverage.medianDepth} steps, ${count(unitOpens, locale)} unit openings. Outcome mix is shown as context, not as the finding.`,
    verdictSources: DERIVED,
    figures,
    findings,
    changes,
    coverage,
    outcomeContext: [...outcomeCounts.entries()]
      .map(([outcome, n2]) => ({ outcome, label: OUTCOME_LABELS[outcome], count: n2 }))
      .sort((a, b) => b.count - a.count),
    meetingCount: n,
    evidence: evidenceRef("showroom-overview", "observed_sequence", `${base}/presentation`, n),
  };
}

/* --- B. Presentation Intelligence ------------------------------------------ */

export type ComparisonMode = "agents" | "cohorts" | "periods";

export function buildPresentationIntelligence(
  context: ViewContext,
  sessions: readonly ShowroomSession[],
  previous: readonly ShowroomSession[],
  mode: ComparisonMode,
  leftKey: string | null,
  rightKey: string | null,
): PresentationIntelligence {
  const base = `/${context.tenant.slug}/${context.project.slug}`;
  const locale = context.project.locale;
  const language = context.language;

  const lanes = presentersIn(sessions)
    .map((agent) =>
      buildLane(
        agent.id,
        agent.name,
        sessions.filter((s) => s.agentId === agent.id),
      ),
    )
    .filter((lane) => lane.meetingCount > 0);

  const teamBenchmark = buildLane("team", "Team benchmark", sessions);

  let comparison: PresentationComparison | null = null;
  let noComparison: string | null = null;

  /*
   * THE FLOOR IS ON THE VERDICT, NOT ON THE LANES.
   *
   * `AGENT_MIN_SAMPLE`'s own rule: below it, no agent figure is presented as a
   * verdict. A lane is a description with its count in its header, and it
   * stays on every cell. The finding and the "What differs" rows are
   * comparative claims about two people or two periods, and those fall silent
   * under the floor — with the reason beside the counts, not as an empty list
   * that reads as "no difference".
   *
   * A side with NO meetings is not a small sample: it is an absence. `share()`
   * divides by nought as 0, so a lane nobody presented came out as "0%" on
   * every behaviour, and the finding read "Akhilesh Undev 0%" on a project he
   * never presented on — a false statement about a named colleague, drawn by
   * default. There is no comparison at all in that case, and `noComparison`
   * says who or what was absent, so the screen's null branch is a reason and
   * not a shrug.
   */
  /*
   * ONE HALF-SET, ONE NUMBER.
   *
   * The evidence behind a comparison is the meetings on its two sides — the
   * count the finding's `n` is drawn from. Each mode used to pass its own
   * idea of "observations": cohorts passed the whole slice, so the finding
   * read "74 records" beside "n = 65 meetings" and the nine meetings with no
   * recorded outcome were the unexplained gap; periods passed the current
   * slice alone, so it read "74 records" beside "n = 109", evidence smaller
   * than the sample. The count is derived here, once, and what stands on
   * neither side is named in `excluded` rather than left as a difference.
   */
  const comparisonOf = (
    kind: PresentationComparison["mode"],
    left: { id: string; label: string; sessions: readonly ShowroomSession[] },
    right: { id: string; label: string; sessions: readonly ShowroomSession[] },
    evidenceId: string,
    tier: Parameters<typeof evidenceRef>[1],
    excluded: string | null,
  ): PresentationComparison => {
    const observations = left.sessions.length + right.sessions.length;
    const underFloor =
      left.sessions.length < AGENT_MIN_SAMPLE || right.sessions.length < AGENT_MIN_SAMPLE;
    const compared = underFloor
      ? { differences: [], withheld: [] }
      : buildDifferences(left.sessions, right.sessions);
    return {
      context,
      mode: kind,
      left: buildLane(left.id, left.label, left.sessions),
      right: buildLane(right.id, right.label, right.sessions),
      transitionsLeft: buildTransitions(left.sessions),
      transitionsRight: buildTransitions(right.sessions),
      differences: compared.differences,
      verdictRefusal: underFloor ? insufficient(AGENT_MIN_SAMPLE, "meetings on a side") : null,
      withheld: compared.withheld,
      excluded,
      evidence: evidenceRef(evidenceId, tier, `${base}/presentation`, observations),
      disclaimer: DISCLAIMER,
    };
  };

  if (mode === "cohorts") {
    const progressed = sessions.filter((s) => hasProgressed(s.outcome));
    const didNot = sessions.filter(
      (s) => !hasProgressed(s.outcome) && !outcomeIsUnknown(s.outcome),
    );
    if (progressed.length === 0 && didNot.length === 0) {
      noComparison =
        "No meeting in this period has a recorded outcome, so there is no cohort to compare.";
    } else if (progressed.length === 0 || didNot.length === 0) {
      noComparison = `Every meeting with a recorded outcome in this period ${
        progressed.length === 0 ? "did not progress" : "progressed"
      } — ${count(progressed.length + didNot.length, locale)} of them — so there is no second cohort to compare.`;
    } else {
      /* Neither cohort: the meetings whose outcome was never recorded. Named, not a silent gap. */
      const unknown = sessions.length - progressed.length - didNot.length;
      comparison = comparisonOf(
        "cohorts",
        { id: "progressed", label: "Progressed further", sessions: progressed },
        { id: "did_not", label: "Did not progress", sessions: didNot },
        "cohort-comparison",
        "statistical_association",
        unknown === 0
          ? null
          : sentence(language, PROJECT_NO_OUTCOME_SENTENCE, {
              count: count(unknown, locale),
              n: unknown,
            }),
      );
    }
  } else if (mode === "periods") {
    if (sessions.length === 0) {
      noComparison = `No meetings in this period, so there is nothing to compare with ${context.period.baselineLabel}.`;
    } else if (previous.length === 0) {
      noComparison = `No meetings in ${context.period.baselineLabel}, so there is nothing to compare ${context.period.label} with.`;
    } else {
      comparison = comparisonOf(
        "periods",
        { id: "current", label: context.period.label, sessions },
        { id: "previous", label: "Previous period", sessions: previous },
        "period-comparison",
        "observed_sequence",
        null,
      );
    }
  } else {
    /*
     * Who is compared when the reader has not chosen. On the synthetic roster
     * that is the scenario's pair, as it always was. A delivered project's
     * meetings name nobody on the roster, so there it is the first two who
     * actually presented — and where only one person has, there is nobody to
     * compare them with and no comparison is drawn. Falling back to the roster
     * there compared a real presenter with a stranger who has no meetings on
     * the project.
     */
    const presenters = presentersIn(sessions);
    const presented = presenters.filter((p) => sessions.some((s) => s.agentId === p.id));
    /* A project that shows only its own data has no roster to fall back on, with meetings or without. */
    const onRoster =
      !context.ownDataOnly &&
      (sessions.length === 0 || sessions.some((s) => agentById(s.agentId) !== undefined));
    const pick = (key: string | null, scenario: string, index: number) =>
      (key === null ? undefined : presenters.find((p) => p.id === key)) ??
      (onRoster ? (agentById(scenario) ?? SYNTHETIC_AGENTS[index]) : presented[index]);
    const leftAgent = pick(leftKey, "agt_monika", 0);
    const rightAgent = pick(rightKey, "agt_akhilesh", 1);
    if (leftAgent === undefined || rightAgent === undefined) {
      noComparison = `${
        presented.length === 0 ? "Nobody" : "Only one person"
      } has presented on this project in this period, so there is no pair to compare.`;
    } else {
      const l = sessions.filter((s) => s.agentId === leftAgent.id);
      const r = sessions.filter((s) => s.agentId === rightAgent.id);
      /*
       * The roster names the scenario's pair whether or not both presented
       * here — the docblock above describes that stranger for delivered
       * projects, and the same stranger stood on the synthetic ones: the
       * review project's default view compared its presenter with a rostered
       * colleague who has no meetings on it. Absent is absent on either path.
       */
      const absent = [leftAgent, rightAgent]
        .filter((a) => !sessions.some((s) => s.agentId === a.id))
        .map((a) => a.name);
      if (absent.length > 0) {
        noComparison = `${absent.join(" and ")} presented no meeting in this period, so there is nothing to compare.`;
      } else {
        comparison = comparisonOf(
          "agents",
          { id: leftAgent.id, label: leftAgent.name, sessions: l },
          { id: rightAgent.id, label: rightAgent.name, sessions: r },
          `agent-comparison-${leftAgent.id}-${rightAgent.id}`,
          "statistical_association",
          null,
        );
      }
    }
  }

  const findings: ShowroomFinding[] = [];
  if (comparison !== null && comparison.differences.length > 0) {
    const top = comparison.differences[0] as PresentationDifference;
    findings.push({
      id: `difference-${top.id}`,
      statement: `${top.behaviour}: ${comparison.left.label} ${top.leftDisplay}, ${comparison.right.label} ${top.rightDisplay}.`,
      baseline: `${count(top.sampleLeft, locale)} and ${count(top.sampleRight, locale)} meetings`,
      soWhat:
        "The largest observed difference in how the two present. Whether it is worth changing is a coaching conversation, not a conclusion from this data.",
      nextStep: { label: "Open a meeting", href: `${base}/meetings` },
      evidence: comparison.evidence,
      sampleSize: top.sampleLeft + top.sampleRight,
      sources: top.sources,
      /* What stands outside the comparison, then what the row itself excludes. */
      caveat:
        [comparison.excluded, top.note].filter((s): s is string => s !== null).join(" ") || null,
    });
  }

  return {
    context,
    lanes,
    transitions: buildTransitions(sessions),
    teamBenchmark,
    comparison,
    noComparison,
    findings,
    evidence: evidenceRef(
      "presentation-intelligence",
      "observed_sequence",
      `${base}/presentation`,
      sessions.length,
    ),
  };
}

/* --- C. Meeting Replay ----------------------------------------------------- */

/**
 * The join the replay's summary sentence needs, done here and nowhere else.
 *
 * Every opened code lands in exactly one of three places: a room band the
 * catalogue states, "rooms unstated" for a code the catalogue holds without a
 * count, or "not in the catalogue" for a code it does not hold at all. The last
 * is the guard `buildMeetingRows` already keeps for the same reason — a
 * showroom records whatever it showed, and a legacy import or a withdrawn flat
 * leaves a code with nothing behind it. Dropping it would make `opened` lie;
 * banding it would make a room count up.
 */
/** Two opened units make a group. One is a unit, and the journey already speaks of it by code. */
const MIN_GROUP = 2;
/** One band, applied twice: between two groups, and for one group against its own share. */
const BAND = 0.2;
const ABOVE = 1 + BAND;
/** The multiplicative mirror of ABOVE, so the band is symmetric on a ratio: 1/1.2 = 0.833. */
const BELOW = 1 / ABOVE;

/**
 * Which way the looking time leaned, by aspect. See `OrientationInterest`.
 *
 * The index is P2-07's at meeting scope — a group's share of the dwell divided
 * by its share of the units opened — and both denominators are the whole set of
 * opened units with a stated aspect. The qualification narrows what the
 * sentence is about, never what it is measured against: a buyer who opened six
 * south-facing flats and one west-facing saw seven, and the west-facing one's
 * forty minutes are a seventh of the supply whatever the sentence ends up
 * saying.
 */
function orientationInterestOf(
  units: readonly ShowroomUnitInteraction[],
  catalogue: ReadonlyMap<string, RawUnit>,
): OrientationInterest {
  const known = units.filter((u) => catalogue.get(u.unitCode)?.orientation != null);
  const N = known.length;
  const dwellTotal = known.reduce((sum, u) => sum + u.dwellSeconds, 0);

  const count = new Map<string, number>();
  const dwell = new Map<string, number>();
  for (const u of known) {
    const aspect = catalogue.get(u.unitCode)?.orientation ?? "";
    count.set(aspect, (count.get(aspect) ?? 0) + 1);
    dwell.set(aspect, (dwell.get(aspect) ?? 0) + u.dwellSeconds);
  }

  if (count.size === 0) {
    return {
      shape: "unknown",
      groups: [],
      sentence:
        "No opened unit has a stated aspect, so nothing can be said about where the interest went.",
    };
  }
  if (count.size === 1) {
    const only = [...count.keys()][0] ?? "";
    return {
      shape: "one_orientation",
      groups: [],
      sentence: `Every unit opened was ${aspectWord(only)}, so there is no other aspect to compare it with.`,
    };
  }

  const groups = [...count.entries()]
    .filter(([, n]) => n >= MIN_GROUP)
    .map(([orientation, n]) => ({
      orientation,
      units: n,
      index: dwellTotal === 0 ? 0 : (dwell.get(orientation) ?? 0) / dwellTotal / (n / N),
    }))
    .sort((a, b) => b.index - a.index);

  if (groups.length === 0) {
    return {
      shape: "no_group",
      groups,
      sentence:
        "No aspect was opened more than once, so there is no group to compare; the journey below is the detail.",
    };
  }

  const share = (index: number) => `${index.toFixed(2)}× their share of what was opened`;

  if (groups.length === 1) {
    const g = groups[0] as (typeof groups)[number];
    const who = `the ${String(g.units)} units ${aspectWord(g.orientation)}`;
    const rest = "no other aspect was opened more than once";
    if (g.index >= ABOVE) {
      return {
        shape: "above_share",
        groups,
        sentence: `Interest leaned toward ${who}: they drew ${share(g.index)}; ${rest}.`,
      };
    }
    if (g.index <= BELOW) {
      return {
        shape: "below_share",
        groups,
        sentence: `Interest leaned away from ${who}: they drew ${share(g.index)}; ${rest}.`,
      };
    }
    return {
      shape: "followed",
      groups,
      sentence: `Attention followed supply: ${who} drew ${share(g.index)}; ${rest}.`,
    };
  }

  const first = groups[0] as (typeof groups)[number];
  const second = groups[1] as (typeof groups)[number];
  const gap = first.index === 0 ? 0 : (first.index - second.index) / first.index;

  if (gap >= BAND) {
    return {
      shape: "leader",
      groups,
      sentence: `Interest leaned toward the ${String(first.units)} units ${aspectWord(first.orientation)}: they drew ${share(first.index)}, against ${second.index.toFixed(2)}× for the ${String(second.units)} ${aspectWord(second.orientation)}.`,
    };
  }
  return {
    shape: "split",
    groups,
    sentence: `Interest was split between the units ${aspectWord(first.orientation)} and those ${aspectWord(second.orientation)}: ${first.index.toFixed(2)}× and ${second.index.toFixed(2)}× their shares of what was opened, too close to name a leader.`,
  };
}

function unitsViewedOf(
  units: readonly ShowroomUnitInteraction[],
  catalogue: ReadonlyMap<string, RawUnit>,
  language: Language,
): UnitsViewedSummary {
  const bands = new Map<number, number>();
  let roomsUnstated = 0;
  let notInCatalogue = 0;

  for (const unit of units) {
    const held = catalogue.get(unit.unitCode);
    if (held === undefined) notInCatalogue += 1;
    else if (held.rooms === null) roomsUnstated += 1;
    else bands.set(held.rooms, (bands.get(held.rooms) ?? 0) + 1);
  }

  const byRooms = [...bands.entries()]
    .sort(([a], [b]) => a - b)
    .map(([rooms, count]) => ({ rooms, count }));
  const shortlisted = units.filter((u) => u.favourited).length;
  const opened = units.length;

  return {
    opened,
    byRooms,
    roomsUnstated,
    notInCatalogue,
    shortlisted,
    sentence: unitsViewedSentence(
      opened,
      byRooms,
      roomsUnstated,
      notInCatalogue,
      shortlisted,
      language,
    ),
    interest: orientationInterestOf(units, catalogue),
  };
}

/**
 * Singular and nought are answers. "1 unit opened" and "nothing was
 * shortlisted" are what happened; a sentence that could not say them would fall
 * silent on a fifth of the smallest scheme's meetings, and the reader would be
 * left to guess whether nothing was chosen or nothing was measured.
 */
export function unitsViewedSentence(
  opened: number,
  byRooms: readonly { readonly rooms: number; readonly count: number }[],
  roomsUnstated: number,
  notInCatalogue: number,
  shortlisted: number,
  language: Language,
): string {
  if (opened === 0) return "No unit was opened.";

  const parts = byRooms.map(({ rooms, count }) =>
    sentence(language, PROJECT_UNITS_BY_ROOMS, {
      count,
      rooms: roomsWord(rooms, language),
      r: rooms,
    }),
  );
  if (roomsUnstated > 0) {
    parts.push(sentence(language, PROJECT_UNITS_ROOMS_UNSTATED, { count: roomsUnstated }));
  }
  if (notInCatalogue > 0) {
    parts.push(sentence(language, PROJECT_UNITS_NOT_IN_CATALOGUE, { count: notInCatalogue }));
  }

  const shortlist =
    shortlisted === 0
      ? sentence(language, PROJECT_UNITS_NONE_SHORTLISTED, {})
      : sentence(language, PROJECT_UNITS_SHORTLISTED, { count: shortlisted });

  return sentence(language, PROJECT_UNITS_VIEWED_SENTENCE, {
    count: opened,
    parts: parts.join(", "),
    shortlist,
  });
}

export function buildMeetingReplay(context: ViewContext, session: ShowroomSession): MeetingReplay {
  const locale = context.project.locale;
  const language = context.language;
  const timeZone = context.project.timeZone;
  const base = `/${context.tenant.slug}/${context.project.slug}`;
  const agent = agentById(session.agentId);
  /* The same catalogue `buildMeetingRows` consults, for the same project, keyed by the code a session carries. */
  const catalogue = new Map(catalogueFor(context.project.id as string).map((u) => [u.code, u]));
  const steps: ReplayStep[] = [];
  let ordinal = 0;

  const push = (step: Omit<ReplayStep, "ordinal">) => {
    ordinal += 1;
    steps.push({ ...step, ordinal });
  };

  for (const step of session.steps) {
    push({
      kind: "section",
      label: sectionLabel(step.sectionId),
      detail: step.itemLabel,
      atDisplay: step.enteredAt === null ? null : clockLabel(step.enteredAt, locale, timeZone),
      dwellDisplay: step.dwellSeconds === null ? null : duration(step.dwellSeconds, language),
      sectionId: step.sectionId,
      unitCode: null,
      isReturn: step.isReturn,
      sources: OBSERVED,
      evidence: evidenceRef(
        `${session.meetingId}-${step.ordinal}`,
        "observed_sequence",
        `${base}/meetings/${session.meetingId}`,
        1,
      ),
    });

    // Unit interactions belong to the Residences and Compare stretches. The
    // legacy source cannot say which unit was opened at which moment, so they
    // are attached to the section rather than given an invented timestamp.
    if (step.sectionId === "residences" && !step.isReturn) {
      for (const unit of session.units) {
        push({
          kind: "unit",
          label: unit.unitCode,
          detail: `${unit.views} ${plural(language, unit.views, PROJECT_VIEWS)} · ${duration(unit.dwellSeconds, language)}`,
          atDisplay: null,
          dwellDisplay: duration(unit.longestViewSeconds, language),
          sectionId: "residences",
          unitCode: unit.unitCode,
          isReturn: false,
          sources: OBSERVED,
          evidence: evidenceRef(
            `${session.meetingId}-${unit.unitCode}`,
            "observed_sequence",
            `${base}/units?unit=${unit.unitCode}`,
            unit.views,
          ),
        });
        for (const [kind, active, label] of [
          ["favourite", unit.favourited, "Shortlisted"],
          ["pdf", unit.pdfOpened, "Floor plan opened"],
          ["balcony", unit.balconyViews > 0, "Balcony view"],
          ["floor_cut", unit.floorCutViews > 0, "Floor cut"],
          ["screenshot", unit.screenshots > 0, "Screenshot taken"],
          ["share", unit.shared, "Shared"],
        ] as const) {
          if (!active) continue;
          push({
            kind,
            label,
            detail: unit.unitCode,
            atDisplay: null,
            dwellDisplay: null,
            sectionId: "residences",
            unitCode: unit.unitCode,
            isReturn: false,
            sources: OBSERVED,
            evidence: null,
          });
        }
      }
    }

    if (step.sectionId === "compare") {
      const set = session.units.filter((u) => u.comparedWith.length > 0);
      if (set.length > 0) {
        const keeper = set.find((u) => u.keptFromComparison === true);
        push({
          kind: "compare",
          label: `Compared ${set.map((u) => u.unitCode).join(", ")}`,
          detail: keeper === undefined ? "No unit was kept" : `${keeper.unitCode} was kept`,
          atDisplay: null,
          dwellDisplay: null,
          sectionId: "compare",
          unitCode: keeper?.unitCode ?? null,
          isReturn: false,
          sources: OBSERVED,
          evidence: evidenceRef(
            `${session.meetingId}-compare`,
            "observed_sequence",
            `${base}/units`,
            set.length,
          ),
        });
      }
    }
  }

  for (const env of session.environment) {
    push({
      kind: "environment",
      label: [env.timeOfDay, env.weather].filter(Boolean).join(" · ") || "Environment changed",
      detail: env.duringSectionId === null ? null : `during ${sectionLabel(env.duringSectionId)}`,
      atDisplay: null,
      dwellDisplay: null,
      sectionId: env.duringSectionId,
      unitCode: null,
      isReturn: false,
      sources: OBSERVED,
      evidence: null,
    });
  }

  push({
    kind: "outcome",
    label: OUTCOME_LABELS[session.outcome],
    detail: "Recorded by the agent at the end of the meeting",
    atDisplay: clockLabel(session.endedAt, locale, timeZone),
    dwellDisplay: null,
    sectionId: null,
    unitCode: null,
    isReturn: false,
    /*
     * The step said "Recorded by the agent at the end of the meeting" and wore a
     * chip reading "CRM outcome", one line apart, on a project with no CRM
     * connected. `CRM_OUTCOME_CONTEXT` is a fact the CRM holds; this is the
     * agent selecting on the showroom's own widget, which the showroom then sent
     * as an event. The caption was right and the chip was wrong.
     */
    sources: OBSERVED,
    evidence: null,
  });

  const gaps: string[] = [];
  if (session.timingUnavailable) {
    gaps.push(
      "This session came from the legacy analytics, which records the order of sections but not when each was entered. The sequence is real; the pacing is unknown.",
    );
  }
  gaps.push(
    "Interactions inside a section — shortlisting, opening a plan, a balcony view — are recorded as having happened during that section, but not at what moment. Only section entries carry a time.",
  );
  if (session.filters.length === 0) {
    /*
     * Two different absences. The legacy analytics never carried filter state; a
     * source that times its steps does, so an empty list there means nobody
     * filtered, and saying the build cannot emit it would be false.
     */
    gaps.push(
      session.timingUnavailable
        ? "Filter state is not emitted by the current showroom build, so what the buyer searched for is unknown."
        : "No filter was applied in this meeting, so there is no search to read.",
    );
  }
  if (!session.units.some((u) => u.comparedWith.length > 0)) {
    gaps.push("No comparison was recorded. Compare mode is only measured when the agent opens it.");
  }

  return {
    context,
    meetingId: session.meetingId,
    /*
     * Length and step count, and no unit count. The count used to sit here as
     * well, two lines above `unitsViewed.sentence` opening with the very same
     * number — one fact printed twice, which is the thirteenth column of the
     * unit register in prose. The sentence beneath carries the count and its
     * breakdown; the headline keeps what nothing else on the screen says.
     */
    headline: `${duration(session.durationSeconds, language)}, ${session.steps.length} steps.`,
    unitsViewed: unitsViewedOf(session.units, catalogue, language),
    agentName: agent?.name ?? presenterName(session.projectId, session.agentId),
    /* Everybody who presented has a page: `buildAgentDetail` finds them by their meetings, roster or not. */
    agentHref: `${base}/agents/${encodeURIComponent(session.agentId)}`,
    startedDisplay: `${dayLabel(session.startedAt, locale, timeZone)} · ${clockLabel(session.startedAt, locale, timeZone)}`,
    durationDisplay: duration(session.durationSeconds, language),
    outcome: session.outcome,
    outcomeLabel: OUTCOME_LABELS[session.outcome],
    steps,
    coverage: coverageOf([session]),
    gaps,
    timingAvailable: !session.timingUnavailable,
    evidence: evidenceRef(
      session.meetingId,
      "observed_sequence",
      `${base}/meetings/${session.meetingId}`,
      steps.length,
    ),
  };
}

export function buildMeetingList(
  context: ViewContext,
  sessions: readonly ShowroomSession[],
): readonly MeetingSummary[] {
  const locale = context.project.locale;
  const timeZone = context.project.timeZone;
  const base = `/${context.tenant.slug}/${context.project.slug}`;
  /*
   * NEWEST FIRST, AND THEN BY IDENTIFIER.
   *
   * The instant alone is not a total order. Two meetings that start in the same
   * millisecond leave `sort` free to keep whichever order the input happened to
   * arrive in, and the input order is not a promise anything here makes: it is
   * whatever the sessions were assembled in.
   *
   * Today's fixtures contain no collision — measured across every project and
   * every period, at minute granularity, which is coarser than the key, so the
   * instants cannot collide either. That is a property of the data, not of this
   * code. Two agents presenting at once, or a second installation in the same
   * showroom, produce the same second without anything unusual happening, and
   * the register is the one surface where the reader's position IS the order.
   *
   * `meetingId` is the tiebreaker because it is the only field on the session
   * that is unique by construction. It makes the order total, so it is the same
   * on every call whatever order the sessions arrived in — which is what a
   * reader paging, linking or comparing two screenshots is entitled to assume,
   * and what the caller's caption already states on their behalf.
   */
  return [...sessions]
    .sort((a, b) => {
      const byInstant = Date.parse(b.startedAt) - Date.parse(a.startedAt);
      return byInstant !== 0 ? byInstant : a.meetingId.localeCompare(b.meetingId);
    })
    .map((s) => ({
      meetingId: s.meetingId,
      label: `${dayLabel(s.startedAt, locale, timeZone)} · ${clockLabel(s.startedAt, locale, timeZone)}`,
      agentName: presenterName(s.projectId, s.agentId),
      startedDisplay: dayLabel(s.startedAt, locale, timeZone),
      durationDisplay: duration(s.durationSeconds, context.language),
      outcome: s.outcome,
      outcomeLabel: OUTCOME_LABELS[s.outcome],
      sectionCount: new Set(orderOf(s)).size,
      unitCount: s.units.length,
      href: `${base}/meetings/${s.meetingId}`,
    }));
}

/* --- D. Unit Attention ----------------------------------------------------- */

export function buildUnitAttention(
  context: ViewContext,
  sessions: readonly ShowroomSession[],
  previous: readonly ShowroomSession[],
  selectedCode: string | null,
): UnitAttentionView {
  const locale = context.project.locale;
  const language = context.language;
  const currency = context.project.currency;
  const base = `/${context.tenant.slug}/${context.project.slug}`;

  // This project's units. See the note in `views3.ts`.
  const rows: UnitAttentionRow[] = catalogueFor(context.project.id as string).map((unit) => {
    const touches = sessions.flatMap((s) => s.units.filter((u) => u.unitCode === unit.code));
    const previousTouches = previous.flatMap((s) =>
      s.units.filter((u) => u.unitCode === unit.code),
    );
    const meetings = sessions.filter((s) => s.units.some((u) => u.unitCode === unit.code)).length;
    const dwells = touches.map((t) => t.dwellSeconds);
    const comparisons = touches.filter((t) => t.comparedWith.length > 0);
    const wins = comparisons.filter((t) => t.keptFromComparison === true).length;

    const now = touches.length;
    const before = previousTouches.length;
    const trend = now > before * 1.15 ? "rising" : now < before * 0.85 ? "falling" : "flat";

    return {
      unitId: unit.code,
      unitCode: unit.code,
      status: unit.status,
      rooms: unit.rooms,
      areaSqm: unit.areaSqm,
      orientation: unit.orientation,
      floor: unit.floor,
      priceDisplay: moneyOr(unit.price, currency, locale),
      meetings,
      views: touches.reduce((a, t) => a + t.views, 0),
      medianDwellSeconds: Math.round(median(dwells)),
      totalDwellSeconds: dwells.reduce((a, b) => a + b, 0),
      repeatViews: touches.filter((t) => t.views > 1).length,
      favourites: touches.filter((t) => t.favourited).length,
      pdfOpens: touches.filter((t) => t.pdfOpened).length,
      balconyViews: touches.reduce((a, t) => a + t.balconyViews, 0),
      floorCutViews: touches.reduce((a, t) => a + t.floorCutViews, 0),
      screenshots: touches.reduce((a, t) => a + t.screenshots, 0),
      comparisonAppearances: comparisons.length,
      comparisonWins: comparisons.length === 0 ? null : wins,
      shares: touches.filter((t) => t.shared).length,
      trend,
      /*
       * A percentage change needs a base worth dividing by.
       *
       * One appearance last period becoming twelve this period is "+1,100%",
       * which is arithmetically true and tells the reader nothing except that
       * the denominator was tiny. Below three prior appearances the counts are
       * shown instead.
       */
      trendDisplay:
        before === 0
          ? `new · ${count(now, locale)}`
          : before < 3
            ? `${count(before, locale)} → ${count(now, locale)}`
            : signedPercent((now - before) / before, locale),
      attention: 0,
      sources: OBSERVED,
    } satisfies UnitAttentionRow;
  });

  const peak = Math.max(1, ...rows.map((r) => r.totalDwellSeconds));
  const scaled = rows.map((r) => ({ ...r, attention: r.totalDwellSeconds / peak }));

  const selected =
    selectedCode === null ? null : (scaled.find((r) => r.unitCode === selectedCode) ?? null);

  let detail: UnitAttentionDetail | null = null;
  if (selected !== null) {
    const together = new Map<string, { together: number; keptOther: number }>();
    for (const session of sessions) {
      const mine = session.units.find((u) => u.unitCode === selected.unitCode);
      if (mine === undefined) continue;
      for (const other of mine.comparedWith) {
        const entry = together.get(other) ?? { together: 0, keptOther: 0 };
        entry.together += 1;
        const otherUnit = session.units.find((u) => u.unitCode === other);
        if (otherUnit?.keptFromComparison === true) entry.keptOther += 1;
        together.set(other, entry);
      }
    }

    const findings: ShowroomFinding[] = [];
    if (selected.meetings > 0) {
      findings.push({
        id: `unit-${selected.unitCode}-attention`,
        statement: sentence(language, PROJECT_UNIT_OPENED_SENTENCE, {
          unit: selected.unitCode,
          count: count(selected.meetings, locale),
          n: selected.meetings,
          look: duration(selected.medianDwellSeconds, language),
        }),
        baseline: `the project median is ${duration(Math.round(median(scaled.filter((r) => r.meetings > 0).map((r) => r.medianDwellSeconds))), language)}`,
        soWhat:
          selected.medianDwellSeconds >= 60
            ? "Long enough to be an examination rather than a glance."
            : "Short enough that it was shown rather than studied.",
        nextStep: { label: "See the meetings", href: `${base}/meetings` },
        evidence: evidenceRef(
          `unit-${selected.unitCode}`,
          "observed_sequence",
          `${base}/units?unit=${selected.unitCode}`,
          selected.views,
        ),
        sampleSize: selected.meetings,
        sources: OBSERVED,
        caveat: null,
      });
    }
    if (selected.favourites > 0 || selected.pdfOpens > 0) {
      findings.push({
        id: `unit-${selected.unitCode}-intent`,
        statement: sentence(language, PROJECT_INTENT_SENTENCE, {
          favourites: count(selected.favourites, locale),
          f: selected.favourites,
          pdfOpens: count(selected.pdfOpens, locale),
          p: selected.pdfOpens,
        }),
        baseline: null,
        soWhat:
          "Shortlisting and taking the plan away are the interactions that most often precede a follow-up.",
        nextStep: null,
        evidence: evidenceRef(
          `unit-${selected.unitCode}-intent`,
          "observed_sequence",
          `${base}/units?unit=${selected.unitCode}`,
          selected.favourites + selected.pdfOpens,
        ),
        sampleSize: selected.meetings,
        sources: OBSERVED,
        caveat: null,
      });
    }

    detail = {
      row: selected,
      headline: `${selected.unitCode} · ${roomsWord(selected.rooms, language)} · ${areaWord(selected.areaSqm)} · ${selected.priceDisplay}`,
      findings,
      competitors: [...together.entries()]
        .map(([unitCode, v]) => ({ unitCode, together: v.together, keptOther: v.keptOther }))
        .sort((a, b) => b.together - a.together),
      // Filters are not emitted by the current build; an empty list is the
      // honest answer and the surface says so rather than showing nothing.
      relatedFilters: [],
      evidence: evidenceRef(
        `unit-detail-${selected.unitCode}`,
        "observed_sequence",
        `${base}/units?unit=${selected.unitCode}`,
        selected.views,
      ),
    };
  }

  const busiest = [...scaled].sort((a, b) => b.totalDwellSeconds - a.totalDwellSeconds)[0];
  const findings: ShowroomFinding[] = [];
  if (busiest !== undefined && busiest.meetings > 0) {
    const available = scaled.filter((r) => r.status === "available");
    const twoRoom = available.filter((r) => r.rooms === 2);
    const attentionShare = share(
      twoRoom.reduce((a, r) => a + r.totalDwellSeconds, 0),
      available.reduce((a, r) => a + r.totalDwellSeconds, 0),
    );
    const stockShare = share(twoRoom.length, available.length);
    findings.push({
      id: "unit-segment-attention",
      statement: `Two-room units are ${percent(stockShare, locale)} of available stock and take ${percent(attentionShare, locale)} of the time spent looking at units.`,
      baseline: `an index of ${(attentionShare / Math.max(0.01, stockShare)).toFixed(2)}× their share`,
      soWhat:
        "A segment drawing more attention than its size is either priced right or priced wrong; the unit list tells which.",
      nextStep: { label: "Open the busiest unit", href: `${base}/units?unit=${busiest.unitCode}` },
      evidence: evidenceRef(
        "unit-segment",
        "statistical_association",
        `${base}/units`,
        sessions.length,
      ),
      sampleSize: sessions.length,
      sources: DERIVED,
      caveat: null,
    });
  }

  return {
    context,
    rows: scaled.sort((a, b) => b.attention - a.attention),
    selected: detail,
    findings,
    evidence: evidenceRef("unit-attention", "observed_sequence", `${base}/units`, sessions.length),
  };
}

/* --- E. Storytelling and Feature Intelligence ------------------------------ */

/**
 * How the IRIS story itself is being used.
 *
 * `previous` is the baseline slice, and it is optional for one reason: a caller
 * that has no baseline — a project three weeks old, or a test handing this an
 * empty period — must not be told that every feature is newly adopted. An
 * absent baseline produces `no_baseline` on every row rather than a page full
 * of green "new" badges, which is the flattering answer the state exists to
 * refuse.
 */
/**
 * How much of the timed presentation time went to Time & weather.
 *
 * One definition, borrowed rather than written: `sectionSeconds` and
 * `totalSeconds` are the agent lane's, so this share and the agent's
 * `timeShare` for the same section are the same arithmetic at two scopes. The
 * set is the fully timed meetings and nothing else — a meeting with one untimed
 * step is outside both sides, and `timedMeetings` says how many that left.
 *
 * `null`, not nought, when no meeting was fully timed.
 */
function environmentTimeShare(sessions: readonly ShowroomSession[]): EnvironmentUsage["timeShare"] {
  const timed = sessions.filter(fullyTimed);
  const timedSeconds = timed.reduce((a, s) => a + totalSeconds(s), 0);
  if (timed.length === 0 || timedSeconds === 0) return null;
  const environmentSeconds = timed.reduce((a, s) => a + sectionSeconds(s, "environment"), 0);
  return {
    share: environmentSeconds / timedSeconds,
    environmentSeconds,
    timedSeconds,
    timedMeetings: timed.length,
    meetingsTotal: sessions.length,
  };
}

export function buildStorytelling(
  context: ViewContext,
  sessions: readonly ShowroomSession[],
  previous: readonly ShowroomSession[] = [],
): StorytellingIntelligence {
  const locale = context.project.locale;
  const base = `/${context.tenant.slug}/${context.project.slug}`;
  const n = sessions.length;

  const sections = SHOWROOM_SECTIONS.map((section) => {
    const withSection = sessions.filter((s) => reached(s, section.id));
    const steps = sessions.flatMap((s) => s.steps.filter((step) => step.sectionId === section.id));
    const dwells = steps.map((s) => s.dwellSeconds).filter((d): d is number => d !== null);
    const glances = dwells.filter((d) => d < MEANINGFUL_DWELL_SECONDS).length;
    const positions = withSection.map((s) => {
      const order = orderOf(s);
      return order.length <= 1 ? 0 : order.indexOf(section.id) / (order.length - 1);
    });

    /*
     * Entries, not meetings.
     *
     * `steps` already holds every entry into this section across the slice,
     * returns included, so an agent who came back to Residences three times in
     * one meeting is one meeting and three opens. "Most used feature" answers a
     * different question depending on which of those two it counts, and the
     * screen asks for both.
     */
    const opens = steps.length;

    return {
      sectionId: section.id,
      label: section.label,
      kind: section.kind,
      meetings: withSection.length,
      opens,
      adoption:
        previous.length === 0
          ? ("no_baseline" as const)
          : withSection.length > 0 && !previous.some((s) => reached(s, section.id))
            ? ("new_in_period" as const)
            : ("established" as const),
      reachRate: share(withSection.length, n),
      medianDwellSeconds: dwells.length === 0 ? null : Math.round(median(dwells)),
      glanceRate: share(glances, Math.max(1, dwells.length)),
      returnRate: share(
        withSection.filter((s) => s.steps.some((x) => x.sectionId === section.id && x.isReturn))
          .length,
        Math.max(1, withSection.length),
      ),
      meanPosition:
        positions.length === 0 ? 0 : positions.reduce((a, b) => a + b, 0) / positions.length,
      availability:
        dwells.length === 0 ? ("requires_ue5_v2_event" as const) : ("legacy_available" as const),
    };
  }).sort((a, b) => b.reachRate - a.reachRate);

  // Co-occurrence lift. 1.0 is exactly what independence would produce.
  const pairings = SECTION_IDS.flatMap((a, i) =>
    SECTION_IDS.slice(i + 1).map((b) => {
      const both = sessions.filter((s) => reached(s, a) && reached(s, b)).length;
      const pa = share(sessions.filter((s) => reached(s, a)).length, n);
      const pb = share(sessions.filter((s) => reached(s, b)).length, n);
      const expected = pa * pb * n;
      return { a, b, together: both, lift: expected === 0 ? 0 : both / expected };
    }),
  )
    .filter((p) => p.together >= 5)
    .sort((a, b) => b.lift - a.lift);

  const timeCounts = new Map<string, number>();
  const weatherCounts = new Map<string, number>();
  const duringCounts = new Map<SectionId, number>();
  for (const session of sessions) {
    for (const env of session.environment) {
      if (env.timeOfDay !== null)
        timeCounts.set(env.timeOfDay, (timeCounts.get(env.timeOfDay) ?? 0) + 1);
      if (env.weather !== null)
        weatherCounts.set(env.weather, (weatherCounts.get(env.weather) ?? 0) + 1);
      if (env.duringSectionId !== null)
        duringCounts.set(env.duringSectionId, (duringCounts.get(env.duringSectionId) ?? 0) + 1);
    }
  }

  // What tends to happen before a unit is shortlisted.
  const withShortlist = sessions.filter((s) => s.units.some((u) => u.favourited));
  const beforeShortlist = SECTION_IDS.map((id) => ({
    sectionId: id,
    label: sectionLabel(id),
    rate: share(
      withShortlist.filter((s) => reached(s, id)).length,
      Math.max(1, withShortlist.length),
    ),
  }))
    .filter((x) => x.rate > 0.1)
    .sort((a, b) => b.rate - a.rate);

  const findings: ShowroomFinding[] = [];
  const glanced = [...sections]
    .filter((s) => s.glanceRate > 0.25)
    .sort((a, b) => b.glanceRate - a.glanceRate)[0];
  if (glanced !== undefined) {
    findings.push({
      id: "glanced_section",
      statement: `${glanced.label} is opened in ${percent(glanced.reachRate, locale)} of meetings but left within ${MEANINGFUL_DWELL_SECONDS} seconds ${percent(glanced.glanceRate, locale)} of the time.`,
      baseline: `median dwell ${glanced.medianDwellSeconds === null ? "unknown" : duration(glanced.medianDwellSeconds, context.language)}`,
      soWhat:
        "Either the section is not carrying an argument, or it is being opened by accident on the way somewhere else.",
      nextStep: { label: "See the transitions", href: `${base}/presentation` },
      evidence: evidenceRef(
        `glance-${glanced.sectionId}`,
        "observed_sequence",
        `${base}/storytelling`,
        glanced.meetings,
      ),
      sampleSize: n,
      sources: DERIVED,
      caveat: null,
    });
  }

  const topPair = pairings[0];
  if (topPair !== undefined && topPair.lift > 1.15) {
    findings.push({
      id: "pairing",
      statement: `${sectionLabel(topPair.a)} and ${sectionLabel(topPair.b)} appear together in ${count(topPair.together, locale)} meetings — ${topPair.lift.toFixed(2)}× what independent use would produce.`,
      baseline: "1.00× is chance",
      soWhat:
        "Two sections that travel together are one argument in the agent's head, and can be presented as one.",
      nextStep: null,
      evidence: evidenceRef(
        `pair-${topPair.a}-${topPair.b}`,
        "statistical_association",
        `${base}/storytelling`,
        topPair.together,
      ),
      sampleSize: n,
      sources: DERIVED,
      caveat: "Co-occurrence within a meeting, not a sequence claim.",
    });
  }

  const goldenCount = timeCounts.get("golden") ?? 0;
  const totalTime = [...timeCounts.values()].reduce((a, b) => a + b, 0);
  if (totalTime > 0) {
    findings.push({
      id: "environment_usage",
      statement: `Golden hour is chosen for ${percent(share(goldenCount, totalTime), locale)} of all time-of-day changes.`,
      baseline: `${count(totalTime, locale)} changes across ${count(sessions.filter((s) => s.environment.length > 0).length, locale)} meetings`,
      soWhat:
        "The environment control is being used as a flattering default rather than as an argument about a specific aspect or floor.",
      nextStep: { label: "See unit attention by aspect", href: `${base}/units` },
      evidence: evidenceRef("environment", "observed_sequence", `${base}/storytelling`, totalTime),
      sampleSize: n,
      sources: OBSERVED,
      caveat:
        "Which unit was on screen at the moment of the change is not recorded by the current build.",
    });
  }

  return {
    context,
    sections,
    pairings: pairings.slice(0, 8),
    environment: {
      timeOfDay: [...timeCounts.entries()].map(([preset, c]) => ({
        preset: preset as never,
        count: c,
        label: preset.charAt(0).toUpperCase() + preset.slice(1),
      })),
      weather: [...weatherCounts.entries()].map(([preset, c]) => ({
        preset: preset as never,
        count: c,
        label: preset.charAt(0).toUpperCase() + preset.slice(1),
      })),
      duringSections: [...duringCounts.entries()].map(([sectionId, c]) => ({
        sectionId,
        label: sectionLabel(sectionId),
        count: c,
      })),
      meetingsUsingEnvironment: sessions.filter((s) => s.environment.length > 0).length,
      meetingsTotal: n,
      timeShare: environmentTimeShare(sessions),
    },
    beforeShortlist,
    findings,
    evidence: evidenceRef("storytelling", "observed_sequence", `${base}/storytelling`, n),
  } satisfies StorytellingIntelligence;
}

export type { EvidenceRef };
