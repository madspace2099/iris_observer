# Roadmap

**Status:** current · **Last corrected:** 2026-08-24 (M1 closure amendment)

The development order is deliberately reversed. Observer defines what must be measured; the physical
database and the Unreal Engine module implement that specification afterwards, once the dashboard
requirements have stabilised.

---

## Done

| #      | Milestone                     | Outcome                                                                                                                                                                                   |
| ------ | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **M0** | Workspace foundation          | pnpm workspace, Next.js, strict TypeScript, ESLint, Prettier, CI, nine ADRs, first clean commit                                                                                           |
| **M1** | Product Intelligence Contract | Identity and journey contracts, observable-fact taxonomy, evidence discipline, pre-meeting brief, 64 metrics, requirement coverage, ingestion boundary, versioned policies, eighteen ADRs |

---

## Next

### M2 — UI Foundation and First Intelligence Slice

**No database work.** No Supabase project, no Drizzle migrations, no physical row-level security, no
production ingestion, no Unreal contracts. The physical database implements the approved read models
and the canonical-fact architecture _after_ the dashboard requirements stabilise — building it now
would freeze a schema against screens that do not exist yet.

**Foundation**

- Design tokens extracted from the MADSPACE Figma brand identity.
- Next.js application shell.
- Primary navigation, four items: **Overview · Sales Flow · Project · People**.
- Tenant, project and role context.
- MADSPACE administration kept out of customer navigation entirely.
- Typed Observer read-model interfaces, and repository **ports**.
- A deterministic synthetic repository behind those ports. **No React component imports fixture JSON.**
- Component foundations: chart, evidence link, AI summary, alert, metric card.
- Responsive large-screen behaviour, accessibility foundations, and the loading, empty, partial-data
  and error states for every one of them.

**Two vertical slices, at final quality — product screens, not wireframes**

1. **Executive Overview** — AI briefing, evidence links, important changes, actions.
2. **Sales-agent pre-meeting brief** for the synthetic Viktória journey.

**Tests**

Tenant and project switching in the synthetic repository · role-appropriate content · evidence-link
integrity · forbidden buyer-screen visibility · loading and missing-data states · accessibility smoke
checks · fixed-viewport visual smoke tests.

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
