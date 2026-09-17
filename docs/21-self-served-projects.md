# 21 — A project created in administration becomes a customer dashboard

**Status:** BUILT and proven on the local control plane, 2026-09-18 (`1ce436e` onwards). Applied to
no hosted database. Planned 2026-09-17 as phase 7 of "The road to install-and-connect" in
`docs/PROJECT-STATE.md`, whose 2026-09-18 section says what became of each package.

**The decisions, as taken.** D1 to D3 as recommended below, when the user said to continue in the
recommended order. **D4 was decided against the recommendation, by the user, on 2026-09-18: the
sales agent's name is visible on every showroom session, as a condition.** So names are kept in
administration now (`observer.project_agents`), a showroom reports its own on
`POST /functions/v1/observer-agents` (`PD-30`), and the privacy review sees them as a fact rather
than a proposal. D5: yes.

## 1. The target, and the one check that proves it

An administrator creates a project in MADSPACE administration. With no change to code or fixtures,
that project exists as a customer dashboard at its own address, shows only what its own sources
delivered, and says plainly what is not connected yet.

**The check.** On a clean local control plane: create a developer and a project with its currency,
locale and time zone; create a source, issue a code, activate, send one meeting through the real
ingest endpoint; grant the project to one account. That account signs in, finds the project in the
chooser, and Meetings shows the meeting under today's date. An account without the grant gets the
same "not available" sentence as for an address that does not exist. No figure on any page of that
project comes from the synthetic world.

## 2. What is true today

Established by three read-only surveys of the repository on 2026-09-17 and checked by hand where the
plan leans on it.

**The customer application resolves projects in one place, from constants.**

- `TENANTS`, `PROJECTS` and `VIEWERS` are frozen literals in `packages/synthetic/src/world.ts`
  (`:37`, `:69`, `:321`). Every page reaches them through three repository methods, `listTenants`,
  `listProjects` and `resolveProject` (`packages/synthetic/src/repository.ts:177-205`). No route,
  component or `SURFACES` entry names a project.
- Access is two array tests in that repository, against `viewer.tenantIds` and `viewer.projectIds`.
  The grant list is the `VIEWERS` constant, reached through `viewerForAccount`
  (`apps/web/src/lib/accounts.ts:279`), which has four call sites, all already asynchronous.
- A `ProjectSummary` needs `id`, `tenantId`, `slug`, `name`, `currency`, `locale`, `timeZone`,
  `connectedSources` and `sources` (`packages/readmodels/src/context.ts:76-96`).

**The control plane's project holds less than that, and nobody may view it.**

- `observer.projects` is `project_id`, `account_id`, `name`, a nullable `slug`, `status`
  (`supabase/migrations/20260902090000_observer_source_identity_spine.sql:83-114`). No currency,
  locale or time zone anywhere. No tenant table: `account_id` is opaque text by design (`:22-42`).
- The create form asks for a name and nothing else; the slug is derived silently
  (`apps/web/src/lib/madspace/create-actions.ts:164-173`).
- Administration operates as one constant account, `CONTROL_PLANE_ACCOUNT`, used 79 times in 21
  files. Its own comment says a second account needs a registry, a membership model and an audit of
  who switched to whom (`apps/web/src/lib/sources/control-plane.ts:31-45`).
- No grant, membership or invitation exists in any migration or package.
- The bridge between the two worlds is a name match against the fixtures, written four times:
  `readModelProjectIdFor` (`apps/web/src/lib/repository.ts:30-39`) and the twin lookups in
  `session-source.ts`, `catalogue-source.ts` and `deal-source.ts`. A fresh project matches nothing,
  so its events are stored and have no screen.
- Already there and reusable: catalogue and deals import from a file (`importCsvAction`,
  `importDealsCsvAction`), and `scopeFor` (`apps/web/src/lib/connectors/service.ts:160`), which
  already derives `prj_<uuid without hyphens>`, a valid and reversible `ProjectId`.

**A project with no synthetic world already exists, and most of the product is honest about it.**
`akhilesh-demo-source` has no building rule and no session dataset, and
`packages/synthetic/test/live-clock.test.ts` proves meetings, agents, the real clock and Ask on it.
Read models carry four absence states and a "not stated" vocabulary. The survey found the places
that would still lie for an empty project; they are work package 4.

**The local control plane re-applies every `202609*` migration on every start.** A later migration
cannot widen the return type of an existing function, because the older file's `create or replace`
would then fail on the next start. New behaviour needs new function names.

## 3. Decisions this needs from MADSPACE

| #   | Question                                               | Recommendation                                                                                                                                                                                                                                                                                                                        |
| --- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | What is a developer in the control plane               | A `tenants` table inside the one operating estate, now. An account per developer is the spine's long-term shape, and it means a registry, a switch audit and 79 call sites. The cost of waiting: projects cannot move between accounts (a trigger forbids it), so re-homing later is one audited migration. Pilots only until Gate 2. |
| D2  | Who sees a new project before real sign-in exists      | MADSPACE administrators always; anyone else by an explicit grant to an existing account. Invitations and real accounts arrive with Gate 2 and an identity provider, which is a separate decision.                                                                                                                                     |
| D3  | May a project's address change                         | No. Chosen at creation, shown before saving, immutable afterwards. An editable slug needs a redirect table for every link already sent.                                                                                                                                                                                               |
| D4  | Sales agents' names for the plugin's ids               | Keep showing the id until the privacy review (Gate 1) has seen it. Names of staff are personal data, and they would live in administration, never in events. **Overruled 2026-09-18: the name is shown on every session, a condition.** They still live in administration and never in events.                                        |
| D5  | Is "the building lights up from real meetings" in this | Yes. Without it a real project's flagship surface stays dark whatever the showroom sends.                                                                                                                                                                                                                                             |

## 4. The shape

- **Developer.** `observer.tenants`: id, account, name, a globally unique URL slug, status. Reserved
  words are refused: the top-level routes (`sign-in`, `projects`, `settings`, `madspace`,
  `design-lab`, `lab`, `iris`, `api`, `functions`, `brand`) in the database, the synthetic world's
  tenant slugs in the application, which is where that world lives.
- **Project settings.** Four nullable columns on `observer.projects`: `tenant_id`, `currency`
  (`^[A-Z]{3}$`), `locale`, `time_zone`. Columns and not a settings bag, because they are fixed,
  always needed and checkable. A project is complete when all four and the slug are set, and only a
  complete project reaches the customer side. No publish flag: until somebody is granted, nobody but
  administration sees it. `connector_configs.config.currency` stays what it is, a parsing fallback.
- **Grants.** `observer.project_viewers`: project, viewer account, who granted, when, and
  `revoked_at`. Revoking keeps the row. The session layer merges grants into the viewer once
  (`viewerForAccount`), so the repository keeps its single rule and ADR-0029's boundary does not
  move.
- **Identity.** `prj_<uuid hex>` and `tnt_<uuid hex>`, one helper and its inverse, replacing
  `scopeFor`'s private copy. The four name matches collapse into one function: a runtime project
  answers by id, a synthetic one by the match it has today.
- **The seam.** A `ProjectDirectory` source injected into the repository beside the session, deal and
  catalogue sources, composed in `apps/web/src/lib/repository.ts`. The synthetic world stays; the
  directory adds to it. `apps/web/test/surfaces.test.ts` keeps its three-file allowlist.
- **The clock.** A runtime project always runs on the real clock, with or without meetings. Today
  the real clock is tied to delivered sessions (`repository.ts:227-235`), which would put an empty
  new project in August 2026.
- **Facades.** Additive, new names only, `p_account` first, `security definer`, empty
  `search_path`, RLS enabled with no policy, execute to `service_role` alone.

## 5. Work packages, in order

Sizes are relative: S is a sitting, M is a few.

**1. Control plane (M).** One migration: the table, the columns, the grants, and
`observer_tenant_create`, `observer_tenants_for_account`, `observer_project_settings_set`,
`observer_project_directory`, `observer_project_viewer_grant`, `observer_project_viewer_revoke`,
`observer_project_viewers`, `observer_projects_for_viewer`. Tenant set once and only within the same
account. Port, both adapters, `FACADE_NAMES`, `ObserverAdmin` with validation (time zone and locale
are validated in the application with `Intl`, identically for both adapters). Tests: adapter suites,
a privileges and re-apply test like `supabase/test/events-for-project.test.ts`, the M10 readiness
recorder.

**2. Administration (M).** Developers: list and create. The project form asks for developer, name,
address (prefilled from the name, editable, collision said in words), currency, locale, time zone,
with no hidden default. The project page gains "Customer dashboard": a readiness list read from
persisted state (settings, activated, connected, ingestion verified, catalogue, CRM, first meeting),
the address once complete, and who can see it with grant and revoke. `docs/20` governs the look;
real screenshots, desktop and mobile.

**3. The directory seam and the grant merge (M).** The port, the repository's merged lookups
(`listTenants`, `listProjects`, `resolveProject`, `resolvePeriod`, `getAgentDetail`), the real clock
rule, the live adapter with the 30-second memo the other sources use and a `forget` for the
administration actions, the asynchronous `viewerForAccount`, and the single twin function. Tests
with an injected directory: resolves and lists; an ungranted and an unknown address read the same;
the synthetic world is unchanged; a runtime project's meetings are invisible from any other project.

**4. An empty project tells the truth (M).** From the survey:

- the building, the stack plan and the units page at no floors: an unavailable band that names the
  missing catalogue, no "0 flats, 0 available", no legend for an empty plan (`Building.tsx:102`,
  `units/page.tsx:150`, `StackPlan.tsx`);
- the home verdict at zero meetings, which today says "The showroom is running"
  (`views3.ts:1394`);
- the default agent comparison at zero meetings, which today falls back to two synthetic people
  (`project.ts:687`);
- `resolvePeriod`'s silent fall back to August for a project it does not know (`repository.ts:209`);
- synthetic people offered in a real project's meeting filter (`screens.ts:399`, `:821`, `:1027`);
- the data marker, which speaks for meetings alone and whose delivered wording calls the rest
  demonstration data (`layout.tsx:269`, `Absence.tsx:152`, `parts.tsx:50`). A runtime project gets
  neither.

Overview keeps its existing "No overview is composed for this project yet". The first-run state is
designed, not left as twelve quiet pages: what is connected, what is not, and whose move it is. One
sweeping test over every repository method for a blank runtime project, and the QA sweep over its
routes.

**5. The building lights up from real meetings (M).** `buildProjectPulse` zeroes attention for a
delivered catalogue and never reads delivered sessions (`packages/synthetic/src/pulse.ts:410-435`).
With both delivered, attention comes from unit views in the period joined on the unit code; with no
meetings delivered it is unavailable and not nought. Codes the showroom sent that the catalogue does
not list are reported in administration, which is also the diagnostic for the `unit_id` rule in the
handoff. Anything new is declared in the metric registry, then `pnpm matrix`.

**6. Names for the plugin's agent ids (S, waits for D4).** Built both ways after D4: an
administrator types a name on the project's dashboard screen, and a showroom reports its roster on
`observer-agents` so that nobody has to. An administrator's name is never overwritten by a report.

**7. The proof (S).** The lifecycle harness gains "create a fresh project", so the whole road runs
locally from an empty estate. A Playwright spec on the local control plane for the check in §1.

Order: 1, then 2 and 3 side by side, then 4, then 7. Package 5 needs only the twin function of 3.

## 6. Deliberately not in this phase

- Production authentication, invitations, e-mail, an identity provider: Gate 2.
- An account per developer, and an administration that switches estates: D1.
- A computed executive overview for projects without a hand-written one.
- Branding and feature flags, still without a specification.
- Buyer identity, contacts and briefs for real projects: ADR-0011 and Gate 1.
- WEBIRIS, which has no delivered counterpart at all.
- Anything hosted. The migration is a file until the operator applies it, after the ones already
  waiting.

## 7. Risks

- **A public Preview with demonstration accounts.** A runtime project there is readable by anyone
  who signs in as the administrator. Same answer as for activation: local or a closed deployment
  until Gate 2.
- **Two projects, one name.** Slugs are unique per account, tenant slugs globally. The name match
  that survives for synthetic twins must never claim a runtime project; the single twin function
  checks the id first.
- **Staleness.** A 30-second memo means a revoked grant can outlive itself by that long on another
  instance. Acceptable before Gate 2, stated in the code, removed with it.
- **Time zones.** PGlite and hosted Postgres may not agree on `pg_timezone_names`, so the database
  checks the shape only and the application decides validity.
