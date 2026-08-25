import {
  AMENITIES,
  CORE_SECTION_IDS,
  SECTION_IDS,
  SURROUNDINGS,
  sectionLabel,
  type MeetingOutcome,
  type Place,
  type SectionId,
  type ShowroomEnvironmentSelection,
  type ShowroomFilterApplication,
  type ShowroomPlaceInteraction,
  type ShowroomSession,
  type ShowroomStep,
  type ShowroomUnitInteraction,
  type TimeOfDayPreset,
  type WeatherPreset,
} from "@observer/contracts";
import { catalogueFor, type RawUnit } from "../pulse";

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
  /*
   * Beta Development's own people.
   *
   * A different developer, a different agency, different presenters. Reusing
   * Meridian's team across both tenants would put one developer's staff on
   * another developer's screens, which is the same leak as sharing the figures
   * and reads as more obviously wrong.
   */
  {
    id: "agt_tomas_r",
    name: "Tomáš Rypák",
    organisationName: "Kingsford Sales",
    surroundingsEarly: 0.58,
    amenitiesSkip: 0.11,
    compareUse: 0.44,
    returnToShortlist: 0.47,
    coverageBias: 0.66,
    homeDwell: 1.1,
    unitsShownMean: 4.1,
    outcomeBias: 0.04,
    meetingShare: 0.55,
  },
  {
    id: "agt_eva",
    name: "Eva Lindqvist",
    organisationName: "Kingsford Sales",
    surroundingsEarly: 0.37,
    amenitiesSkip: 0.22,
    compareUse: 0.29,
    returnToShortlist: 0.24,
    coverageBias: 0.49,
    homeDwell: 1.5,
    unitsShownMean: 3.4,
    outcomeBias: -0.02,
    meetingShare: 0.45,
  },
];

export function agentById(id: string): SyntheticAgent | undefined {
  return SYNTHETIC_AGENTS.find((a) => a.id === id);
}

/** The people who present on one project. Never the whole roster. */
export function agentsForProject(projectId: string): readonly SyntheticAgent[] {
  const dataset = PROJECT_DATASETS.find((d) => d.projectId === projectId);
  if (dataset === undefined) return [];
  return dataset.agentIds
    .map((id) => agentById(id))
    .filter((a): a is SyntheticAgent => a !== undefined);
}

/* --- named content inside sections ----------------------------------------- */

/*
 * The real place lists, supplied by MADSPACE.
 *
 * Buyers do not attend to places uniformly, and a generator that picks
 * uniformly produces a dataset in which nothing is worth reporting. Weights
 * make some places genuinely magnetic — the lake, the tram stop, the nursery —
 * so that "what is this segment actually interested in" has an answer.
 */
const PLACE_WEIGHT: Record<string, number> = {
  family: 1.7,
  transport: 1.5,
  leisure: 1.3,
  convenience: 1.2,
  shopping: 1.0,
  lifestyle: 1.0,
  healthcare: 0.9,
  landmark: 0.8,
  work: 0.7,
  hospitality: 0.4,
  services: 0.4,
  neighbourhood: 0.35,
  building: 0.8,
};

function weightedPlace(r: () => number, pool: readonly Place[]): Place {
  const weights = pool.map((p) => PLACE_WEIGHT[p.category] ?? 1);
  const total = weights.reduce((a, b) => a + b, 0);
  let x = r() * total;
  for (let i = 0; i < pool.length; i += 1) {
    x -= weights[i] as number;
    if (x <= 0) return pool[i] as Place;
  }
  return pool[pool.length - 1] as Place;
}

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
 * What each project actually is.
 *
 * The generator once stamped `prj_northgate` — an id belonging to no project —
 * onto every session, and `sessionsInPeriod` filtered on dates alone. Three
 * developments therefore reported one set of figures, and a reader had no way
 * to tell. Each project now has its own volume, its own presenters, its own
 * sources and its own seed.
 *
 * The differences are the point. Riverside has no CRM, so no outcome was ever
 * recorded and every rate below the meeting must render as unavailable rather
 * than as nil. Kingsford has been selling for three weeks, so every verdict on
 * it must be suppressed for want of sample.
 */
export interface ProjectDataset {
  readonly projectId: string;
  /** Two letters, used in meeting ids so one id names one meeting. */
  readonly code: string;
  /** Distinct per project, so no two developments share a random stream. */
  readonly seed: number;
  /** Who presents here. An Alpha agent must never appear on a Beta project. */
  readonly agentIds: readonly string[];
  readonly periods: readonly {
    readonly phase: "previous" | "current";
    readonly from: string;
    readonly to: string;
    readonly meetings: number;
  }[];
  /** Without a CRM there is no outcome to record — not a nil one. */
  readonly crmConnected: boolean;
  /** Sessions imported from legacy analytics, carrying no per-step timing. */
  readonly legacyImports: number;
}

export const PROJECT_DATASETS: readonly ProjectDataset[] = [
  {
    projectId: "prj_northgate01",
    code: "ng",
    seed: 0x1a15,
    agentIds: ["agt_monika", "agt_akhilesh", "agt_jan", "agt_lucia"],
    periods: [
      { phase: "previous", ...PERIOD_BOUNDS.previous },
      { phase: "current", ...PERIOD_BOUNDS.current },
    ],
    crmConnected: true,
    legacyImports: 16,
  },
  {
    projectId: "prj_riversidew1",
    code: "rw",
    seed: 0x5c31,
    // A smaller team on a smaller scheme, and only two of them.
    agentIds: ["agt_monika", "agt_lucia"],
    periods: [
      { phase: "previous", from: "2026-04-01", to: "2026-06-30", meetings: 37 },
      { phase: "current", from: "2026-07-01", to: "2026-08-24", meetings: 29 },
    ],
    // No CRM connected. This project exists to prove the unavailable state.
    crmConnected: false,
    legacyImports: 0,
  },
  {
    projectId: "prj_beta0000001",
    code: "ky",
    seed: 0x9f07,
    // A different developer entirely, and therefore different people.
    agentIds: ["agt_tomas_r", "agt_eva"],
    // Three weeks live. There is no previous period to compare against.
    periods: [{ phase: "current", from: "2026-08-03", to: "2026-08-24", meetings: 41 }],
    crmConnected: false,
    legacyImports: 0,
  },
];

/* --- generation ------------------------------------------------------------ */

/**
 * Which of this project's presenters took the meeting.
 *
 * Weighted by each agent's share, renormalised over the roster actually working
 * on the project — a two-person team whose shares sum to 0.48 would otherwise
 * send half its meetings to the fallback.
 */
function chooseAgent(r: () => number, roster: readonly SyntheticAgent[]): SyntheticAgent {
  const total = roster.reduce((sum, a) => sum + a.meetingShare, 0);
  const x = r() * total;
  let acc = 0;
  for (const agent of roster) {
    acc += agent.meetingShare;
    if (x <= acc) return agent;
  }
  return roster[roster.length - 1] as SyntheticAgent;
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

    /*
     * Some visits are not presentations.
     *
     * A section gets opened on the way to another one, or tapped by accident,
     * and abandoned within a few seconds. Without these the dataset has no
     * visit below the meaningful-dwell threshold at all, and the one metric
     * that exists to separate "presented" from "clicked" can never fire — which
     * is precisely the flattery the legacy dashboard's "Engagement: High" on a
     * single click was built out of.
     *
     * Pass-throughs are commoner on the sections that sit between others.
     */
    const passThroughRate = sectionId === "maps" || sectionId === "gallery" ? 0.24 : 0.09;
    const dwell =
      r() < passThroughRate
        ? 3 + Math.floor(r() * 11)
        : // A long tail rather than a hard ceiling. With a narrow multiplier
          // the fastest agent's rate on "over a minute on Home" came out at
          // exactly 0%, which no real measurement looks like.
          Math.max(16, Math.round(base * bias * (0.4 + r() * 1.9)));

    let itemId: string | null = null;
    let itemLabel: string | null = null;
    if (sectionId === "amenities" && r() > 0.25) {
      const p = weightedPlace(r, AMENITIES);
      itemLabel = p.name;
      itemId = p.id;
    } else if (sectionId === "surroundings" && r() > 0.3) {
      const p = weightedPlace(r, SURROUNDINGS);
      itemLabel = p.name;
      itemId = p.id;
    }

    steps.push({
      ordinal: index + 1,
      sectionId,
      itemId,
      itemLabel,
      enteredAt: timingUnavailable
        ? null
        : new Date(startedAt.getTime() + clock * 1000).toISOString(),
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
  const compareSet =
    usedCompare && chosen.length >= 2 ? chosen.slice(0, Math.min(3, chosen.length)) : [];
  const keeper =
    compareSet.length > 0 ? (compareSet[Math.floor(r() * compareSet.length)] as RawUnit) : null;

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
      comparedWith: inCompare
        ? compareSet.filter((c) => c.code !== unit.code).map((c) => c.code)
        : [],
      keptFromComparison: inCompare ? keeper?.code === unit.code : null,
      shared: r() < engaged * 0.3,
    } satisfies ShowroomUnitInteraction;
  });
}

/**
 * What this buyer lingered on.
 *
 * Given an *interest profile* rather than picked at random, so the dataset
 * contains readable groups: a household drawn to the nursery and the playground,
 * a commuter drawn to the tram stop and the bus station. Those groups are the
 * whole point — "select everyone whose favourites were two-room flats and who
 * spent their time on the nursery" is only answerable if such people exist.
 *
 * The profile is the buyer's, not the agent's, and it is deliberately leaky: a
 * family-leaning visitor still looks at the lake.
 */
type InterestProfile = "family" | "commuter" | "lifestyle" | "investor" | "undecided";

const PROFILE_BIAS: Record<InterestProfile, Partial<Record<string, number>>> = {
  family: { family: 4.5, healthcare: 1.8, convenience: 1.6, leisure: 1.2 },
  commuter: { transport: 4.5, work: 2.4, convenience: 1.4 },
  lifestyle: { lifestyle: 3.6, leisure: 2.6, landmark: 1.8, shopping: 1.5 },
  investor: { work: 3.2, transport: 2.2, neighbourhood: 2.6, landmark: 1.2 },
  undecided: {},
};

function chooseProfile(r: () => number): InterestProfile {
  const x = r();
  if (x < 0.3) return "family";
  if (x < 0.52) return "commuter";
  if (x < 0.72) return "lifestyle";
  if (x < 0.85) return "investor";
  return "undecided";
}

function buildPlaces(
  r: () => number,
  profile: InterestProfile,
  order: readonly SectionId[],
): ShowroomPlaceInteraction[] {
  const out: ShowroomPlaceInteraction[] = [];
  const bias = PROFILE_BIAS[profile];

  const draw = (
    pool: readonly Place[],
    count: number,
    availability: "legacy_available" | "requires_ue5_v2_event",
  ) => {
    const weights = pool.map((p) => (PLACE_WEIGHT[p.category] ?? 1) * (bias[p.category] ?? 1));
    const total = weights.reduce((a, b) => a + b, 0);
    const chosen = new Set<string>();
    for (let i = 0; i < count; i += 1) {
      let x = r() * total;
      for (let j = 0; j < pool.length; j += 1) {
        x -= weights[j] as number;
        if (x <= 0) {
          const p = pool[j] as Place;
          if (!chosen.has(p.id)) {
            chosen.add(p.id);
            out.push({
              placeId: p.id,
              placeName: p.name,
              category: p.category,
              section: p.section,
              // A place someone cares about holds them; one they do not is a
              // glance. The spread is what makes the ranking mean anything.
              dwellSeconds: Math.round(4 + r() * (bias[p.category] === undefined ? 22 : 70)),
              availability,
            });
          }
          break;
        }
      }
    }
  };

  if (order.includes("amenities")) draw(AMENITIES, 2 + Math.floor(r() * 4), "legacy_available");
  if (order.includes("surroundings"))
    draw(SURROUNDINGS, 2 + Math.floor(r() * 5), "requires_ue5_v2_event");
  return out;
}

/**
 * What the buyer asked for.
 *
 * Stated demand rather than observed attention. **The current build emits none
 * of it** — this is a demonstration of what the UE5 v2 event would answer, and
 * it is marked as such on every record so no surface can present it as observed.
 */
function buildFilters(
  r: () => number,
  profile: InterestProfile,
  catalogue: readonly RawUnit[],
): ShowroomFilterApplication[] {
  if (r() < 0.28) return [];

  const out: ShowroomFilterApplication[] = [];
  const rooms = profile === "family" ? (r() > 0.35 ? 3 : 2) : r() > 0.7 ? 3 : 2;
  out.push({
    field: "rooms",
    value: String(rooms),
    matches: catalogue.filter((c) => c.rooms === rooms && c.status === "available").length,
    availability: "requires_ue5_v2_event",
  });

  if (r() > 0.4) {
    const cap = 200_000 + Math.round(r() * 9) * 10_000;
    out.push({
      field: "price",
      value: `under €${cap.toLocaleString("en-GB")}`,
      matches: catalogue.filter((c) => c.price <= cap && c.status === "available").length,
      availability: "requires_ue5_v2_event",
    });
  }
  if (r() > 0.62) {
    const aspect = pick(r, ["S", "SW", "W"] as const);
    out.push({
      field: "orientation",
      value: aspect,
      matches: catalogue.filter((c) => c.orientation === aspect && c.status === "available").length,
      availability: "requires_ue5_v2_event",
    });
  }
  if (r() > 0.78) {
    // A floor band nobody has left. The zero-result search is the finding.
    out.push({
      field: "floor",
      value: "7 and above",
      matches: catalogue.filter((c) => c.floor >= 7 && c.status === "available").length,
      availability: "requires_ue5_v2_event",
    });
  }
  return out;
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

  const sessions: ShowroomSession[] = [];

  for (const dataset of PROJECT_DATASETS) {
    const catalogue = catalogueFor(dataset.projectId);
    const roster = agentsForProject(dataset.projectId);
    let index = 0;

    for (const bounds of dataset.periods) {
      const phase = bounds.phase;
      const from = new Date(`${bounds.from}T09:00:00.000Z`).getTime();
      const to = new Date(`${bounds.to}T18:00:00.000Z`).getTime();

    for (let i = 0; i < bounds.meetings; i += 1) {
      index += 1;
      const r = rng(dataset.seed ^ (index * 2654435761));
      const agent = chooseAgent(r, roster);

      // Meetings land on working days, spread across the period, weighted
      // toward late morning and mid-afternoon.
      const at = new Date(from + (to - from) * ((i + r() * 0.8) / bounds.meetings));
      at.setUTCHours(9 + Math.floor(r() * 8), Math.floor(r() * 60), 0, 0);

      const timingUnavailable = phase === "previous" && i < dataset.legacyImports;
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

      /*
       * No CRM means no outcome — not a nil one.
       *
       * `skipped` is this product's word for "nothing recorded it". Drawing an
       * outcome for a project with no CRM connected would invent the one fact
       * that project cannot have, and every progression rate computed from it
       * would be fiction presented as measurement.
       */
      const outcome = dataset.crmConnected
        ? chooseOutcome(r, agent, {
            coverage,
            surroundingsEarly,
            compared: usedCompare,
            returned,
          })
        : "skipped";

      // Roughly a third of meetings are with a contact Observer already knows.
      const contactId = r() < 0.34 ? `con_${String(1000 + (index % 41))}` : null;

      /*
       * A returning buyer is a different sales situation.
       *
       * Only a contact Observer knows can be counted as returning; a walk-in has
       * no history to have. Averaging first and third meetings together hides
       * the thing an agent most wants to see.
       */
      const priorMeetings =
        contactId === null ? 0 : r() < 0.42 ? 0 : r() < 0.78 ? 1 : r() < 0.94 ? 2 : 3;

      const profile = chooseProfile(r);

      /*
       * The agent's rating of IRIS, 1-5, taken at the end of the session.
       * MADSPACE only: it is feedback on the software, not on the meeting.
       * Agents skip it often, and a skipped rating is null rather than a three.
       */
      const irisRating = r() < 0.31 ? null : Math.min(5, 3 + Math.round((r() - 0.35) * 3));

      /*
       * Identifiers carry the project.
       *
       * `mtg_0004` existed once under all three developments at the same time.
       * A meeting id has to name exactly one meeting, or a deep link opens
       * somebody else's presentation.
       */
      sessions.push({
        sessionId: `ses_${dataset.code}${String(index).padStart(4, "0")}`,
        meetingId: `mtg_${dataset.code}${String(index).padStart(4, "0")}`,
        projectId: dataset.projectId,
        agentId: agent.id,
        contactId,
        startedAt: at.toISOString(),
        endedAt: new Date(at.getTime() + durationSeconds * 1000).toISOString(),
        durationSeconds,
        outcome,
        steps,
        units,
        environment: buildEnvironment(r, order),
        filters: buildFilters(r, profile, catalogue),
        places: buildPlaces(r, profile, order),
        screenshots: units.reduce((sum, u) => sum + u.screenshots, 0),
        irisRating,
        priorMeetings,
        timingUnavailable,
      });
      }
    }
  }

  cache = sessions;
  return sessions;
}

/** Every session belonging to one project. */
export function sessionsForProject(projectId: string): readonly ShowroomSession[] {
  return showroomSessions().filter((s) => s.projectId === projectId);
}

/**
 * Sessions inside one period, for one project.
 *
 * The project is not optional and has no default. The previous signature took
 * a date range alone, so every project read every project's meetings — three
 * developments, one set of figures, and nothing on screen to say so.
 */
export function sessionsInPeriod(
  projectId: string,
  fromIso: string,
  toIso: string,
): readonly ShowroomSession[] {
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  return showroomSessions().filter((s) => {
    if (s.projectId !== projectId) return false;
    const at = Date.parse(s.startedAt);
    return at >= from && at <= to;
  });
}

/**
 * One meeting, scoped to the project that owns it.
 *
 * Looking a meeting up by id alone is how a deep link crosses a tenant
 * boundary: ids are guessable, and the reader who guesses one should get a
 * refusal rather than another developer's presentation.
 */
export function sessionById(meetingId: string, projectId?: string): ShowroomSession | undefined {
  return showroomSessions().find(
    (s) => s.meetingId === meetingId && (projectId === undefined || s.projectId === projectId),
  );
}

export { SECTION_IDS, sectionLabel };
