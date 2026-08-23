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

- Metrics declared: **16**
- Facts depended upon: **10**
- Facts declared but not yet used by any metric: **14**

---

## 1. Metrics and what they need

| Metric | Name | Kind | Claim tier | Required facts | CRM fields | Unit attributes | Min n | Comparison | Drill-down | Roles |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
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

---

## 2. Facts and what breaks without them

This is the seed of the instrumentation backlog. A fact with dependants and no producer is a screen
that cannot work, visible here before anybody builds it.

| Fact | Owner | Producible by | Required attributes | Metrics | Which |
| --- | --- | --- | --- | --- | --- |
| `catalogue.filtered` | observer | webiris, showroom | `criteria`, `result_count`, `occurred_at`, `channel` | 2 | `journey.conversion_by_online_segment`, `journey.preference_agreement` |
| `deal.stage.changed` | crm | crm, observer | `deal_ref`, `contact_ref`, `project_ref`, `stage`, `changed_at` | 4 | `journey.online_to_offer`, `journey.online_to_reservation`, `journey.online_to_purchase`, `journey.conversion_by_online_segment` |
| `identity.linked` | observer | observer | `contact_ref`, `basis`, `deterministic`, `linked_at` | 4 | `journey.webiris_to_showroom`, `journey.online_to_offer`, `journey.online_to_reservation`, `journey.online_to_purchase` |
| `lead.submitted` | webiris | webiris, crm | `contact_ref`, `project_ref`, `submitted_at`, `consent_state` | 11 | `webiris.identified_leads`, `webiris.visitor_to_lead`, `journey.lead_to_booking`, `journey.webiris_to_showroom`, `journey.lead_to_attendance_days`, `journey.online_to_offer`, `journey.online_to_reservation`, `journey.online_to_purchase`, `journey.conversion_by_online_segment`, `journey.common_path`, `journey.unmatched_contacts` |
| `meeting.attended` | showroom | showroom | `meeting_ref`, `project_ref`, `started_at` | 6 | `journey.meeting_attendance_rate`, `journey.webiris_to_showroom`, `journey.lead_to_attendance_days`, `journey.common_path`, `journey.cross_channel_completeness`, `journey.unmatched_meetings` |
| `meeting.booked` | crm | crm, webiris | `meeting_ref`, `contact_ref`, `project_ref`, `booked_at`, `scheduled_for` | 3 | `journey.lead_to_booking`, `journey.meeting_attendance_rate`, `journey.common_path` |
| `meeting.outcome.recorded` | showroom | showroom, crm | `meeting_ref`, `outcome`, `recorded_at` | 1 | `journey.cross_channel_completeness` |
| `online.session.observed` | webiris | webiris | `visitor_ref`, `project_ref`, `started_at` | 3 | `webiris.anonymous_visitors`, `webiris.visitor_to_lead`, `journey.common_path` |
| `unit.favourited` | observer | webiris, showroom | `unit_ref`, `occurred_at`, `channel`, `active` | 1 | `journey.preference_agreement` |
| `unit.viewed` | observer | webiris, showroom | `unit_ref`, `occurred_at`, `duration_ms`, `channel` | 2 | `journey.conversion_by_online_segment`, `journey.preference_agreement` |

---

## 3. Declared but not yet consumed

These facts are specified in the taxonomy and no metric requires them yet. They are not dead: several
feed the pre-meeting brief and the meeting timeline, which are read models rather than metrics.

- `unit.compared`
- `unit.material.opened`
- `unit.shared`
- `project.section.viewed`
- `unit.examined.balcony`
- `unit.examined.floor_cut`
- `unit.interior.opened`
- `surroundings.poi.presented`
- `amenity.presented`
- `scene.environment.set`
- `visual.captured`
- `visual.enhanced`
- `unit.attributes.published`
- `unit.availability.changed`
