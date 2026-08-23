# Requirements traceability

**Status:** M1 · **Date:** 2026-08-24

Where each confirmed requirement is satisfied. Hand-maintained, unlike
[`measurement-matrix.md`](measurement-matrix.md), which is generated from the registry.

**Status key:** ✅ contract in code · 📄 documented decision · ⏭ deliberately deferred, with the
milestone that owns it.

---

## M1 — Product Intelligence Contract

### Unified journey

| Requirement                                             | Where                                                                  | Status |
| ------------------------------------------------------- | ---------------------------------------------------------------------- | ------ |
| Unify WEBIRIS, CRM, IRIS Showroom and later outcomes    | `docs/04-journey.md` §1                                                | 📄     |
| Full funnel documented, anonymous visitor → purchase    | `JOURNEY_STAGES` in `engagement.ts`; `docs/04-journey.md` §1           | ✅     |
| Stage ownership across systems                          | `STAGE_OWNER`; test `identity.test.ts`                                 | ✅     |
| Terminal exits (not interested, lost, unreachable)      | `JOURNEY_EXITS`                                                        | ✅     |
| Distinguish observed / attributed / associated / causal | `EVIDENCE_TIERS`; `docs/04-journey.md` §2; ADR-0010                    | ✅     |
| Never claim WEBIRIS caused a showroom visit             | `StatementSchema` rejects the tier; `validateMetric` rejects it; tests | ✅     |
| Attribution window                                      | `JOURNEY_ATTRIBUTION.windowDays` = 90                                  | ✅     |
| Qualifying identity link                                | `qualifyingLink: deterministic_only`                                   | ✅     |
| First-touch and last-touch behaviour                    | `touchModel: both_reported`                                            | ✅     |
| Direct booking source                                   | `directBookingTreatment: separate_bucket`                              | ✅     |
| Missing-source treatment                                | `missingSourceTreatment: report_as_unknown`                            | ✅     |
| Confidence and minimum sample                           | `ConfidenceSchema`; `minimumSampleSize` per metric                     | ✅     |

### Identity architecture

| Requirement                                                 | Where                                                                         | Status     |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------- |
| Anonymous visitor · online session                          | `AnonymousVisitorSchema`, `OnlineSessionSchema`                               | ✅         |
| Contact · contact identity                                  | `ContactSchema`, `ContactIdentitySchema`                                      | ✅         |
| Lead · project contact                                      | `LeadSchema`, `ProjectContactSchema`                                          | ✅         |
| Meeting · meeting participant                               | `MeetingSchema`, `MeetingParticipantSchema`                                   | ✅         |
| Deal                                                        | `DealSchema`                                                                  | ✅         |
| CRM reference · source-system reference                     | `SourceReferenceSchema`                                                       | ✅         |
| Unified interaction timeline                                | `TimelineEntrySchema`                                                         | ✅         |
| `contact_id` stable within a tenant                         | `docs/05-identity.md` §2.1; `tenantId` required on every identity record      | ✅         |
| One contact across several projects of a tenant             | `ProjectContact` separation                                                   | ✅         |
| Identity never crosses tenants                              | `docs/05-identity.md` §2.2; per-tenant hash salt; tests in M2 isolation suite | 📄 + ⏭ M2  |
| Pre-identification activity linked only when consent allows | `Lead.consent.behaviouralLinking`; `IdentityLink.authorisedByLeadId`          | ✅         |
| No raw email or phone in behavioural events                 | `Contact` is strict and PII-free; `ContactPii` separate; test                 | ✅         |
| Events reference internal identifiers                       | branded ids in `ids.ts`; test refuses cross-entity ids                        | ✅         |
| Meetings support multiple participants, including couples   | `MeetingParticipantSchema` with role; tests                                   | ✅         |
| Cross-system identifiers as explicit records                | `SourceReference`, not a column                                               | ✅         |
| Booking and showroom session share one `meeting_id`         | `MeetingOrigin`; `docs/04-journey.md` §1                                      | ✅         |
| Identity conflict behaviour                                 | `docs/05-identity.md` §4                                                      | 📄         |
| Duplicate contact behaviour                                 | `docs/05-identity.md` §4; `mergedIntoContactId`                               | 📄 + ✅    |
| Deletion behaviour                                          | `docs/05-identity.md` §4; `erasedAt` tombstone                                | 📄 + ✅    |
| Consent-withdrawal behaviour                                | `docs/05-identity.md` §4; `IdentityLink.revokedAt`                            | 📄 + ✅    |
| Do not implement identity resolution yet                    | ADR-0011                                                                      | ⏭ M2 / M10 |

### Ownership

| Requirement                                              | Where                                             | Status |
| -------------------------------------------------------- | ------------------------------------------------- | ------ |
| WEBIRIS owns online behaviour                            | `docs/06-ownership.md` §1; `ObservableFact.owner` | ✅     |
| CRM owns contact, appointment and deal-stage facts       | same                                              | ✅     |
| Showroom owns in-meeting observation                     | same                                              | ✅     |
| Catalogue owns unit attributes, price, availability      | same                                              | ✅     |
| Observer owns timelines, metrics, evidence, intelligence | same; ADR-0012                                    | ✅     |
| UI must not join source records in components            | ADR-0012; `docs/06-ownership.md` §2               | 📄     |

### Pre-meeting brief

Every field below is a property of `PreMeetingBriefSchema` unless noted.

| Requirement                                        | Where                                                                 | Status |
| -------------------------------------------------- | --------------------------------------------------------------------- | ------ |
| Meeting and contact context                        | `BriefContextSchema`                                                  | ✅     |
| Last online activity · session count and dates     | `OnlineActivitySchema`                                                | ✅     |
| Viewed units · unique views · meaningful dwell     | `UnitInterestSchema`                                                  | ✅     |
| Favourites · compare sets · applied filters        | `UnitInterest.favourited`, `CompareSetSchema`, `ObservedFilterSchema` | ✅     |
| Preferred unit attributes                          | `PreferredAttributeSchema` (interpretation section)                   | ✅     |
| Price range only when explicitly observed          | `ObservedPriceRangeSchema`, nullable; test asserts the default        | ✅     |
| Downloaded or shared material                      | `ObservedSection.sharedMaterials`, `UnitInterest.materialsOpened`     | ✅     |
| Units still available                              | `UnitToPrepare.available`                                             | ✅     |
| Relevant changes since the last visit              | `RecommendationSection.changesSinceLastVisit`                         | ✅     |
| Units the agent should prepare                     | `RecommendationSection.unitsToPrepare`                                | ✅     |
| Suggested clarification questions                  | `ClarificationQuestionSchema`                                         | ✅     |
| Missing data                                       | `BriefDataHealthSchema`                                               | ✅     |
| Evidence and confidence                            | `EvidenceSchema`, `ConfidenceSchema`, `StatementSchema`               | ✅     |
| Three separated sections                           | `observed` / `interpretation` / `recommended`; test                   | ✅     |
| No sensitive personal traits inferred              | `PROHIBITED_INFERENCE_CATEGORIES`; test                               | ✅     |
| No unsupported assumption as customer fact         | `docs/07-pre-meeting-brief.md` §3; question form required             | 📄     |
| Every statement links to evidence and a drill-down | `StatementSchema` requires `evidenceId`; `Evidence.drillTo` required  | ✅     |

### Metrics

All sixteen are declared in `packages/metrics/src/registry/journey.ts` and asserted present by
`registry.test.ts`. See [`measurement-matrix.md`](measurement-matrix.md) for their full dependencies.

| Required metric                          | Identifier                             |
| ---------------------------------------- | -------------------------------------- |
| Anonymous WEBIRIS visitors               | `webiris.anonymous_visitors`           |
| Identified WEBIRIS leads                 | `webiris.identified_leads`             |
| Visitor-to-lead conversion               | `webiris.visitor_to_lead`              |
| Lead-to-meeting-booking conversion       | `journey.lead_to_booking`              |
| Meeting attendance rate                  | `journey.meeting_attendance_rate`      |
| WEBIRIS-to-showroom conversion           | `journey.webiris_to_showroom`          |
| Median time from lead to attendance      | `journey.lead_to_attendance_days`      |
| Online-to-offer conversion               | `journey.online_to_offer`              |
| Online-to-reservation conversion         | `journey.online_to_reservation`        |
| Online-to-purchase conversion            | `journey.online_to_purchase`           |
| Conversion by online interest segment    | `journey.conversion_by_online_segment` |
| Online and showroom preference agreement | `journey.preference_agreement`         |
| Most common online-to-showroom journey   | `journey.common_path`                  |
| Cross-channel data completeness          | `journey.cross_channel_completeness`   |
| Unmatched contacts                       | `journey.unmatched_contacts`           |
| Unmatched meetings                       | `journey.unmatched_meetings`           |

### Scenarios and placement

| Requirement                                    | Where                             | Status    |
| ---------------------------------------------- | --------------------------------- | --------- |
| Viktória reference journey, deterministic      | `docs/08-scenarios.md` §1         | 📄 → ⏭ M4 |
| Visitor who never identifies                   | §2                                | 📄 → ⏭ M4 |
| Lead using a second device                     | §2                                | 📄 → ⏭ M4 |
| Duplicate CRM contacts                         | §2                                | 📄 → ⏭ M4 |
| Meeting attended by a couple                   | §2                                | 📄 → ⏭ M4 |
| Unmatched showroom visitor                     | §2                                | 📄 → ⏭ M4 |
| Withdrawn consent and deletion                 | §2                                | 📄 → ⏭ M4 |
| Missing WEBIRIS data                           | §2                                | 📄 → ⏭ M4 |
| Two tenants, same email, no merge              | §2                                | 📄 → ⏭ M4 |
| Brief in agent Overview and Meeting drill-down | `docs/07-pre-meeting-brief.md` §6 | 📄 → ⏭ M6 |
| Journey in Contact drill-down under People     | same                              | 📄 → ⏭ M7 |
| No additional primary navigation item          | same; `docs/04-journey.md` §5     | 📄        |

### Held back on purpose

| Item                                    | Reason                                                                           | Owner milestone          |
| --------------------------------------- | -------------------------------------------------------------------------------- | ------------------------ |
| Concrete WEBIRIS and Unreal event names | ADR-0013 — facts first, so metrics are specifiable before either producer exists | later contract milestone |
| Identity resolution implementation      | ADR-0011 — rules reviewed before code merges records about real people           | M2 / M10                 |
| Ingest envelope, JSON Schema, OpenAPI   | Depends on the event catalogue above                                             | later contract milestone |
| Seeds and simulator                     | M1 specifies them; M4 builds them                                                | M4                       |

---

## M0 — Workspace foundation

| Requirement                             | Where                                                 | Status |
| --------------------------------------- | ----------------------------------------------------- | ------ |
| Next.js, React, strict TypeScript       | `apps/web`, `tsconfig.base.json`                      | ✅     |
| Pinned package manager and lockfile     | `packageManager`, `pnpm-lock.yaml`                    | ✅     |
| `CLAUDE.md` · `README.md`               | repository root                                       | ✅     |
| ADR folder and first decisions          | `docs/adr/` — thirteen records                        | ✅     |
| Safe `.env.example`                     | root, empty values only                               | ✅     |
| Lint, typecheck, test, production build | `pnpm verify`                                         | ✅     |
| CI pipeline                             | `.github/workflows/ci.yml`                            | ✅     |
| Consistent folder structure             | `apps/*`, `packages/*`                                | ✅     |
| Project settings and formatting rules   | `.editorconfig`, `.prettierrc.json`, `.gitattributes` | ✅     |
| First clean commit                      | `d73ba18`                                             | ✅     |
