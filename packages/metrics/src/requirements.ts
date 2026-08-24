/**
 * Source-requirement coverage.
 *
 * The metric registry says what the product measures. This says why — every
 * requirement that entered the product, where it came from, and what satisfies
 * it. A requirement with nothing against it fails validation, so a dropped
 * requirement surfaces as a failing test rather than as a gap somebody notices
 * a year later.
 *
 * Coverage is not always a metric. Some requirements are satisfied by a read
 * model, some by a contract, and some are honestly still open — those must say
 * so explicitly rather than be quietly counted as done.
 */

export const REQUIREMENT_SOURCES = [
  /** The consultation with Stano Bajaník on the analytics MVP. */
  "stano",
  /** The documented Showroom IRIS sales-agent UX flow. */
  "sales_agent_flow",
  /** Decisions taken by MADSPACE during this build. */
  "madspace",
  /** The WEBIRIS cross-channel journey addendum. */
  "webiris_addendum",
] as const;
export type RequirementSource = (typeof REQUIREMENT_SOURCES)[number];

export const REQUIREMENT_FAMILIES = [
  "executive",
  "sales_flow",
  "project_unit",
  "people_agency",
  "cross_channel",
  "platform",
] as const;
export type RequirementFamily = (typeof REQUIREMENT_FAMILIES)[number];

export interface SourceRequirement {
  readonly id: string;
  readonly source: RequirementSource;
  readonly family: RequirementFamily;
  /** The requirement, in the words of whoever asked for it. */
  readonly requirement: string;
  /** Metric identifiers that satisfy it. */
  readonly metrics?: readonly string[];
  /** Read models or screens that satisfy it where a metric is the wrong shape. */
  readonly readModels?: readonly string[];
  /** Contracts, policies or decisions that satisfy it. */
  readonly contracts?: readonly string[];
  /** Milestone that will satisfy it, when the answer is "later, on purpose". */
  readonly deferredTo?: string;
  /** An open product decision. Counts as coverage only by being explicit. */
  readonly unresolved?: string;
  /** A decision that is made, but blocked behind a review before production. */
  readonly gate?: string;
}

export const REQUIREMENTS: readonly SourceRequirement[] = [
  /* --- Stano --------------------------------------------------------------- */
  {
    id: "stano.ten_second_verdict",
    source: "stano",
    family: "executive",
    requirement:
      "On the first screen, within about ten seconds, I must know whether this is good, bad or worth attention.",
    metrics: ["exec.performance_status", "exec.notable_changes"],
    readModels: ["ExecutiveOverview verdict strip"],
  },
  {
    id: "stano.context_not_raw_data",
    source: "stano",
    family: "executive",
    requirement:
      "There is a lot of data but no context. I cannot evaluate anything from numbers standing on their own.",
    contracts: ["MetricDefinition.denominator", "MetricDefinition.comparison", "MetricStates"],
    readModels: ["verdict strip", "comparison chips"],
  },
  {
    id: "stano.multiple_views",
    source: "stano",
    family: "platform",
    requirement:
      "Not one dashboard: I want to look at the same numbers by sales flow, by project, and by salespeople.",
    readModels: ["Overview", "Sales Flow", "Project", "People"],
  },
  {
    id: "stano.pipeline_on_one_screen",
    source: "stano",
    family: "sales_flow",
    requirement:
      "The pipeline with its counts and conversions has to be next to each other on one screen, or I cannot say what my success rate is.",
    metrics: ["flow.stage_counts", "flow.stage_conversion", "flow.viewing_to_offer"],
  },
  {
    id: "stano.unit_type_statistics",
    source: "stano",
    family: "project_unit",
    requirement:
      "Statistics by unit type — do two-room flats sell well, how many clients were interested, how long did they spend on them.",
    metrics: ["project.segment_interest", "project.attention_index", "project.sold_by_segment"],
  },
  {
    id: "stano.floor_and_unit_analysis",
    source: "stano",
    family: "project_unit",
    requirement:
      "Which floor is looked at most, which units, what interests people about them, and who specifically those people are.",
    metrics: ["project.segment_interest", "unit.unique_interested_contacts", "unit.active_dwell"],
    readModels: ["Unit detail with buyer drill-down"],
  },
  {
    id: "stano.pull_interested_contacts",
    source: "stano",
    family: "project_unit",
    requirement:
      "Pull me the ten clients interested in this project right now, so I can email them myself without asking the agents.",
    readModels: ["Contacts segment builder", "consent-checked export"],
    deferredTo: "M7",
  },
  {
    id: "stano.crm_view_of_agents",
    source: "stano",
    family: "people_agency",
    requirement:
      "A CRM-like view: this person works on this project, met this client three times, made an offer, is in negotiation.",
    metrics: ["people.meetings_by_agent", "flow.stage_counts"],
    readModels: ["Agent detail", "Contact timeline"],
  },
  {
    id: "stano.push_stalled",
    source: "stano",
    family: "sales_flow",
    requirement:
      "I can see these are stuck — so I can tell someone to push the client, because I want this project to move.",
    metrics: ["flow.stalled_opportunities", "people.follow_up_delay"],
  },
  {
    id: "stano.sales_cycle_length",
    source: "stano",
    family: "sales_flow",
    requirement:
      "How long does it take on average to sell one flat here? I cannot plan a campaign without knowing.",
    metrics: [
      "flow.sales_cycle_duration",
      "flow.time_between_meetings",
      "flow.time_in_stage",
      "exec.avg_days_to_close",
    ],
  },
  {
    id: "stano.floor_plan_beside_unit",
    source: "stano",
    family: "project_unit",
    requirement: "When I click a unit I want the floor plan beside it, so I can see what it is.",
    readModels: ["Unit detail"],
    metrics: ["unit.availability_price_context"],
  },
  {
    id: "stano.ai_report_on_demand",
    source: "stano",
    family: "platform",
    requirement:
      "Ask for the Monday steering summary on one A4 and have it produced, instead of building general dashboards nobody agrees on.",
    deferredTo: "the reporting and AI milestone",
    contracts: ["Statement", "Evidence"],
  },
  {
    id: "stano.voice_interface",
    source: "stano",
    family: "platform",
    requirement: "A voice interface over the same data.",
    deferredTo: "after the text ask-bar is trusted",
  },
  {
    id: "stano.custom_home_screen",
    source: "stano",
    family: "executive",
    requirement:
      "Everyone wants different metrics on the opening screen — HR, a sales manager, a marketer.",
    readModels: ["role-aware default home screens"],
    contracts: ["ADR-0019"],
  },
  {
    id: "stano.mobile_one_screen",
    source: "stano",
    family: "platform",
    requirement: "On my phone, one screen that tells me how it is going.",
    deferredTo: "M6 agent workspace and the executive mobile layout",
  },

  /* --- the sales-agent flow ------------------------------------------------ */
  {
    id: "flow.agent_identity",
    source: "sales_agent_flow",
    family: "people_agency",
    requirement: "The agent selects their profile, so every meeting is attributable to a person.",
    metrics: ["people.meetings_by_agent"],
    contracts: ["Meeting.agentId"],
  },
  {
    id: "flow.timer_starts_at_presentation",
    source: "sales_agent_flow",
    family: "people_agency",
    requirement:
      "The welcome screen may sit open for minutes; timing must start at Start Presentation.",
    contracts: ["Meeting.startedAt distinct from scheduledFor"],
  },
  {
    id: "flow.surroundings",
    source: "sales_agent_flow",
    family: "project_unit",
    requirement: "Surroundings and points of interest are presented and should be measurable.",
    metrics: ["project.poi_interest"],
  },
  {
    id: "flow.amenities",
    source: "sales_agent_flow",
    family: "project_unit",
    requirement: "Amenities are presented, sometimes auto-played.",
    metrics: ["project.amenity_interest"],
  },
  {
    id: "flow.filters",
    source: "sales_agent_flow",
    family: "project_unit",
    requirement: "Filter criteria capture what the buyer is actually looking for.",
    readModels: ["Pre-meeting brief observed filters"],
    contracts: ["ObservedFilter"],
    metrics: [
      "demand.filter_value_reach",
      "demand.by_rooms",
      "demand.by_orientation",
      "demand.by_floor_band",
      "demand.by_price_band",
      "demand.by_area_band",
      "demand.filter_combinations",
      "demand.zero_result_searches",
      "demand.matching_available_units",
    ],
  },
  {
    id: "flow.unit_selection_method",
    source: "sales_agent_flow",
    family: "project_unit",
    requirement: "Whether a unit was picked on the 3D model or from a list.",
    contracts: ["CanonicalFact.attributes.selection_method"],
    metrics: ["product.unit_selection_method"],
  },
  {
    id: "flow.deep_dive",
    source: "sales_agent_flow",
    family: "project_unit",
    requirement: "Balcony view, floor cut, materials and the interior walkthrough.",
    metrics: ["unit.deep_dive_rate", "unit.pdf_opens"],
  },
  {
    id: "flow.compare_mode",
    source: "sales_agent_flow",
    family: "project_unit",
    requirement: "Compare mode, and which unit survived the comparison.",
    metrics: ["unit.compare_inclusion", "unit.compare_win_rate"],
  },
  {
    id: "flow.scene_control",
    source: "sales_agent_flow",
    family: "project_unit",
    requirement: "Time of day and weather are scene control, not photo mode.",
    metrics: ["project.environment_interest"],
  },
  {
    id: "flow.photo_and_render",
    source: "sales_agent_flow",
    family: "project_unit",
    requirement: "Photo mode captures and the AI Render Studio.",
    metrics: [
      "project.environment_interest",
      "render.engagement",
      "render.operational_cost",
      "render.failure_rate",
    ],
  },
  {
    id: "flow.share",
    source: "sales_agent_flow",
    family: "people_agency",
    requirement: "The agent shares selected units and images with the buyer by email.",
    metrics: ["unit.shares", "people.share_to_offer"],
  },
  {
    id: "flow.outcome_including_skip",
    source: "sales_agent_flow",
    family: "people_agency",
    requirement:
      "The meeting outcome is recorded, and a skipped outcome must never become presentation-only.",
    metrics: ["people.skipped_outcomes"],
    contracts: ["MeetingOutcome including skipped"],
  },
  {
    id: "flow.returning_buyer",
    source: "sales_agent_flow",
    family: "cross_channel",
    requirement: "A returning buyer's history must be available before the next meeting.",
    readModels: ["PreMeetingBrief", "Contact timeline"],
  },

  /* --- MADSPACE decisions -------------------------------------------------- */
  {
    id: "madspace.multi_tenant_configuration",
    source: "madspace",
    family: "platform",
    requirement: "A new project must be created through configuration, never by changing code.",
    contracts: ["ADR-0002", "project configuration model"],
    deferredTo: "M10 administration",
  },
  {
    id: "madspace.seats_as_entitlements",
    source: "madspace",
    family: "platform",
    requirement: "Commercial seat limits are configurable entitlements, never a hard-coded number.",
    deferredTo: "M10 administration",
  },
  {
    id: "madspace.attribution_policy",
    source: "madspace",
    family: "cross_channel",
    requirement:
      "Attribution defaults to 90 days, is tenant-configurable by MADSPACE administrators only, is versioned with an effective date, and is reported alongside the numbers.",
    contracts: ["DEFAULT_ATTRIBUTION_POLICY", "policiesComparable", "ADR-0014"],
  },
  {
    id: "madspace.meaningful_dwell",
    source: "madspace",
    family: "project_unit",
    requirement:
      "Raw active duration is always retained; meaningful dwell is derived and versioned, and the threshold is never applied during ingestion.",
    contracts: ["DEFAULT_DWELL_POLICY", "CanonicalFact.rawActiveDurationMs", "ADR-0016"],
    metrics: ["unit.active_dwell", "unit.meaningful_views"],
  },
  {
    id: "madspace.canonical_meeting_identity",
    source: "madspace",
    family: "cross_channel",
    requirement:
      "Observer owns the internal meeting identifier; WEBIRIS and CRM booking identifiers are source references.",
    contracts: ["Meeting.id", "SourceReference", "ADR-0017"],
  },
  {
    id: "madspace.brief_never_buyer_visible",
    source: "madspace",
    family: "people_agency",
    requirement:
      "The internal pre-meeting brief must never appear on a buyer-visible display; the buyer-facing report is a separate sanitised contract.",
    contracts: ["ADR-0018", "BuyerFacingSurface"],
  },
  {
    id: "madspace.ingestion_boundary",
    source: "madspace",
    family: "platform",
    requirement:
      "Source observations are the external boundary; canonical facts are produced server-side, and clients may never submit derived facts.",
    contracts: ["SourceObservation", "CanonicalFact", "isClientSubmittableFact", "ADR-0015"],
  },
  {
    id: "madspace.no_mock_data",
    source: "madspace",
    family: "platform",
    requirement: "No mock data layer; synthetic scenarios travel the real path.",
    contracts: ["ADR-0007"],
  },
  {
    id: "madspace.rls_mandatory",
    source: "madspace",
    family: "platform",
    requirement:
      "Row-level security and application authorisation both remain mandatory; hashing is not an access control.",
    contracts: ["ADR-0005", "ADR-0011"],
    deferredTo: "the physical database milestone",
  },
  {
    id: "madspace.webiris_visitor_identity",
    source: "madspace",
    family: "cross_channel",
    requirement:
      "WEBIRIS will implement a first-party pseudonymous UUID with a 180-day rolling lifetime, no fingerprinting, and consent state stored separately.",
    contracts: ["docs/10-policies.md"],
    deferredTo: "WEBIRIS implementation",
  },
  {
    id: "madspace.legal_review",
    source: "madspace",
    family: "platform",
    requirement:
      "Legal basis, consent wording and retention periods are marked for formal review, not asserted in technical documentation.",
    contracts: ["docs/05-identity.md review markers", "docs/11-preproduction-gates.md"],
    gate: "Pre-production legal and privacy review: privacy notice, lawful basis and consent, retention, deletion and anonymisation, CRM data sharing, sales-agency access, AI processing, forbidden inference categories.",
  },

  /* --- WEBIRIS addendum ---------------------------------------------------- */
  {
    id: "madspace.intent_not_a_stage",
    source: "madspace",
    family: "sales_flow",
    requirement:
      "Lead temperature is an Observer signal, not a CRM stage. Stage conversion must never be computed through it.",
    contracts: ["DEAL_STAGES", "IntentSignal", "ADR-0021"],
    metrics: [
      "intent.distribution",
      "intent.high_to_offer",
      "intent.high_to_reservation",
      "intent.high_to_purchase",
      "intent.lift_over_baseline",
      "intent.signal_freshness",
    ],
  },
  {
    id: "madspace.self_hosted_typography",
    source: "madspace",
    family: "platform",
    requirement:
      "Manrope is self-hosted from a reproducible package, with no runtime dependency on a third-party font host.",
    contracts: ["@fontsource-variable/manrope", "apps/web/src/app/layout.tsx"],
  },
  {
    id: "madspace.synthetic_session_boundary",
    source: "madspace",
    family: "platform",
    requirement:
      "The scenario session adapter must not let a browser grant itself a tenant or role, and must not be described as production authentication.",
    contracts: ["opaque server-validated session id", "ADR-0022"],
  },
  {
    id: "webiris.funnel",
    source: "webiris_addendum",
    family: "cross_channel",
    requirement:
      "Document the funnel from anonymous visitor to purchase, distinguishing observed, attributed, associated and causal claims.",
    contracts: ["JOURNEY_STAGES", "EVIDENCE_TIERS", "ADR-0010"],
  },
  {
    id: "webiris.identity_architecture",
    source: "webiris_addendum",
    family: "cross_channel",
    requirement:
      "Anonymous visitor, online session, contact, contact identity, lead, project contact, meeting, participant, deal, source reference and unified timeline.",
    contracts: ["packages/contracts/src/identity.ts", "packages/contracts/src/engagement.ts"],
  },
  {
    id: "webiris.pre_meeting_brief",
    source: "webiris_addendum",
    family: "cross_channel",
    requirement:
      "A structured pre-meeting brief in three separated sections, every statement carrying evidence and a drill-down.",
    contracts: ["PreMeetingBriefSchema", "StatementSchema"],
    readModels: ["PreMeetingBrief"],
  },
  {
    id: "webiris.journey_metrics",
    source: "webiris_addendum",
    family: "cross_channel",
    requirement: "The sixteen cross-channel journey metrics.",
    metrics: [
      "webiris.anonymous_visitors",
      "webiris.identified_leads",
      "webiris.visitor_to_lead",
      "journey.lead_to_booking",
      "journey.meeting_attendance_rate",
      "journey.webiris_to_showroom",
      "journey.lead_to_attendance_days",
      "journey.online_to_offer",
      "journey.online_to_reservation",
      "journey.online_to_purchase",
      "journey.conversion_by_online_segment",
      "journey.preference_agreement",
      "journey.common_path",
      "journey.cross_channel_completeness",
      "journey.unmatched_contacts",
      "journey.unmatched_meetings",
    ],
  },
  {
    id: "webiris.viktoria_scenario",
    source: "webiris_addendum",
    family: "cross_channel",
    requirement: "A deterministic synthetic Viktória journey, plus the edge cases around it.",
    contracts: ["docs/08-scenarios.md"],
    deferredTo: "M2 synthetic read models, then the seeding milestone",
  },
] as const;

/** A requirement with nothing against it at all. Validation fails on these. */
export function uncoveredRequirements(): readonly SourceRequirement[] {
  return REQUIREMENTS.filter(
    (r) =>
      (r.metrics?.length ?? 0) === 0 &&
      (r.readModels?.length ?? 0) === 0 &&
      (r.contracts?.length ?? 0) === 0 &&
      r.deferredTo === undefined &&
      r.unresolved === undefined &&
      r.gate === undefined,
  );
}

/** Decisions that are made but wait on a review before production. */
export function gatedRequirements(): readonly SourceRequirement[] {
  return REQUIREMENTS.filter((r) => r.gate !== undefined);
}

/** Requirements whose answer is an open product decision. */
export function unresolvedRequirements(): readonly SourceRequirement[] {
  return REQUIREMENTS.filter((r) => r.unresolved !== undefined);
}

export function requirementsBySource(source: RequirementSource): readonly SourceRequirement[] {
  return REQUIREMENTS.filter((r) => r.source === source);
}
