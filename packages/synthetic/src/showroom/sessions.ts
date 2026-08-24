import {
  CORE_SECTION_IDS,
  SECTION_IDS,
  sectionLabel,
  type MeetingOutcome,
  type SectionId,
  type ShowroomEnvironmentSelection,
  type ShowroomSession,
  type ShowroomStep,
  type ShowroomUnitInteraction,
  type TimeOfDayPreset,
  type WeatherPreset,
} from "@observer/contracts";
import { RAW_CATALOGUE, type RawUnit } from "../pulse";

/**
 * The synthetic showroom, generated deterministically.
 *
 * Seven sessions — five of them test rows — cannot demonstrate whether one
 * agent presents differently from another. This generator produces a body of
 * behaviour large enough to carry a pattern, from a fixed seed, so the same
 * dataset appears on every machine and in every test run.
 *
 * **Three rules govern what may be invented here.**
 *
 * 1. Nothing is asserted that the product would not be able to observe. Every
 *    field maps to a fact in `docs/16-showroom-intelligence-audit.md`, and the
 *    facts the UE5 module cannot yet emit are marked, not silently filled in.
 * 2. **No correlation is perfect.** Agents have tendencies, not rules, and the
 *    outcome model is deliberately noisy. A dataset in which the "good"
 *    behaviour always precedes the good outcome would teach the product to make
 *    causal claims, which is the one thing it must never do.
 * 3. The dataset is labelled as synthetic in the interface. It is a
 *    demonstration of what Observer can explain, never a claim about buyers.
 */

/* --- deterministic randomness ---------------------------------------------- */

/** mulberry32. Small, fast, and identical across engines. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(r: () => number, items: readonly T[]): T {
  return items[Math.floor(r() * items.length)] as T;
}

/* --- the agents ------------------------------------------------------------ */

/**
 * Four agents with different habits.
 *
 * The numbers are tendencies applied through a noisy sampler, so every agent
 * produces exceptions to their own pattern. Monika generally reaches
 * Surroundings early and uses Compare; she also has meetings where she does
 * neither, and some of those still progress.
 */
export interface SyntheticAgent {
  readonly id: string;
  readonly name: string;
  readonly organisationName: string;
  /** Probability Surroundings lands in the first third of the presentation. */
  readonly surroundingsEarly: number;
  /** Probability Amenities is skipped entirely. */
  readonly amenitiesSkip: number;
  readonly compareUse: number;
  /** Probability of returning to shortlisted units before the meeting ends. */
  readonly returnToShortlist: number;
  /** Bias on how many optional sections are reached. */
  readonly coverageBias: number;
  /** Multiplier on Home dwell. Above 1 means a long opening. */
  readonly homeDwell: number;
  readonly unitsShownMean: number;
  /** Additive shift on the progression probability. Small on purpose. */
  readonly outcomeBias: number;
  readonly meetingShare: number;
}

export const SYNTHETIC_AGENTS: readonly SyntheticAgent[] = [
  {
    id: "agt_monika",
    name: "Monika Kováčová",
    organisationName: "Meridian Sales",
    surroundingsEarly: 0.68,
    amenitiesSkip: 0.06,
    compareUse: 0.61,
    returnToShortlist: 0.58,
    coverageBias: 0.72,
    homeDwell: 0.8,
    unitsShownMean: 4.4,
    outcomeBias: 0.09,
    meetingShare: 0.3,
  },
  {
    id: "agt_akhilesh",
    name: "Akhilesh Undev",
    organisationName: "Meridian Sales",
    surroundingsEarly: 0.31,
    amenitiesSkip: 0.34,
    compareUse: 0.22,
    returnToShortlist: 0.19,
    coverageBias: 0.41,
    homeDwell: 1.9,
    unitsShownMean: 3.1,
    outcomeBias: -0.06,
    meetingShare: 0.27,
  },
  {
    id: "agt_jan",
    name: "Ján Hruška",
    organisationName: "Meridian Sales",
    surroundingsEarly: 0.44,
    amenitiesSkip: 0.15,
    compareUse: 0.38,
    returnToShortlist: 0.36,
    coverageBias: 0.58,
    homeDwell: 1.05,
    unitsShownMean: 3.8,
    outcomeBias: 0.0,
    meetingShare: 0.25,
  },
  {
    id: "agt_lucia",
    name: "Lucia Bartošová",
    organisationName: "Meridian Sales",
    surroundingsEarly: 0.52,
    amenitiesSkip: 0.08,
    compareUse: 0.17,
    returnToShortlist: 0.41,
    coverageBias: 0.63,
    homeDwell: 0.95,
    unitsShownMean: 4.9,
    outcomeBias: 0.02,
    meetingShare: 0.18,
  },
];

export function agentById(id: string): SyntheticAgent | undefined {
  return SYNTHETIC_AGENTS.find((a) => a.id === id);
}

/* --- named content inside sections ----------------------------------------- */

const AMENITY_ITEMS = [
  "Fitness",
  "Kids zone",
  "Rooftop terrace",
  "Co-working",
  "Bicycle store",
  "Car parking entrance",
  "Concierge",
] as const;

const POI_ITEMS = [
  "Primary school",
  "Tram stop",
  "Riverside park",
  "Grocery store",
  "Pharmacy",
  "Nursery",
] as const;

/** Base dwell in seconds per section, before agent bias and noise. */
const BASE_DWELL: Record<SectionId, number> = {
  home: 42,
  residences: 210,
  amenities: 95,
  surroundings: 88,
  gallery: 54,
  maps: 40,
  environment: 33,
  compare: 76,
  shortlist: 58,
};

/* --- the period boundaries ------------------------------------------------- */

/**
 * Two comparable periods. The previous quarter is complete; the current one
 * runs to `TODAY`, which is why it holds more meetings — the project stepped up
 * its presentation volume, and that is one of the findings.
 */
export const PERIOD_BOUNDS = {
  previous: { from: "2026-04-01", to: "2026-06-30", meetings: 58 },
  current: { from: "2026-07-01", to: "2026-08-24", meetings: 74 },
} as const;

/**
 * Sessions imported from the legacy analytics.
 *
 * The first sessions of the previous quarter carry no per-step timing, because
 * the legacy source records only the order of sections. They exist so the
 * product has to render the honest gap rather than a comfortable fiction.
 */
const LEGACY_IMPORT_COUNT = 16;

/* --- generation ------------------------------------------------------------ */

function chooseAgent(r: () => number): SyntheticAgent {
  const x = r();
  let acc = 0;
  for (const agent of SYNTHETIC_AGENTS) {
    acc += agent.meetingShare;
    if (x <= acc) return agent;
  }
  return SYNTHETIC_AGENTS[SYNTHETIC_AGENTS.length - 1] as SyntheticAgent;
}

/**
 * The order the story was told in.
 *
 * Sections get a sort key rather than a hard position, so an agent's tendency
 * shows up as a distribution rather than as a script.
 */
function buildSequence(r: () => number, agent: SyntheticAgent): SectionId[] {
  const keyed: { id: SectionId; key: number }[] = [];

  // Home almost always opens. A few meetings start straight in Residences,
  // which is a real thing agents do when the buyer arrives impatient.
  if (r() > 0.06) keyed.push({ id: "home", key: -1 });
  keyed.push({ id: "residences", key: 0.4 + r() * 0.4 });

  if (r() > agent.amenitiesSkip) {
    keyed.push({ id: "amenities", key: 0.2 + r() * 0.6 });
  }

  // Surroundings: the behaviour the agents most visibly differ on.
  if (r() > 0.12) {
    const early = r() < agent.surroundingsEarly;
    keyed.push({ id: "surroundings", key: early ? 0.05 + r() * 0.2 : 0.6 + r() * 0.35 });
  }

  const optional: readonly SectionId[] = ["gallery", "maps", "environment"];
  for (const id of optional) {
    if (r() < agent.coverageBias) keyed.push({ id, key: r() });
  }

  if (r() < agent.compareUse) keyed.push({ id: "compare", key: 0.72 + r() * 0.2 });
  if (r() < agent.returnToShortlist + 0.2) keyed.push({ id: "shortlist", key: 0.8 + r() * 0.15 });

  keyed.sort((a, b) => a.key - b.key);
  const order = keyed.map((k) => k.id);

  // Returns. An agent who pulls the buyer back to the shortlisted units before
  // closing produces a second visit to residences or shortlist at the end.
  if (r() < agent.returnToShortlist) {
    order.push(order.includes("shortlist") ? "shortlist" : "residences");
  }
  if (r() < 0.18) order.push("home");

  return order;
}

function buildSteps(
  r: () => number,
  agent: SyntheticAgent,
  order: readonly SectionId[],
  startedAt: Date,
  timingUnavailable: boolean,
): { steps: ShowroomStep[]; durationSeconds: number } {
  const steps: ShowroomStep[] = [];
  const seen = new Set<SectionId>();
  let clock = 0;

  order.forEach((sectionId, index) => {
    const base = BASE_DWELL[sectionId] ?? 60;
    const bias = sectionId === "home" ? agent.homeDwell : 1;
    // A wide but plausible spread: 0.45× to 1.75× the base.
    const dwell = Math.max(6, Math.round(base * bias * (0.45 + r() * 1.3)));

    let itemId: string | null = null;
    let itemLabel: string | null = null;
    if (sectionId === "amenities" && r() > 0.25) {
      itemLabel = pick(r, AMENITY_ITEMS);
      itemId = itemLabel.toLowerCase().replace(/\s+/g, "_");
    } else if (sectionId === "surroundings" && r() > 0.3) {
      itemLabel = pick(r, POI_ITEMS);
      itemId = itemLabel.toLowerCase().replace(/\s+/g, "_");
    }

    steps.push({
      ordinal: index + 1,
      sectionId,
      itemId,
      itemLabel,
      enteredAt: timingUnavailable ? null : new Date(startedAt.getTime() + clock * 1000).toISOString(),
      dwellSeconds: timingUnavailable ? null : dwell,
      isReturn: seen.has(sectionId),
      availability: timingUnavailable ? "partially_derivable" : "legacy_available",
    });

    seen.add(sectionId);
    clock += dwell + Math.round(r() * 12);
  });

  return { steps, durationSeconds: Math.max(60, clock) };
}

/**
 * Which units were opened.
 *
 * Weighted by the same attractiveness the Pulse uses — smaller plans and the
 * middle floors draw more attention — so the two surfaces cannot disagree.
 */
function unitWeight(unit: RawUnit): number {
  const roomWeight = unit.rooms === 2 ? 1.55 : 0.75;
  const floorWeight = unit.floor >= 3 && unit.floor <= 6 ? 1.35 : 0.8;
  const aspectWeight = unit.orientation === "S" ? 1.25 : unit.orientation === "SW" ? 1.05 : 0.85;
  const statusWeight = unit.status === "sold" ? 0.35 : unit.status === "reserved" ? 0.7 : 1;
  return roomWeight * floorWeight * aspectWeight * statusWeight;
}

function buildUnits(
  r: () => number,
  agent: SyntheticAgent,
  catalogue: readonly RawUnit[],
  usedCompare: boolean,
): ShowroomUnitInteraction[] {
  const count = Math.max(1, Math.round(agent.unitsShownMean + (r() - 0.5) * 3));
  const weights = catalogue.map(unitWeight);
  const total = weights.reduce((a, b) => a + b, 0);

  const chosen: RawUnit[] = [];
  for (let i = 0; i < count; i += 1) {
    let x = r() * total;
    for (let j = 0; j < catalogue.length; j += 1) {
      x -= weights[j] as number;
      if (x <= 0) {
        const unit = catalogue[j] as RawUnit;
        if (!chosen.some((c) => c.code === unit.code)) chosen.push(unit);
        break;
      }
    }
  }
  if (chosen.length === 0) chosen.push(catalogue[0] as RawUnit);

  // The comparison set, when the agent used Compare at all.
  const compareSet = usedCompare && chosen.length >= 2 ? chosen.slice(0, Math.min(3, chosen.length)) : [];
  const keeper = compareSet.length > 0 ? (compareSet[Math.floor(r() * compareSet.length)] as RawUnit) : null;

  return chosen.map((unit) => {
    const views = 1 + (r() > 0.68 ? 1 : 0) + (r() > 0.91 ? 1 : 0);
    const longest = Math.round(18 + r() * 190);
    const dwell = longest + (views - 1) * Math.round(12 + r() * 60);
    const inCompare = compareSet.some((c) => c.code === unit.code);
    // Interest strengthens with dwell, but not deterministically.
    const engaged = dwell > 90 ? 0.55 : dwell > 45 ? 0.28 : 0.1;

    return {
      unitId: unit.code,
      unitCode: unit.code,
      views,
      dwellSeconds: dwell,
      longestViewSeconds: longest,
      favourited: r() < engaged,
      pdfOpened: r() < engaged * 0.7,
      balconyViews: r() < engaged * 0.8 ? 1 + (r() > 0.8 ? 1 : 0) : 0,
      floorCutViews: r() < engaged * 0.55 ? 1 : 0,
      screenshots: r() < engaged * 0.45 ? 1 + (r() > 0.85 ? 1 : 0) : 0,
      comparedWith: inCompare ? compareSet.filter((c) => c.code !== unit.code).map((c) => c.code) : [],
      keptFromComparison: inCompare ? keeper?.code === unit.code : null,
      shared: r() < engaged * 0.3,
    } satisfies ShowroomUnitInteraction;
  });
}

function buildEnvironment(
  r: () => number,
  order: readonly SectionId[],
): ShowroomEnvironmentSelection[] {
  if (!order.includes("environment") && r() > 0.35) return [];
  const times: readonly TimeOfDayPreset[] = ["morning", "afternoon", "golden", "evening", "night"];
  const weathers: readonly WeatherPreset[] = ["clear", "cloudy", "rain", "snow", "fog"];
  const count = 1 + (r() > 0.55 ? 1 : 0) + (r() > 0.85 ? 1 : 0);

  return Array.from({ length: count }, () => ({
    // Golden hour is over-represented, as it is in every property presentation.
    timeOfDay: r() > 0.18 ? (r() < 0.42 ? "golden" : pick(r, times)) : null,
    weather: r() > 0.42 ? pick(r, weathers) : null,
    duringSectionId: order.length > 0 ? pick(r, order) : null,
  }));
}

/**
 * How the meeting ended.
 *
 * A noisy function of behaviour: broader coverage, an early Surroundings, use
 * of Compare and a return to the shortlist all shift the odds upward, and the
 * agent's own bias shifts them a little further. The noise term is large enough
 * that plenty of thorough meetings end in `not_interested` and plenty of thin
 * ones end in an offer, which is what stops the dataset from teaching a lie.
 */
function chooseOutcome(
  r: () => number,
  agent: SyntheticAgent,
  signals: { coverage: number; surroundingsEarly: boolean; compared: boolean; returned: boolean },
): MeetingOutcome {
  /*
   * Calibrated so the mix looks like a showroom rather than a sales fantasy:
   * most meetings end in a presentation or a follow-up, purchases are rare, and
   * the behavioural signals move the odds by a noticeable but modest amount.
   * The noise term is wider than the entire behavioural contribution, which is
   * what guarantees exceptions in both directions.
   */
  /*
   * The dominant term is one Observer cannot see.
   *
   * How ready the buyer already was — their financing, their timeline, whether
   * they had decided before they walked in — drives the outcome more than
   * anything the agent does on screen, and none of it is observable from the
   * showroom. Modelling it explicitly is what makes this dataset honest: the
   * behavioural signals are real and detectable, and they are still not the
   * cause. Any product built on this data that claims causation will be wrong,
   * and that is the point.
   */
  const buyerReadiness = r();

  let score = 0.02;
  score += buyerReadiness * 0.44;
  score += signals.coverage * 0.09;
  if (signals.surroundingsEarly) score += 0.04;
  if (signals.compared) score += 0.04;
  if (signals.returned) score += 0.03;
  score += agent.outcomeBias * 0.3;
  score += (r() - 0.5) * 0.34;

  // Some meetings simply never get an outcome recorded. That is a real state,
  // and it is drawn independently of behaviour — a thorough presentation is no
  // more likely to be written up than a thin one.
  if (r() < 0.11) return "skipped";

  if (score > 0.59) return r() > 0.52 ? "purchase" : "reservation";
  if (score > 0.49) return r() > 0.48 ? "interested" : "follow_up_needed";
  if (score > 0.35) return r() > 0.4 ? "follow_up_needed" : "presentation_only";
  return r() > 0.45 ? "presentation_only" : "not_interested";
}

/* --- the dataset ----------------------------------------------------------- */

let cache: readonly ShowroomSession[] | null = null;

/**
 * Every synthetic showroom session, for the Northgate project.
 *
 * Memoised because the whole application reads it on every request and the
 * generator is pure — the same array every time, from the same fixed seed.
 */
export function showroomSessions(): readonly ShowroomSession[] {
  if (cache !== null) return cache;

  const catalogue = RAW_CATALOGUE;
  const sessions: ShowroomSession[] = [];
  let index = 0;

  for (const [phase, bounds] of Object.entries(PERIOD_BOUNDS)) {
    const from = new Date(`${bounds.from}T09:00:00.000Z`).getTime();
    const to = new Date(`${bounds.to}T18:00:00.000Z`).getTime();

    for (let i = 0; i < bounds.meetings; i += 1) {
      index += 1;
      const r = rng(0x1a15 ^ (index * 2654435761));
      const agent = chooseAgent(r);

      // Meetings land on working days, spread across the period, weighted
      // toward late morning and mid-afternoon.
      const at = new Date(from + (to - from) * ((i + r() * 0.8) / bounds.meetings));
      at.setUTCHours(9 + Math.floor(r() * 8), Math.floor(r() * 60), 0, 0);

      const timingUnavailable = phase === "previous" && i < LEGACY_IMPORT_COUNT;
      const order = buildSequence(r, agent);
      const { steps, durationSeconds } = buildSteps(r, agent, order, at, timingUnavailable);

      const usedCompare = order.includes("compare");
      const units = buildUnits(r, agent, catalogue, usedCompare);

      const coreReached = CORE_SECTION_IDS.filter((id) => order.includes(id)).length;
      const coverage = coreReached / CORE_SECTION_IDS.length;
      const surroundingsIndex = order.indexOf("surroundings");
      const surroundingsEarly =
        surroundingsIndex >= 0 && surroundingsIndex < Math.ceil(order.length / 3);
      const returned = steps.some((s) => s.isReturn);

      const outcome = chooseOutcome(r, agent, {
        coverage,
        surroundingsEarly,
        compared: usedCompare,
        returned,
      });

      // Roughly a third of meetings are with a contact Observer already knows.
      const contactId = r() < 0.34 ? `con_${String(1000 + (index % 41))}` : null;

      sessions.push({
        sessionId: `ses_${String(index).padStart(4, "0")}`,
        meetingId: `mtg_${String(index).padStart(4, "0")}`,
        projectId: "prj_northgate",
        agentId: agent.id,
        contactId,
        startedAt: at.toISOString(),
        endedAt: new Date(at.getTime() + durationSeconds * 1000).toISOString(),
        durationSeconds,
        outcome,
        steps,
        units,
        environment: buildEnvironment(r, order),
        // Filter state is not recoverable from the legacy source and the UE5
        // module does not emit it yet. Left empty rather than invented.
        filters: [],
        screenshots: units.reduce((sum, u) => sum + u.screenshots, 0),
        timingUnavailable,
      });
    }
  }

  cache = sessions;
  return sessions;
}

/** Sessions inside one period. The only slicing the read models need. */
export function sessionsInPeriod(fromIso: string, toIso: string): readonly ShowroomSession[] {
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  return showroomSessions().filter((s) => {
    const at = Date.parse(s.startedAt);
    return at >= from && at <= to;
  });
}

export function sessionById(meetingId: string): ShowroomSession | undefined {
  return showroomSessions().find((s) => s.meetingId === meetingId);
}

export { SECTION_IDS, sectionLabel };
