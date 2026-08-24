import type { SourceSystem } from "./sources";

/**
 * The observable-fact taxonomy.
 *
 * **This file deliberately contains no wire event names** (ADR-0013). It
 * states what Observer must be able to know, and which system is expected to
 * know it. The concrete WEBIRIS and Unreal event catalogues are a later
 * milestone, and each event will declare which fact or facts it supplies.
 *
 * The indirection buys three things:
 *
 *  - metrics can be specified before either producer exists;
 *  - the same fact can arrive from two channels — `unit.viewed` happens online
 *    and in the showroom, and every cross-channel metric depends on those
 *    being the same fact rather than two similarly named events;
 *  - renaming an event later is a mapping change, not a metric rewrite.
 *
 * A fact is a claim about the world, not a UI interaction. "The buyer looked
 * at unit A-402 for ninety seconds" is a fact; "the detail panel mounted" is
 * an implementation detail that happens to imply one.
 */

/** What the fact is about. Determines which drill-down it can support. */
export type FactSubject = "visitor" | "contact" | "meeting" | "unit" | "project" | "deal";

/** Whether the fact is meaningful before the person is known. */
export type FactIdentityRequirement = "anonymous_ok" | "requires_contact";

export interface ObservableFact {
  /** Stable identifier. Metrics and the dependency matrix reference this. */
  readonly id: string;
  readonly name: string;
  /** The product question this fact exists to answer. */
  readonly question: string;
  /**
   * Who is authoritative when more than one system reports the same instance.
   *
   * `observer` means no single source is: the fact is observable in both
   * channels and Observer owns the reconciled version. That is the normal case
   * for interest facts, and it is what makes cross-channel comparison possible
   * at all — the alternative is two near-identical facts that never line up.
   */
  readonly owner: SourceSystem;
  /** Every system that can legitimately report it. */
  readonly producibleBy: readonly SourceSystem[];
  readonly subject: FactSubject;
  readonly identity: FactIdentityRequirement;
  /** Attributes without which the fact cannot be used. */
  readonly required: readonly string[];
  /** Attributes that enrich it where available. */
  readonly optional: readonly string[];
  readonly note?: string;
}

const BOTH_CHANNELS = ["webiris", "showroom"] as const satisfies readonly SourceSystem[];

export const FACTS = {
  /* --- journey and identity --------------------------------------------- */

  "online.session.observed": {
    id: "online.session.observed",
    name: "Online session observed",
    question: "How often, and how recently, has this person been on the website?",
    owner: "webiris",
    producibleBy: ["webiris"],
    subject: "visitor",
    identity: "anonymous_ok",
    required: ["visitor_ref", "project_ref", "started_at"],
    optional: ["ended_at", "referrer_class", "device_class"],
  },

  "lead.submitted": {
    id: "lead.submitted",
    name: "Lead submitted",
    question: "When did this person identify themselves, and under what consent?",
    owner: "webiris",
    producibleBy: ["webiris", "crm"],
    subject: "contact",
    identity: "requires_contact",
    required: ["contact_ref", "project_ref", "submitted_at", "consent_state"],
    optional: ["visitor_ref", "channel"],
    note: "The consent captured here governs whether earlier anonymous activity may be attached.",
  },

  "identity.linked": {
    id: "identity.linked",
    name: "Identity linked",
    question: "Why does Observer believe these records describe the same person?",
    owner: "observer",
    producibleBy: ["observer"],
    subject: "contact",
    identity: "requires_contact",
    required: ["contact_ref", "basis", "deterministic", "linked_at"],
    optional: ["authorising_lead_ref"],
    note: "Recorded so a link can be explained to the data subject and reversed.",
  },

  "meeting.booked": {
    id: "meeting.booked",
    name: "Showroom meeting booked",
    question: "Did the lead convert into a scheduled appointment, and when?",
    owner: "crm",
    producibleBy: ["crm", "webiris"],
    subject: "meeting",
    identity: "requires_contact",
    required: ["meeting_ref", "contact_ref", "project_ref", "booked_at", "scheduled_for"],
    optional: ["agent_ref", "booking_source"],
  },

  "meeting.attended": {
    id: "meeting.attended",
    name: "Showroom meeting attended",
    question: "Did the buyer actually arrive, and how long was the presentation?",
    owner: "showroom",
    producibleBy: ["showroom"],
    subject: "meeting",
    identity: "anonymous_ok",
    required: ["meeting_ref", "project_ref", "started_at"],
    optional: ["agent_ref", "installation_ref", "ended_at", "participants", "language"],
    note: "Anonymous is permitted: a walk-in who declines to give details still attended.",
  },

  "meeting.outcome.recorded": {
    id: "meeting.outcome.recorded",
    name: "Meeting outcome recorded",
    question: "What did the agent say happened, and about which units?",
    owner: "showroom",
    producibleBy: ["showroom", "crm"],
    subject: "meeting",
    identity: "anonymous_ok",
    required: ["meeting_ref", "outcome", "recorded_at"],
    optional: ["unit_refs", "note"],
    note: "A skipped outcome is itself an outcome and must be reported as such.",
  },

  "deal.stage.changed": {
    id: "deal.stage.changed",
    name: "Deal stage changed",
    question: "Where is this buyer in the commercial process, and for how long?",
    owner: "crm",
    producibleBy: ["crm", "observer"],
    subject: "deal",
    identity: "requires_contact",
    required: ["deal_ref", "contact_ref", "project_ref", "stage", "changed_at"],
    optional: ["unit_refs", "previous_stage", "exit_reason"],
  },

  /* --- interest, observable in both channels ---------------------------- */

  "unit.viewed": {
    id: "unit.viewed",
    name: "Unit viewed",
    question: "Did this person look at this unit, when, and for how long?",
    owner: "observer",
    producibleBy: BOTH_CHANNELS,
    subject: "unit",
    identity: "anonymous_ok",
    required: ["unit_ref", "occurred_at", "duration_ms", "channel"],
    optional: ["selection_method", "meeting_ref", "visitor_ref", "contact_ref"],
    note: "Cross-channel preference agreement depends on this being one fact, not two.",
  },

  "unit.favourited": {
    id: "unit.favourited",
    name: "Unit favourited",
    question: "Which units did this person actively single out?",
    owner: "observer",
    producibleBy: BOTH_CHANNELS,
    subject: "unit",
    identity: "anonymous_ok",
    required: ["unit_ref", "occurred_at", "channel", "active"],
    optional: ["origin", "meeting_ref"],
    note: "Carries removal too: unfavouriting is a signal, not an absence of one.",
  },

  "unit.compared": {
    id: "unit.compared",
    name: "Units compared",
    question: "Which units competed against each other, and which one survived?",
    owner: "observer",
    producibleBy: BOTH_CHANNELS,
    subject: "unit",
    identity: "anonymous_ok",
    required: ["unit_refs", "occurred_at", "channel"],
    optional: ["kept_unit_ref", "meeting_ref"],
    note: "The competition graph is built from this and has no CRM equivalent.",
  },

  "unit.material.opened": {
    id: "unit.material.opened",
    name: "Unit material opened",
    question: "Did they go past the summary into the floor plan or the brochure?",
    owner: "observer",
    producibleBy: BOTH_CHANNELS,
    subject: "unit",
    identity: "anonymous_ok",
    required: ["unit_ref", "material_kind", "occurred_at", "channel"],
    optional: ["meeting_ref", "duration_ms"],
  },

  "unit.shared": {
    id: "unit.shared",
    name: "Unit shared with the buyer",
    question: "What did the agent commit to in writing, and when?",
    owner: "observer",
    producibleBy: BOTH_CHANNELS,
    subject: "unit",
    identity: "requires_contact",
    required: ["unit_refs", "occurred_at", "channel"],
    optional: ["meeting_ref", "image_count", "included_materials"],
    note: "The only in-room action with a consequence outside the room.",
  },

  "catalogue.filtered": {
    id: "catalogue.filtered",
    name: "Catalogue filtered",
    question: "What was this person actually looking for, in their own criteria?",
    owner: "observer",
    producibleBy: BOTH_CHANNELS,
    subject: "project",
    identity: "anonymous_ok",
    required: ["criteria", "result_count", "occurred_at", "channel"],
    optional: ["meeting_ref"],
    note: "The result count matters: it says whether the search narrowed or gave up.",
  },

  "project.section.viewed": {
    id: "project.section.viewed",
    name: "Project section viewed",
    question: "Which parts of the story were covered, and for how long?",
    owner: "observer",
    producibleBy: BOTH_CHANNELS,
    subject: "project",
    identity: "anonymous_ok",
    required: ["section_path", "occurred_at", "duration_ms", "channel"],
    optional: ["meeting_ref"],
    note: "Presentation coverage per agent is derived from this.",
  },

  /* --- showroom depth ---------------------------------------------------- */

  "unit.examined.balcony": {
    id: "unit.examined.balcony",
    name: "Balcony view experienced",
    question: "Did the buyer stand on the balcony and see the actual view?",
    owner: "showroom",
    producibleBy: ["showroom"],
    subject: "unit",
    identity: "anonymous_ok",
    required: ["unit_ref", "occurred_at", "duration_ms"],
    optional: ["meeting_ref"],
    note: "In an exterior product the view is the merchandise; this is the signature moment.",
  },

  "unit.examined.floor_cut": {
    id: "unit.examined.floor_cut",
    name: "Floor cut examined",
    question: "Did they need to understand where the unit sits in the building?",
    owner: "showroom",
    producibleBy: ["showroom"],
    subject: "unit",
    identity: "anonymous_ok",
    required: ["unit_ref", "occurred_at", "duration_ms"],
    optional: ["floor", "meeting_ref"],
  },

  "unit.interior.opened": {
    id: "unit.interior.opened",
    name: "Interior walkthrough opened",
    question: "Did they go inside, and how long were they gone?",
    owner: "showroom",
    producibleBy: ["showroom"],
    subject: "unit",
    identity: "anonymous_ok",
    required: ["unit_ref", "occurred_at", "mode"],
    optional: ["duration_ms", "meeting_ref", "external_ref"],
    note: "A boundary fact. Interiors run on a separate platform, so only the crossing is observable here.",
  },

  "surroundings.poi.presented": {
    id: "surroundings.poi.presented",
    name: "Point of interest presented",
    question: "Which neighbourhood arguments does this agent actually use?",
    owner: "showroom",
    producibleBy: BOTH_CHANNELS,
    subject: "project",
    identity: "anonymous_ok",
    required: ["poi_ref", "category", "occurred_at"],
    optional: ["duration_ms", "meeting_ref"],
    note: "Correlating this with outcomes turns surroundings into a campaign input.",
  },

  "amenity.presented": {
    id: "amenity.presented",
    name: "Amenity presented",
    question: "Which shared facilities were shown, and were they auto-played?",
    owner: "showroom",
    producibleBy: BOTH_CHANNELS,
    subject: "project",
    identity: "anonymous_ok",
    required: ["amenity_ref", "occurred_at"],
    optional: ["duration_ms", "autoplay", "meeting_ref"],
  },

  "scene.environment.set": {
    id: "scene.environment.set",
    name: "Scene environment set",
    question: "Under which light and weather does the project get presented, and does it matter?",
    owner: "showroom",
    producibleBy: ["showroom"],
    subject: "project",
    identity: "anonymous_ok",
    required: ["occurred_at"],
    optional: ["time_of_day", "weather", "clock", "date", "meeting_ref"],
    note: "Exterior-specific and undervalued. Nobody else in this market can report it.",
  },

  "visual.captured": {
    id: "visual.captured",
    name: "Visual captured",
    question: "Which view did the buyer want to take away with them?",
    owner: "showroom",
    producibleBy: ["showroom"],
    subject: "meeting",
    identity: "anonymous_ok",
    required: ["capture_ref", "occurred_at"],
    optional: ["unit_ref", "camera_preset", "aspect_ratio", "meeting_ref"],
  },

  "visual.enhanced": {
    id: "visual.enhanced",
    name: "Visual enhanced",
    question: "How much render work does a meeting consume, and does it convert?",
    owner: "showroom",
    producibleBy: ["showroom"],
    subject: "meeting",
    identity: "anonymous_ok",
    required: ["capture_ref", "occurred_at", "succeeded"],
    optional: ["preset", "duration_ms", "meeting_ref"],
  },

  /* --- catalogue --------------------------------------------------------- */

  "unit.attributes.published": {
    id: "unit.attributes.published",
    name: "Unit attributes published",
    question: "What is this unit, in the terms every segment metric needs?",
    owner: "catalogue",
    producibleBy: ["catalogue", "crm"],
    subject: "unit",
    identity: "anonymous_ok",
    required: ["unit_ref", "project_ref", "observed_at"],
    optional: ["rooms", "floor", "area", "orientation", "price", "building", "floorplan_ref"],
    note: "Without these there is no segment analysis at all, only per-unit counts.",
  },

  "unit.availability.changed": {
    id: "unit.availability.changed",
    name: "Unit availability changed",
    question: "Is this unit still sellable, and when did that change?",
    owner: "catalogue",
    producibleBy: ["catalogue", "crm"],
    subject: "unit",
    identity: "anonymous_ok",
    required: ["unit_ref", "status", "changed_at"],
    optional: ["previous_status", "price"],
    note: "Drives the pre-meeting brief's 'still available' and 'changed since last visit' sections.",
  },
} as const satisfies Record<string, ObservableFact>;

export type FactId = keyof typeof FACTS;

export const FACT_IDS = Object.keys(FACTS) as readonly FactId[];

export function getFact(id: FactId): ObservableFact {
  return FACTS[id];
}

export function isFactId(value: string): value is FactId {
  return Object.hasOwn(FACTS, value);
}

/** Facts a given system is expected to be able to report. */
export function factsProducibleBy(system: SourceSystem): readonly ObservableFact[] {
  return FACT_IDS.map((id) => FACTS[id]).filter((fact) =>
    (fact.producibleBy as readonly SourceSystem[]).includes(system),
  );
}
