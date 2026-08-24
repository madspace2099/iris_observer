<!--
  GENERATED FILE — do not edit by hand.
  Produced by: pnpm matrix        Verified by: packages/metrics/test/matrix.test.ts
  Source of truth: packages/metrics/src/registry/
-->

# Measurement dependency matrix

Generated from the metric registry. Every displayed number traces from here to the facts that must be
produced for it to exist, and no further hand-maintained list stands between them.

**Chain:** Screen → Component → **Metric → Required facts** → Source system → Query → Refresh

The bold segment is generated today. Screen and Component are filled as screens are built; the
fact-to-event expansion arrives with the event catalogue (ADR-0013).

- Metrics declared: **82**
- Facts depended upon: **24**
- Facts declared but not yet used by any metric: **0**

---

## 1. Metrics and what they need

| Metric | Name | Kind | Claim tier | Required facts | CRM fields | Unit attributes | Min n | Comparison | Drill-down | Roles |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `exec.performance_status` | Overall performance status | status | observed sequence | `meeting.attended`, `meeting.outcome.recorded`, `deal.stage.changed` | `deal.stage` | `price`, `status` | 10 | previous period | meetings | developer, agency_manager, madspace_admin |
| `exec.unrealised_potential` | Unrealised potential | currency | observed sequence | `unit.viewed`, `unit.availability.changed`, `deal.stage.changed` | `deal.stage` | `price`, `status` | 5 | previous period | units | developer, agency_manager |
| `exec.notable_changes` | Important changes | list | observed sequence | `meeting.attended`, `unit.viewed`, `deal.stage.changed` | — | — | 10 | previous period | meetings | developer, agency_manager, sales_agent |
| `exec.data_completeness` | Data completeness | ratio | observed sequence | `meeting.attended`, `meeting.outcome.recorded` | — | — | 5 | previous period | meetings | developer, agency_manager, madspace_admin |
| `exec.units_sold` | Units Sold | count | observed sequence | `deal.stage.changed` | `deal.stage`, `deal.unit` | — | 1 | previous quarter | deals | developer, agency_manager, madspace_admin |
| `exec.revenue` | Revenue | currency | observed sequence | `deal.stage.changed`, `unit.attributes.published` | `deal.stage`, `deal.contract_price` | `price` | 1 | previous quarter | deals | developer, madspace_admin |
| `exec.avg_days_to_close` | Average Days to Close | duration | observed sequence | `meeting.attended`, `deal.stage.changed` | `deal.stage` | — | 10 | previous quarter | deals | developer, agency_manager |
| `exec.active_buyers` | Active Buyers | count | observed sequence | `meeting.attended`, `deal.stage.changed` | `deal.stage` | — | 1 | previous period | contacts | developer, agency_manager, sales_agent |
| `flow.stage_counts` | Pipeline by stage | distribution | observed sequence | `meeting.attended`, `deal.stage.changed` | `deal.stage` | — | 1 | previous period | deals | developer, agency_manager, sales_agent |
| `flow.stage_conversion` | Conversion between stages | distribution | observed sequence | `meeting.attended`, `deal.stage.changed` | `deal.stage` | — | 20 | previous quarter | deals | developer, agency_manager |
| `flow.viewing_to_offer` | Viewing to Offer | ratio | observed sequence | `meeting.attended`, `deal.stage.changed` | `deal.stage` | — | 20 | previous quarter | deals | developer, agency_manager |
| `flow.offer_to_reservation` | Offer to Reservation | ratio | observed sequence | `meeting.attended`, `deal.stage.changed` | `deal.stage` | — | 15 | previous quarter | deals | developer, agency_manager |
| `flow.reservation_to_sale` | Reservation to Sale | ratio | observed sequence | `meeting.attended`, `deal.stage.changed` | `deal.stage` | — | 10 | previous quarter | deals | developer, agency_manager |
| `flow.time_between_meetings` | Time between meetings | duration | observed sequence | `meeting.attended` | — | — | 15 | previous quarter | meetings | developer, agency_manager, sales_agent |
| `flow.time_in_stage` | Time in stage | duration | observed sequence | `deal.stage.changed` | `deal.stage` | — | 15 | previous quarter | deals | developer, agency_manager |
| `flow.sales_cycle_duration` | Total sales-cycle duration | duration | observed sequence | `meeting.attended`, `online.session.observed`, `deal.stage.changed` | `deal.stage` | — | 10 | previous quarter | deals | developer, agency_manager |
| `flow.stalled_opportunities` | Stalled opportunities | count | observed sequence | `deal.stage.changed` | `deal.stage` | — | 15 | previous period | deals | developer, agency_manager, sales_agent |
| `unit.unique_interested_contacts` | Unique interested contacts | count | observed sequence | `unit.viewed` | — | — | 1 | previous period | units | developer, agency_manager, sales_agent |
| `unit.raw_views` | Raw views | count | observed sequence | `unit.viewed` | — | — | 1 | previous period | units | developer, agency_manager, sales_agent |
| `unit.meaningful_views` | Meaningful views | count | observed sequence | `unit.viewed` | — | — | 1 | previous period | units | developer, agency_manager, sales_agent |
| `unit.active_dwell` | Active dwell time | duration | observed sequence | `unit.viewed` | — | — | 3 | previous period | units | developer, agency_manager, sales_agent |
| `unit.favourites` | Favourites | count | observed sequence | `unit.favourited` | — | — | 1 | previous period | units | developer, agency_manager, sales_agent |
| `unit.shares` | Shares | count | observed sequence | `unit.shared` | — | — | 1 | previous period | units | developer, agency_manager, sales_agent |
| `unit.pdf_opens` | Material opens | count | observed sequence | `unit.material.opened` | — | — | 1 | previous period | units | developer, agency_manager, sales_agent |
| `unit.recent_interest` | Recent interest | count | observed sequence | `unit.viewed` | — | — | 1 | previous period | units | developer, agency_manager, sales_agent |
| `unit.compare_inclusion` | Compare-set inclusion | count | observed sequence | `unit.compared` | — | — | 1 | previous period | units | developer, agency_manager, sales_agent |
| `unit.compare_win_rate` | Compare-set win rate | ratio | statistical association | `unit.compared` | — | `price`, `rooms`, `floor`, `orientation`, `area` | 5 | none | units | developer, agency_manager |
| `unit.demand_trend` | Demand trend | distribution | observed sequence | `unit.viewed` | — | — | 10 | previous period | units | developer, agency_manager |
| `unit.sharp_demand_decline` | Sharp demand decline | list | statistical association | `unit.viewed`, `unit.availability.changed` | — | `status` | 10 | previous period | units | developer, agency_manager |
| `unit.available_demand` | Demand for available units | ratio | observed sequence | `unit.viewed`, `unit.availability.changed` | — | `status` | 20 | previous period | units | developer, agency_manager |
| `unit.availability_price_context` | Availability and price context | list | observed sequence | `unit.attributes.published`, `unit.availability.changed` | — | `price`, `status` | 1 | previous period | units | developer, agency_manager, sales_agent |
| `project.segment_interest` | Interest by segment | distribution | observed sequence | `unit.viewed`, `unit.attributes.published` | — | `rooms`, `floor`, `orientation`, `price`, `area`, `building` | 20 | previous quarter | segments | developer, agency_manager |
| `project.attention_index` | Attention index | ratio | observed sequence | `unit.viewed`, `unit.attributes.published` | — | `rooms`, `floor`, `orientation`, `price`, `area` | 20 | previous quarter | segments | developer, agency_manager |
| `project.sold_by_segment` | Sales performance by segment | distribution | observed sequence | `deal.stage.changed`, `unit.attributes.published` | `deal.stage`, `deal.unit` | `rooms`, `floor`, `orientation`, `price`, `area`, `building` | 10 | previous quarter | segments | developer, agency_manager |
| `project.poi_interest` | Surroundings and POI interest | distribution | observed sequence | `surroundings.poi.presented`, `project.section.viewed` | — | — | 15 | previous quarter | meetings | developer, agency_manager |
| `project.amenity_interest` | Amenity interest | distribution | observed sequence | `amenity.presented`, `project.section.viewed` | — | — | 15 | previous quarter | meetings | developer, agency_manager |
| `project.environment_interest` | Environment and camera-preset interest | distribution | statistical association | `scene.environment.set`, `visual.captured`, `unit.viewed` | — | — | 15 | previous quarter | meetings | developer, agency_manager |
| `unit.deep_dive_rate` | Deep-dive rate | ratio | observed sequence | `unit.viewed`, `unit.examined.balcony`, `unit.examined.floor_cut`, `unit.material.opened`, `unit.interior.opened` | — | — | 5 | previous period | units | developer, agency_manager, sales_agent |
| `people.meetings_by_agent` | Meetings by agent | count | observed sequence | `meeting.attended` | — | — | 1 | previous period | meetings | developer, agency_manager, sales_agent, madspace_admin |
| `people.presentation_coverage` | Presentation coverage | ratio | observed sequence | `project.section.viewed`, `meeting.attended` | — | — | 20 | previous quarter | meetings | developer, agency_manager, sales_agent |
| `people.follow_up_delay` | Follow-up delay | duration | observed sequence | `meeting.attended`, `unit.shared`, `deal.stage.changed` | `activity.occurred_at` | — | 15 | previous quarter | meetings | developer, agency_manager, sales_agent |
| `people.share_to_offer` | Share-to-offer conversion | ratio | observed sequence | `unit.shared`, `deal.stage.changed` | `deal.stage` | — | 20 | previous quarter | contacts | developer, agency_manager, sales_agent |
| `people.agent_conversion` | Agent conversion | ratio | observed sequence | `meeting.attended`, `meeting.outcome.recorded`, `deal.stage.changed` | `deal.stage` | — | 20 | previous quarter | contacts | developer, agency_manager |
| `people.agency_conversion` | Agency conversion | ratio | observed sequence | `meeting.attended`, `meeting.outcome.recorded`, `deal.stage.changed` | `deal.stage` | — | 20 | previous quarter | contacts | developer, agency_manager |
| `people.skipped_outcomes` | Skipped outcomes | ratio | observed sequence | `meeting.attended`, `meeting.outcome.recorded` | — | — | 10 | previous period | meetings | developer, agency_manager, sales_agent, madspace_admin |
| `people.coaching_signals` | Coaching signals | list | statistical association | `project.section.viewed`, `unit.viewed`, `meeting.outcome.recorded`, `scene.environment.set` | — | — | 40 | none | meetings | agency_manager, sales_agent, developer |
| `people.team_comparison` | Comparison with team and previous period | distribution | observed sequence | `meeting.attended`, `project.section.viewed`, `unit.shared` | — | — | 20 | previous quarter | meetings | agency_manager, sales_agent, developer |
| `webiris.anonymous_visitors` | Anonymous WEBIRIS visitors | count | observed sequence | `online.session.observed` | — | — | 1 | previous period | contacts | developer, agency_manager, madspace_admin |
| `webiris.identified_leads` | Identified WEBIRIS leads | count | observed sequence | `lead.submitted` | — | — | 1 | previous period | contacts | developer, agency_manager, madspace_admin |
| `webiris.visitor_to_lead` | Visitor-to-lead conversion | ratio | observed sequence | `online.session.observed`, `lead.submitted` | — | — | 50 | previous period | contacts | developer, agency_manager, madspace_admin |
| `journey.lead_to_booking` | Lead-to-booking conversion | ratio | observed sequence | `lead.submitted`, `meeting.booked` | `appointment.scheduled_for` | — | 20 | previous period | contacts | developer, agency_manager |
| `journey.meeting_attendance_rate` | Meeting attendance rate | ratio | observed sequence | `meeting.booked`, `meeting.attended` | `appointment.scheduled_for` | — | 20 | previous period | meetings | developer, agency_manager, sales_agent |
| `journey.webiris_to_showroom` | WEBIRIS-to-showroom conversion | ratio | attributed conversion | `lead.submitted`, `meeting.attended`, `identity.linked` | — | — | 20 | previous period | contacts | developer, agency_manager |
| `journey.lead_to_attendance_days` | Time from lead to showroom attendance | duration | observed sequence | `lead.submitted`, `meeting.attended` | — | — | 15 | previous quarter | contacts | developer, agency_manager |
| `journey.online_to_offer` | Online-to-offer conversion | ratio | attributed conversion | `lead.submitted`, `deal.stage.changed`, `identity.linked` | `deal.stage` | — | 20 | previous quarter | deals | developer, agency_manager |
| `journey.online_to_reservation` | Online-to-reservation conversion | ratio | attributed conversion | `lead.submitted`, `deal.stage.changed`, `identity.linked` | `deal.stage` | — | 25 | previous quarter | deals | developer, agency_manager |
| `journey.online_to_purchase` | Online-to-purchase conversion | ratio | attributed conversion | `lead.submitted`, `deal.stage.changed`, `identity.linked` | `deal.stage` | — | 30 | previous quarter | deals | developer, agency_manager |
| `journey.conversion_by_online_segment` | Conversion by online interest segment | distribution | attributed conversion | `lead.submitted`, `catalogue.filtered`, `unit.viewed`, `deal.stage.changed` | `deal.stage` | `rooms`, `orientation`, `price`, `floor` | 20 | previous quarter | segments | developer, agency_manager |
| `journey.preference_agreement` | Online and showroom preference agreement | ratio | statistical association | `unit.viewed`, `catalogue.filtered`, `unit.favourited` | — | `rooms`, `orientation`, `price`, `floor`, `area` | 25 | none | contacts | developer, agency_manager |
| `journey.common_path` | Most common online-to-showroom journey | distribution | observed sequence | `online.session.observed`, `lead.submitted`, `meeting.booked`, `meeting.attended` | — | — | 30 | none | contacts | developer, agency_manager |
| `journey.cross_channel_completeness` | Cross-channel data completeness | ratio | observed sequence | `meeting.attended`, `meeting.outcome.recorded` | — | — | 5 | previous period | meetings | developer, agency_manager, madspace_admin |
| `journey.unmatched_contacts` | Unmatched contacts | count | observed sequence | `lead.submitted` | `contact.id` | — | 1 | previous period | contacts | developer, agency_manager, madspace_admin |
| `journey.unmatched_meetings` | Unmatched meetings | count | observed sequence | `meeting.attended` | — | — | 1 | previous period | meetings | developer, agency_manager, sales_agent, madspace_admin |
| `intent.distribution` | Intent signal distribution | distribution | observed sequence | `unit.viewed`, `unit.favourited`, `meeting.attended`, `online.session.observed` | — | — | 10 | previous period | contacts | developer, agency_manager, sales_agent |
| `intent.signal_freshness` | Intent signal freshness | ratio | observed sequence | `unit.viewed`, `meeting.attended` | — | — | 10 | previous period | contacts | developer, agency_manager, madspace_admin |
| `intent.high_to_offer` | High intent to offer | ratio | attributed conversion | `unit.favourited`, `meeting.attended`, `deal.stage.changed` | `deal.stage` | — | 15 | previous quarter | deals | developer, agency_manager |
| `intent.high_to_reservation` | High intent to reservation | ratio | attributed conversion | `unit.favourited`, `meeting.attended`, `deal.stage.changed` | `deal.stage` | — | 15 | previous quarter | deals | developer, agency_manager |
| `intent.high_to_purchase` | High intent to purchase | ratio | attributed conversion | `unit.favourited`, `meeting.attended`, `deal.stage.changed` | `deal.stage` | — | 20 | previous quarter | deals | developer, agency_manager |
| `intent.lift_over_baseline` | Intent signal lift | ratio | statistical association | `unit.favourited`, `meeting.attended`, `deal.stage.changed` | `deal.stage` | — | 20 | previous quarter | contacts | developer, agency_manager, madspace_admin |
| `demand.filter_value_reach` | Reach by filter value | ratio | observed sequence | `catalogue.filtered`, `unit.viewed` | — | — | 20 | previous quarter | segments | developer, agency_manager |
| `demand.by_rooms` | Demand by room count | distribution | observed sequence | `catalogue.filtered`, `unit.viewed`, `unit.attributes.published` | — | `rooms` | 20 | previous quarter | segments | developer, agency_manager |
| `demand.by_orientation` | Demand by orientation | distribution | observed sequence | `catalogue.filtered`, `unit.viewed`, `unit.attributes.published` | — | `orientation` | 20 | previous quarter | segments | developer, agency_manager |
| `demand.by_floor_band` | Demand by floor range | distribution | observed sequence | `catalogue.filtered`, `unit.viewed`, `unit.attributes.published` | — | `floor` | 20 | previous quarter | segments | developer, agency_manager |
| `demand.by_price_band` | Demand by price range | distribution | observed sequence | `catalogue.filtered`, `unit.viewed`, `unit.attributes.published` | — | `price` | 20 | previous quarter | segments | developer, agency_manager |
| `demand.by_area_band` | Demand by area range | distribution | observed sequence | `catalogue.filtered`, `unit.viewed`, `unit.attributes.published` | — | `area` | 20 | previous quarter | segments | developer, agency_manager |
| `demand.filter_combinations` | Common filter combinations | distribution | observed sequence | `catalogue.filtered` | — | `rooms`, `orientation`, `price`, `floor`, `area` | 20 | previous quarter | segments | developer, agency_manager |
| `demand.zero_result_searches` | Searches returning nothing | distribution | observed sequence | `catalogue.filtered` | — | `rooms`, `orientation`, `price`, `floor`, `area`, `status` | 10 | previous quarter | segments | developer, agency_manager |
| `demand.matching_available_units` | Average matching available units | count | observed sequence | `catalogue.filtered`, `unit.availability.changed` | — | `status` | 10 | previous quarter | segments | developer, agency_manager |
| `product.unit_selection_method` | How units get chosen | distribution | observed sequence | `unit.viewed` | — | — | 30 | previous quarter | meetings | agency_manager, sales_agent, madspace_admin |
| `render.engagement` | Render Studio engagement | distribution | observed sequence | `visual.captured`, `visual.enhanced`, `unit.shared`, `meeting.attended` | — | — | 20 | previous quarter | meetings | agency_manager, sales_agent, madspace_admin |
| `render.operational_cost` | Render Studio operating cost | currency | observed sequence | `visual.enhanced` | — | — | 1 | previous period | meetings | madspace_admin, developer |
| `render.failure_rate` | Render failure rate | ratio | observed sequence | `visual.enhanced` | — | — | 20 | previous period | meetings | madspace_admin |

---

## 2. Facts and what breaks without them

This is the seed of the instrumentation backlog. A fact with dependants and no producer is a screen
that cannot work, visible here before anybody builds it.

| Fact | Owner | Producible by | Required attributes | Metrics | Which |
| --- | --- | --- | --- | --- | --- |
| `amenity.presented` | showroom | webiris, showroom | `amenity_ref`, `occurred_at` | 1 | `project.amenity_interest` |
| `catalogue.filtered` | observer | webiris, showroom | `criteria`, `result_count`, `occurred_at`, `channel` | 11 | `journey.conversion_by_online_segment`, `journey.preference_agreement`, `demand.filter_value_reach`, `demand.by_rooms`, `demand.by_orientation`, `demand.by_floor_band`, `demand.by_price_band`, `demand.by_area_band`, `demand.filter_combinations`, `demand.zero_result_searches`, `demand.matching_available_units` |
| `deal.stage.changed` | crm | crm, observer | `deal_ref`, `contact_ref`, `project_ref`, `stage`, `changed_at` | 28 | `exec.performance_status`, `exec.unrealised_potential`, `exec.notable_changes`, `exec.units_sold`, `exec.revenue`, `exec.avg_days_to_close`, `exec.active_buyers`, `flow.stage_counts`, `flow.stage_conversion`, `flow.viewing_to_offer`, `flow.offer_to_reservation`, `flow.reservation_to_sale`, `flow.time_in_stage`, `flow.sales_cycle_duration`, `flow.stalled_opportunities`, `project.sold_by_segment`, `people.follow_up_delay`, `people.share_to_offer`, `people.agent_conversion`, `people.agency_conversion`, `journey.online_to_offer`, `journey.online_to_reservation`, `journey.online_to_purchase`, `journey.conversion_by_online_segment`, `intent.high_to_offer`, `intent.high_to_reservation`, `intent.high_to_purchase`, `intent.lift_over_baseline` |
| `identity.linked` | observer | observer | `contact_ref`, `basis`, `deterministic`, `linked_at` | 4 | `journey.webiris_to_showroom`, `journey.online_to_offer`, `journey.online_to_reservation`, `journey.online_to_purchase` |
| `lead.submitted` | webiris | webiris, crm | `contact_ref`, `project_ref`, `submitted_at`, `consent_state` | 11 | `webiris.identified_leads`, `webiris.visitor_to_lead`, `journey.lead_to_booking`, `journey.webiris_to_showroom`, `journey.lead_to_attendance_days`, `journey.online_to_offer`, `journey.online_to_reservation`, `journey.online_to_purchase`, `journey.conversion_by_online_segment`, `journey.common_path`, `journey.unmatched_contacts` |
| `meeting.attended` | showroom | showroom | `meeting_ref`, `project_ref`, `started_at` | 32 | `exec.performance_status`, `exec.notable_changes`, `exec.data_completeness`, `exec.avg_days_to_close`, `exec.active_buyers`, `flow.stage_counts`, `flow.stage_conversion`, `flow.viewing_to_offer`, `flow.offer_to_reservation`, `flow.reservation_to_sale`, `flow.time_between_meetings`, `flow.sales_cycle_duration`, `people.meetings_by_agent`, `people.presentation_coverage`, `people.follow_up_delay`, `people.agent_conversion`, `people.agency_conversion`, `people.skipped_outcomes`, `people.team_comparison`, `journey.meeting_attendance_rate`, `journey.webiris_to_showroom`, `journey.lead_to_attendance_days`, `journey.common_path`, `journey.cross_channel_completeness`, `journey.unmatched_meetings`, `intent.distribution`, `intent.signal_freshness`, `intent.high_to_offer`, `intent.high_to_reservation`, `intent.high_to_purchase`, `intent.lift_over_baseline`, `render.engagement` |
| `meeting.booked` | crm | crm, webiris | `meeting_ref`, `contact_ref`, `project_ref`, `booked_at`, `scheduled_for` | 3 | `journey.lead_to_booking`, `journey.meeting_attendance_rate`, `journey.common_path` |
| `meeting.outcome.recorded` | showroom | showroom, crm | `meeting_ref`, `outcome`, `recorded_at` | 7 | `exec.performance_status`, `exec.data_completeness`, `people.agent_conversion`, `people.agency_conversion`, `people.skipped_outcomes`, `people.coaching_signals`, `journey.cross_channel_completeness` |
| `online.session.observed` | webiris | webiris | `visitor_ref`, `project_ref`, `started_at` | 5 | `flow.sales_cycle_duration`, `webiris.anonymous_visitors`, `webiris.visitor_to_lead`, `journey.common_path`, `intent.distribution` |
| `project.section.viewed` | observer | webiris, showroom | `section_path`, `occurred_at`, `duration_ms`, `channel` | 5 | `project.poi_interest`, `project.amenity_interest`, `people.presentation_coverage`, `people.coaching_signals`, `people.team_comparison` |
| `scene.environment.set` | showroom | showroom | `occurred_at` | 2 | `project.environment_interest`, `people.coaching_signals` |
| `surroundings.poi.presented` | showroom | webiris, showroom | `poi_ref`, `category`, `occurred_at` | 1 | `project.poi_interest` |
| `unit.attributes.published` | catalogue | catalogue, crm | `unit_ref`, `project_ref`, `observed_at` | 10 | `exec.revenue`, `unit.availability_price_context`, `project.segment_interest`, `project.attention_index`, `project.sold_by_segment`, `demand.by_rooms`, `demand.by_orientation`, `demand.by_floor_band`, `demand.by_price_band`, `demand.by_area_band` |
| `unit.availability.changed` | catalogue | catalogue, crm | `unit_ref`, `status`, `changed_at` | 5 | `exec.unrealised_potential`, `unit.sharp_demand_decline`, `unit.available_demand`, `unit.availability_price_context`, `demand.matching_available_units` |
| `unit.compared` | observer | webiris, showroom | `unit_refs`, `occurred_at`, `channel` | 2 | `unit.compare_inclusion`, `unit.compare_win_rate` |
| `unit.examined.balcony` | showroom | showroom | `unit_ref`, `occurred_at`, `duration_ms` | 1 | `unit.deep_dive_rate` |
| `unit.examined.floor_cut` | showroom | showroom | `unit_ref`, `occurred_at`, `duration_ms` | 1 | `unit.deep_dive_rate` |
| `unit.favourited` | observer | webiris, showroom | `unit_ref`, `occurred_at`, `channel`, `active` | 7 | `unit.favourites`, `journey.preference_agreement`, `intent.distribution`, `intent.high_to_offer`, `intent.high_to_reservation`, `intent.high_to_purchase`, `intent.lift_over_baseline` |
| `unit.interior.opened` | showroom | showroom | `unit_ref`, `occurred_at`, `mode` | 1 | `unit.deep_dive_rate` |
| `unit.material.opened` | observer | webiris, showroom | `unit_ref`, `material_kind`, `occurred_at`, `channel` | 2 | `unit.pdf_opens`, `unit.deep_dive_rate` |
| `unit.shared` | observer | webiris, showroom | `unit_refs`, `occurred_at`, `channel` | 5 | `unit.shares`, `people.follow_up_delay`, `people.share_to_offer`, `people.team_comparison`, `render.engagement` |
| `unit.viewed` | observer | webiris, showroom | `unit_ref`, `occurred_at`, `duration_ms`, `channel` | 26 | `exec.unrealised_potential`, `exec.notable_changes`, `unit.unique_interested_contacts`, `unit.raw_views`, `unit.meaningful_views`, `unit.active_dwell`, `unit.recent_interest`, `unit.demand_trend`, `unit.sharp_demand_decline`, `unit.available_demand`, `project.segment_interest`, `project.attention_index`, `project.environment_interest`, `unit.deep_dive_rate`, `people.coaching_signals`, `journey.conversion_by_online_segment`, `journey.preference_agreement`, `intent.distribution`, `intent.signal_freshness`, `demand.filter_value_reach`, `demand.by_rooms`, `demand.by_orientation`, `demand.by_floor_band`, `demand.by_price_band`, `demand.by_area_band`, `product.unit_selection_method` |
| `visual.captured` | showroom | showroom | `capture_ref`, `occurred_at` | 2 | `project.environment_interest`, `render.engagement` |
| `visual.enhanced` | showroom | showroom | `capture_ref`, `occurred_at`, `succeeded` | 3 | `render.engagement`, `render.operational_cost`, `render.failure_rate` |

---

## 3. Declared but not yet consumed

These facts are specified in the taxonomy and no metric requires them yet. They are not dead: several
feed the pre-meeting brief and the meeting timeline, which are read models rather than metrics.

_None._
