# Roadmap

**Status:** current · **Last corrected:** 2026-08-24 (project takeover and visual reboot)

The development order is deliberately reversed. Observer defines what must be measured; the physical
database and the Unreal Engine module implement that specification afterwards, once the dashboard
requirements have stabilised.

---

## Done

| #        | Milestone                                   | Outcome                                                                                                                                                                                             |
| -------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **M0**   | Workspace foundation                        | pnpm workspace, Next.js, strict TypeScript, ESLint, Prettier, CI, nine ADRs, first clean commit                                                                                                     |
| **M1**   | Product Intelligence Contract               | Identity and journey contracts, observable-fact taxonomy, evidence discipline, pre-meeting brief, requirement coverage, ingestion boundary, versioned policies                                      |
| **M2**   | UI foundation and first intelligence slices | Design system, shell, role-aware navigation, synthetic repository, Executive Overview and the pre-meeting brief at final quality                                                                    |
| **M2.1** | Visual acceptance and model corrections     | Intent split from the deal ladder, three new metric families (82 metrics), self-hosted typography, opaque session adapter, ten-second first viewport, every open decision resolved, twenty-two ADRs |

---

## Next

### M2.2 — Visual reboot

The M2.1 visual layer was rejected (`docs/12-visual-autopsy.md`). The contracts, metrics, evidence
rules and security decisions underneath it stand.

- Audit, direction and the design system: done — `docs/13-figma-adoption-matrix.md`, `docs/14-design-system.md`.
- Two isolated Executive Overview concepts on laboratory routes: narrative-first and spatial-first.
- **User selects one.** Nothing is promoted to production until then.
- Then: promote to `@observer/ui`, rebuild the two production slices, re-review every surface.

### M3 — Remaining intelligence surfaces

**Blocked on M2.2.** A second surface built on a rejected visual system multiplies whatever is wrong
with it.

- Sales Flow: the stage ladder, conversion between rungs, time in stage, stalled opportunities.
- Project: segment interest, the attention index, the attention-versus-conversion matrix, the unit
  competition graph, demand and zero-result searches.
- People: contacts and unified timelines, agency and agent figures with sample-size protection,
  presentation coverage, follow-up delay, intent distribution.
- Period comparison across all of them, with the policy-version guard.

Still no database work. The physical schema follows the read models once every screen has settled.

---

## Later

| #       | Milestone                       | Contains                                                                                                                       |
| ------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **M3**  | Remaining intelligence surfaces | Project and Unit Intelligence, Meeting Intelligence, Behaviour Intelligence, period comparison                                 |
| **M4**  | Reports                         | Buyer meeting report and internal sales-intelligence report, real vector PDF                                                   |
| **M5**  | Full synthetic scenario set     | Every scenario in `docs/08-scenarios.md`, driving every screen state                                                           |
| **M6**  | Physical data layer             | Schema, migrations, row-level security, projections, reprojection — implementing the now-stable read models                    |
| **M7**  | Ingestion                       | Source-observation endpoint, adapters, OpenAPI, integration simulator                                                          |
| **M8**  | Event catalogues                | Per-source event vocabularies mapped onto the fact taxonomy; the Unreal instrumentation specification for Akhilesh             |
| **M9**  | MADSPACE administration         | Tenants, projects, branding, users, agencies, installations, integrations, unit import, feature flags, data health, activation |
| **M10** | CRM connectors                  | Canonical model with REALPAD, Monday and manual adapters                                                                       |
| **M11** | AI layer                        | MCP server over the metric registry, deterministic insight detectors, report composer, ask bar                                 |

The ordering rule: **anything that hardens a shape comes after the shape stops moving.** The database
follows the read models; the event catalogues follow the facts; the Unreal specification follows both.

---

## Superseded plan entries

The original plan had M2 as "Drizzle schema, migrations, RLS policies, projections, Supabase dev
project". That is now M6, and the Supabase project is not created until then. The original M1 also
included the ingest envelope, JSON Schema and OpenAPI; those moved to M7, because concrete event names
cannot be frozen before the fact taxonomy and the screens that consume it are settled (ADR-0013).
