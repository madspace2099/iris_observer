import type { InsightSource, MeetingOutcome, PlaceCategory, SectionId } from "@observer/contracts";
import type { ViewContext } from "./context";
import type { AssistedSales, DealLadder } from "./deal-source";
import type { EvidenceRef } from "./metric-value";
import type { ShowroomFinding } from "./showroom";

/**
 * The three views, and the door that leads to them.
 *
 * Review found the opening screen overloaded: a wall of prose and figures where
 * a verdict belonged. A developer with two minutes must be able to tell whether
 * the showroom meetings are going well or badly, and then choose one of three
 * places to go. Everything analytical moved behind those three doors.
 *
 *   Sales Flow   — how the process is performing
 *   Project      — what buyers want, and what they linger on
 *   Sales Agents — how each person presents, and how their meetings end
 */

/* --- the opening screen ------------------------------------------------------ */

/**
 * Whether things are going well.
 *
 * Three states, not a score. A number between 0 and 100 invites the reader to
 * watch it move by a point; a word makes them ask why.
 */
export type ShowroomSignal = "good" | "attention" | "poor";

export interface HomeFigure {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  /** The comparison, in words. Null when there is nothing to compare against. */
  readonly against: string | null;
  readonly direction: "up" | "down" | "flat";
  readonly better: "up" | "down" | "neither";
  /** The glossary entry, so the figure can explain itself. */
  readonly measurementId: string | null;
}

export interface ShowroomDoor {
  readonly id: "flow" | "project" | "agents";
  readonly label: string;
  /** What this view answers, in one line. */
  readonly question: string;
  /** The single most useful thing behind the door, already computed. */
  readonly headline: string;
  readonly href: string;
}

export interface ShowroomHome {
  readonly context: ViewContext;
  readonly signal: ShowroomSignal;
  /** One sentence. The whole ten-second answer. */
  readonly verdict: string;
  /** Why the signal is what it is. One clause, never a paragraph. */
  readonly because: string;
  /** Three figures. Never more — the registry holds eighty-two. */
  readonly figures: readonly HomeFigure[];
  /**
   * The one thing worth acting on today, if anything is raised at all.
   *
   * Null means the checks found nothing, and nothing else. It used to mean
   * "nothing that can be opened", which let a project with four raised states
   * print "Nothing in this period is waiting on a decision from you" because
   * the highest-ranked one happened to have no route of its own — an absent
   * link rendered as an absent problem, which is the absence-as-zero rule
   * applied to a sentence rather than a figure.
   *
   * `actionLabel` exists because the two cases do not look alike and must not
   * read alike: the state's own action goes where the state is, and the
   * fallback goes to the list, and a reader told "Look at it" who lands on a
   * register has been misled by one word.
   */
  readonly alert: {
    readonly text: string;
    readonly href: string;
    readonly actionLabel: string;
  } | null;
  readonly doors: readonly ShowroomDoor[];
  readonly meetingCount: number;
  readonly sources: readonly InsightSource[];
  readonly evidence: EvidenceRef;
}

/* --- 1. Sales Flow ----------------------------------------------------------- */

/**
 * A bucket of time.
 *
 * Named periods rather than a date picker, because the question an agent or a
 * manager actually asks is "how did this week go" — and a comparison to the
 * matching previous bucket is what makes the answer mean anything.
 */
export interface FlowPeriod {
  readonly id: "today" | "yesterday" | "this_week" | "last_week" | "this_month" | "last_month";
  readonly label: string;
  readonly meetings: number;
  /** Median, not mean. One long meeting must not move it. */
  readonly medianDurationSeconds: number | null;
  readonly medianDurationDisplay: string;
  /** Share of meetings whose outcome was recorded at all. */
  readonly outcomeRecorded: number;
  readonly progressed: number;
}

export interface OutcomeSlice {
  readonly outcome: MeetingOutcome;
  readonly label: string;
  readonly count: number;
  readonly share: number;
}

/**
 * A presenter's results, as a shape rather than a table.
 *
 * The doughnut is the requested form and the right one: outcome mix is parts of
 * one whole, and a bar chart of six categories invites a reader to compare
 * heights across agents, which is exactly the league table this product refuses
 * to be. Side by side, the shapes are comparable at a glance and the counts are
 * still written down.
 */
export interface AgentOutcomeRing {
  readonly agentId: string;
  readonly name: string;
  readonly meetings: number;
  /**
   * Of `meetings`, the ones with an outcome recorded — the denominator of
   * `progressedShare`, which is NOT `meetings`: the ring's centre says every
   * meeting, the rate stands on the decided ones, and a card that printed the
   * rate beside the centre count invited the reader to multiply the wrong two
   * numbers. Carried here so the screen prints it rather than counts it.
   */
  readonly decidedMeetings: number;
  readonly slices: readonly OutcomeSlice[];
  /** Of `decidedMeetings`. Nought where none was decided, which the screen must read as no rate. */
  readonly progressedShare: number;
  /**
   * Set only when the pattern is worth a conversation, never as a score.
   *
   * `sampleSize` is the exact population `text`'s own figures are drawn from
   * (not always the same one -- a "no outcome recorded" flag is stated over
   * every meeting, the others over only the decided ones) -- so a finding
   * built from this flag can cite the same number rather than a different
   * one from a different field.
   */
  readonly flag: {
    readonly severity: "watch" | "concern";
    readonly text: string;
    readonly sampleSize: number;
  } | null;
  readonly href: string;
}

export interface SalesFlowView {
  readonly context: ViewContext;
  readonly verdict: string;
  readonly periods: readonly FlowPeriod[];
  readonly outcomes: readonly OutcomeSlice[];
  readonly rings: readonly AgentOutcomeRing[];
  readonly findings: readonly ShowroomFinding[];
  readonly meetingCount: number;
  readonly evidence: EvidenceRef;
  /**
   * The deal ladder, which is the CRM's (ADR-0021). Drawn from the deals a
   * connector delivered; says "not connected" where none did, never a rung
   * at zero.
   */
  readonly ladder: DealLadder;
  /**
   * Which of the CRM's dated sales followed a showing of the unit in IRIS, by
   * the versioned rule in `DEFAULT_IRIS_ASSIST_POLICY`. An observed sequence:
   * it never says the showing produced the sale (ADR-0039).
   */
  readonly assisted: AssistedSales;
}

/* --- 2. Project -------------------------------------------------------------- */

/**
 * One unit segment, and whether attention matches supply.
 *
 * The question behind it: *are two-room flats interesting to buyers, and if so
 * what about them?* Share of stock against share of every kind of engagement —
 * looking, shortlisting, comparing, sharing — because those four are different
 * strengths of interest and averaging them loses the distinction.
 */
export interface SegmentInterest {
  readonly id: string;
  readonly label: string;
  /**
   * The room count this segment is defined by. Carried so a consumer can
   * build a criterion from the segment itself rather than parse its id.
   * `null` for the segment of units whose count the catalogue did not state.
   */
  readonly rooms: number | null;
  readonly availableUnits: number;
  readonly stockShare: number;
  readonly attentionShare: number;
  readonly favouriteShare: number;
  readonly compareShare: number;
  readonly shareShare: number;
  /** Attention share over stock share. Above one is disproportionate interest. */
  readonly index: number;
  readonly meetings: number;
  /** What buyers looking at this segment attended to, in order. */
  readonly attendedTo: readonly {
    readonly label: string;
    readonly category: string;
    readonly share: number;
  }[];
  /** The sections these meetings spent longest in. */
  readonly sections: readonly {
    readonly sectionId: SectionId;
    readonly label: string;
    readonly share: number;
  }[];
  /**
   * How buyers examined these units, as a rate per unit opened.
   *
   * The four acts are different questions: the balcony is the view, the floor
   * cut is the layout, the plan is what they take away, the screenshot is what
   * they show someone else. "They spend their time on the view" and "they take
   * the floor plan" call for different campaigns, and averaging them into
   * "engagement" loses exactly that.
   */
  readonly examinedHow: readonly {
    readonly id: string;
    readonly label: string;
    readonly rate: number;
    readonly otherRate: number;
  }[];
  readonly soWhat: string;
  /**
   * The attention × conversion reading (docs/02-views.md §4.2): where this
   * segment falls against parity on attention and against the project on
   * conversion. `quadrant` is null below the documented minimum sample or
   * where no CRM records an outcome, and the words say which.
   */
  readonly conversion: SegmentConversion;
}

export const SEGMENT_QUADRANTS = ["hero", "mispriced", "hidden_gem", "dead_stock"] as const;
export type SegmentQuadrant = (typeof SEGMENT_QUADRANTS)[number];

export interface SegmentConversion {
  /** Meetings that opened a unit of this segment and recorded an outcome. */
  readonly decided: number;
  readonly progressed: number;
  /** progressed / decided, or null when nothing was decided. */
  readonly share: number | null;
  /** The same share over every decided meeting on the project. */
  readonly projectShare: number | null;
  /** The documented minimum for a verdict, so the screen can say how far short. */
  readonly minimum: number;
  readonly quadrant: SegmentQuadrant | null;
  /** Why there is no quadrant, in words; null when there is one. */
  readonly withheld: string | null;
}

export interface StatedDemand {
  readonly field: string;
  readonly label: string;
  readonly value: string;
  readonly applications: number;
  /** How many available units satisfied it. Zero is the finding. */
  readonly matches: number;
  readonly availability: "legacy_available" | "partially_derivable" | "requires_ue5_v2_event";
}

export interface PlaceInterest {
  readonly placeId: string;
  readonly name: string;
  readonly category: PlaceCategory;
  readonly section: "surroundings" | "amenities";
  readonly meetings: number;
  readonly totalDwellSeconds: number;
  readonly medianDwellSeconds: number;
  readonly availability: "legacy_available" | "requires_ue5_v2_event";
}

export interface ProjectView {
  readonly context: ViewContext;
  readonly verdict: string;
  readonly segments: readonly SegmentInterest[];
  /** What the attention × conversion frame rests on, said once for the whole matrix. */
  readonly matrixNote: string;
  readonly selectedSegment: SegmentInterest | null;
  readonly demand: readonly StatedDemand[];
  readonly places: readonly PlaceInterest[];
  readonly placeCategories: readonly {
    readonly category: PlaceCategory;
    readonly label: string;
    readonly share: number;
    readonly meetings: number;
  }[];
  readonly findings: readonly ShowroomFinding[];
  readonly meetingCount: number;
  readonly evidence: EvidenceRef;
}

/* --- 3. Sales Agents --------------------------------------------------------- */

/**
 * How often the same buyer came back to the same agent.
 *
 * A first meeting and a third meeting are different sales situations, and a
 * project whose meetings are all first meetings is not building a pipeline.
 */
export interface RepeatDistribution {
  readonly visits: number;
  readonly label: string;
  readonly meetings: number;
  readonly share: number;
}

/** Where an agent's time goes inside IRIS, as a share of their own presentation. */
export interface AgentSectionUse {
  readonly sectionId: SectionId;
  readonly label: string;
  /**
   * Where this section falls in the agent's running order, 1 first.
   *
   * From the mean position across their meetings, not from a single one. An
   * agent does not present in exactly the same order twice, so the order shown
   * is their habit rather than a script.
   */
  readonly order: number;
  /** Mean position, 0 first and 1 last. The figure `order` is derived from. */
  readonly position: number;
  /** Median seconds in this section. Null where no session could report timing. */
  readonly medianDwellSeconds: number | null;
  /** Ready to print: "1m 24s", or "—" when the source cannot say. */
  readonly dwellDisplay: string;
  /**
   * Share of the presentation time the source could time for this agent.
   *
   * Not "total presentation time". A step the source could not time carries
   * a null dwell — never a nought, never inferred — and is outside this
   * figure entirely: it is skipped on both sides of the share, and the
   * meetings that had no such step are counted in `AgentProfile.timedMeetings`
   * so the reader knows what set the share stands on. This used to say
   * "total", while the builder zeroed every unknown into the denominator; the
   * fixtures' unknowns happen to be whole meetings and moved nothing, and the
   * ingest path's need not be.
   */
  readonly timeShare: number;
  /**
   * Share of the team's timed presentation time in the same section, for
   * contrast. The same rule, the same skipped nulls, and the set is
   * `AgentsView.timedMeetingCount`.
   */
  readonly teamShare: number;
  /** The team's median seconds in the same section, so the agent's has a scale. */
  readonly teamDwellDisplay: string;
  readonly reachRate: number;
  /** Share of their meetings that came back to this section after leaving it. */
  readonly returnRate: number;
  readonly availability: "legacy_available" | "partially_derivable" | "requires_ue5_v2_event";
}

export interface AgentProfile {
  readonly agentId: string;
  readonly name: string;
  /**
   * The agency this agent presents for. Every project has had exactly one
   * until docs/08-scenarios.md §3's "Multiple agencies" case (ISTER TOWER);
   * printed regardless, since a byline that only appears on the one project
   * with two agencies would itself be the tell that something is being
   * hidden the rest of the time.
   */
  readonly organisationName: string;
  readonly meetings: number;
  /**
   * Of `meetings`, the ones every step of which the source could time. The
   * section shares below stand on these and no others; the difference is
   * meetings the source could not time, not meetings that did not happen.
   */
  readonly timedMeetings: number;
  /**
   * `meetings < AGENT_MIN_SAMPLE` (docs/10-policies.md §6), carried on the
   * profile itself rather than left for the card to compute — the same rule
   * `AgentDetailView` already states, applied where the roster shows a
   * verdict too. Below it, the card prints `suppressionNote` in place of a
   * percentage and a team-comparison flag: figures stand, no rank or trend.
   */
  readonly belowMinimum: boolean;
  /** Null when the sample clears the minimum. Never an empty string. */
  readonly suppressionNote: string | null;
  /**
   * Why no habit is read for this presenter although the meetings held clear
   * the floor: the habit stands on `timedMeetings`, and that set is under it.
   * Null above the floor, and null under `belowMinimum`, whose
   * `suppressionNote` speaks for the whole card. The screen prints this where
   * "leans on" would stand; the signature finding's gate reads the same set.
   */
  readonly signatureNote: string | null;
  readonly medianDurationDisplay: string;
  readonly ring: AgentOutcomeRing;
  readonly repeats: readonly RepeatDistribution[];
  readonly sections: readonly AgentSectionUse[];
  /** The section this agent leans on hardest relative to the team. */
  readonly signature: { readonly label: string; readonly overIndex: number } | null;
  /**
   * The agent's own rating of IRIS, averaged. **MADSPACE only** — it is
   * feedback on the software, and a developer reading it would misread it as
   * feedback on their sales team.
   */
  readonly irisRating: { readonly mean: number; readonly responses: number } | null;
  readonly href: string;
}

export interface AgentsView {
  readonly context: ViewContext;
  readonly verdict: string;
  readonly agents: readonly AgentProfile[];
  readonly repeats: readonly RepeatDistribution[];
  readonly findings: readonly ShowroomFinding[];
  readonly showRatings: boolean;
  readonly meetingCount: number;
  /** Of `meetingCount`, the ones every step of which the source could time. The team's section shares stand on these. */
  readonly timedMeetingCount: number;
  readonly evidence: EvidenceRef;
}

/* --- the audience builder ---------------------------------------------------- */

/**
 * Everyone whose behaviour matched, without naming any of them here.
 *
 * The product case: a nursery is being built nearby, so find the buyers who
 * shortlisted a two-room flat and spent their time on family places. The result
 * is a count, the criteria in words, and the meetings behind it — the agent
 * opens those to reach the contacts, which keeps identity on the surface that
 * already governs it rather than in a list.
 */
export interface AudienceCriteria {
  readonly rooms: number | null;
  readonly favouritedOnly: boolean;
  readonly placeCategory: PlaceCategory | null;
  readonly minimumPlaceSeconds: number;
}

export interface AudienceMatch {
  readonly meetingId: string;
  readonly startedDisplay: string;
  readonly agentName: string;
  readonly outcomeLabel: string;
  /** Why this meeting matched, in words. */
  readonly because: string;
  readonly href: string;
}

export interface AudienceView {
  readonly context: ViewContext;
  readonly criteria: AudienceCriteria;
  /** The room counts this project's catalogue actually contains, ascending. */
  readonly roomChoices: readonly { readonly rooms: number; readonly label: string }[];
  readonly description: string;
  readonly matches: readonly AudienceMatch[];
  readonly total: number;
  readonly ofMeetings: number;
  readonly caveats: readonly string[];
  readonly evidence: EvidenceRef;
}
