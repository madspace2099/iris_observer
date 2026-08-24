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
} from "@observer/readmodels";
import { RAW_CATALOGUE } from "../pulse";
import { count, evidenceRef, money, ok, percent, signedPercent } from "../format";
import { agentById, SYNTHETIC_AGENTS } from "./sessions";

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

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m === 0 ? `${s}s` : `${m}m ${String(s).padStart(2, "0")}s`;
}

function formatClock(iso: string, locale: string): string {
  return new Date(iso).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
}

function formatDay(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short" });
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
      return { from, to, count: n, share: share(n, outOf.get(from) ?? 1) };
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
    test: (s) => s.steps.some((step) => step.sectionId === "home" && (step.dwellSeconds ?? 0) > 60),
    note: "Timing-blind sessions cannot answer this and are excluded from both sides.",
  },
  {
    id: "four_plus_units",
    behaviour: "Opens four or more units",
    test: (s) => s.units.length >= 4,
  },
];

export function buildDifferences(
  left: readonly ShowroomSession[],
  right: readonly ShowroomSession[],
): PresentationDifference[] {
  return BEHAVIOURS.map((b) => {
    const l = left.filter(b.test).length;
    const r = right.filter(b.test).length;
    const lRate = share(l, left.length);
    const rRate = share(r, right.length);
    return {
      id: b.id,
      behaviour: b.behaviour,
      leftDisplay: `${Math.round(lRate * 100)}%`,
      rightDisplay: `${Math.round(rRate * 100)}%`,
      magnitude: Math.abs(lRate - rRate),
      sampleLeft: left.length,
      sampleRight: right.length,
      sources: DERIVED,
      note: b.note ?? null,
    } satisfies PresentationDifference;
  })
    .filter((d) => d.magnitude > 0.04)
    .sort((a, b) => b.magnitude - a.magnitude);
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
  const perAgent = SYNTHETIC_AGENTS.map((agent) => ({
    agent,
    sessions: sessions.filter((s) => s.agentId === agent.id),
  })).filter((a) => a.sessions.length >= 8);

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
      direction:
        compareRate > previousCompareRate
          ? "up"
          : compareRate < previousCompareRate
            ? "down"
            : "flat",
      deltaDisplay: signedPercent(compareRate - previousCompareRate, locale),
      sources: OBSERVED,
      sampleSize: n,
      href: `${base}/presentation`,
    },
    {
      id: "surroundings_position",
      label: "Surroundings, early",
      detail: `Opened in the first third of ${percent(surroundingsEarly, locale)} of presentations`,
      direction:
        surroundingsEarly >
        share(
          previous.filter((s) => reachedEarly(s, "surroundings")).length,
          Math.max(1, previous.length),
        )
          ? "up"
          : "down",
      deltaDisplay: signedPercent(
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
    verdictDetail: `Median presentation ${formatDuration(median(sessions.map((s) => s.durationSeconds)))}, ${coverage.medianDepth} steps, ${count(unitOpens, locale)} unit openings. Outcome mix is shown as context, not as the finding.`,
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

  const lanes = SYNTHETIC_AGENTS.map((agent) =>
    buildLane(
      agent.id,
      agent.name,
      sessions.filter((s) => s.agentId === agent.id),
    ),
  ).filter((lane) => lane.meetingCount > 0);

  const teamBenchmark = buildLane("team", "Team benchmark", sessions);

  let comparison: PresentationComparison | null = null;

  if (mode === "cohorts") {
    const progressed = sessions.filter((s) => hasProgressed(s.outcome));
    const didNot = sessions.filter(
      (s) => !hasProgressed(s.outcome) && !outcomeIsUnknown(s.outcome),
    );
    comparison = {
      context,
      mode: "cohorts",
      left: buildLane("progressed", "Progressed further", progressed),
      right: buildLane("did_not", "Did not progress", didNot),
      transitionsLeft: buildTransitions(progressed),
      transitionsRight: buildTransitions(didNot),
      differences: buildDifferences(progressed, didNot),
      evidence: evidenceRef(
        "cohort-comparison",
        "statistical_association",
        `${base}/presentation`,
        sessions.length,
      ),
      disclaimer: DISCLAIMER,
    };
  } else if (mode === "periods") {
    comparison = {
      context,
      mode: "periods",
      left: buildLane("current", context.period.label, sessions),
      right: buildLane("previous", "Previous period", previous),
      transitionsLeft: buildTransitions(sessions),
      transitionsRight: buildTransitions(previous),
      differences: buildDifferences(sessions, previous),
      evidence: evidenceRef(
        "period-comparison",
        "observed_sequence",
        `${base}/presentation`,
        sessions.length,
      ),
      disclaimer: DISCLAIMER,
    };
  } else {
    const leftAgent = agentById(leftKey ?? "agt_monika") ?? SYNTHETIC_AGENTS[0];
    const rightAgent = agentById(rightKey ?? "agt_akhilesh") ?? SYNTHETIC_AGENTS[1];
    if (leftAgent !== undefined && rightAgent !== undefined) {
      const l = sessions.filter((s) => s.agentId === leftAgent.id);
      const r = sessions.filter((s) => s.agentId === rightAgent.id);
      comparison = {
        context,
        mode: "agents",
        left: buildLane(leftAgent.id, leftAgent.name, l),
        right: buildLane(rightAgent.id, rightAgent.name, r),
        transitionsLeft: buildTransitions(l),
        transitionsRight: buildTransitions(r),
        differences: buildDifferences(l, r),
        evidence: evidenceRef(
          `agent-comparison-${leftAgent.id}-${rightAgent.id}`,
          "statistical_association",
          `${base}/presentation`,
          l.length + r.length,
        ),
        disclaimer: DISCLAIMER,
      };
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
      caveat: top.note,
    });
  }

  return {
    context,
    lanes,
    transitions: buildTransitions(sessions),
    teamBenchmark,
    comparison,
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

export function buildMeetingReplay(context: ViewContext, session: ShowroomSession): MeetingReplay {
  const locale = context.project.locale;
  const base = `/${context.tenant.slug}/${context.project.slug}`;
  const agent = agentById(session.agentId);
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
      atDisplay: step.enteredAt === null ? null : formatClock(step.enteredAt, locale),
      dwellDisplay: step.dwellSeconds === null ? null : formatDuration(step.dwellSeconds),
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
          detail: `${unit.views} view${unit.views === 1 ? "" : "s"} · ${formatDuration(unit.dwellSeconds)}`,
          atDisplay: null,
          dwellDisplay: formatDuration(unit.longestViewSeconds),
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
    atDisplay: formatClock(session.endedAt, locale),
    dwellDisplay: null,
    sectionId: null,
    unitCode: null,
    isReturn: false,
    sources: ["CRM_OUTCOME_CONTEXT"],
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
    gaps.push(
      "Filter state is not emitted by the current showroom build, so what the buyer searched for is unknown.",
    );
  }
  if (!session.units.some((u) => u.comparedWith.length > 0)) {
    gaps.push("No comparison was recorded. Compare mode is only measured when the agent opens it.");
  }

  return {
    context,
    meetingId: session.meetingId,
    headline: `${formatDuration(session.durationSeconds)}, ${session.steps.length} steps, ${session.units.length} unit${session.units.length === 1 ? "" : "s"} opened.`,
    agentName: agent?.name ?? session.agentId,
    startedDisplay: `${formatDay(session.startedAt, locale)} · ${formatClock(session.startedAt, locale)}`,
    durationDisplay: formatDuration(session.durationSeconds),
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
  const base = `/${context.tenant.slug}/${context.project.slug}`;
  return [...sessions]
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
    .map((s) => ({
      meetingId: s.meetingId,
      label: `${formatDay(s.startedAt, locale)} · ${formatClock(s.startedAt, locale)}`,
      agentName: agentById(s.agentId)?.name ?? s.agentId,
      startedDisplay: formatDay(s.startedAt, locale),
      durationDisplay: formatDuration(s.durationSeconds),
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
  const currency = context.project.currency;
  const base = `/${context.tenant.slug}/${context.project.slug}`;

  const rows: UnitAttentionRow[] = RAW_CATALOGUE.map((unit) => {
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
      priceDisplay: money(unit.price, currency, locale),
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
        statement: `${selected.unitCode} was opened in ${count(selected.meetings, locale)} meeting${selected.meetings === 1 ? "" : "s"}, with a median look of ${formatDuration(selected.medianDwellSeconds)}.`,
        baseline: `the project median is ${formatDuration(Math.round(median(scaled.filter((r) => r.meetings > 0).map((r) => r.medianDwellSeconds))))}`,
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
        statement: `Shortlisted ${count(selected.favourites, locale)} time${selected.favourites === 1 ? "" : "s"}, floor plan opened ${count(selected.pdfOpens, locale)} time${selected.pdfOpens === 1 ? "" : "s"}.`,
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
      headline: `${selected.unitCode} · ${selected.rooms} rooms · ${selected.areaSqm} m² · ${selected.priceDisplay}`,
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

export function buildStorytelling(
  context: ViewContext,
  sessions: readonly ShowroomSession[],
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

    return {
      sectionId: section.id,
      label: section.label,
      kind: section.kind,
      meetings: withSection.length,
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
      baseline: `median dwell ${glanced.medianDwellSeconds === null ? "unknown" : formatDuration(glanced.medianDwellSeconds)}`,
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
    },
    beforeShortlist,
    findings,
    evidence: evidenceRef("storytelling", "observed_sequence", `${base}/storytelling`, n),
  } satisfies StorytellingIntelligence;
}

export type { EvidenceRef };
