<!--
  GENERATED FILE — do not edit by hand.
  Produced by: pnpm matrix        Verified by: packages/metrics/test/coverage.test.ts
  Source of truth: packages/metrics/src/requirements.ts
-->

# Source-requirement coverage

Every requirement that entered IRIS Observer, where it came from, and what satisfies it. Generated
from `packages/metrics/src/requirements.ts`; a requirement with nothing against it fails the test
suite rather than quietly disappearing.

Coverage is not always a metric. Some requirements are answered by a read model, some by a contract
or a decision, and some are still open — those are listed in full at the end rather than counted as
done.

- Requirements tracked: **47**
- Uncovered: **0**
- Open decisions: **0**
- Decided, waiting on a review gate: **1**

---

## Stano Bajaník consultation

15 requirements.

| Requirement | Family | Covered by | Status |
| --- | --- | --- | --- |
| On the first screen, within about ten seconds, I must know whether this is good, bad or worth attention. | executive | `exec.performance_status`<br>`exec.notable_changes`<br>_ExecutiveOverview verdict strip_ | ✅ metric |
| There is a lot of data but no context. I cannot evaluate anything from numbers standing on their own. | executive | _verdict strip_<br>_comparison chips_<br>MetricDefinition.denominator<br>MetricDefinition.comparison<br>MetricStates | ✅ contract |
| Not one dashboard: I want to look at the same numbers by sales flow, by project, and by salespeople. | platform | _Overview_<br>_Sales Flow_<br>_Project_<br>_People_ | ✅ contract |
| The pipeline with its counts and conversions has to be next to each other on one screen, or I cannot say what my success rate is. | sales flow | `flow.stage_counts`<br>`flow.stage_conversion`<br>`flow.viewing_to_offer` | ✅ metric |
| Statistics by unit type — do two-room flats sell well, how many clients were interested, how long did they spend on them. | project unit | `project.segment_interest`<br>`project.attention_index`<br>`project.sold_by_segment` | ✅ metric |
| Which floor is looked at most, which units, what interests people about them, and who specifically those people are. | project unit | `project.segment_interest`<br>`unit.unique_interested_contacts`<br>`unit.active_dwell`<br>_Unit detail with buyer drill-down_ | ✅ metric |
| Pull me the ten clients interested in this project right now, so I can email them myself without asking the agents. | project unit | _Contacts segment builder_<br>_consent-checked export_<br>⏭ M7 | ✅ contract |
| A CRM-like view: this person works on this project, met this client three times, made an offer, is in negotiation. | people agency | `people.meetings_by_agent`<br>`flow.stage_counts`<br>_Agent detail_<br>_Contact timeline_ | ✅ metric |
| I can see these are stuck — so I can tell someone to push the client, because I want this project to move. | sales flow | `flow.stalled_opportunities`<br>`people.follow_up_delay` | ✅ metric |
| How long does it take on average to sell one flat here? I cannot plan a campaign without knowing. | sales flow | `flow.sales_cycle_duration`<br>`flow.time_between_meetings`<br>`flow.time_in_stage`<br>`exec.avg_days_to_close` | ✅ metric |
| When I click a unit I want the floor plan beside it, so I can see what it is. | project unit | `unit.availability_price_context`<br>_Unit detail_ | ✅ metric |
| Ask for the Monday steering summary on one A4 and have it produced, instead of building general dashboards nobody agrees on. | platform | Statement<br>Evidence<br>⏭ the reporting and AI milestone | ✅ contract |
| A voice interface over the same data. | platform | ⏭ after the text ask-bar is trusted | ⏭ deferred |
| Everyone wants different metrics on the opening screen — HR, a sales manager, a marketer. | executive | _role-aware default home screens_<br>ADR-0019 | ✅ contract |
| On my phone, one screen that tells me how it is going. | platform | ⏭ M6 agent workspace and the executive mobile layout | ⏭ deferred |

---

## Showroom IRIS sales-agent flow

13 requirements.

| Requirement | Family | Covered by | Status |
| --- | --- | --- | --- |
| The agent selects their profile, so every meeting is attributable to a person. | people agency | `people.meetings_by_agent`<br>Meeting.agentId | ✅ metric |
| The welcome screen may sit open for minutes; timing must start at Start Presentation. | people agency | Meeting.startedAt distinct from scheduledFor | ✅ contract |
| Surroundings and points of interest are presented and should be measurable. | project unit | `project.poi_interest` | ✅ metric |
| Amenities are presented, sometimes auto-played. | project unit | `project.amenity_interest` | ✅ metric |
| Filter criteria capture what the buyer is actually looking for. | project unit | `demand.filter_value_reach`<br>`demand.by_rooms`<br>`demand.by_orientation`<br>`demand.by_floor_band`<br>`demand.by_price_band`<br>`demand.by_area_band`<br>`demand.filter_combinations`<br>`demand.zero_result_searches`<br>`demand.matching_available_units`<br>_Pre-meeting brief observed filters_<br>ObservedFilter | ✅ metric |
| Whether a unit was picked on the 3D model or from a list. | project unit | `product.unit_selection_method`<br>CanonicalFact.attributes.selection_method | ✅ metric |
| Balcony view, floor cut, materials and the interior walkthrough. | project unit | `unit.deep_dive_rate`<br>`unit.pdf_opens` | ✅ metric |
| Compare mode, and which unit survived the comparison. | project unit | `unit.compare_inclusion`<br>`unit.compare_win_rate` | ✅ metric |
| Time of day and weather are scene control, not photo mode. | project unit | `project.environment_interest` | ✅ metric |
| Photo mode captures and the AI Render Studio. | project unit | `project.environment_interest`<br>`render.engagement`<br>`render.operational_cost`<br>`render.failure_rate` | ✅ metric |
| The agent shares selected units and images with the buyer by email. | people agency | `unit.shares`<br>`people.share_to_offer` | ✅ metric |
| The meeting outcome is recorded, and a skipped outcome must never become presentation-only. | people agency | `people.skipped_outcomes`<br>MeetingOutcome including skipped | ✅ metric |
| A returning buyer's history must be available before the next meeting. | cross channel | _PreMeetingBrief_<br>_Contact timeline_ | ✅ contract |

---

## MADSPACE decisions

14 requirements.

| Requirement | Family | Covered by | Status |
| --- | --- | --- | --- |
| A new project must be created through configuration, never by changing code. | platform | ADR-0002<br>project configuration model<br>⏭ M10 administration | ✅ contract |
| Commercial seat limits are configurable entitlements, never a hard-coded number. | platform | ⏭ M10 administration | ⏭ deferred |
| Attribution defaults to 90 days, is tenant-configurable by MADSPACE administrators only, is versioned with an effective date, and is reported alongside the numbers. | cross channel | DEFAULT_ATTRIBUTION_POLICY<br>policiesComparable<br>ADR-0014 | ✅ contract |
| Raw active duration is always retained; meaningful dwell is derived and versioned, and the threshold is never applied during ingestion. | project unit | `unit.active_dwell`<br>`unit.meaningful_views`<br>DEFAULT_DWELL_POLICY<br>CanonicalFact.rawActiveDurationMs<br>ADR-0016 | ✅ metric |
| Observer owns the internal meeting identifier; WEBIRIS and CRM booking identifiers are source references. | cross channel | Meeting.id<br>SourceReference<br>ADR-0017 | ✅ contract |
| The internal pre-meeting brief must never appear on a buyer-visible display; the buyer-facing report is a separate sanitised contract. | people agency | ADR-0018<br>BuyerFacingSurface | ✅ contract |
| Source observations are the external boundary; canonical facts are produced server-side, and clients may never submit derived facts. | platform | SourceObservation<br>CanonicalFact<br>isClientSubmittableFact<br>ADR-0015 | ✅ contract |
| No mock data layer; synthetic scenarios travel the real path. | platform | ADR-0007 | ✅ contract |
| Row-level security and application authorisation both remain mandatory; hashing is not an access control. | platform | ADR-0005<br>ADR-0011<br>⏭ the physical database milestone | ✅ contract |
| WEBIRIS will implement a first-party pseudonymous UUID with a 180-day rolling lifetime, no fingerprinting, and consent state stored separately. | cross channel | docs/10-policies.md<br>⏭ WEBIRIS implementation | ✅ contract |
| Legal basis, consent wording and retention periods are marked for formal review, not asserted in technical documentation. | platform | docs/05-identity.md review markers<br>docs/11-preproduction-gates.md<br>🔒 review gate | 🔒 gated |
| Lead temperature is an Observer signal, not a CRM stage. Stage conversion must never be computed through it. | sales flow | `intent.distribution`<br>`intent.high_to_offer`<br>`intent.high_to_reservation`<br>`intent.high_to_purchase`<br>`intent.lift_over_baseline`<br>`intent.signal_freshness`<br>DEAL_STAGES<br>IntentSignal<br>ADR-0021 | ✅ metric |
| Manrope is self-hosted from a reproducible package, with no runtime dependency on a third-party font host. | platform | @fontsource-variable/manrope<br>apps/web/src/app/layout.tsx | ✅ contract |
| The scenario session adapter must not let a browser grant itself a tenant or role, and must not be described as production authentication. | platform | opaque server-validated session id<br>ADR-0022 | ✅ contract |

---

## WEBIRIS cross-channel addendum

5 requirements.

| Requirement | Family | Covered by | Status |
| --- | --- | --- | --- |
| Document the funnel from anonymous visitor to purchase, distinguishing observed, attributed, associated and causal claims. | cross channel | JOURNEY_STAGES<br>EVIDENCE_TIERS<br>ADR-0010 | ✅ contract |
| Anonymous visitor, online session, contact, contact identity, lead, project contact, meeting, participant, deal, source reference and unified timeline. | cross channel | packages/contracts/src/identity.ts<br>packages/contracts/src/engagement.ts | ✅ contract |
| A structured pre-meeting brief in three separated sections, every statement carrying evidence and a drill-down. | cross channel | _PreMeetingBrief_<br>PreMeetingBriefSchema<br>StatementSchema | ✅ contract |
| The sixteen cross-channel journey metrics. | cross channel | `webiris.anonymous_visitors`<br>`webiris.identified_leads`<br>`webiris.visitor_to_lead`<br>`journey.lead_to_booking`<br>`journey.meeting_attendance_rate`<br>`journey.webiris_to_showroom`<br>`journey.lead_to_attendance_days`<br>`journey.online_to_offer`<br>`journey.online_to_reservation`<br>`journey.online_to_purchase`<br>`journey.conversion_by_online_segment`<br>`journey.preference_agreement`<br>`journey.common_path`<br>`journey.cross_channel_completeness`<br>`journey.unmatched_contacts`<br>`journey.unmatched_meetings` | ✅ metric |
| A deterministic synthetic Viktória journey, plus the edge cases around it. | cross channel | docs/08-scenarios.md<br>⏭ M2 synthetic read models, then the seeding milestone | ✅ contract |

---

## Open decisions

These are not gaps in the build. They are questions the product has not answered yet, recorded so
that nobody mistakes silence for agreement.

_None._

---

## Review gates

Decided in the product, and blocked behind a review before production. A gate is not a gap: the work
is done and the answer is known, but somebody outside engineering has to sign it off.

### Legal basis, consent wording and retention periods are marked for formal review, not asserted in technical documentation.

Pre-production legal and privacy review: privacy notice, lawful basis and consent, retention, deletion and anonymisation, CRM data sharing, sales-agency access, AI processing, forbidden inference categories.
