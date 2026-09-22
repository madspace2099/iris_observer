# Project state

**Read this first in every session.** Then `.claude/skills/iris-observer-product/SKILL.md`, then
whatever it points at. Update this file at the end of every meaningful session.

**Last updated:** 2026-09-18 · **Branch:** `feature/observer-reference-parity`, **pushed to
`origin` through `cc26720` on 2026-09-18** · **PR #1 open. Not merged.** Latest: **phase 7 is built** (2026-09-18): a project created in MADSPACE administration
becomes a customer dashboard with no change to code or fixtures, shows only what its own sources
delivered, and names the presenter of every meeting, whom a showroom can now report itself
(`PD-30`). Before it, the 2026-09-17 afternoon run made ingested UE5 events reach the customer's
screens (ADR-0038). See the last section of this file.

---

## Where the project is

| Milestone                                    | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M0 Workspace foundation                      | ✅ accepted · `d73ba18`, `3214b51`                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| M1 Product Intelligence Contract             | ✅ accepted · `a30fcb8`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| M1 closure amendment                         | ✅ accepted · `b7d4869`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| M2 UI foundation and first slices            | ✅ **technically** accepted · `2bb84eb`                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| M2.1 Visual acceptance and model corrections | ✅ model, security and typography accepted · `50d0349`                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **M2.1 visual layer**                        | ❌ **rejected.** See `docs/12-visual-autopsy.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| M2.2 Visual reboot — concepts                | ✅ **the user proceeded on 2026-09-07** with the spatial direction as built (see below)                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **M2.3 Showroom Intelligence refocus**       | ✅ reviewed by the user on the Vercel Preview on 2026-09-07; one defect raised and fixed (segments)                                                                                                                                                                                                                                                                                                                                                                                                            |
| **Infrastructure checkpoint**                | ✅ **deployed and verified on the live URL**                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Production remediation, 19 sections          | ✅ built · `8b4d7c1` · **local only, never on `main`**                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Demo release candidate**                   | ✅ **on Preview from this branch** — `iris-observer-git-feature-observer-re-698f93-madspaces-projects.vercel.app`, demo accounts switched on by the user                                                                                                                                                                                                                                                                                                                                                       |
| M3 Remaining intelligence surfaces           | 🟡 **frontend review-ready 2026-09-07 night** — time in stage and the stalled list on the ladder, the attention × conversion matrix, the competition bars, the policy-version guard; contacts/unified timeline and intent distribution are not built (see the overnight section)                                                                                                                                                                                                                               |
| M6 Physical data layer                       | 🟡 partial — source spine, event store, credentials, **catalogue and connectors** (`7226e07`); no domain tables for meetings, contacts, deals                                                                                                                                                                                                                                                                                                                                                                  |
| M7 Ingestion                                 | 🟡 partial — activation, heartbeat, ingest endpoints live and proven; **since 2026-09-17 ingested events fold into the sessions every surface reads (ADR-0038), proven live on the local control plane**; no simulator package, no CRM/WEBIRIS adapters into `SourceObservation`                                                                                                                                                                                                                               |
| M8 Event catalogues                          | ⛔ not started — `EventRegistry` is null; the UE5 spec is a candidate (ADR-0032)                                                                                                                                                                                                                                                                                                                                                                                                                               |
| M9 MADSPACE administration                   | 🟡 partial — projects, installations, activation, diagnostics, **integrations** (`7226e07`), **directory** (tenants, agencies, people from the demonstration directory, `c85f469`); **since 2026-09-18 developers, a project's address and settings, viewer grants and presenter names are real control-plane records with their own screen** (`docs/21-self-served-projects.md`); no user or agency tables, no branding, no flags                                                                             |
| **M10 CRM connectors**                       | 🟡 **READY FOR PREVIEW ACCEPTANCE** (`4d6fcfb`, ADR-0036) — every adapter built, the REALPAD deals adapter included (`644a79b`); the whole path accepted on the local control plane by `e2e/m10-acceptance.spec.ts` (8 of 8, target `local-pglite`); the two migrations executed on the whole chain (`e580f64`); **nothing on the Preview**: three secrets, two migrations and a push are the operator's, then the same suite with `OBSERVER_ACCEPTANCE_TARGET=preview`. The matrix is at the end of this file |

## Cloud resources — do not ask for these again

Full runbook in `docs/18-deployment.md`. No secret value is recorded anywhere in this repository.

|                  |                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub           | `madspace2099/iris_observer` — public, branch `main`, pushed                                                                                                                                                                                                                                                                                                                                                                                  |
| Supabase preview | **`IRIS OBSERVER`, ref `tfcchobwobpadenampyh`, `eu-west-1`, `ACTIVE_HEALTHY`, €0/mo** — the project the Preview actually reaches                                                                                                                                                                                                                                                                                                              |
| Supabase unused  | `iris-observer-staging`, ref `jtvqecusxzogqubxpoyf` — provisioned first, holds the same migrations, never reached by the Preview. Left alone.                                                                                                                                                                                                                                                                                                 |
| Supabase legacy  | `vrhrzlvhyxrkxxcjxmaf` — the obsolete MVP project. Left alone, never reused.                                                                                                                                                                                                                                                                                                                                                                  |
| Vercel team      | `madspace's projects` (`team_DcZjnqXKYp579zibvXU3UiNE`), **hobby** plan                                                                                                                                                                                                                                                                                                                                                                       |
| Vercel project   | `iris-observer` (`prj_4pqpmpB8VwLbq06V1TTd3zTWp15p`), root `apps/web`, region `fra1`                                                                                                                                                                                                                                                                                                                                                          |
| **Live URL**     | **https://iris-observer.vercel.app** — serving `3515402`, two milestones behind                                                                                                                                                                                                                                                                                                                                                               |
| **Preview URL**  | **https://iris-observer-git-feature-observer-re-698f93-madspaces-projects.vercel.app** — the branch alias for `feature/observer-reference-parity`; it follows every push. The older `release/observer-demo-rc1` alias still exists.                                                                                                                                                                                                           |
| Vercel variables | `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, and since 2026-09-07 `OBSERVER_DEMO_ACCOUNTS=1` (Preview, set by the user) — reaching Preview builds. The Supabase pair is supplied by the Supabase–Vercel integration, which is why hand-set values never took. **Not set anywhere yet:** `OBSERVER_CREDENTIAL_KEY` (needed before a CRM credential can be stored) and `CRON_SECRET` (needed before the daily catalogue sync runs). |

**One thing to know.** The deployment landed on **Production**, not Preview: `create_git_project`
deploys from the linked repository's production branch, and `main` is it. That was not the intent and
is recorded rather than glossed over. It is harmless in this state — synthetic data, `noindex`, the
staging badge on every screen, a sign-in that states it is not authentication — and nothing was
deleted to undo it. Push any non-`main` branch to get a genuine Preview.

## The release blocker, and how it closed

**`SUPABASE_URL` on the Vercel Preview pointed at a Supabase project that was not in this
account.** The deployment's own log named it: `PostgREST at tfcchobwobpadenampyh.supabase.co
matched no such function`. Five rounds of diagnosis went into establishing that — 406 from an
unexposed schema, 404 from the wrong project, 401 from an unrecognised key, `PGRST202` from a
role that could not match the function, and finally `observer_whoami()` answering 200 to one
caller and 404 to another, which is only possible against two different PostgREST instances.
The fault was the host, never the key.

It came from the Supabase–Vercel integration, which injects `SUPABASE_URL` for whichever
project _it_ is linked to and overrides hand-set values on every sync.

**Resolved on 2026-08-25 by moving the schema rather than the variable.** `tfcchobwobpadenampyh`
(`IRIS OBSERVER`, eu-west-1) is now the official Preview database. The four migrations were
applied there through the SQL Editor — each part verified byte-identical to its source file
first, because the Supabase MCP tools are write-blocked from this session. The Supabase CLI has
no record of them; see `supabase/README.md` for the `migration repair` reconciliation.

Verified afterwards on the deployment itself, not by SQL alone: the shared counters move
(`project/day` climbing, `session/minute` reaching its ceiling of 10 under a burst) and the
audit records rows. Both are only reachable through PostgREST with the server-side secret
key, so their movement is proof the real transport works.

## What that verification then found

Two defects in the audit, neither visible from the code alone.

**It could not say who wrote the answer.** `answered · gpt-5.6-sol` was recorded whether a
model had written a word or the deterministic composer had — while the screen said "written
by the tools" for the same request. Migration `20260825205000` adds `response_source`
(`model` · `deterministic_composer` · `refusal` · `failure`), a nullable `author_model`, a
separate `attempted_model`, and a `fallback_reason` code. `model_authored` is derived from the
same `live` flag the answer sheet renders, and a test asserts they agree on every branch.

**It lost requests: 153 admitted, 133 recorded.** The write was fired and forgotten after the
response, and a serverless instance may freeze once it has responded. Awaiting it would only
have narrowed the window, so the invariant is structural: the row is inserted inside the same
transaction that consumes the quota. A request interrupted before its terminal result stays
visible as `started` rather than vanishing.

A refused request has no audit row and should not — the ceiling declines before any work — so
an admitted-request count and an audit-row count are the same number, which is what makes
reconciling them meaningful.

The `observer_whoami` diagnostic is revoked from the browser roles. The two superseded façades
are **kept** during the expand phase and dropped by a separate contract migration — Vercel keeps
every build reachable at its own URL, and twelve Preview deployments of this branch were READY
and still calling them by name. See [ADR-0028](adr/0028-demo-release-candidate.md) and
[supabase/README.md](../supabase/README.md) for the audit contract.

An independent review of the first draft found four release blockers, all fixed before any
Supabase write: it would have dropped façades a live deployment still calls; it would have
relabelled every historical row as an interrupted request with authorship `false`; admission
consumed quota _before_ its conflict clause, so a retry spent a second unit of the daily budget
and left one row; and completion rewrote an already-completed record, timestamp included.

## The correction that reshaped the product

**ADR-0023: IRIS Showroom is the primary observational source; the CRM is outcome
context.** 28 of 82 registry metrics were computable entirely from CRM data, and those
metrics led the product — which made Observer a second CRM with better typography. The
audit of the legacy dashboard (`docs/16-showroom-intelligence-audit.md`) found the same
mistake there: three of ten headline cards were CRM figures reading zero, above a
conversion funnel that had never held data.

The five primary surfaces are now Showroom, Presentation Intelligence, Unit Attention,
Storytelling and Meeting Replay. The conversion funnel left the navigation.

## What is true right now

- 82 metrics in the registry, **62 source requirements**, 0 uncovered, 0 open decisions, 1 review gate.
- **28 ADRs. 385 unit tests, 480 Playwright tests** across 1920×1080, 1440×900 and Pixel 7
  (65 skipped: the desktop-only concepts and the wide-only review sets), **zero axe violations
  on every showroom surface at every viewport**, production build green. The Playwright suite
  has been run against the Vercel Preview as well as locally.
- **Thirteen chart shapes**, all hand-drawn SVG, documented in `docs/17-showroom-intelligence.md`
  §5a. Sales Flow carries the summary window, the weekday×hour heatmap, the annotated trend, the
  stacked composition, the nested behaviour funnel and two ranked lists; Project carries the
  bullet chart against the sales plan and the stepped journey alluvial; Sales Agents carries one
  radar per presenter. Four correctness rules — funnels nest, ordered lists are never ordered by
  outcome, one figure has one value per page, a radar is a shape and not a score — are guarded by
  tests in `e2e/quality.spec.ts`, each because it was broken first.
- **Observer is the interface** (ADR-0025). The opening surface is a briefing: the orb, a
  first-person sentence, a prominent prompt and context-aware offers, above the fold at
  1920×1080, 1440×900 and on a phone. The orb is canvas-drawn, state-driven and has no
  runtime asset; its state mapping is asserted by the unit suite. A microphone appears only when
  the realtime layer can actually be reached; otherwise one reader-facing sentence says so, and
  the operator diagnosis behind it goes to the server log.
- **Ask Observer is live**, running the controlled tool architecture against OpenAI's Responses
  API with `store: false`. When the model cannot be reached the deterministic composer answers
  from the same tools, and `status.live` says which produced the prose — a claim that now
  describes the answer rather than the deployment. **No model-backed answer has been produced
  yet:** the configured key returns `401 invalid_api_key`. See the release blocker above.
- **A shared ceiling above the in-process limiter** (ADR-0028). Four ceilings consumed atomically
  from Postgres, the last of them the per-project daily budget that bounds the bill. Verified
  against the live database; not active on the Preview, which holds no Supabase variables.
- **Three synthetic projects with three separate datasets** — Northgate (CRM connected, two
  comparable periods), Riverside (no CRM, so every outcome rate renders as unavailable) and
  Kingsford (three weeks old, so no baseline exists). Northgate carries 16 sessions with no
  per-step timing, so the honest gap has to be rendered.
- Three laboratory routes exist and no production route has changed: `/lab/sign-in`,
  `/lab/overview-a`, `/lab/overview-b`. They are declared in `SURFACES` as MADSPACE-only.
- **Ingestion exists; production authentication does not.** Seventeen-plus-one migrations build
  the `observer` schema from source: the AI ceilings and audit, provider credentials, model budget,
  the source identity spine, activation codes and source credentials, the append-only
  `analytics_events` store, `source_operations`, and — since 2026-09-07 — connector configs,
  sealed connector credentials, the current catalogue, its append-only change log and every sync
  attempt. Three endpoints (`/functions/v1/observer-activate|heartbeat|ingest`) run as Next route
  handlers and are proven end to end against PGlite. `docs/ue5-ingestion-contract.md` still says
  "nothing here is implemented"; that header is stale.
- **Room segments follow the catalogue** (`800237a`). Project, the Overview pulse and the audience
  builder derive their segments from the distinct room counts the stock contains; nothing names a
  count by hand any more, and Ister Tower shows its one- and four-room flats.
- **The CRM connector layer exists and is not yet read by the product** (`7226e07`, ADR-0036).
  REALPAD, Lomnio, Monday and CSV adapters, one sync loop, a PostgREST/SQL port, the migration and
  the `/madspace/projects/[id]/integrations` screen are built and proven; the read models still
  take their catalogue from `packages/synthetic`. The seam that flips it is named in the next
  actions.
- The synthetic repository is the only data source behind `ObserverRepository`. It is the only
  implementation of the port.

## The decision the user took on 2026-09-07

**Proceed.** After reviewing the demo on the Preview URL the user directed development to continue
from M2.2/M3 through M10 without further review rounds ("mehet a fejlesztés egészen M10-ig"). The
Executive Overview question that had blocked M3 is closed by that instruction: the production
surfaces stand on the spatial direction with the narrative concept's verdict typography, exactly
as built and reviewed; the `/lab` concepts remain as record. The one product defect the review
raised — segments hard-coded to two-room and three-room — is fixed in `800237a`.

The commercial shape of the CRM work was set in the same brief: every client hands MADSPACE one
credential for their CRM; most use REALPAD, some Monday, at least one Lomnio. Their developer
portals were read the same day and the facts are in ADR-0036, which also lists what only the
client can answer (their orientation codes, their stage vocabulary) and what only REALPAD support
can (the `flat_type` table, the business-case Lifecycle values).

## Next recommended action

The order follows the dependency chain, not the milestone numbers.

1. **Make the connector layer real on the Preview.** Set `OBSERVER_CREDENTIAL_KEY` (64 hex),
   `CRON_SECRET` and, for deals, `OBSERVER_SUBJECT_PEPPER` (32+ bytes; Ask Observer already
   wants it) on the Vercel project (Preview scope), apply
   `supabase/migrations/20260907100000_observer_catalogue_and_connectors.sql` and then
   `supabase/migrations/20260907180000_observer_deals.sql` to `tfcchobwobpadenampyh` through the
   SQL Editor as the earlier ones were, add both to the `migration repair` list in
   `supabase/README.md`, and prove it from the integrations screen with a pricelist upload and a
   deals sheet — the same path this session proved on the local control plane. Every step is
   the operator's: a secret is generated in a password manager and pasted, never produced here.
   Before and after: `node scripts/preview-preflight.mjs <preview-url>` says, read-only, what
   can be seen from outside (today: the build serves `d9879e3` and the sync route is absent,
   so the push comes first), and
   `OBSERVER_M10_ACCEPTANCE=1 OBSERVER_ACCEPTANCE_TARGET=preview OBSERVER_BASE_URL=<preview-url> pnpm exec playwright test m10-acceptance --project desktop`
   proves the whole path on the Preview and writes its evidence with the target named.
   **The REALPAD deals adapter is built** (`644a79b`, `packages/connectors/src/realpad-deals.ts`):
   `list-excel-business-cases` for one project with `headermode=ids` and `xlsx=1`, Status 3 WON
   and 2 LOST fixed, Lifecycle ids through the stage table, no subject key because the export
   carries no email or phone. What it still needs from a client is one real export: the stable
   header ids are not published anywhere, so `pnpm connectors:realpad-inspect --file <export.xlsx>`
   (or `--project <id>` with the Data Takeout pair in the environment) prints them beside their
   labels, with the Status and Lifecycle vocabularies and nothing else, and a person types them
   into the REALPAD connector's Deal columns and Stage words.
2. ✅ **Done, rule lifted.** The product reads a synced catalogue through the `CatalogueSource`
   seam (composed in `apps/web/src/lib/repository.ts`, asked in `context()`): the connector's
   stock replaces the synthetic stock for the twin project, invented sessions never touch a
   delivered unit, and attention on delivered units is what they have earned — none, until
   ingestion delivers sessions. Since 2026-09-07 a unit the catalogue barely describes is drawn
   too: `floor`, `rooms`, `areaSqm`, `orientation` and `price` are nullable through `RawUnit`,
   `PulseUnit`, `UnitAttributes` and `UnitAttentionRow`; `placementOf` refuses a unit only for
   a status the surfaces have no word for and returns the rest as `gaps`; the words live in
   `@observer/readmodels` (`words.ts`: "Rooms not stated", "Floor not stated", "Area not
   stated", "Aspect not stated", "Not stated"); the Pulse gains a last "Floor not stated" row
   and a "Rooms not stated" segment (ADR-0036's own rule), the register a "Rooms not stated"
   filter choice and absent-last ordering, and the integrations screen counts the gaps ("7 of 8
   units drawn. Not drawn: 1 status unknown. Gaps: 2 no room count; 1 no floor; 1 no area").
   Proven on the local control plane with a sparse sheet through the real upload and the real
   Project, Units and unit pages: no `null`, `NaN` or empty cell anywhere. A unit type
   vocabulary (parking, cellar) is still absent, so a parking place with no room count sits in
   the unstated-rooms row; that is ADR-0036's open `flat_type` question, not a rendering gap.
3. 🟡 **Deals: delivered, stored and shown; the ladder is the piece left.** Since 2026-09-07
   the connectors carry the CRM's deals the way they carry the catalogue: `CrmDeal` in
   `@observer/contracts` (`deals.ts`: stage mapped by the tenant's table to the seven canonical
   stages or carried raw as null; the buyer a keyed hash of email, else phone, under
   `OBSERVER_SUBJECT_PEPPER`, never the value), `diffDeals` into `opened` / `stage_changed` /
   `withdrawn` facts whose id is SHA-256 over scope, deal, kind, word and time; adapters for
   Lomnio `/v1/leads`, a Monday deals board and a deals sheet (`packages/connectors/src/deals.ts`);
   migration `20260907180000_observer_deals.sql` (`deals_current`, append-only
   `deal_stage_changes` keyed by event id, `deal_syncs`; executed on PGlite, applied nowhere); the
   service's `syncDeals` / `importDealsCsv` / `dealSummary` / `recentDealChanges` /
   `currentDeals`; the daily cron syncs deals after the catalogue for Lomnio and Monday; and on
   the integrations screen a "Stage words" table per connector, a deals board id and deal columns
   for Monday, deal columns and a "Deals sheet" upload for the spreadsheet, a "Deals" row per
   plane and a "Recent stage changes" table. Proven on the local control plane: a deals sheet
   read as "4 opened" with one unmapped word and one rejected row, the same sheet again as
   "0 opened, 0 changed stage, 0 withdrawn", a second sheet as "1 opened, 2 changed stage,
   1 withdrawn", and no email, phone or subject key in the HTML or the console. REALPAD's
   business cases arrive as an Excel export through Data Takeout and are read the same way
   since `644a79b`, by header ids a person reads off one real export (see action 1).
   ✅ **And into the ladder.** `DealSource` sits beside `CatalogueSource` in
   `@observer/readmodels` (`deal-source.ts`), the repository asks it in `context()`, and
   `SalesFlowView.ladder` is built from where each delivered deal stands (`packages/synthetic/src/deals.ts`:
   a rung counts the deals at that stage or further along, every rung `verified` because the CRM
   stated it, unmapped words and lost deals counted beside the ladder) or says the CRM is not
   connected; `FlowLadder`, written and mounted nowhere since M3's inventory, is mounted on
   Sales Flow and composed with `liveDealSource` in `apps/web/src/lib/repository.ts`. Proven on
   the local control plane: with the spreadsheet enabled, `/alpha/ister-tower/flow` drew Lead 4,
   Meeting 4, Negotiation 3, Offer 3, Reservation 1, Purchase 0 of 4 deals with the note; with
   it disabled, the sentence and no rung.
4. ✅ **M3's frontend, mostly done on the night of 2026-09-07** (see the overnight section):
   `FlowLadder` mounted with time in stage and the stalled list; the attention × conversion
   matrix on Project; the competition bars on a unit; the policy-version guard on every
   comparison; the internal report and the meeting summary as pages (M4's frontend). Still not
   built, and why: contacts and the unified timeline (identity stays on the meeting surface by
   construction — `VisitorLabel` carries no contact, `docs/05-identity.md` §5 lists the drill-down
   as not built, and the timeline needs CRM and WEBIRIS joins from M6/M7); intent distribution (no
   derivation of `IntentLevel` exists in the contracts or the synthetic world, and inventing one
   would be a lead-temperature score ADR-0021 forbids on the ladder).
5. **M4, M5, M8** in that order: a report generator behind the orphaned `ExportReport`; a scenario
   registry that replays facts through the ingest API (ADR-0007 is breached by the seeded
   generator); the per-source event vocabularies that `EventRegistry` is waiting for.
6. **Push** to update the demo. Twenty-three commits since the last push are local; the user's
   word is needed before `origin` moves.

---

## Accepted decisions

Recorded in full in `docs/adr/`. The ones that constrain daily work:

| Decision                                                       | Where                      |
| -------------------------------------------------------------- | -------------------------- |
| Append-only events; the client never aggregates                | ADR-0001                   |
| No mock data layer; synthetic scenarios travel the real path   | ADR-0007                   |
| The metric registry is the single source of truth              | ADR-0006                   |
| Facts are defined before wire event names                      | ADR-0013                   |
| Observer produces no causal claims                             | ADR-0010                   |
| Attribution is a versioned, MADSPACE-owned policy              | ADR-0014                   |
| Source observations are the ingestion boundary                 | ADR-0015                   |
| Meaningful dwell is derived at query time                      | ADR-0016                   |
| Observer owns the canonical meeting identifier                 | ADR-0017                   |
| The internal brief is never buyer-visible                      | ADR-0018                   |
| Role-aware default home screens, no free customisation         | ADR-0019                   |
| Manrope self-hosted                                            | ADR-0020                   |
| Lead temperature is a signal, not a deal stage                 | ADR-0021                   |
| The session adapter is a scenario selector, not authentication | ADR-0022                   |
| **IRIS Spatial Intelligence is the visual system**             | `docs/14-design-system.md` |
| **The showroom is the subject; the CRM is context**            | ADR-0023                   |
| The model runs through fal.ai's OpenRouter route               | ADR-0024                   |

## Unresolved decisions

| Question                                                                      | Blocks                                                                                    | Owner                                                        |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Narrative-first or spatial-first Executive Overview                           | the visual rollout                                                                        | **the user, now**                                            |
| Whether the assistant is named AI-RIS in Observer too                         | Ask Observer's greeting and voice                                                         | MADSPACE                                                     |
| ~~Does REALPAD expose a usable API~~ — **yes; verified 2026-09-07, ADR-0036** | the CRM connector milestone                                                               | resolved                                                     |
| REALPAD `flat_type` table (unit type vocabulary)                              | a parking place sits in "Rooms not stated" until a type word exists; not an M10 condition | MADSPACE — a support request                                 |
| REALPAD `headermode=ids` header strings and Lifecycle ids                     | typing the REALPAD deal columns and stage words; the adapter is built                     | one real export, read with `pnpm connectors:realpad-inspect` |
| Interior platform — can it post back                                          | interior dwell in deep-dive metrics                                                       | MADSPACE                                                     |
| WEBIRIS stable visitor identifier and cookie lifetime                         | deterministic back-linking                                                                | MADSPACE                                                     |
| Which system mints the booking                                                | `meeting_id` ownership in practice                                                        | MADSPACE                                                     |
| Seats per project or per installation                                         | the entitlement model                                                                     | MADSPACE                                                     |

## Review gates before production

`docs/11-preproduction-gates.md` — privacy and legal review, production authentication, device
credentials, data processing agreement.

---

## Visual review history

| Date       | Surface                                                                     | Outcome                                                                                                                                                                                                                                                     |
| ---------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-24 | M2.1, 7 surfaces × 3 viewports                                              | **Rejected.** Generic dark SaaS; no spatial intelligence; no IRIS language; AI is a decorative card; MADSPACE admin shipped 86% empty and unreviewed. `docs/12-visual-autopsy.md`                                                                           |
| 2026-08-24 | Figma inspection                                                            | `4:20`, `7843:300`, `7813:1334`, `4:25` inspected; `3:16` empty. Matrix in `docs/13-figma-adoption-matrix.md`                                                                                                                                               |
| 2026-08-24 | Welcome browser `6964:245`, splash `6620:1840`, AI-RIS greeting `6872:3494` | Adopted. Corrected the "nothing is a card" rule — IRIS uses cards for image-led collection browsing, never for analytical content. Matrix §5                                                                                                                |
| 2026-08-24 | Laboratory, 3 routes × 2 desktop viewports, repose and interaction          | **11 defects found by looking and fixed**, including an invented profile that had no viewer behind it. Listed in `docs/15-visual-concepts.md` §4                                                                                                            |
| 2026-08-24 | Legacy IRIS Analytics Dashboard, 2 captures                                 | Read-only audit; both PDFs are pure raster, so the embedded images were extracted and read. 31 measurements inventoried. `docs/16-showroom-intelligence-audit.md`                                                                                           |
| 2026-08-24 | Showroom surfaces, 5 routes × 3 viewports                                   | 14 defects found by looking and fixed: overlapping headers, a hatched overlay nobody could read, "−0%", "+1,100%" from a base of one, a mobile top bar running off the screen, a command rail floating mid-page.                                            |
| 2026-08-24 | Bug-fixing sweep                                                            | The answer sheet covered the rail that opened it; `aria-pressed` on links, which axe rejects and a screen reader would misannounce; 1.1:1 contrast on a selected chip's count; a random "Suggest" button; a `38vw` answer sheet that is 156px on a handset. |
| 2026-08-24 | **User review of the unit list**                                            | Rejected as overwhelming. Rebuilt: 12 rows instead of 48, six columns instead of eight, no abbreviations, an icon and an info control on every measurement explaining what it measures, how, from where, and what it does not say.                          |

## Where the artefacts are

Review screenshots and Figma renders live outside the repository, under the session scratchpad:

```
…/scratchpad/showroom   Showroom Intelligence review set, 3 viewports
…/scratchpad/dashimg    legacy dashboard rasters, extracted from the supplied PDFs
…/scratchpad/review    42 rejected M2.1 screenshots
…/scratchpad/figma     Figma renders inspected for the adoption matrix
…/scratchpad/lab       concept screenshots
…/scratchpad/fig       extracted .fig archives (HORIZONTAL MENU, BASIC SCREEN HERE, IRIS FIGMA BOT)
```

The scratchpad root is recorded in `e2e/review-screenshots.spec.ts` and can be overridden with
`OBSERVER_SHOTS`. Screenshots are never committed — there is no visual-baseline policy yet.

---

## MADSPACE admin on the client-portal design system

**2026-09-03.** Branch `feature/observer-reference-parity`. PR #1 open, not merged.

The reviewer read the operations screenshots and gave two notes: there is a great deal of
superfluous description, which could go behind an information button beside the big titles, and
here is the MADSPACE client portal's design system, rework the pages onto it.

The specification, extracted from the PDF plus the decisions taken in adopting it, is
`docs/20-madspace-admin-design-system.md`. Read that before touching a `/madspace` screen.

### What changed

|               |                                                                                                                                        |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Ground        | Graphite dark to warm paper, through a token swap on `.mad-portal`. Observer stays dark; the boundary is one class.                    |
| Type          | Inter with tabular figures on `/madspace`; Manrope everywhere else.                                                                    |
| Prose         | 94 sentences behind an `InfoNote`, 20 deleted, 38 dashes rewritten. The screens lead with the state, the party waited on and the date. |
| States        | `StatusMark` gives six states six shapes. `StatusChip` has no prop to drop its word. One verdict-to-mark table, beside `HEALTH_LABEL`. |
| Absent values | Words matched to the field: Not set, None scheduled, Never, No delay, Not readable. Never a dash, never a zero.                        |
| Numbers       | Pinned `Intl` formatters, so one count does not print two ways on one row.                                                             |

### Defects the pass found, which were not design

- The header asserted "Hosted control plane" for any process that merely was not local, including
  one with no control plane at all. `runningLocally()` reads the environment; it never asked
  whether a database answered.
- A project with any non-active status was told it was "Archived" and that the decision was
  terminal. A suspended project was being told something untrue about something reversible.
- The head tally set `data-missing` on a class with no rule behind it, so "Not reported" rendered
  at the full weight of a real count in the largest type on the page.
- An unparseable timestamp fell into the same branch as an empty column and claimed "Never".
- Two screens each declared their own verdict-to-mark table and disagreed about three of seven, so
  one installation wore two shapes depending on which screen you opened.

### Verification

`pnpm test`: 94 files, 2981 passed, 1 skipped, 0 failed. Typecheck, lint and `format:check` clean.
`apps/web/test/madspace-design-system.test.ts` holds 13 of the system's literal rules and says in
its own docblock why it does not attempt the rest.

Screenshots: 46 images, six screens at 1920 / 1440 / 412 plus the five-state lifecycle record at
1440, under `…/scratchpad/madspace`. The lifecycle record is only truthful on a fresh estate, and
the spec asserts that precondition rather than assuming it.

### Next recommended action

**The user reviews the screenshots.** Everything below is held until they do.

Three things are worth their opinion rather than another pass:

1. The scope band is on every `/madspace` screen, stating the account and which control plane
   answered. It is correct by the specification and it is heavy. The alternative is the header
   chip it replaced, which disappeared below 768px and took the fact with it.
2. Source detail's head carries project, environment and lifecycle on the right. If those belong
   in the strip below the title instead, it is a small change.
3. The `i` sits beside a title only where something needed explaining, so some headings have none.
   The reviewer asked for it beside "the big titles"; this reads it as "wherever there is doctrine
   to move", which is not quite the same request.

---

## Impeccable frontend hardening — shell, Project, Meetings, Attention

**2026-09-06.** Branch `feature/observer-reference-parity`, still not merged; ten commits, none
pushed to `origin` yet. A sequence of narrowly-scoped `/impeccable` passes, each measured on the
real authenticated route before any source change, never from source reading alone.

### What changed

| Commit    | Surface                     | Defect measured, then fixed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `c396fbb` | Shared mobile shell         | The open mobile menu leaked both keyboard focus (36 elements reachable outside it, including the Ask dock) and pointer clicks (the backdrop's inherited `pointer-events`) to the page underneath. One `inert`-toggling effect fixes both; 7 new real-path tests in `e2e/mobile-menu-containment.spec.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `cf2373c` | Project · journey chart     | Edge labels clipped at every width ("esented"/"Progres"); the chart under-scaled at 768px; no cue or focus when it scrolled. Anchor-aware label positions, a container query keyed on the chart's own column width, and a `FlowScroller` client component that sets `tabindex`/`data-overflow` only when genuinely scrollable.                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `aa531b9` | Project · place bars        | Two of six place names clipped, with the wrong recovery title. Reused the existing `data-wide-labels` pattern already used elsewhere on the same page.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `5deda1f` | Project · demand matrix     | Mobile rows repeated the unit-code-carries-no-legend precedent incorrectly, bloating row height. Matched the established `data-columns="6"` treatment.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `2a79fcc` | Project · findings          | A colored `border-left` rail — DESIGN.md's own named anti-pattern — plus a genuine bug: `.iris-action` rendering in the wrong (mono) typeface inside findings. Opt-in `plane` prop on `Finding`, scoped so Flow/Agents/Presentation/Audience (which share the component) render unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `323f816` | Project · plan bullet chart | The target mark (`.iris-bullet-track u`) sat at `left: 100%` inside an `overflow: hidden` track — structurally zero visible pixels, on every row, at every width. Clamped both marks inside the track's own edges before centering.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `e8ef905` | Project · places caption    | "Sized by total time" — measured: `--w` only ever feeds a `color-mix` tint, never a dimension. Same mechanism as the Heatmap two sections over, which correctly says "luminance," never "size." Copy corrected to "Ordered by total time" (the list is already time-sorted); no i18n system exists anywhere in this repo's source, so this is a plain literal edit like the rest of the page.                                                                                                                                                                                                                                                                                                                                                          |
| `2b665be` | Meetings · register         | The "Units opened" column measured 122px against 62px-wide code chips at 1280px — one code per line, rows up to 163px tall, 11750px of document height for 82 rows. An opt-in `DataColumn.className` (purely additive to the shared `DataTable`) widens only this column; 27.8% shorter document at 1280px, byte-identical elsewhere.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `2debee8` | Shared `DataTable` caption  | At ≤48rem, `.ox-table`'s stacked-record rule sets `display: block` on the table/rows/cells but never on `caption`, which kept the UA default `table-caption` — orphaned outside any real table formatting context, it shrink-wrapped to ~95–125px and wrapped one to two words per line (23 lines / 480px tall on Attention). Reproduced on both Meetings and Attention before fixing; one line added to the existing selector list fixes both, and every other live `DataTable` consumer (Units, Units detail, Sales Agents ×2, Unit Attention) verified unharmed.                                                                                                                                                                                    |
| `4bf748a` | Attention · severity alerts | `info` and `attention` severities differed in exactly one CSS property (the rail color) and nothing else; `info`'s border measured 2.60:1 against its real composited background, under WCAG 1.4.11's 3:1 floor. Moved `info` onto `--ox-ink-4` (6.17:1, the token this system already uses as "the floor of legible ink") and gave the rail a second channel by reusing `.ox-chip-mark`'s own shape-drawing rules verbatim (no new icon, color, or pattern), plus an `.ox-sr` label so a screen reader gets the same word. `.ox-alert` is independently rendered by two files (`StateList.tsx`, and the shared `Attention.tsx` also used by Units' `DemandAttention`); both got the identical edit, and the untouched consumer was verified unharmed. |

An `/impeccable audit` pass on Attention (between the last two rows above) is not itself a commit
— it measured the whole view, found the caption bug (which turned out to be shared, not
Attention-specific) and the severity-contrast gap, and deliberately changed nothing else on that
view: the "planes not boxes" surface discipline, the evidence/provenance separation, and the
`Unavailable`-never-a-zero band above the register were all measured and found already correct.

### Verification

Every commit: format, targeted typecheck, targeted lint clean. Real rendered measurement (not
source inference) at the repository's four standard widths (393/768/1280/1920) before and after
each change, with an explicit before/after table in the session's own report for each. axe scoped
to the changed region: zero violations, every commit, every width, before and after. Real keyboard
walks (actual `activeElement` and computed `outline`, not assumed) confirmed correct tab order and
visible focus throughout Project, Meetings and Attention.

`layout-integrity.spec.ts`'s shared "no surface clips its own text or widens the page" check: 6–7
of 7 widths pass after every commit in this run. The one recurring failure
(`showroom`/`.irs-who-name` clipping at 1280px) was proven pre-existing against the exact
pre-milestone baseline commit (`28954f6`) in an isolated worktree earlier in this work, before any
change in this table — not introduced by, or related to, anything in this list.

A separate, unrelated pre-existing bug was found and reported but **not fixed** (out of scope for
a single-view pass): `observer-product.spec.ts`'s shared `open()` helper resolves
`getByText(shot.proof).first()` to a hidden mobile-nav duplicate rather than the visible page
heading whenever a screen's name coincides with a Project sub-tab label (`05 unit-demand`,
`07 meetings`, `09 feature-usage` all fail identically). Fixing it means editing shared test
infrastructure, not any of the views above.

### The two Vercel/OpenAI action items above

Done directly in the dashboards the same day — see the "Next recommended action" section above
for exactly what was checked and what was deliberately left to the user (revoking the old key;
confirming Ask IRIS actually answers with the new one).

### Remaining debt, not yet a task

- `.ox-segmented` (the Two-room/Three-room style tabs on Project, Presentation and Audience) has
  no ARIA-APG arrow-key navigation between tabs. Tab+Enter fully works and axe does not flag it;
  real but minor, and shared verbatim across three pages, so any fix needs to cover all three
  together.
- The dead-space question raised by an earlier audit (single-column analytical modules on
  Project not filling the wide content plane at 1920px) was re-measured and deliberately left
  alone: the bars are already fully legible at their current width, and no documented
  reading-measure rule in DESIGN.md governs bar-chart width specifically — widening them would be
  filling space for its own sake, which the doctrine itself warns against.
- `observer-product.spec.ts`'s `open()` helper text-collision bug, above.

### Next recommended action

Superseded by the 2026-09-07 section below; the user's decision that day unblocked the roadmap.

---

## The demo, the CRM verification and the connector layer — 2026-09-07

Branch `feature/observer-reference-parity`. Commits, oldest first: `d9879e3` (Sales Flow verdict
on closed periods, flag/finding sample sizes — pushed), `c0c7496` (formatting and lint gates
restored), `800237a` (room segments derived from the catalogue), `7226e07` (ADR-0036, contracts,
connectors, migration, integrations screen), and this document.

### The demo

The user asked for the demo online. The monorepo is too large for Vercel's file upload, so the
branch was pushed (with the user's explicit yes) and the already-linked `iris-observer` Vercel
project built it: `iris-observer-git-feature-observer-re-698f93-madspaces-projects.vercel.app`.
The deployed server had no account directory until the user set `OBSERVER_DEMO_ACCOUNTS=1` in the
Vercel dashboard and redeployed from the branch's own row — not the top-level Redeploy, which
targets `main`. The repository is public on GitHub and was handed to Akhilesh, who is building the
Unreal Engine and Supabase side that will connect to the online Observer.

### The CRM facts, in one paragraph

REALPAD: `POST https://cms.realpad.eu/ws/v10/{endpoint}`, form-encoded, `login`+`password` per
project and use case, XML catalogue via `get-project` with `flat_disposition` (`2+kk`),
`flat_status` (0–5), `flat_type` (1–36/99, table unpublished), no per-flat timestamp, hourly fetch
recommended; deals and customers only as Excel via Data Takeout under a five-minute cooldown; no
push; token/OAuth/push/REST on their roadmap without a date. Lomnio: `app.lomnio.com/api/v1`,
bearer token per project with scopes, JSON units with `room_count` and `layout_type`, Laravel
pagination, HMAC-signed webhooks. Monday: GraphQL `items_page`, personal or app token, columns are
per-client configuration. Full detail with sources: ADR-0036.

### What was built and how it was proven

- `packages/contracts/src/catalogue.ts` — the canonical unit, snapshot and change; `parseDisposition`;
  `diffCatalogue`. 10 tests.
- `packages/connectors/` — REALPAD, Lomnio (plus webhook verification), Monday and CSV adapters over
  an injected `Http`; `runCatalogueSync`; `CatalogueDb` with `sqlCatalogueDb` and
  `postgrestCatalogueDb` calling the same nine façades. 42 tests, no network anywhere.
- `supabase/migrations/20260907100000_…` — five tables under the ingestion owner, nine definer
  façades, RLS on with no policy. 12 tests on PGlite, including grants asked of PostgreSQL. Found by
  executing: a separate owner role with a SELECT grant saw `projects` and none of its rows, because
  RLS with no policy shows a table only to its owner.
- `apps/web/src/lib/connectors/` — the service (seal on save, open on sync, four characters on the
  screen), the live wiring, the config and credential schemas. 7 tests against a fake CRM and an
  in-memory port.
- `/madspace/projects/[id]/integrations` — four planes on the client-portal design system, state
  first; `Sync now`; `Forget credential`; a CSV upload that lists refused rows by line; the recent
  change register. Proven on the local control plane: a Hungarian sheet with five units and one
  bad row read as "5 added", "Row 6: no unit code", `Synced · 5 units`.
- `/api/observer/connectors/sync` (GET, `CRON_SECRET`, `0 6 * * *` in `apps/web/vercel.json` — the
  hobby plan allows daily) and `/api/observer/connectors/lomnio/[projectId]` (POST, HMAC verified,
  schedules the pull with `after()`).
- `.env.example` documents `OBSERVER_CREDENTIAL_KEY`, `OBSERVER_CREDENTIAL_KEY_VERSION` and
  `CRON_SECRET`, which it had not.

Every commit: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, the suites the change touched,
and a production build. **What the full gate actually said, found at the end of the day:** every
whole-suite run had been read through `pnpm test 2>&1 | tail -8`, and a pipe's exit status is the
tail's, so the step reported green while four tests failed underneath — the release reporter's
list of PGlite-booting suites (`scripts/release/vitest-runner-reporter.ts`) did not name the new
catalogue suite, and the three packager suites refuse any tree that is not clean, which another
session's `.impeccable/` residue and a build-rewritten `next-env.d.ts` had made it. Both are fixed
in the commit after `48417c3`: the suite is registered and `.impeccable/` is gitignored. The
whole suite re-run with its own exit status then showed one more: the secret-audit history test
(`supabase/test/no-secret-recipes.test.ts`) timed out at 31 seconds against the 30-second default,
because the auditor walks 835 files, the browser bundle and 236 branch commits while the packager
suites share the machine (16 seconds idle). Standalone the auditor is clean; the test now carries
an explicit 120-second budget so a slow machine cannot read as a finding. `pnpm lint`, read the
same way, had been hiding one error of its own: a literal no-break space inside a regex class in
`packages/connectors/src/shared.ts` (`no-irregular-whitespace`); `\s` already matches it, so the
class collapsed to `\s` and the NBSP case in `packages/connectors/test/shared.test.ts` still
passes (`2c326d5`).

With both fixed, the whole suite still exited 1: every test passed and Vitest reported one
unhandled error, `[vitest-worker]: Timeout calling "onTaskUpdate"`. `vitest.config.ts` had
attributed that error to a parent starved by machine load, but a memory sampler showed free RAM
never below 1.2 GB across two runs, and the error then reproduced with one file, one worker and
nothing else running: a 65-second `Atomics.wait` in a `beforeAll`, and again in a test body. The
deadline is birpc's sixty seconds on the worker's side; the parent answers at once, a worker
blocked in synchronous work cannot read the answer, and on resuming Node runs the expired timer
before the I/O carrying the reply. The one synchronous stretch over sixty seconds was
`package-generation.test.ts` building twice back to back in one hook; a 100 ms pause between the
builds lets the reply land (`72f1f83`). The whole suite then exited 0 on the clean tree: 112
files, 3249 passed, 1 skipped, no errors, 204 seconds, free RAM never below 1.7 GB. The lesson
stands in the working-practice section: never read a gate through a pipe.

### What the inventories found, condensed

Two read-only surveys on 2026-09-07 corrected this document's picture of M3–M9. Done, partial and
missing per milestone:

- **M3** — done: segment interest, attention index, demand and zero-result searches, presentation
  coverage, agent figures with sample protection, baseline machinery. Partial: the stage ladder
  (`FlowLadder` written, mounted nowhere — `/flow` draws a behaviour funnel), rung conversion,
  unit competition (a table, no graph), follow-up (delay figure is a literal), period comparison
  (explicit only on `/presentation?mode=periods`). Missing: time in stage, stalled opportunities,
  the attention-versus-conversion matrix, contacts and unified timelines, intent distribution, the
  policy-version guard.
- **M4** — `buildReportScope` and the `ExportReport` dialog exist; the dialog is mounted nowhere,
  no `/report` route, no PDF library anywhere.
- **M5** — no scenario registry; four projects cover five of the scenario shapes; sessions come
  from a seeded generator, not from batches through the ingest API.
- **M6** — see the milestone table; `packages/db` is a placeholder and ADR-0004 is unimplemented.
- **M7** — three endpoints proven; `packages/simulator` is a placeholder whose `bin` points at a
  file that does not exist; only the UE5 wire form is implemented, `projection.ts` is not on the
  request path.
- **M8** — the fact taxonomy and the `EventRegistry` mechanism exist; every per-source vocabulary
  is missing and `docs/03-event-map.md` names events in prose only.
- **M9** — projects, installations, activation, diagnostics, integrations exist; tenants, users,
  agencies, branding and feature flags do not.

### Working practice, learned the hard way

A second Claude Code session was running against this repository in a terminal tab with the
Impeccable skill's live mode active. Its `live-server` (port 8400) and `live-poll` loop wrote
"carbonize" edits into `page.tsx`, `charts.css` and `layout.tsx` several times, and killing the
process did not stop it because the other session restarted it. The mechanism, not the process,
is what to stop: `.claude/skills/impeccable/scripts/impeccable.cmd live-server stop` shuts the
shared server and removes the injected script tag. `.impeccable/` and `**/.impeccable/` are now
ignored by Prettier, ESLint and git for the same reason; the `apps/web/.gitignore` the tool had
written was moved out of the tree (it only listed paths the root ignore now covers).

**Never read a gate through a pipe.** `pnpm test 2>&1 | tail` exits with the tail's status, so a
failing suite prints "exit 0". Run the suite into a log file and echo its own exit code, or use
`set -o pipefail`. Four failures hid behind that pipe for a whole day of otherwise careful work.

**No synchronous stretch in a test worker may approach sixty seconds.** Vitest's worker reports
progress to its parent over an RPC with a sixty-second deadline kept on the worker's side. A hook
or test body that blocks the event loop longer than that (a `build()` twice in a row, a long
`execFileSync`) makes the run exit 1 with `Timeout calling "onTaskUpdate"` beside a full pass. It
is not machine load and not the worker count; it reproduces with one file and one worker. Split
the work with an `await`, or run it in a child process. Details in `vitest.config.ts`.

### The catalogue seam, later the same day

`packages/readmodels/src/catalogue-source.ts` is the port; `SyntheticObserverRepository` takes it
as an option and asks it in `context()`; `provideCatalogue` in `packages/synthetic/src/pulse.ts`
holds the delivered stock beside the synthetic one, and `catalogueFor` prefers it while
`syntheticCatalogueFor` — the session generator's only reader — never sees it. `placementOf` in
`@observer/contracts` decides what the surfaces can draw and says why not; the orientation
vocabulary is a per-connector mapping (`orientationMap`, ADR-0036's open rule, now configuration).
Proven on the local control plane: the CSV catalogue uploaded earlier drew nothing until its
Hungarian compass codes were mapped, then four of five units, and Project showed One- to Four-room
segments at 0.00× with the verdict falling back to the meeting count. `apps/web/src/lib/repository.ts`
is composed with `liveCatalogueSource`, memoised for thirty seconds per project.

### The Integrations screen, audited and folded

An Impeccable audit of `/madspace/projects/[projectId]/integrations` on the local control plane
(measured at 390, 768, 1440 and 1920; axe; a 40-stop keyboard walk; the CSV upload through the real
file input; a fixture token never echoed into HTML, inputs, console, URLs or POST bodies) found the
page structurally wrong and otherwise sound: every provider form stood fully open whatever its
state, 7414 px on desktop and 8475 px on a phone, with the only configured source fourth in order
at y≈5250. The distill pass that followed put each connector's form behind a native `<details>`
(`.mad-fold`, the `.obs-rules` marker treatment, the secondary button look), closed until asked
for, with the state row, the actions and the spreadsheet upload staying in front of it; the lede
now says "Spreadsheet (CSV) configured, not enabled." where it said "No CRM is connected." Measured
after: 2712 px on desktop, 3425 px on a phone, the configured source at y=1289, one form and one
field visible on load instead of five and thirty-one, ten focus stops to reach it instead of
thirty-three; every state word, credential line, last sync and "On Project" line visible with the
forms closed; Enter opens and Space closes each fold with focus staying on the control; scoped axe
clean at both widths. Note: the repository has no translations system, so the one new string
(`"<name> settings"`) is English like the rest of the surface.

The harden pass that followed took the four safety and accessibility findings, each reproduced
on the rendered page first. To reach the credential path at all, a dev-only key was generated
straight into `apps/web/.env.development.local` (gitignored, never printed, only ever sealing
fixture credentials in the local PGlite); delete that one file to return the machine to how it
was. Measured before: "Forget credential" fired on one Enter with no dialog, and the browser's
grey button chrome showed under its underline; after the refresh removed the buttons the
component returned nothing, so "The credential was forgotten." never reached the screen; the
changes table at 390 px (340 px wrapper, 647 px scroll width) had no `tabindex`, role or name
(axe serious); the refused REALPAD save marked the field invalid with no `aria-describedby` and
its sentence 1300 px below; no `role=status` container existed until an event created one.
After: the press opens the source lifecycle's `ConfirmDialog` (Cancel focused; Escape and Cancel
both return focus to the trigger with the credential still stored; Tab, Enter on the confirming
button forgets it) and the sentence stays in a persistent polite status line; the wrapper is a
focusable, heading-named `group` only while it overflows (arrow keys scroll it; no tab stop on
desktop where nothing overflows); the refusal sits under the failing control as
`.mad-field-error`, pointed at by `aria-describedby`, 58 px from the field; every form carries
its status line from the start, `aria-live="polite"`. Scoped axe clean at 390 and 1440; the
fixture token never appeared in HTML, inputs, console, URLs or POST bodies. The `<details>` folds
stayed closed by default.

Still open on that screen: implementation vocabulary in the hints, the Fields column and the raw
validation sentence (`statusRaw`, `interiorSqm`, `pre_reserved`, `units:read`, "Invalid input:
expected number, received null"); the Lomnio webhook endpoint is never shown; no route-level
loading state; the `.mad-choice` row looks clickable beyond the box and the label word; inputs
use an 8 px radius the system reserves for the scrollbar thumb; after a confirmed forget, focus
lands on the body because the trigger is gone. The five `.mad-table-wrap` tables on Diagnostics
share the pre-fix scroll behaviour and were left alone, being another route.

### Remaining debt from this day

- Sparse delivered units are counted, not drawn (next action 2's remaining rule).
- `ConnectorForm` is one component with four branches; when a fifth connector arrives it should
  become four.
- The Lomnio webhook route re-pulls on every `unit.*` event; a burst of events is a burst of pulls
  against a 100-requests-a-minute limit. Coalesce before a real client turns push on.
- `scopeFor` mints the read-model identifiers from the control-plane uuid; next action 2 replaces
  it with the slug match.

---

## M10 acceptance matrix — 2026-09-07, evening

The milestone's objective is `docs/roadmap.md`'s one line — "CRM connectors: canonical model with
REALPAD, Monday, Lomnio and manual adapters — shape and verified API facts in ADR-0036" — and
ADR-0036's decisions give it its conditions. Every row is one of them, classified honestly. Four
classes of evidence appear, and they are not interchangeable: **real local path** means the real
form, the real server action, the real façade and the real screen on the local PGlite control
plane (`OBSERVER_LOCAL_CONTROL_PLANE=1`, dev-only secrets in the gitignored
`apps/web/.env.development.local`); **automated** means Vitest against fakes or PGlite;
**Preview** means the hosted deployment, and no row has it yet.

| Condition                                                                      | Class                                                         | Evidence                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Canonical catalogue model (`CatalogueUnit`, disposition, status)               | PASS, real local path                                         | `packages/contracts/test/catalogue.test.ts`; the sparse sheet drawn in the acceptance suite                                                                                                                        |
| REALPAD catalogue adapter (`get-project`, `list-projects`)                     | PASS, automated test only                                     | `packages/connectors/test/realpad.test.ts`, `apps/web/test/connectors.test.ts` against a fake HTTP; a live REALPAD needs a client's pair                                                                           |
| Lomnio catalogue adapter and webhook signature                                 | PASS, automated test only                                     | `packages/connectors/test/lomnio.test.ts`, the webhook case in `apps/web/test/connectors.test.ts`                                                                                                                  |
| Monday catalogue adapter by configured columns                                 | PASS, automated test only                                     | `packages/connectors/test/monday.test.ts`                                                                                                                                                                          |
| Manual CSV catalogue, always working (§4 rule 2)                               | PASS, real local path                                         | acceptance step "pricelist v1" and "pricelist v1 again" (Read 6 units: 0 added, 0 changed, 0 withdrawn)                                                                                                            |
| Sparse units drawn, absence said in words                                      | PASS, real local path                                         | acceptance step "sparse pricelist" (7 of 8 units drawn. Gaps: 2 no room count; 1 no floor; 1 no area), "Rooms not stated" on Project, "Not stated" on the unit page, no null, no NaN                               |
| Catalogue persistence: snapshot, append-only changes, façades                  | PASS, real local path                                         | `supabase/test/catalogue-connectors.test.ts` (PGlite); the same façades behind every acceptance step                                                                                                               |
| Credentials sealed server-side, four characters shown                          | PASS, real local path                                         | `apps/web/test/connectors.test.ts`; the REALPAD plane's "Stored · ends list"; no password in the HTML (`realpad-exercise`)                                                                                         |
| Integrations operator path (configure, upload, enable, sync, forget)           | PASS, real local path                                         | acceptance steps "spreadsheet settings", "connector enabled", "connector disabled"; the harden pass earlier this day                                                                                               |
| Stage and status words as configuration, never inferred (decision 4)           | PASS, real local path                                         | the "Stage words" and "Status words" tables saved in the acceptance suite; "1 stage word(s) are not mapped yet: opció" counted, not guessed                                                                        |
| Canonical deals model, diff, deterministic event ids                           | PASS, automated test only                                     | `packages/contracts/test/deals.test.ts`, `packages/connectors/test/deals.test.ts`                                                                                                                                  |
| Lomnio deals adapter (`/v1/leads`)                                             | PASS, automated test only                                     | `packages/connectors/test/deals.test.ts`, `supabase/test/deals-connectors.test.ts`                                                                                                                                 |
| Monday deals adapter by configured columns                                     | PASS, automated test only                                     | `packages/connectors/test/deals.test.ts`                                                                                                                                                                           |
| REALPAD deals adapter (Data Takeout, `headermode=ids`, `xlsx=1`)               | PASS, automated test only                                     | `packages/connectors/test/realpad-deals.test.ts`, `xlsx.test.ts`, two web cases; the form proven on the local control plane. **Live use needs an external REALPAD fact**: the header ids, read off one real export |
| Manual deals sheet                                                             | PASS, real local path                                         | acceptance steps "deals v1", "deals v1 again" (0 opened, 0 changed stage, 0 withdrawn), "deals v2" (1 opened, 2 changed stage, 1 withdrawn)                                                                        |
| Deal persistence: membership withdrawal, append-only facts, replay             | PASS, real local path                                         | `supabase/test/deals-connectors.test.ts` (PGlite); the idempotent second upload in the acceptance suite                                                                                                            |
| Sales Flow ladder from delivered deals, every rung verified                    | PASS, real local path                                         | acceptance step "ladder" (Lead 4, Meeting 4, Negotiation 3, Offer 3, Reservation 1, Purchase 0)                                                                                                                    |
| Disabled connector never masquerades as live CRM data                          | PASS, real local path                                         | acceptance step "connector disabled" ("The CRM is not connected." and no rung)                                                                                                                                     |
| No person in the deal store or on any screen; subject key only                 | PASS, real local path                                         | `deals_current_no_person` (PGlite); acceptance privacy scan of HTML, console, URL and accessible names on Integrations and Sales Flow                                                                              |
| No credential shape in what the browser is sent                                | PASS, real local path                                         | the same scan; `scripts/preview-probe.mjs` for a deployment                                                                                                                                                        |
| axe clean and no browser error on the M10 screens                              | PASS, real local path                                         | acceptance steps "integrations privacy and axe", "ladder", "console"                                                                                                                                               |
| Daily sync of every enabled connector (cron)                                   | BLOCKED, requires Preview mutation                            | the route exists and refuses a stranger (`apps/web/src/app/api/observer/connectors/sync/route.ts`); the scheduler is Vercel's, with `CRON_SECRET`                                                                  |
| The two migrations on the hosted project                                       | BLOCKED, requires Preview mutation                            | executed on the whole chain in `supabase/test/m10-migration-readiness.test.ts`; applied to no hosted project; PostgREST argument names proven equal to `pg_proc.proargnames`                                       |
| `OBSERVER_CREDENTIAL_KEY`, `CRON_SECRET`, `OBSERVER_SUBJECT_PEPPER` on Preview | BLOCKED, requires Preview mutation                            | never produced here; `scripts/preview-preflight.mjs` lists them as the operator's and names how presence, never a value, is confirmed                                                                              |
| The acceptance suite on the Preview                                            | BLOCKED, requires Preview mutation                            | `OBSERVER_ACCEPTANCE_TARGET=preview`; today the Preview serves `d9879e3` and the sync route is absent, so the push is the first step                                                                               |
| A live CRM pull (REALPAD, Lomnio, Monday) with a client's credential           | BLOCKED, requires external REALPAD fact / a client credential | never attempted from this repository; the evidence file records "not exercised"                                                                                                                                    |
| A unit type vocabulary (`flat_type`: parking, cellar, garage)                  | NOT IMPLEMENTED                                               | ADR-0036 leaves it `OPEN` and names a support request; no document specifies the words, so nothing was invented. A parking place with no room count sits in "Rooms not stated". Not an M10 condition               |

**Status: READY FOR PREVIEW ACCEPTANCE.** Every M10 condition that can be satisfied without a
Preview mutation or a client's credential is satisfied and proven on the real local path or by an
automated test; nothing has been applied, set, pushed or deployed. What turns the four blocked rows:
the operator sets the three secrets on Vercel (Preview scope), applies `20260907100000` then
`20260907180000` to `tfcchobwobpadenampyh`, pushes the branch, runs the preflight, then the
acceptance suite with `OBSERVER_ACCEPTANCE_TARGET=preview`. A REALPAD client's first real export
then supplies the header ids for its deal columns.

**What could not be read from here, and was not improvised around.** The Supabase MCP's read-only
table listing and migration listing for `tfcchobwobpadenampyh` were refused or timed out from this
session; Vercel's project metadata was readable and carries no environment-variable names; the
Preview's runtime logs were not readable. None of that was worked around.

---

## The overnight frontend completion — night of 2026-09-07 to 2026-09-08

**Mandate:** complete the reviewable frontend of M3–M10 by 07:00, page by page, without a redesign
and without new backend. **Start** `c365fdf` at 20:32; the review package and the ledger are in the
session scratchpad (`overnight/review/index.html`). Frontend readiness is not milestone
acceptance: every row below is a screen a reader can open and judge, and the roadmap's backend,
security and deployment gates still govern the milestones.

| Milestone | Frontend delivered tonight                                                                                                                                                                                                                                                                                                                           | Still open, and why                                                                                                                                                          |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M3        | Sales Flow: time in stage on every rung and the stalled list, a demonstration CRM standing in for Northgate (`f3772fd`); Project: the attention × conversion matrix (`34533f3`); Unit: competition as bars (`078f5a3`); the policy-version guard on Sales Flow, Presentation DNA and the report (`341ce54`); Riverside's funnel no longer prints NaN | Contacts and the unified timeline; intent distribution — both by doctrine or missing contract, not by time (next action 4)                                                   |
| M4        | `/report`: the internal sales-intelligence report as a page, printed through the browser; the export dialog's "Shareable page" opens it (`e9efa13`); `/report?meeting=<id>`: the meeting summary, the export dialog on the replay (`b4c209b`)                                                                                                        | The server-side vector PDF generator; the buyer-facing sanitised document (a separate contract, ADR-0018)                                                                    |
| M5        | Nothing new; the states the existing projects force (no CRM, young, healthy with a demonstration CRM) are in the review package                                                                                                                                                                                                                      | The scenario registry and ingest batches (backend); the scenarios not yet represented                                                                                        |
| M6–M8     | No frontend deliverable (schema, ingestion, catalogues); ingestion health is read on Diagnostics                                                                                                                                                                                                                                                     | Backend                                                                                                                                                                      |
| M9        | `/madspace/directory`: tenants, agencies and people from the demonstration directory, stated as such (`c85f469`); a route-level loading state for the operations surface                                                                                                                                                                             | Tenant, user and agency tables; creating, inviting, suspending; branding and feature flags (no documented field list or contract — a product decision, not a screen to draw) |
| M10       | The Integrations audit's remaining findings closed: validation in an operator's words, the Lomnio webhook address on the plane, the choice row's cursor, focus after a forget (`2055df7`)                                                                                                                                                            | Preview acceptance (secrets, migrations, push — the operator's); the REALPAD header ids from one real export                                                                 |

**How each page was verified.** Signed in through the real form as the account the page is for,
captured at 1440 × 900 and 390 × 844, axe (WCAG 2.x A/AA) clean, no console or page error, no
horizontal overflow, no "null", "NaN" or "undefined" in the visible text, and the workflow driven
through the real controls: the export dialog opens on Enter, focuses Close, offers the page as a
real link and returns focus on Escape; the refused REALPAD save says "a number is needed here"
under its field; the meeting summary refuses the developer. Twenty-six pages are in the review
package with those checks recorded per page.

**The Playwright regression, triaged.** Five specs run against the dev server (navigation,
layout integrity, chart rules, authorisation, portal quality) failed 28 tests; every one of the 28
failed identically on a worktree at `c365fdf`, so none was a regression of the night. They were
the briefing-era locators ADR-0033 retired (`.obs-lede`, `.obs-prompt`, a "Briefing" nav item,
`.iris-matrix-row`) and a route list that navigated to a redirect mid-check. Rewritten for the
product as it is: the ten-second test on Ask IRIS and the briefing, the register as a table that
drops no column, the Ask dock covering nothing, the developer switch on an analytical surface.
The rewritten layout check then found two real things — the viewer name and the Ask scope name
ellipsised without a title — and the journey check a third: the Project tab row was unclickable
by mouse on every Project page since `32ea300`, painted under the main column. All three fixed.

**Working practice.** Every new figure is a field of one read model: the matrix, the time in
stage and the stalled list are computed in `packages/synthetic` and typed in
`packages/readmodels`, and the pages only print them (ADR-0012). The demonstration CRM covers
one scenario by slug (`DEMONSTRATION_CRM_SLUGS`) so the ISTER TOWER twin keeps its connector's
ladder or nobody's. A React key is never a 64-hex digest: the stage-change rows are keyed by what
they show.

### Continuation, 00:30–07:00, two founder decisions and the rest of the queue

Two explicit, scoped decisions arrived after the report above: the REALPAD connector's visible
name changes to "CRM API Connection" (presentation only), and the seven MADSPACE operations
routes (Integrations, Directory, Diagnostics, New project, Project detail, Projects, MADSPACE
home) leave the warm-paper presentation and adopt the Observer graphite ground. Both are done,
recorded in ADR-0037, commit `625e09e`.

**The rename.** `CONNECTOR_NAMES.realpad` (`apps/web/src/lib/connectors/configs.ts`) is the one
place the name is declared; every heading, disclosure, button, dialog and status/validation
sentence in the Integrations experience reads it. Field-level labels that name an actual REALPAD
API concept (REALPAD project id, the Data Takeout pair) are left alone on purpose: renaming those
would make the configuration instructions false, which the founder's brief explicitly forbade.
The internal `realpad` identifier, its adapter, request shape and credential schema are
unchanged. Verified before/after with a real browser session: 5 REALPAD-brand labels became "CRM
API Connection"; 5 REALPAD occurrences remain, all field-technical.

**The theme.** `.mad-portal`'s tokens are restated at `.ox-graphite`'s own ADR-0034 values (ink,
surfaces, the six-alpha border ramp, the four status pairs); the studio-blue accent override is
removed so the brand accent applies; Inter, which had no asset in the repository and silently
rendered the reader's OS font, is withdrawn for the same Manrope the rest of the product loads. A
`@media print` block keeps the original paper values for print. `docs/20-madspace-admin-design-
system.md` §0/§2/§8 amended in place (superseded tables kept for the PDF cross-reference); ADR-
0037 records the decision. All seven routes verified at 390/768/1440/1920 as the MADSPACE
account: axe clean, no console error, no overflow, no clipped label, at every width; Integrations
additionally through its collapsed, opened-form, validation-refusal and destructive-dialog
states, axe clean on each.

**Report and print, verified.** The real Project → Report link and the meeting Export dialog's
"Open the report page" both reached, sections and period/scope confirmed, browser print emulated
and a PDF persisted for each (app chrome excluded, no clipping, no blank page). One pre-existing
axe "region" (landmark) finding reproduces identically on `/flow`, an already-shipped page using
the same shell components — not introduced tonight, not fixed in this pass (shell-wide, outside
the seven-page and report scope this mandate set).

**M5, resolved against the actual scenario specification (`docs/08-scenarios.md`), nothing
invented.** Verified live: disconnected CRM (Riverside), missing CRM at project level (Kingsford),
one developer across three projects (Petra), agency isolation across two developers (Akhilesh:
Northgate for Alpha vs Kingsford for Beta, denied on Riverside), agent-level insufficient sample
(Ister Tower's Lucia Horváth, 9 recorded meetings). Confirmed missing, honestly: a second agency
on one project, the velocity-drop detector, a single-unit demand-drop warning, the named Viktória
reference journey, and the identity-join cases — the last recorded then as blocked by the same
VisitorLabel privacy contract already recorded against Contacts. That contract governs one label and
was never a product-wide prohibition; see `docs/22-visitor-name-display.md`.

**M9, unchanged conclusion.** Branding and feature flags remain SPECIFICATION_BLOCKED: no field
list or contract exists anywhere in the documentation, and a visual decision does not create one.

Full evidence, screenshots, PDFs and JSON: `overnight/admin/{before,after}`,
`overnight/report-print`, session scratchpad.

**The Integrations rename, finished.** The founder's follow-up correctly identified that "REALPAD
project id" and four other field labels/hints under the disclosure still named the brand. Fixed:
"Project ID" (matching the plain "Developer id"/"Screen id" labels already beside it), "your CRM
provider" and "your CRM" in the hints and the credential InfoNote. "Pricelist" and "Data Takeout"
are left alone — they name a credential type, not the brand, and renaming them would make the
instruction wrong. Verified live: 0 REALPAD occurrences anywhere on the page including the opened
form and the InfoNote panel, 0 in an aria-label or title, 4 occurrences of "CRM API Connection", no
clipping, no overflow, axe clean.

**Two account-picker specs (`account-login.spec.ts`, `agent-authorisation.spec.ts`) updated.** The
projects picker was rewritten to `ox-` classes at some point before tonight
(`.ox-thread-row`/`.ox-thread-title`/`.ox-thread-context`; the `.mp-card`/`.mp-project`/
`.mp-developer`/`.mp-cover` classes both specs targeted do not exist in the current markup at all),
ADR-0033 moved the project home segment to Ask IRIS (`HOME_SEGMENT = "ask"`, commit `3d90c63`,
so "Open Observer" now opens `/ask` rather than `/showroom`), and Ister Tower was added to
Monika's and Petra's account grants in the M10 work before tonight, making three project-count
assertions stale on their own terms. Every fix updates a locator or an expected value to the
verified current behaviour while leaving the requirement under test, and every unauthorized-access
and tenant/project isolation assertion in both files, untouched; the one dropped claim ("each card
carries a cover image") is dropped because the current row design has no cover image at all, a
verified fact about the redesign rather than a weakened check. Full per-test classification
(requirement protected, evidence the old expectation was wrong, what the replacement still proves)
is in the session ledger.

**Discovered, not fixed:** `lab.spec.ts:68` checks a per-column "explain this measurement" info
button on the Units register that does not exist anywhere on the page today (checked directly) — a
real feature gap from an earlier redesign, not a locator problem, and restoring it is a real
product change outside tonight's bounded scope. Left failing rather than patched or deleted.

### Continuation, 2026-09-08 08:56–10:35, `096614b` → `70fe48e`

The overnight deadline had passed by the time this continuation started; it ran as ordinary work
with no deadline, not a second "overnight."

**The Units register "explain itself" gap, resolved.** `lab.spec.ts:68`'s premise was checked
against the shipped `UnitRegister` component's own docblock, which records the decision directly:
the interactive per-column info button was deliberately superseded by an always-present "How to
read this register" definitions list, because `DataColumn.label` cannot hold a control — "reported
as a gap in the shared layer rather than worked around by hand-rolling a second table." The old
test also named columns ("Attention", "Typical look", "Trend") that do not exist on the register at
all. Replaced with `e2e/units-register.spec.ts`, which verifies the real thirteen columns and the
real definitions list, reachable with no interaction and clean at 390px; moved out of `lab.spec.ts`
because that file's `/lab/*` mobile-skip does not apply to a shipping product page.

**M5 "Multiple agencies" (docs/08-scenarios.md §3), implemented.** ISTER TOWER's roster gains a
fourth presenter, Sabina Diallo of Tatra Realty, deliberately below `AGENT_MIN_SAMPLE`, alongside
the existing above-threshold Meridian Sales team. `AgentProfile.organisationName` threads the
agency onto every roster card as a byline. Building this correctly surfaced a real defect: the
roster's cards drew a percentage verdict and a team-comparison flag with no sample-size check at
all — at Northgate's own default period, three of its four presenters are below the 20-meeting
floor and were shown a bare percentage. Fixed at the source `AgentDetailView` already uses
(`belowMinimum`/`suppressionNote`, same wording, now also on `AgentProfile`); the roster suppresses
the percentage, the flag and the "leans on" line below the floor.

**observer-product.spec.ts, 23 → 32 of 34 passing.** Four proof-text checks ("Project", "Units",
"Meetings", "Features") were resolving to a hidden nav-item duplicate ahead of the real page
heading in DOM order (`getByText(...).first()`, no scope); fixed by scoping to `#main`. Separately,
"15 below-sample" (Kingsford Yard) was opened by every shot's shared Petra Novák sign-in, and Petra
does not hold that project — every capture and check for it was silently exercising a refusal page.
Fixed with a per-shot `account` override to Akhilesh Undev, who holds it. Two failures remain,
precisely root-caused and confirmed unrelated to either fix above (reproduces identically with both
reverted): `page.goto("/ask")`'s `waitUntil: "load"` does not resolve the SECOND time one page
instance navigates there within a test; every other test opens `/ask` once, on a fresh page, and
passes. TravelingLight's WebGL canvas (ADR-0035) is the only thing on that route with an unmanaged
`requestAnimationFrame` loop and is the leading suspect, not confirmed, and is the one implementation
this repository says not to change — left failing and documented at both call sites rather than
excluded or weakened.

**Two more stale assertions, corrected.** `observer.spec.ts` still named the retired "Briefing" nav
item (ADR-0033: Ask IRIS); fixed. A mistake in this morning's own `62d9b02` was found and fixed:
that commit demonstrated the single-project sign-in case with Martin Kováč, on the assumption the
product still stops at the picker for a single-project account — it does not (the shared
`signInAs` helper's own comment already says so; the product opens a single-project account's one
project directly). The test now demonstrates the multi-project half of its own claim instead, with
Petra. **Corrected, not fixed:** `settings-ai.spec.ts`'s reported failure was re-tested in true
isolation and passed with its original, unmodified assertion — the earlier failure was cross-test
contamination in a combined run, the same pattern already seen with `portal-quality.spec.ts`; no
change was needed or made.

**The dev-server/production-build split, reconciled rather than newly discovered.** Three more spec
files (`design-lab*.spec.ts`, `madspace-screenshots.spec.ts`, `observer-product.spec.ts`) document
in their own header comments that they require the dev server with `OBSERVER_LOCAL_CONTROL_PLANE=1`
and cannot pass under the default production-build invocation, which deliberately disables both the
local control plane and `/design-lab`. Confirmed by running each against the dev server: design-lab,
135/135; madspace-screenshots, 7/7 (directly confirming the seven-page dark theme did not break
MADSPACE); observer-product, 32/34 as above.

**Genuine, confirmed, not fixed:** a developer or agency manager with more than one project under
one tenant has no in-shell way back to the projects picker once inside a project — no nav item, no
logo link, no account-menu entry (checked directly). The cross-tenant "Developer" switch (the
context band on the analytical surfaces) does not cover this: it switches developer/tenant, and a
single-tenant account like Petra's three projects never sees it. `account-login.spec.ts`'s "the
workspace offers a way back to the projects" names this correctly and is left failing rather than
weakened — this is a real navigation/IA decision (extend the existing switcher pattern, or another
mechanism), not a stale locator, and not this pass's to make.

**Final gates at `70fe48e`:** format, lint, typecheck, vitest (119 files, 3321 passed, 1 skipped, 0
failed, run alone on a clean tree), production build and secret audit all clean.

### Continuation, night of 2026-09-08, the Akhilesh Supabase demo — `70fe48e` → `2c7f109`

**Mandate:** connect Akhilesh's supplied Supabase demo project through the real MADSPACE admin,
prove real data reaches a real product page, then continue through §7 project switching, §8 the
Ask-navigation defect, and M3–M10 per the founder's numbered brief. Deadline 2026-09-09 07:00
Europe/Bratislava.

**The schema, established by bounded live probing, not guessed.** Akhilesh's project exposes
exactly one relevant table, `public.user_sessions`: `session_id`, `created_at`, and a
`session_data` JSONB blob holding what the legacy dashboard showed —
`docs/16-showroom-intelligence-audit.md` confirmed consistent (same unit codes, same "not found
in registry" catalogue gap). No separate catalogue, CRM or WEB IRIS table exists in this project.

**Built, mirroring the existing `DealSource`/`CatalogueSource` overlay pattern exactly:** a
`ShowroomSessionSource` port (`packages/readmodels/src/session-source.ts`), a Supabase adapter
(`packages/connectors/src/supabase-showroom.ts` — bounded pagination, deterministic order, GET
only, host pinned to the exact authorised origin by `z.literal`), a `SessionsDb` storage port with
a new migration (local PGlite only, never applied to any hosted project), a `ShowroomSourceKind`
kept deliberately separate from `ConnectorKind`, and a MADSPACE Integrations plane
(`SessionSourceForm`/`SessionSourceSync`) kept separate from the REALPAD-backed CRM connectors.
The demo project (`Akhilesh Demo Source`, tenant `MADSPACE Integration Sandbox`, its own
`tnt_madspacedemo1` — never Alpha Estates or Beta Development, so imported sessions cannot join
either tenant's real figures) was added to `packages/synthetic/src/world.ts` and granted to the
`madspace` viewer.

**Verified end to end, live, through the real admin form:** created via `/madspace/projects/new`
(control-plane id `c4841820-840f-46e3-8a4c-4aed48d2dba3`); Supabase URL + anon key saved and
persisted across reload (credential shown only as "ends o2hc", never in full); Sync now fetched
11, accepted 11, rejected 0 — matching the audit's own row count exactly. The Project overview for
`/madspace-integration/akhilesh-demo-source` shows "11 meetings", the Meetings register lists all
11 with real unit codes (`IT 13 B6`, `IT 23 B2`, …), real recorded outcomes, `agt_demo_akhilesh`
as agent, "Not linked to a contact" as visitor on every row (no name/phone/email anywhere), and the
honest "no CRM connected" unavailable state on Sold/follow-up rather than a fabricated number.
Screenshots in `artifacts/akhilesh-supabase-demo/` (gitignored, local only). Zero writes to
Akhilesh's Supabase at any point — the adapter issues GET only, confirmed by reading the file, and
nothing in this pass touched RLS, schema, keys or Auth.

**One local-machine blocker found and worked around, not a product defect.** The dev server
launched through the Browser pane's `preview_start` failed every outbound HTTPS call with
`UNABLE_TO_VERIFY_LEAF_SIGNATURE` — Avast's local TLS-interception root (`NODE_EXTRA_CA_CERTS`,
already set in this machine's shell environment) was not inherited by that subsystem's spawned
process. Worked around by starting `next dev` directly (background Bash, which does inherit it)
and attaching the Browser pane to the already-running server by URL instead of by launch config.
Not a code change, not a security weakening, and irrelevant to any other environment — recorded
here so a future session does not re-diagnose it.

**Two real bugs fixed along the way, found by an Explore agent tracing every synthetic generator
against a project with zero fixture rows:** `packages/synthetic/src/pulse.ts`'s `peakViews` was an
unguarded `Math.max()` over zero units, which is `-Infinity` in JS and would have printed literally
in Ask Observer's "strongest verified interest" sentence; and `soldInPeriod` hard-coded Northgate's
narrative "7" onto any uncatalogued project regardless of whether it actually had units. Both
fixed with the same "empty means honestly empty" rule the rest of the file already follows for
this exact scenario.

### Continuation, same night, §7 project switching, §8 Ask-navigation, M3-7, and the QA gate — `2c7f109` → `e263191`

**§7 project switching, built and verified live.** The gap this file's own 2026-09-08 10:35 entry
named — a multi-project account within one tenant had no in-shell way back to the picker — is
closed on Ask IRIS specifically, the one screen that had no context band at all and the one every
sign-in lands on. `Shell.tsx` reuses the existing `ContextSwitcher`/`repository.listProjects`
pattern already driving the Sales Flow/Project/Sales Agents switcher, restyled into the Ask header
beside Sign out, gated on `projects.length > 1` so a single-project account sees nothing new; the
wordmark now links to the current project's Ask IRIS from every surface. Verified live as Petra
(three projects, one tenant — switches and lands correctly, section preserved) and Martin (one
project — no switcher shown); `e2e/project-switching.spec.ts` added, 14 passed/1 skipped (the one
skip is the pre-existing switcher's own mobile-hamburger affordance, unchanged by this work).

**§8 Ask-navigation, root-caused correctly and closed.** The prior report's TravelingLight/WebGL
suspicion (`prompt-glow.ts`'s `requestAnimationFrame` loop) does not hold up: both the imperative
cleanup and its React wrapper's `useEffect` return dispose completely (cancel the loop, remove
every listener, disconnect the `ResizeObserver`, explicitly lose the WebGL context). Rerun at
Playwright's stock 30s timeout, the failure reproduced on `/units/IT-A-12-07` — a route with no
WebGL canvas — disproving the diagnosis rather than confirming it. Real cause: `observer-
product.spec.ts`'s "holds together" test makes 39 sequential `page.goto` calls against a Turbopack
dev server in one 30s budget; whichever navigation is in flight when that budget expires is
arbitrary, which is why the reported route differed between reports. Fixed with `test.setTimeout`,
the same headroom `ask-security.spec.ts`/`madspace-screenshots.spec.ts` already give their own
multi-navigation tests. Both affected tests pass reliably now (confirmed over multiple runs).

**M3-7, the one M3–M10 slice actually implemented tonight.** A background research agent produced
a full, evidence-cited M3–M10 requirement matrix (six buckets: specified-and-implementable /
implemented-not-integrated / integrated-not-verified / demonstrable-via-approved-adapter /
genuinely-specification-blocked / dependent-on-hosted-acceptance) and recommended two bounded
slices. Only the smaller was taken, given the hours left: the agent overview's "16 days" follow-up
figure (`packages/synthetic/src/agent.ts`) was a hand-typed literal beside a hand-typed "8 August"
label, kept in sync by nobody — exactly the fabricated-figure case the product doctrine's own rule
forbids, on a number a verdict card renders live. Now computed from one real timestamp via
`deals.ts`'s `daysBetween` (exported for this), against `people.follow_up_delay`'s own 7-day
threshold; urgency and the metric's pass/fail outcome follow the same comparison rather than being
asserted independently of it. Verified live, signed in as Monika: "waiting 15 days" (the honest
figure the new timestamp produces), "FAIL" against the 7-day rule, consistent everywhere it
appears. The agent's other pick — completing the Viktória reference journey against
`docs/08-scenarios.md` §1's dated 12-step table — and the fully-coded-but-unwired
`unit.sharp_demand_decline` metric were both left untaken; neither is started. Full matrix, with
citations, is in the session transcript rather than copied here — ask for it if a future session
needs the detail rather than re-deriving it.

**QA gate.** `pnpm verify` (format, typecheck, lint, unit+integration test, build) run to a clean
pass at `e263191`: format clean, typecheck clean across all 11 packages plus tests and scripts,
ESLint clean, **3623 tests passed, 24 skipped, 0 failed** across two independent full runs
(vitest's own count moved from the baseline 3321 as this session's own new tests were added),
production build succeeded (every route compiled). `node scripts/secret-audit.mjs` clean,
independently reconfirmed three times (standalone, and twice more inside the vitest run's own
`no-secret-recipes.test.ts`, including a full branch-history scan each time). The gate first failed
four ways, all caused by this session's own new code, all fixed and reverified: `session-source.ts`
imported `@observer/synthetic` directly outside the composition root (moved the reverse lookup into
`repository.ts`, the one file `surfaces.test.ts`/ADR-0007 allow to name the synthetic world);
`SessionSourceForm.tsx` used two em dashes in reader-facing copy (reworded); `m10-migration-
readiness.test.ts` asserted the catalogue and deals migrations were literally the newest two files,
true only until this session's own showroom-sessions migration sorted after both (now checks their
relative order instead of the directory's tail); `isolation.test.ts` required every project to have
its own synthetic sessions, which the new Akhilesh demo project deliberately does not (excluded by
slug, reasoning stated inline — its sessions come from a live connector overlay whose own fallback
is an empty filter, never a borrowed row).

**E2E: the two directly relevant files verified; a full sweep was attempted and is honestly
incomplete.** `observer-product.spec.ts` and `project-switching.spec.ts` both verified clean across
multiple complete runs. A broader pass was then attempted three ways — the full suite against the
dev server, the full suite against a fresh production build, a single-worker desktop-only pass —
and each hit page-load timeouts unrelated to this session's product code: this machine was down to
2.4 GB free RAM and 68% CPU load, traced to orphaned Node/Chromium processes left behind by earlier
stopped Playwright runs (`TaskStop` ends the wrapper process but not every child). Killed the
orphaned processes (CPU load fell to 17%), retried single-worker; individual tests now pass but at
roughly one per 1-2 minutes on this machine's current baseline load, too slow to complete the ~500
remaining desktop-project tests inside the hours left before the deadline. One targeted, bounded
check did complete before time ran out: `layout-integrity.spec.ts`'s "no surface clips its own text
or widens the page" at 1920px — the layout check most directly exercising `Shell.tsx`, the file
this session's project-switching work changed everywhere it is used — passed clean. **The
remaining ~30 spec files are genuinely not re-verified tonight** and that is stated here rather
than implied otherwise; nothing in them was touched by this session's own commits, and the
resource ceiling, not a discovered failure, is why they were not run to completion.

### Continuation, 2026-09-09 morning, the QA sweep and its fixes — from `00b3028`

**The ask.** Test the whole Observer as a QA engineer would, then fix everything found. The full
Playwright suite (~1,578 cases) cannot complete on this machine in a working morning (see the
resource ceiling above), so the sweep was done with a purpose-built, role-aware crawler,
`scripts/qa-sweep.mjs` (now committed as a reusable tool): it signs in as each of the six
demonstration accounts, walks every surface of every project the account holds plus a bounded set
of unit/meeting/agent/conversation details, and records console and page errors, failed requests,
forbidden text (`undefined`, `NaN`, `null`, `[object Object]`), a main region stuck on its loading
copy, horizontal overflow, axe WCAG 2.x A/AA violations, and whether a refusal happened where one
was expected (MADSPACE on `/people`, the admin surface for non-admins, a project the account does
not hold, every project route signed out). `node scripts/qa-sweep.mjs http://localhost:3310
[--mobile] [--only=account,…]` writes `artifacts/qa-sweep/report.{md,json}`. The first desktop pass
covered 600 pages: zero forbidden text, zero overflow, zero failed requests, zero axe violations,
and the defects below.

**What was found, and what was done about each.**

1. **`/overview` fell into the error boundary** for ISTER TOWER, the Akhilesh demo project, and
   for a sales agent on any project but Northgate ("This screen could not be loaded … Try again",
   with a Try again that could never help). Root cause: the page returned an async view component
   from inside a try/catch, so the component's `NotFoundError` was thrown by React, outside the
   catch. The read now happens on the page itself; a project the overview is not composed for gets
   an honest state message with one action, Open Project, which carries the same figures for every
   project. (`overview/page.tsx`; the duplicate local `presetFrom` went with it.)
2. **The Ask page logged `NotPermittedError` on every refused URL** while the layout was already
   rendering the refusal panel — a server-side `⨯` per request that read as a fault in the log.
   The page now returns nothing on a refusal or an unknown project, the same pattern as its
   siblings.
3. **The demo project's meeting pages said "No brief for this meeting"** for meetings that had
   run. `getMeetingReplay` looked the id up in the static showroom fixtures only, so a session that
   arrived through a connector overlay was invisible to it; the same lookup was unscoped by
   project, so a meeting id from one project could in principle be read under another project's
   address. Both `getMeetingReplay` and `getReportScope` now resolve through
   `sessionById(meetingId, projectId)`, which consults the project's overlay first and stays inside
   the project.
4. **Register unit chips linked to codes the catalogue does not hold** (every chip on the demo
   project, which has no catalogue), so each led to the product's own "This isn't here".
   `MeetingRow.unitsViewed` is now `readonly UnitReference[]` (`{ code, href | null }`) — the read
   model decides the link because only it can see the catalogue — and the register prints a code
   with no page as a plain chip titled "Not in the unit catalogue". The deal ladder's stalled-deal
   unit links got the same catalogue check and URL encoding. Covered by a new test in
   `screens.test.ts`.
5. **`/report?meeting=<unknown>` crashed into the error boundary.** The `?meeting=` branch now
   maps `NotFoundError` to the not-found page and a refusal to nothing (the layout has it).
6. **Every date and time was printed on the HOST's clock, not the project's.** `toLocaleString`
   and friends were called without `timeZone` in eleven places (meeting registers and replays,
   unit timelines, weekly buckets, the flow charts, the deal ladder, Ask history stamps, the
   pre-meeting brief, which also hard-coded `en-GB`), so a 10:30 Bratislava meeting reads "08:30"
   on a UTC host such as Vercel, and Kingsford (`Europe/London`) was an hour off even here. Worse,
   three computations were cut in UTC: the activity heatmap's weekday/hour cells (a 09:10 Bratislava
   meeting fell into a 07:00 cell the grid does not have and dropped out of `meetingsCounted`), the
   Today / This week / This month buckets, and the KPI window's end of day. And the meetings-per-
   week trend used epoch weeks, which begin on a Thursday. New `packages/synthetic/src/time.ts`
   (zone parts, zoned instants, day/week/month starts, month keys, all via `Intl`, no library) and
   `dayLabel`/`clockLabel`/`monthLabel`/`monthYearLabel` in `format.ts`; every site now reads
   `context.project.timeZone`. The trend's weeks start on the project's Monday and a week with no
   meetings is drawn at zero rather than skipped (skipping it let the annotation call a quiet
   fortnight a week-on-week change). The synthetic generator's working hours are now the project's
   own 09:00–16:59 (they were `setUTCHours`), with the `r()` draw order untouched so every other
   value in every session is what it was. `bucketBounds` keeps its UTC arithmetic when no zone is
   given, so the hand-placed test fixtures are unchanged. 16 new tests in `time.test.ts`, pinned
   against instants whose Bratislava and London readings are known by hand, summer and winter.
7. **Ask IRIS offered no way back to the projects list** — every sign-in lands there, and the
   export's reduced header has no Projects link — which `account-login.spec.ts` had been saying
   for as long as the variant existed. The project switch in that header now ends with an
   "All projects" row (`/projects`); the spec selects it. A single-project account still sees no
   switch, as before.
8. **The header's account cluster lay across the navigation at laptop widths.** Measured on the
   administrator's header (badge, Projects, Settings, Administration, Sign out): 71px of overlap at
   1440, 151px at 1280, 191px at 1200; the developer's overlapped by 55px at 1280. The right grid
   column was `minmax(0, 1fr)`, so a cluster wider than its half overflowed leftwards over the
   last navigation item. It is `minmax(max-content, 1fr)` now — centred navigation whenever it
   fits, otherwise the navigation moves left rather than being covered — and below 1600px the
   cluster packs closer and the name/role block is capped (the role line, not the name, was what
   held it open). Re-measured: no overlap at 1440, 1280 or 1200; the navigation sits 72px left of
   centre at 1440 for the administrator and nowhere for the developer.

**Not defects, left alone, stated so nobody re-investigates:** the 15 "not refused" rows in the
first sweep were `requireSurface` redirects to a permitted surface (MADSPACE `/people` → `/agents`),
which is the designed refusal; the crawler now counts a redirect away from the address as one.
`/madspace` for non-admins is the documented stub. HSTS is absent on the dev server because
`next.config.ts` leaves it to the platform, deliberately.

**Verification.** `pnpm -r exec tsc --noEmit` clean; `pnpm lint` clean; Prettier clean on every
changed file; vitest scoped to `packages/synthetic`, `packages/readmodels` and `apps/web` (the
release-packaging suites need a clean tree): 784 passed, then 33/33 on `screens.test.ts` with the
new register test. Live, signed in as MADSPACE Operations against the dev server: ISTER TOWER's
`/overview` renders the composed-for message with its Open Project link; `/report?meeting=mtg_nope`
renders the not-found page; the Akhilesh demo register shows 13 unlinked, titled chips and its
meeting page streams the full replay (confirmed from the response body — the Claude Browser pane
itself never applies React's streamed-boundary swap on slow pages, which is a tooling artefact and
is recorded as such); Northgate's register links all 283 chips to `/units/<code>`; the flow page's
heatmap counts all 74 presentations with "Busiest: Wed at 09:00" in local hours and the trend's
labels are Mondays; "All projects" in the Ask header lands on `/projects`.

**The re-run sweeps.** Desktop, all six accounts: **596 pages, 0 findings.** Mobile (Pixel 7), all
six accounts: 596 pages, 10 findings, all one root cause — axe `scrollable-region-focusable`
(serious) on the Sales Agents detail's "What their buyers opened" chart, whose plot scrolled
sideways. The cause was the paired chart's own tablet rule in `showroom.css`: below 60rem it
collapsed to three columns and hid the last cell of every row, which dropped the PROJECT'S figure
(the number the paired chart exists to set the agent's against) from every tablet and phone, and
left the head's agent name in a 3rem track that "AKHILESH" overflowed, making the whole plot a
scroll region. Four cells at every width now; on phones the label takes its own line above the
track. Re-swept on mobile for the account that showed it: 76 pages, 0 findings. Looked at:
`artifacts/qa-shots/paired-chart-412.png` (both values and both column names present, nothing
scrolls), `header-{1440,1280,1200}-madspace.png`, `demo-register-chips.png`,
`demo-meeting-replay.png`, `ister-overview.png` — the directory is git-ignored; the scripts that
produced them (`shots.mjs`, `links.mjs`) sit beside them and re-run in a minute.

**The targeted E2E specs, against the dev server (`OBSERVER_BASE_URL`), desktop project, one
worker:** `account-login.spec.ts` 19/19 — including "the workspace offers a way back to the
projects", the case that had failed for as long as the Ask variant existed; `project-switching.
spec.ts` 5/5 after its option count moved from 3 to 4 (the fourth is "All projects", asserted by
label); `observer-product.spec.ts` 33 passed, 1 skipped, and one failure: "draws no link that does
not resolve" exceeded its own 180-second budget. Measured directly (`links.mjs`): the crawl issues
221 distinct GETs, none broken, 210 seconds of server time at this machine's current dev-server
latency (Turbopack, ~1s a page; the units and meetings registers alone are 147 of them). The
budget was set for the production build the Playwright config starts by default, where it held;
it is a machine-speed ceiling on the dev server, not a dead link, and the test is left as it is.

**Not run:** the full E2E suite (~1,578 cases, see the ceiling above) and `pnpm verify`'s build
and release-packaging suites, which need a clean tree and a production build — both belong to
the next session's gate, on this commit.

**Next recommended action.** Run `pnpm verify` on a clean tree at this commit and, when the
machine is free, the full Playwright suite against the production build (`pnpm test:e2e`, no
`OBSERVER_BASE_URL`) — the QA crawler cannot see what a spec asserts about behaviour, only what a
page renders. Then show the founder the one visible change of composition made here without a
decision of theirs: the "All projects" row at the foot of the Ask header's project switch, and the
navigation sitting left of centre on the administrator's laptop-width header rather than under
the account cluster.

### Continuation, 2026-09-09 afternoon — verifying the morning report, not repeating it — `94a4b89` → `adf0981`

**The mandate.** Do not re-audit; verify what the morning report claimed, close the acceptance
gates it left open, and reconcile the QA sweep against real functional E2E coverage.

**§1 `time.ts`, hardened rather than assumed correct.** The morning's 16 tests proved the ordinary
case; 21 new ones prove the properties the report claimed without pinning: host independence
(`process.env.TZ` mutated mid-process — a bare `Date` getter moves, `zoneParts`/labels/`bucketBounds`
do not, across four wildly different host zones), that the instant handed in is never rewritten,
half-open period boundaries (`[from, to)`, checked at the exact millisecond), the week/month/
year/leap-day edges (a leap February's 29-day ceiling, not a hard-coded 28; a January→December
rollover that also crosses a year), the two DST irregularities in Europe/Bratislava — the missing
hour (29 March) and the repeated one (25 October) — pinned against ground truth from a second,
more primitive `Intl` call rather than the function under test grading its own homework, and an
unrecognised zone failing loudly (`RangeError`) rather than silently reading the host's. Both
policies (DST resolution, invalid-zone failure) are now stated in `time.ts`'s own docblock, not
just tested. `session-schedule.test.ts` (new) covers the generator's own contract: determinism,
identifiers that encode no timestamp, working hours in the _project's_ zone (Kingsford's UTC hours
now provably differ from Northgate's), and proof the connector overlay never touches the static
generator.

**§2 the meeting-replay and unit-link fixes, proven against the actual bug shape.** Six new tests
in `isolation.test.ts` recreate the historical vulnerability precisely: a real meeting id from a
_different_ project, asked for under a project the viewer _does_ hold (the exact shape of the old
leak) — refused `NotFoundError`, both on `getMeetingReplay` and `getReportScope`; a project the
viewer does not hold at all, refused `NotPermittedError` before any meeting lookup; an unknown id;
and the connector-overlay path exercised through a real `ShowroomSessionSource` stub plugged into
the repository's own `sessionSource` option — not the module-private override, which a repository
with no configured source wipes on every request by design, and reaching into it directly would
have been fighting that contract rather than exercising it. Two new tests in `views3.test.ts` cover
the deal ladder's identical contract: a real _foreign_ catalogue code (a genuine Northgate unit)
does not satisfy Riverside's lookup even though it is a real code somewhere; free text stays
readable with no link; and a catalogue code needing escaping produces a concretely pinned encoded
path, not just "whatever `encodeURIComponent` does today."

**§3 the link-crawl test, and what "smallest correction" actually meant.** Against its own
_documented_ environment — `playwright.config.ts`'s default `webServer` builds and serves
production — the entire `observer-product.spec.ts` file, including "draws no link that does not
resolve," passed clean (34 passed, 1 skipped, 2.7 minutes for the build and all 35 tests). The
correction needed was zero lines of test code: the earlier dev-server run was simply the wrong
environment for a budget calibrated against production. Re-confirmed inside the full 383-test
production run later the same afternoon.

**§4 the QA sweep, reconciled against real functional coverage, not conflated with it.** The
596 desktop / 596 mobile page visits are role×project×route _combinations_, not 596 distinct pages:
254 fixed-surface visits (16 declared surfaces × however many projects × six accounts), 260 sampled
detail pages (capped at 4 units / 4 meetings / 6 agents / 3 conversations per project), 75
MADSPACE-admin-surface visits, the rest refusal/anonymous checks — 484 distinct (account, project,
surface) combinations altogether. It is a rendered-route smoke sweep: page loads, DOM reads,
link-following. It exercises no form submission beyond sign-in, no persistence round-trip, no
destructive confirmation, no multi-step state change, no interaction-dependent authorisation
(a click, a select, a drag) — those are what the full E2E suite is for, and this pass ran it.

**§5 the full E2E suite, run to completion, classified by environment rather than lumped into one
number.** `workers: 1`, `--project=desktop` only (`wide`/`mobile` were not run this pass — a
resource choice, stated rather than hidden). Three environments, each given its own batch:

- **Dev-only** (their own docblocks: the route calls `notFound()` when `NODE_ENV==="production"`,
  unconditionally — `localControlPlaneEnabled()` in `apps/web/src/lib/sources/local-db.ts` refuses
  outright in production regardless of any flag): `design-lab-a11y.spec.ts`, `design-lab-stress
.spec.ts`, `design-lab.spec.ts`, `madspace-screenshots.spec.ts`. Run against the dev server
  (`OBSERVER_BASE_URL=http://localhost:3310`): **142/143 passed, 1 skipped, 0 failed.** The first
  attempt at all four ran against production by mistake (my own batching error, corrected once
  identified) and every one of their tests failed identically on a 30s click-timeout waiting for a
  button a production build never renders — proving the classification rather than a product
  defect, but the wasted run is recorded rather than erased.
- **Production** (everything else, 34 files, 398 tests): **run to completion. 10 confirmed
  failures, all in two files** (`showroom.spec.ts`, `showroom-screenshots.spec.ts`) that pre-date
  three _already-shipped, already-documented, already-tested-elsewhere_ product decisions these two
  files were never updated for: the Storytelling→Features redirect (`nav-reachability.spec.ts`
  tests the current behaviour and passes), the retired `SECONDARY_NAV` row (same), and `StackPlan`
  replacing `UnitMatrix` on `/units` (`.iris-matrix-row` no longer exists there — `StackPlan`'s
  `Cell` is a link to the unit's own page, not an in-page expand). Recommendation: retire or rewrite
  both files against the current component/navigation generation rather than patch ten individual
  selectors under guesswork; their functional intent is already covered by `nav-reachability.spec
.ts`, `observer.spec.ts`, `observer-product.spec.ts` and `ask-security.spec.ts` with current
  selectors. One test (`ask-iris-compare.spec.ts`, "takes 6.45 seconds to go round") failed an
  animation-timing assertion by 6.7% (0.064 against a 0.06 ceiling) — not re-verified in isolation;
  reported as suspected environment-timing sensitivity, not a confirmed regression, because it
  wasn't isolated and re-run before the report was written. One test (the file's own last,
  "Ask Observer answers from evidence, on any surface", `test.setTimeout(150_000)`) was stopped
  before its own generous budget elapsed — genuinely undetermined, not a failure, not a pass.
  The three files after it (`sign-in-baseline.spec.ts`, `units-register.spec.ts`, `views
-screenshots.spec.ts`, 15 tests) were run separately to completion: **15/15 passed.**
- **Explicitly gated** (`m10-acceptance.spec.ts`, opt-in via `OBSERVER_M10_ACCEPTANCE`, fails
  closed by its own design): its 8 tests ran inside the production batch and all 8 passed —
  consistent with the existing M10 matrix's own "8 of 8, target local-pglite" evidence, not
  independently re-verified against a live flag this pass.

**One real, previously-unreported regression found and fixed along the way**:
`ask-iris-compare.spec.ts`'s `getByRole("link", { name: "ASK IRIS" })` (no `exact`) became
ambiguous the moment the wordmark's own accessible name started containing the substring "Ask
IRIS" (the earlier project-switching session's own work) — Playwright's strict mode correctly
refused to guess between the wordmark and the nav item. Fixed with `exact: true`, which is what the
assertion always meant; verified clean in the full run afterwards.

**§6 `pnpm verify`, without a redundant rebuild.** `format:check` clean (full repo); `typecheck`
clean (`pnpm -r exec tsc --noEmit`, all 11 packages plus tests and scripts); `lint` clean (`eslint
.`, whole repo, zero warnings); `build` — not re-run standalone; the production build already
succeeded three times as the E2E suite's own `webServer` step, which is what this gate actually
checks. `test` (`vitest run`, whole repo): **one apparent failure, resolved as a timeout-budget
issue, not a defect.** The first full run (concurrent with the E2E production batch — a resource
timing mistake of this pass's own, corrected) showed 3 failed / 3343 passed and vitest's own
internal RPC timing out, both symptoms of the two heavy processes competing for the same CPU. Run
again in isolation: **1 failed / 3368 passed / 1 skipped** — `supabase/test/artefact-consistency
.test.ts`'s "finds no token the repository cannot account for", timed out at vitest's 30 000 ms
default. Re-run alone with `--testTimeout=120000`: **passed, in 30 434 ms** — three hundred
milliseconds over the default, on a slow `execFileSync` git-history walk this test's own docblock
says should take "a second." Not a bug; the default budget is tight for this machine. **Full repo
vitest is 3369/3370 correct**, the one exception being a timeout ceiling, confirmed by direct
re-run, not by inference.

**§7 source-integration honesty, verified from the shipped code, not by touching Akhilesh's
Supabase again.** Two items the morning report left open, resolved by reading the storage layer
rather than resyncing: **repeated-sync idempotency** — `observer_sessions_apply`'s own SQL
(`supabase/migrations/20260908230000_observer_showroom_sessions.sql`) is `insert ... on conflict
(project_id, connector) do update set sessions = excluded.sessions` — one snapshot row per
project+connector, always overwritten, so a second sync cannot duplicate rows by construction, not
by convention. **Restart persistence** — the local control plane's `PGlite.create({ dataDir })`
(`apps/web/src/lib/sources/local-db.ts`) points at a real, repo-relative directory on disk
(`.observer-local/control-plane`), not an in-memory instance; the same file-backed store holds both
the session snapshots and the sealed connector credentials (`db.connectorCredentialSet` in
`session-source-service.ts`), so both survive a process restart. Neither claim required a live call
to Akhilesh's project. **Source-project scope, source-to-screen mapping, external read-only
behaviour** were already verified live in the morning session and are not re-claimed as newly
proven here.

**§8 the M9 `/madspace` root, checked against the existing ledger rather than re-litigated.** Its
own lede ("Not part of this demonstration") is deliberate and current: `docs/PROJECT-STATE.md`'s
own M9 status (line 31, and the SPECIFICATION_BLOCKED note at what is now further up this file)
already records that tenant/user/agency CRUD, branding and feature flags have no field contract to
build against — a genuine specification gap, not a stub standing in for finished work. It is not a
dead end: `OpsNav` (`apps/web/src/components/madspace/OpsNav.tsx`), rendered on every `/madspace`
page including the root, links to Administration, Projects, Diagnostics and Directory — all four
real, all four already proven live in the morning session and re-confirmed passing in this one's
E2E run (`madspace-screenshots.spec.ts`, 7/7 against dev). No code change; citing the existing
classification is the correct answer here, per the mandate's own rule for a permitted
non-deliverable.

**§9 the M3–M10 ledger — read, not re-derived.** M6 (physical data layer) and M7 (ingestion) remain
🟡 partial exactly as recorded above (no domain tables for meetings/contacts/deals; no CRM/WEBIRIS
adapters); M8 (event catalogues) remains ⛔ not started (`EventRegistry` is null, by design — see
`docs/roadmap.md`, ADR-0032, and the "do not write UE5 C++ in this phase" rule this repository's own
`CLAUDE.md` states). Two items from the prior session's own agent-recommended queue — the Viktória
reference-journey completion (`docs/08-scenarios.md` §1) and the fully-specified-but-unwired
`unit.sharp_demand_decline` metric — were assessed for size this pass rather than attempted: the
metric is not a quick wire-up as it first appeared (its registry entry specifies a trailing-12-week,
weekly-windowed calculation with its own minimum-sample rule on the base, distinct from and more
sophisticated than `attention.ts`'s already-wired `demand_dropping` two-point comparison; building
it means a new per-unit weekly aggregation, not reusing an existing one). Both remain **specified
and implementable, not started** — deliberately deferred this pass in favour of finishing the
acceptance gates and this report, which the same mandate also required, rather than rushing either
under time pressure. Scope is recorded here so a future session starts from this paragraph, not
from zero.

**§10 project switching, checked against every constraint the founder actually set.** "All
projects" is additional, not a replacement: Petra's three own projects still lead the list
(`project-switching.spec.ts`, 5/5, re-confirmed in the full run); it is not a sign-in destination
(sign-in still lands on `/ask`, unchanged); it lives in the Ask header's _project_ switcher, with no
tenant dimension anywhere near it; it performs the identical `router.push` every other option in
that same control already performs — no new interaction with Ask's own reasoning scope; `/projects`
itself still does its own authorisation, unchanged, so nothing exposes a project the account does
not hold; the wordmark's own behaviour (the active project's Ask IRIS) was not touched. Screenshots
sent to the user this session (`header-1440-madspace.png`, `header-1200-madspace.png`, a fresh
production `01-ask-iris-1440.png`) are unreviewed by a human — a passing regression test is not
visual approval, and is not claimed as one here.

**Working tree and commits.** `adf0981` "Harden time.ts and meeting isolation; fix a stale E2E
locator" — 6 files, +599/−8 (`e2e/ask-iris-compare.spec.ts`, `packages/synthetic/src/time.ts`,
`packages/synthetic/test/{isolation,time,views3,session-schedule}.test.ts`). Tree is clean at
`adf0981`. **No push, no merge, no deploy, no hosted mutation, no secret rotation** — everything in
this section ran against the local dev server (port 3310), a locally-built production server (port
3210, stopped after use), and this repository's local PGlite control plane.

**Next recommended action.** (1) A human look at the three screenshots above — the only
undecided-by-a-human composition change this pass made. (2) Retire or rewrite `showroom.spec.ts`
and `showroom-screenshots.spec.ts` against the current navigation/component generation, or delete
them if their ground is now fully covered by `nav-reachability.spec.ts` / `observer.spec.ts` /
`observer-product.spec.ts` — do not patch ten selectors by guesswork. (3) Isolate and re-run
`ask-iris-compare.spec.ts`'s "takes 6.45 seconds to go round" alone, to settle product-vs-environment
before it is filed either way. (4) When there is a machine and a session free for it: `wide` and
`mobile` Playwright projects, not run this pass. (5) Pick up M9's tenant/user/agency/branding/flags
only once a field contract exists to build against — not before; pick up the Viktória journey or
`sharp_demand_decline` as their own bounded sessions, using the scope notes in §9 above.

### Continuation, 2026-09-10 — "make it client-ready": the stale-test rewrite, `mobile`, and two real bugs the walkthrough caught — `beae3d9` → `b92d149`

**The mandate.** Open-ended this time — "continue the development so it becomes usable,
client-ready" — read as: no dead ends in client-visible flows, a test suite that can be trusted
again, and a manual look at the surfaces a developer, an agency manager and a MADSPACE
administrator would actually open, not a new milestone push. M6/M7/M8 and M9's tenant/agency CRUD
remain untouched and out of scope for the reason §9 above already gives.

**`showroom.spec.ts` and `showroom-screenshots.spec.ts`, rewritten rather than patched (`beae3d9`,
predates this section but unrecorded until now).** Item (2) from the action list above. Both files
pre-dated three shipped, already-tested-elsewhere product changes — Storytelling→Features, the
retired secondary nav, `UnitMatrix`→`StackPlan` — and every replacement assertion was checked live
against the running dev server (accessibility tree, raw HTML, a standalone timing script) before it
was written, not guessed from the old selector's name. One real ambiguous-locator bug surfaced and
was fixed along the way: `showroom-screenshots.spec.ts`'s "ask observer" capture used
`getByPlaceholder("Ask IRIS…")`, which now matches both the main composer and the docked `AskDock`
mounted on every project page; narrowed to `#ask-prompt`. Both files: **29/29 passing.**

**The `mobile` Playwright project, run for the first time this pass.** Item (4) from the action
list. First attempt, six client-critical files against a server the run itself pointed at the dev
port: 91 passed, 2 skipped, **8 failed** — six of them one parameterised test
(`layout-integrity.spec.ts`, "no surface clips its own text or widens the page", one case per
viewport) and two `mobile-menu-containment.spec.ts` cases. Both files' failures were re-diagnosed
from scratch rather than filed on that first number, because the summary line undercounted its own
failures (the `.last-run.json` Playwright itself writes was the tell, not the terminal output) and
because the run had, without being asked to, pointed itself at the dev server rather than the
config's own documented production `webServer` — confirmed by the one artefact only a dev server
can produce: a "Tab reached the page beneath: NEXTJS-PORTAL" failure, `NEXTJS-PORTAL` being the dev
overlay's own portal root, absent from every production build.

**Two of the eight were a real bug, not the environment.** `mobile-menu-containment.spec.ts`'s
"covers `<main>` and the docked composer with inert" failed on `A.irs-brand` — the header wordmark
link — being reachable by Tab and by tap the entire time the open mobile sheet was supposed to be
the only thing a reader could reach. Real in either environment: `Shell.tsx`'s `inert` effect
(`apps/web/src/components/iris/Shell.tsx`) covered `#main` and `.ask-dock` and never covered
`<header>`, and `Brand` always renders a real `<Link>` there. Fixed by adding `.irs-header` to the
covered set — safe because `.irs-mobile-bar` (the trigger, the sheet) is a documented _sibling_ of
`<header>`, never a descendant, so containing the header cannot reach into the thing that opened it.
Verified against the live dev server first (the exact `leaks` query the spec runs, injected by
hand, returned `[]` after the fix; `[]` was also confirmed to be what it returned on close), then
against a real production build: `mobile-menu-containment.spec.ts` **7/7.**

**The other six were the dev-server misrouting, not a defect** — confirmed rather than assumed: a
standalone script (`artifacts/qa-shots/features-timing-check.mjs`, gitignored, same pattern as the
earlier `ask-timing-check.mjs`) hit every surface in the loop once each against the same dev server
in complete isolation and found nothing near the 30-second ceiling (939–1604ms per surface,
`features` itself at 1109ms). Re-run against the real production `webServer`
(`artifacts/e2e-runs/mobile-recheck.log`), the six became **one**: `1920`'s pass through all twelve
surfaces timed out at `/alpha/northgate/report`'s own `page.goto`, the other six viewport passes and
every other navigation to the same surfaces across the rest of the file (`report` included, more
than once) resolving in one to two seconds. Two independent production runs, two different surfaces
failing (`features` the first time, `report` the second, always on the run's first viewport pass
against a server that had just started), is a cold-start-after-boot cost occasionally pushing a
twelve-navigation loop over its budget, not a property of either page — no code or test change made
on this evidence; a confident fix would need to know which specific cost is paying that tax, which
this pass did not establish, and guessing at a timeout bump on two data points is exactly what the
standing rule against loosening budgets carelessly exists to prevent. Recorded rather than filed as
closed.

**A second, unrelated bug found on the manual walkthrough, not by any spec.** The Akhilesh Demo
Source project page (`/madspace-integration/akhilesh-demo-source/project`, the one real external
Supabase source this repository has) showed "Floor 0–0", "Price 0–0" and "surface 0–0" as the three
_most_-applied filters in "What buyers searched for" — a nonsensical reading (no buyer sets a price
range of €0–€0) that three simultaneous instances of on the same session made a default value read
as a source: `packages/connectors/src/supabase-showroom.ts`'s `buildFilters` treated a range object
as "applied" whenever either `Min` or `Max` was _present_, and Akhilesh's real UE5 telemetry
serialises an untouched range dimension as `{Min: 0, Max: 0}` rather than omitting it — confirmed
by the shape of the finding itself (three unrelated dimensions, all exactly zero-to-zero, sharing
the single highest application count) rather than by a fresh live pull against his Supabase, which
the standing constraint asks not to repeat without need. This is squarely the doctrine's own "never
render an absent value as zero" rule, on the one surface that proves the real external connector end
to end. Fixed: a range still sitting on `{Min: 0, Max: 0}` is now left out, matching the function's
own already-documented "one row per active dimension" contract; a genuine zero-to-something range
(a ground-floor filter, say) is unaffected, and the connector had no test file at all before this
pass — `packages/connectors/test/supabase-showroom.test.ts` is new, 11 cases, the regression shape
pinned explicitly rather than only the happy path.

**The manual walkthrough itself.** MADSPACE Administration, Projects, Diagnostics and Directory
(admin account); Sales Flow, Project (Overview/Units/Meetings/Features), a unit detail page, a
meeting replay, Sales Agents, Audience and Attention on Northgate; Sales Flow and Project on the
Akhilesh Demo Source project specifically, since it is the one surface a real external-data rough
edge would show up on first — which is exactly where it did. Nothing else rough, unfinished or
placeholder-like found; every screen carried real denominators, honest "Unavailable"/"No segment
here" states where CRM or sample size was actually missing, and correctly labelled provenance
("IRIS observed" vs "IRIS calculated" vs "Demo data").

**`pnpm verify`, on the clean tree at this commit.** `format:check` clean; `tsc --noEmit` clean
across every package; `eslint .` clean, zero warnings; `vitest run`, full repo, run alone: **3357
passed, 24 skipped, 0 failed** (the three release-packaging "clean tree" tests that failed mid-pass
did so correctly, against the tree as it stood with this session's fix still uncommitted — the
documented `requireCleanHead` behaviour working as designed, not a defect; they pass again once the
tree is clean, which it now is). `build` not re-run standalone — already proven twice over as the
two E2E `webServer` runs this pass performed.

**Working tree and commits.** `b92d149` "Contain the mobile menu's header leak; drop zero-default
filter noise" — 4 files, +191/−9 (`apps/web/src/components/iris/Shell.tsx`,
`e2e/mobile-menu-containment.spec.ts`, `packages/connectors/src/supabase-showroom.ts`, new
`packages/connectors/test/supabase-showroom.test.ts`). Tree is clean at `b92d149`, aside from
`apps/web/next-env.d.ts` flipping between `next dev`'s and `next build`'s own generated path and
left alone (the file's own header: "This file should not be edited"). **No push, no merge, no
deploy, no hosted mutation, no secret rotation, no write and no fresh live pull against Akhilesh's
Supabase** — everything ran against the local dev server (port 3310), a locally-built production
server (port 3210, torn down cleanly by Playwright itself after each run — confirmed no LISTENING
socket left behind), and this repository's local PGlite control plane.

**Next recommended action.** (1) The `wide` (1920×1080) Playwright project has still never been
run — a machine/time choice this pass made too, not an oversight. (2) If the layout-integrity
first-viewport flake recurs, capture a trace on the failing run specifically (`trace: "on"`, not
the default `retain-on-failure`, for one deliberate rerun) rather than guessing at which cold-start
cost to budget for. (3) Items (3) and (5) from the prior action list are unchanged and still open.

## Continuation, 2026-09-10 to 2026-09-15 — MADSPACE flagship redesign, then the Akhilesh build review

**MADSPACE `/projects` redesign, committed through `070416f`.** `New project` moved from
`/madspace` onto `/projects` itself (`66f0038`), matching where the MADSPACE admin actually lands.
A live style comparison page was built at `/design-lab/observer-style` so the user could choose
between the MADSPACE system and Observer's own (`653f1a5`); the user picked the MADSPACE direction
but asked for the per-source tally columns (Connected/Ingestion verified/Sources) dropped from the
row and `Last activity` cleaned up (`de30164`). `/madspace/projects` was then rebuilt as a flagship
screen in the same style as `/ask`, `/flow`, `/project`, `/agents` — a verdict sentence as the `h1`,
a flat plane instead of a bordered card stack (`a027466`) — and the verdict's measure was widened
from a 22ch cap (breaking a long sentence into four ragged lines) to 48ch/38ch responsive
(`070416f`) after the user flagged the design directly. `docs/20-madspace-admin-design-system.md`
and ADR-0037 govern this surface; `apps/web/src/app/design-lab/observer-style/page.tsx` is a
dev-only comparison page, not yet asked to be removed.

**Not done this window:** the IRIS-Assisted Sale (IAS) correlation feature (window/sample-size
decisions proposed, not confirmed by the user); email invitation/roles for new MADSPACE projects
(blocked on a real-auth decision); restyling the rest of `/madspace` and the project detail page to
match the flagship direction.

**Akhilesh's `InsightAnalytics.zip` (0.2.0, claimed complete through UE-OBS-010) — full review.**
Extracted and read in full (all 33 C++/header files, both test files, the Python pre-build
verifier, the local web dashboard, the `.uplugin`/`.Build.cs`). Compared against
`docs/ue5-integration-handoff.md`, the `packages/contracts/src/ue5` Zod schemas — confirmed to be
the same schemas `packages/sources/src/{activate,ingest,heartbeat}.ts` parse live requests with,
not an aspirational spec — and the prior UE5 telemetry audit. Every wire-format claim was proven by
actually running the plugin's exact request payloads through those schemas (not just read), and
every other technical claim was independently re-verified by a 13-agent adversarial workflow, each
re-opening the cited file fresh; all 13 held up (one line-range off by one line, one property-shape
claim softened after discovering `DiagnosticTestPropertiesSchema` is published in the OpenAPI doc
but not yet wired into the live validator).

**Result: `docs/ue5-review-2026-09-15-response-to-akhilesh.md`** — the response report, organized
critical → wire-contract → outbox/transport → product-decision → minor, each item with exact
file:line citations and a concrete fix. Headline findings: (1) the changelog's claim that Supabase
egress was removed is false — a live anon key and direct `user_sessions`/`global_analytics` reads
are still shipped inside `Resources/AnalyticsWeb/script.js`, staged into the packaged build by
`InsightAnalytics.Build.cs`, and Akhilesh's own pre-build verifier never scans that folder (dead
`TEXT_SUFFIXES` config), so the gate passed without ever looking; **the key should be treated as
compromised and rotated regardless of the code fix.** (2) The V2 telemetry bridge only forwards 6
event types (session start/end, click, language change, agent rating); roughly 14 legacy tracking
functions (filters, apartment views, favorites, PDF opens, balcony/floor-cut views, screenshots,
feature navigation, environment, session outcome) never call into the Observer subsystem at all —
this is the structural reason the earlier audit's 20 yellow items are still yellow, and the fix in
most cases is one added call to a `ObserverBlueprintLibrary::Track*` function that already exists
and is schema-correct. (3) The activation and heartbeat requests are wire-incompatible with the
live endpoint today (flat fields where the contract requires nested `build`/`queue` objects) —
activation would fail on first contact, which is also why Akhilesh's own self-tests only exercise
the mock transport path. (4) Several outbox/transport edge cases (HTTP 400/413/unrecognized-4xx,
`Retry-After` parsing, one corrupt queue entry, per-event full-queue rewrites) stall delivery
permanently or degrade badly rather than failing safely. (5) Three of the user's A.9/A.10 decisions
from the prior round aren't applied yet: screenshot subtypes remain in three places; the agent
rating flow fabricates a baseline "Good" vote on every session start and has no gate on the Share
Panel having been sent first; `AgentId` is `MD5(SalesPersonName)` instead of the `SalesPersonID`
GUID that already exists on the same struct, which does not meet the "privacy-safe opaque
identifier" bar for a small, named sales team. (6) A `CancelCurrentSession` bug causes the next
visitor's V2 events to be misattributed to the previous, cancelled visitor until an idle timeout.

No secret value is reproduced in the report or here. Nothing was sent to Akhilesh — no channel to
him exists from this session; the user relays it, as with the prior round of decisions.

**Next recommended action.** (1) Hand the report to Akhilesh. (2) Once he confirms the credential
rotation and the activation/heartbeat payload fix, re-run this review's §2 checks against a new
build before spending time on anything else in it — nothing downstream of activation can be proven
working until that succeeds against the live endpoint. (3) The MADSPACE items above (IAS, invites,
remaining `/madspace` restyle) are still open and independent of this review.

## Continuation, same session — `/madspace/projects` visual verification, then chasing `wide`'s 14 failures to ground

**`/madspace/projects` visually verified** against `070416f`, desktop and mobile, signed in as
MADSPACE Operations on the dev server. The verdict sentence wraps cleanly (three lines, no more
ragged four-line break), the estate rows are hairline-separated with no card borders, the tally
columns stay gone. One pre-existing, out-of-scope observation: `obs-nav` (the shared admin tab
strip) overflows at 375px with no scroll affordance — works via touch swipe, has no visual cue that
it does. Not touched; it predates this session's redesign work.

**Then ran the `wide` (1920×1080) Playwright project for the first time ever**, against the default
production `webServer` (`next build && next start`). 255 passed, 14 failed, 256 skipped, 17.5
minutes. Chased all 14, corrected course twice along the way — recorded here including the wrong
turns, because the first write-up of this section overclaimed and was itself corrected before
anyone acted on it.

- **5 of the 14 (`madspace-screenshots.spec.ts`) are not a bug.** The file's own docblock says
  outright: it needs `OBSERVER_BASE_URL=http://localhost:3310` against a running dev server with
  `OBSERVER_LOCAL_CONTROL_PLANE=1`, because `localControlPlaneEnabled()`
  (`apps/web/src/lib/sources/local-db.ts:147-149`) is hard-gated on `NODE_ENV !== "production"` —
  the default `--project=wide` invocation runs it against the production build instead, where
  `<BuildEstate />` structurally cannot render. Confirmed by isolating the file alone on both `wide`
  and `desktop` (fails identically — an invocation issue, not a viewport one).
- **4 of the 14 (`.iris-matrix-row` waits, on `/units` in `milestone-review.spec.ts` and
  `observer-review.spec.ts`) are a real test-authoring bug, and only that.** That class exists in
  `UnitMatrix.tsx` (`/project`, `/audience`), never in `units/page.tsx`'s own tree
  (`StackPlan`/`UnitRegister`/`DemandAttention`/`FindingList`) — confirmed by grep. **`/units` itself
  renders correctly**: a screenshot on a fresh production `next start` (no rebuild — reused the
  existing `.next` output) shows the full stacking plan and register, correctly, within a few
  seconds. An earlier pass through this investigation read a `hidden` attribute lingering on a
  `getElementById('S:0')` node as proof the page never reveals itself — that reasoning was wrong:
  the id is reused across unrelated Suspense boundaries per page, `querySelectorAll` finds elements
  regardless of visibility, and a page that is genuinely fine (`/project` in this same check) shows
  the identical `hidden` attribute on its own `S:0` while rendering perfectly. The earlier draft of
  this section called this a possible P0 across "Units and Meetings." Half of that was wrong; struck
  through in favour of what actually reproduces below.
- **RETRACTED 2026-09-17 — there is no `/meetings` defect.** The entry that stood here called it
  "real, confirmed, reproduced twice". It was the Claude Browser pane: React defers the streamed
  reveal (`$RC` → `$RV`) to `requestAnimationFrame`, and that pane does not paint unless fronted, so
  the swap never ran _there_. In real headless Chromium `/alpha/ister-tower/meetings`,
  `/alpha/northgate/meetings` and `/units` all reveal in 2–6s
  (`node artifacts/qa-shots/reveal-check.mjs`, which exits non-zero if a page stays on the
  fallback). A memory note written on 2026-09-09 described this exact artefact and was not applied;
  it now names the mechanism and the symptoms. The wrong claim was never acted on.
- **Every remaining failure was in three screenshot generators, not in an assertion spec.**
  `milestone-review`, `observer-review` and `madspace-screenshots` each say in their own docblock that
  they produce images for a human and assert nothing; the first two were written against the briefing
  landing and the Observer console that Ask IRIS has since replaced, and wrote into a dead session's
  temp directory. They are now opt-in through the env var each already defined
  (`OBSERVER_MILESTONE_SHOTS`, `OBSERVER_REVIEW_SHOTS`; `madspace-screenshots` needs
  `OBSERVER_BASE_URL`, as its docblock always required). Verified: 26 of 26 skip on `wide`.

**Net effect: every assertion spec that ran passed at 1920×1080 (255 of 255); `wide` has no known
product defect behind it.** Whoever wants the review image sets again sets the variable and updates
the selectors to the current UI first.

## 2026-09-17 — auth review fixes, then Akhilesh's round-2 drop

**Sign-in hardening, `6581e92`.** A security review of `lib/accounts.ts` + `lib/session.ts` found
two real gaps (no login throttling; a signed-out token stayed valid until expiry) and four
checklist items that do not apply to a scenario selector (no per-user password store, no JWT, no
reset flow; CSRF covered by Server Actions' origin check). Both gaps fixed, in-process, with the
limitation stated in the code the same way `lib/ai/quota.ts` states its own. Only failures count
toward the throttle — the demo accounts sign in correctly dozens of times across the E2E suite.
21 unit tests green, `account-login.spec.ts` 19/19 against a production build.

**Akhilesh's second `InsightAnalytics.zip` (2026-09-17), verified item by item →
`docs/ue5-review-2026-09-17-round-2.md`.** Diffed against the first drop and re-ran the exact
request shapes through the live Zod contracts. 10 of 14 round-1 items genuinely fixed (Supabase
egress gone from the web assets, verifier scans `Resources/`, 13 of 14 legacy calls bridged to V2,
`diagnostic.test` proven accepted, parser/400/413/Retry-After/corrupt-entry handling all real,
cancel-session and outcome fixed). 3 half-done (local JSON still splits screenshots, still writes
`MD5(name)` as `agent_id`, still exports environment defaults despite the new `bHasBeenSet`).
**Still blocking: activation and heartbeat are still rejected by the live endpoint** — the nested
`build`/`queue`/`last_error` objects are correct, but the old flat keys were kept as
"backward-compatibility" and both schemas are `strictObject`. Proven: with the flat keys → FAIL, without → PASS. A four-line delete. The 17/17 tests only exercise the mock transport, which never parses a request; running against `pnpm ue5:mock` on loopback would have caught it. Five smaller follow-ups recorded (unknown-4xx stall, batch size never recovers, double emission on view end, empty-string environment facts, event names off the event map). On UE-OBS-011: keep the bridge until each node is replaced, never bridge and replace the same call at once, rename first so nodes are replaced once.

**Third drop, same day — blocker closed.** Activation and heartbeat now build exactly the
contract's keys; both PASS against the live schemas (addendum in the round-2 doc). The same drop
also fixed, unannounced: unknown-4xx quarantine, batch-size recovery, the double emission, empty
environment strings, a 60s heartbeat timer, the local `agent_id`, and the slug filter. New small
finding: `build.engine_version` is `FEngineVersion::Current().ToString()`, exactly 32 characters on
a stock 5.6 build against a contract maximum of 32 — a custom engine branch fails activation and
every heartbeat on that machine. Plugin should send `ToString(EVersionComponent::Patch)`. Open,
non-blocking: `Enqueue` full rewrite, local screenshot subtypes, share gate and local rating
export, `TrackAnalytics` unbridged, event names off the event map, one-flag-for-four environment
fields.

**Next.** (1) Akhilesh runs one real loopback activation against `pnpm ue5:mock` — the shapes are
proven, the C++ HTTP path is not. (2) Ask MADSPACE whether the round-1 anon key was rotated.
(3) Decide on our side whether `engine_version`'s 32-character ceiling should reject at all: the
contract already declines to reject on `app.environment` for the same reason (a diagnostic nobody
authorises on), and this one can fail an entire activation. (4) The `/meetings` "swap failure" named earlier in this file was retracted in `d65ca7d`: it
was the Browser pane, not the product.

## 2026-09-17, afternoon — real showroom data reaches the screens, and IRIS-assisted sales

The user's instruction was to build every missing part without stopping. The order followed what
each step uncovered, and two of the most important findings were on no list: they appeared only
when a real meeting was pushed through the real endpoint and the screen was looked at.

**1. Ingested UE5 events now become meetings (ADR-0038, `5e10463`).** Nothing read
`observer.analytics_events` back; real sessions came only from the legacy Supabase connector, which
the V2 plugin no longer writes. New facade `observer_events_for_project` (migration
`20260917100000`, a file only), `eventsForProject` on the port in both adapters, a pure fold
`foldUe5Sessions` (`packages/connectors/src/ue5-events.ts`) to the same `ShowroomSession` the legacy
mapper produces, and `liveSessionSource` reading both. A failed event read costs the V2 path only,
so a database that has not applied the migration behaves exactly as before.

**2. Delivered projects run on the real clock (`104e339`). Found live.** The product's today was
the synthetic world's fixed day, 24 August, for every project, and the four periods were constants
ending on it. A meeting ingested after that day fell outside every period, so a correctly
integrated project read "0 presentations were recorded" for ever. Delivery now decides: a project
a session source delivers for resolves periods with `periodsAt(now, project.timeZone)`; every
other project stays on the synthetic day. `periodsAt` reproduces the four constants to the
millisecond when handed the synthetic today.

**3. A project's agents are read from its meetings (`705747a`). Found live.** Every per-agent read
model walked `SYNTHETIC_AGENTS`, so for a delivered project Sales Agents was empty, the meeting
filter offered nobody who had presented and an agent's page was a 404. `presentersIn(sessions)` is
the roster plus whoever the sessions name. An id no directory names is shown as the id.

**4. The lifecycle driver sends a whole meeting (`256ef01`).** "Send a showroom meeting" posts one
session as the shipped plugin sends it, through the real ingest endpoint with the real token, with
real unit codes from the catalogue. Development only. Proof script:
`node artifacts/qa-shots/v2-meeting-proof.mjs` (activate, send, read the meeting back on Meetings
and open its replay).

**5. IRIS-assisted sales (ADR-0039, `09f9edc`).** The user asked for the system to decide whether
IRIS assisted the purchase. Built as a rule, not a reading of motive: a sale is IRIS-assisted when a
meeting that opened the unit started no more than 72 hours before the date the CRM states for its
reservation or purchase. `DEFAULT_IRIS_ASSIST_POLICY` (72 h, minimum 5 dated sales, v1.0.0),
metric `flow.iris_assisted_sales` (tier `observed_sequence`), `buildAssistedSales`, a section on
Sales Flow and a finding on the unit's page. Never drawn without a CRM. The lag is stated for every
sale, so on Northgate it reads "1 of 6 dated sales (17%) ... 5 more were shown earlier, a median of
7 days before": the demonstration CRM dates sales 6 and 21 days after the meeting, which is the
rule showing that 72 hours is short for that cycle. **The buyer is not linked to the visitor**
(ADR-0011), so this is an observed sequence and cannot become an attributed conversion until a
deterministic identity link exists.

**6. Smaller things the live data showed.** The data marker said "Demo data" over real meetings;
a delivered project now reads "Live meetings" (`24ff48e`). An empty "not interested" group drew
seven bands at nought (`a87fedc`). "1 agents ... do not present alike" and a 1.0x finding for a
single presenter. A V2 meeting with no step was worded as "legacy analytics". The shared tab strip
gave no sign that it scrolls at phone width.

**7. Test health.** `surfaces` and `reference-parity` had been red since the style comparison page
was left behind; it is removed (`51d3b43`, one `git show 653f1a5` away). The release chain replay
failed as `spawn ENAMETOOLONG` at 278 commits because `git am` was handed one argument per patch;
it now replays one mbox (`03289a9`). **Full vitest on a clean tree: 3440 passed, 0 failed**
(before items 8 and 9; the closing figure is at the end of this section). **Playwright against a
production build, desktop, the five main surface specs: 101 passed, 1 skipped.**

**8. Reads that PostgREST would have cut short, silently (`1087c4e`, `7fa228b`).** PostgREST caps a
response at its `max-rows` (1000 on Supabase, lower if an operator says so) and says nothing. PGlite
has no such cap, so no local proof could show it. Three reads were exposed: the new project event
read, and the two that were already there, `observer_catalogue_current` and
`observer_deals_current`, which would have read a project with more than a thousand units or deals
as exactly the thousand that sorted first. The event read now pages behind an opaque keyset cursor
over `(ingested_at, source_id, event_id)` with microsecond precision, compared strictly; the two
connector reads page with PostgREST's own `order`, `limit` and `offset`, no SQL changed. All
three stop on an EMPTY page, never a short one, so a server that cuts at 300 still yields
everything. Proven with 2300 rows each, against a real Postgres for the events.

**9. Ask IRIS told a real project about 46 viewings that never happened (`4a53b9d`). Found live.**
The landing answers from prepared prose, and that prose is the synthetic scenario's. It was printed
on every project, so ISTER TOWER, holding real ingested meetings under a "Live meetings" marker,
answered "viewings held at 46, offers fell from 17 to 12". A delivered project now gets only what
can be worked out from what was delivered (`packages/synthetic/src/ask-computed.ts`): how many
presentations and how they ended, which apartments were opened, who presented.
`ViewContext.sessionsDelivered` is how a builder knows the script does not describe the project.
The founder's question also had no answer anywhere in Ask IRIS: the landing now offers "Which sales
followed a showing in IRIS?" as a fifth opening wherever a CRM is connected, and the tool layer has
`analyze_iris_assisted_sales` with its route. A scan of every surface of the delivered project for
the scenario's own names then found one more leak, the Presentation page comparing the one real
presenter with a roster agent who has never presented there (`0a42042`). All twelve surfaces are
clean. The scan is `node artifacts/qa-shots/scripted-leak.mjs`.

**10. A sale the CRM did not date (`c6ffbb1`).** IRIS-assisted sales needs a sale's instant, and
most CRMs state none: an export gives a date, a date is not an instant, and `readInstant` rightly
refuses it. On the pilot's own CRM the section would have read "the CRM dates no reservation or
purchase yet" for ever. Where the CRM states no stage instant, a sale is dated by the sync that
first saw the deal on the stage, **and only for a move Observer witnessed** between two syncs. A
deal first seen already sold (`opened`) is never used: the first sync sees every historical sale at
once, and that instant is when Observer arrived. The fallback is late by up to one sync and never
early, so it under-counts. Each sale carries `dateBasis`, the sentence says whose date it is, and
the note says how many were placed that way.

**11. Who may read a project's events (`a47f844`, `c7c530a`).** The new façade returns what a
showroom recorded about real meetings, from a `security definer` function in the schema PostgREST
serves. `supabase/test/events-for-project.test.ts` asks PostgreSQL: `anon`, `authenticated` and
PUBLIC refused, `service_role` admitted only through the function, the table closed, the ingestion
owner, an empty search path; and the migration re-applies over itself and over its first draft.
`meetingAction` refuses outright unless it is running on a local control plane, because it is the
one harness step that writes something a customer would see.

**12. For Akhilesh.** `docs/ue5-integration-handoff.md` §13 states what the dashboard reads from his
events, and the three things that decide whether his data joins anything. The first matters most:
`unit_id` must be the unit's code exactly as the developer's catalogue states it.

**13. Akhilesh's fourth drop, same evening (`51a3968`).** One file changed against the third drop
and in it exactly two lines: activation (`ObserverActivationClient.cpp:109`) and heartbeat (`:541`)
now send `FEngineVersion::Current().ToString(EVersionComponent::Patch)`. Through the live schemas
`5.6.0` and a worst-case `5.10.12` pass on both; the old full form on a licensee branch (41
characters) fails on both, which is the defect it removes. Secret scan clean. Compilation and the
17 tests are his machine's claims. **Next is his:** the loopback run against `pnpm ue5:mock`, the
first time the C++ HTTP path runs end to end. Addendum 2 of
`docs/ue5-review-2026-09-17-round-2.md`.

**14. The EU AI Act enters Gate 1, at the user's instruction.** An educational issue-spotting pass,
not legal advice and not a compliance claim, was run against the repository. The law was read live
from the Official Journal text: Regulation (EU) 2024/1689 as amended by Regulation (EU) 2026/1744,
the Digital Omnibus on AI, in force since 27 July 2026. Article 50 transparency applies from
2 August 2026, the Annex III high-risk rules from 2 December 2027. The decisive fact in the code:
**no surface a reader can reach calls a language model.** The live path is complete, gated and
tested and is mounted on no page, voice always refuses, and every AI-related sentence on screen
states the negative. So nothing was found that triggers today, and the questions belong to the
moment the model is connected and to the moment Observer is placed on the market. They are now rows
of `docs/11-preproduction-gates.md`, Gate 1, "The EU AI Act", with the exact wording of the law,
the dates, and where each behaviour lives.

The user's answers, recorded there: the **provider is MADSPACE s.r.o.**, established in Slovakia,
and the **deployer is the client company** under contract; every AI-written answer comes from the
Ask prompt box, so the notice belongs there, in view before the first question; AI-evaluated content
anywhere else would be announced where it appears (a pop-up was proposed, and on this date no model
evaluates anything outside the prompt box, so there is nothing for one to attach to); the showroom's
own Ask IRIS is not connected. **Open, the user's:** whether evaluating named sales agents falls
under Annex III point 4(b), which needs a lawyer, and what AI literacy measures MADSPACE takes.

`apps/web/test/ai-notice-tripwire.test.ts` makes the first of those blocks real: any reachable
file that calls the ask or voice routes, or mounts the Observer panel, must carry an element marked
`data-ai-notice`. It reads code and not comments, and it was proven to trip with a probe file.

### Closing verification, 2026-09-17 evening

- `pnpm typecheck` (every package, the strict tests project, the scripts), `pnpm lint` and
  `prettier --check .`: clean.
- **Vitest, whole suite, clean tree: 3459 passed, 0 failed, 1 skipped, 779 files.**
- **Playwright against a fresh production build, desktop and mobile, nine specs
  (`observer-product`, `showroom`, `units-register`, `layout-integrity`, `nav-reachability`,
  `mobile-menu-containment`, `ask-iris-scope`, `ask-iris-compare`, `account-login`): 248 passed,
  0 failed, 78 skipped by viewport.** The build itself is the `next build` that run starts from.
- Live, on the local control plane: a meeting sent through `/functions/v1/observer-ingest` appears
  on Meetings with its units, its replay draws timed steps, all eleven customer surfaces of the
  delivered project render without error and without a word of the synthetic scenario.
- Not run: the `wide` Playwright project, the screenshot generators (opt-in), `m10-acceptance`
  (needs CRM credentials), anything against the Preview.

### What this changed on this desk, which the user should know

The proof pressed the real harness against the LOCAL control plane. The demonstration source of
ISTER TOWER was reactivated (its token file rewritten, as every Activate press does) and four
harness meetings were ingested into `.observer-local`, one per run of the proof. **ISTER TOWER on the
local dev server therefore shows those meetings instead of its synthetic ones**, by ADR-0036's rule, and its
agent is `observer-review-harness`. Nothing hosted was touched. The event store is append-only by
design, so the way back to synthetic ISTER TOWER locally is to delete `.observer-local/`, which
also drops local connector settings. That is the user's call and was not done.

### The operator's steps, in order (none of them were done here)

**Corrected the same evening.** "After the earlier ones" hid the larger fact. By
`supabase/README.md` the hosted Preview database holds the August AI migrations and **none of the
source spine**: no projects, sources, activation codes, credentials or event store. So on the
Preview a showroom cannot activate at all yet, whatever the plugin does. The whole source lifecycle
has been proven on the local control plane only. This is what stands between Akhilesh's build and a
real backend, and it is the operator's, not his.

1. Push the branch (the Preview follows it).
2. Apply to `tfcchobwobpadenampyh` through the SQL Editor, in this order, every migration the
   hosted database does not hold yet. Confirm the list against the database first; by the README it
   is the seven of 2026-09-02 (`090000` identity spine, `093000` activation and credentials,
   `100000` analytics events, `110000` source operations, `120000` instant precision, `130000`
   credential resolve precision, `140000` projects for account), then `20260907100000`,
   `20260907180000`, `20260908230000` if the connectors are wanted, then
   `20260917100000_observer_events_for_project.sql`. Add each to the `migration repair` list.
3. Set `OBSERVER_ACTIVATION_CODE_PEPPER` and `OBSERVER_SOURCE_TOKEN_PEPPER` on the Vercel project
   (Preview scope), each at least 32 bytes of random material, generated in a password manager and
   pasted, never produced here. Without them no code can be issued and activation answers 503.
4. **Decide before doing 2 and 3 on a public Preview:** the sign-in there is the scenario selector
   with demonstration accounts switched on, and the repository is public. Anyone who signs in as the
   MADSPACE administrator could then issue a real activation code and ingest into a real event
   store. Gate 2 exists for this. For an integration test it is safer to keep it local, or to
   switch the demonstration accounts off on the deployment that holds the spine.
5. With a showroom activated against the Preview and sending events, its project's Meetings,
   Sales Flow, Project and Sales Agents fill from them. The project must have a twin in the
   read-model world by slug or name (today: ISTER TOWER, and the Akhilesh demo source).

### What is still open, and why each one stopped

- ~~A brand-new MADSPACE project has no customer-facing twin.~~ **Closed 2026-09-18** by phase 7:
  developers, a project's currency, locale and time zone, and viewer grants now live in the control
  plane, and a complete project joins the repository's world at once.
- **Buyer-to-visitor identity link** (ADR-0011): the step that would turn IRIS-assisted sales into
  an attributed conversion. Privacy and legal review first.
- ~~Agent names for plugin GUIDs~~ **Closed 2026-09-18**: the user made the name a condition (D4);
  administration names a presenter, and a showroom reports its own on `observer-agents`.
- **Event registry (M8)**: event names are matched literally in the fold, plugin names and
  event-map aliases both. Ingest still accepts any well-formed name.
- **IRIS-assist window per tenant**: no policy in the product has storage or an override path yet.
- Unchanged: the four pre-production gates, M6 domain tables, the rest of the `/madspace` restyle.

### The road to install-and-connect (the user's target, stated 2026-09-17, late evening)

**The target.** Install the plugin in an Unreal project, create a new project in Observer, the
website generates a code, the plugin asks for it, and the two are connected. Measured against the
fourth drop and this repository, four phases are done and four remain.

**What the fourth drop does about the code today.** Activation is `ActivateWithCode`, which is
Blueprint-callable, and the console command `Observer.Activate <code>`
(`ObserverAnalyticsSubsystem.cpp:222`). The diagnostics HUD prints "UNCONFIGURED (Enter Activation
Code)" and holds text blocks only: there is no field to type into, and a Shipping build has no
console. So the plugin does not ask for the code yet. Only the activation endpoint has to be set in
Project Settings, because activation answers with the ingest and heartbeat addresses; its default
is `https://observer.madspace.io/functions/v1/observer-activate`, whose path is the one this
application serves, on a host that has to exist or be replaced. The `.uplugin` says
`"Installed": false` for engine 5.6.0: a source plugin that a C++ project compiles, not yet a
prebuilt package.

| Phase                              | State             | Whose              |
| ---------------------------------- | ----------------- | ------------------ |
| 1. Contract, handoff, mock backend | done              | Observer           |
| 2. Plugin core                     | done, his machine | Akhilesh           |
| 3. Source spine and MADSPACE admin | done, local proof | Observer           |
| 4. Events to the customer screens  | done, local proof | Observer           |
| 5. The live connection             | next              | Akhilesh, operator |
| 6. The code screen inside IRIS     | open              | Akhilesh           |
| 7. A new project, self-served      | done, local proof | Observer           |
| 8. The pre-production gates        | open              | MADSPACE, counsel  |

- **5** is his loopback run against `pnpm ue5:mock`, then the operator's steps above, the host name
  included.
- **6** is specified in `docs/ue5-remaining-work-2026-09-17.md`, the list written for Akhilesh: shown
  while the source is unconfigured, one field, and the outcomes activated, reactivated,
  `activation_failed` with "ask for a new code", rate limiting, no network, and the environment
  mismatch as a warning. With it, a prebuilt package if IRIS cannot compile a source plugin, and
  `unit_id` equal to the catalogue's unit code.
- **7** was the first open item above, plus a catalogue for the new project (connector or file) so
  unit codes resolve, and an agent directory for the plugin's ids. **Built on 2026-09-18**; see the
  section of that date at the end of this file.
- **8** is unchanged: Gate 1 with the EU AI Act, Gate 2, Gate 4.

**A drift found while writing that list, and closed.** The handoff's §2.3 and the contract
document's §3.4 still described `409 already_activated` with a `source_id`. The contract removed it
long ago (`PD-27`, an unauthenticated existence oracle); the schema, the real activation and the
mock all answer a spent code with the same `401` as any other. Both documents now say so, and so do
Addendum 3 and this file, which had repeated it. The plugin's failure mapping was checked against
the four codes that exist: `400` shares the `401` sentence, and everything collapses into one
`Error` state with a sentence, so a screen has nothing to switch on yet. Also found: the plugin reads
`expires_at` where the contract says `token_expires_at` (always null today), and never reads
`environment`, `environment_mismatch` or the heartbeat's `server_time`. The mock's command line
gained `--force rate_limit,unavailable,…`, proven over real HTTP (`429` with `Retry-After: 5`, `503`,
`401`, `200`, and `401` for the same code again), so the screen's refusal states can be seen
without a parser test.

**Phase 7 is planned: `docs/21-self-served-projects.md`.** PROPOSED, nothing built. Three read-only
surveys found the whole customer side resolves projects through three repository methods over
constants, the grant list is the `VIEWERS` constant behind `viewerForAccount`, the control plane's
project has a name, a nullable slug and a status and nothing else, administration operates as one
constant account (79 uses in 21 files), and no grant exists anywhere. Already there: file import for
catalogue and deals, a reversible `prj_<uuid>` derivation, and a tested project with no synthetic
world. Seven work packages: control plane (developers, settings, grants), administration, the
directory seam with the grant merge and a real clock for every runtime project, an empty project
that tells the truth (six places the survey found that would not), the building lit by real
meetings, agent names, and the proof. **Five decisions are the user's** (§3 there), each with a
recommendation; the first is whether a developer is a table inside the one operating estate now, or
an account of its own.

**Next recommended action, as it stood that evening.** Send Akhilesh
`docs/ue5-remaining-work-2026-09-17.md`, then the operator steps above. Phase 7 has since been
built; the current next action is at the end of the 2026-09-18 section below.

## 2026-09-18 — phase 7 built: a project created in administration serves itself

Commits `1ce436e` → `217954c`, local only. The plan is `docs/21-self-served-projects.md`; this is
what became of it.

**The decisions.** The user answered on 2026-09-18: **D4, the sales agent's name is visible on every
showroom session, as a condition**, and D5 yes, the building is lit by real meetings. "Continue in
the recommended order" was taken as D1 to D3 as recommended: a developer is a row in
`observer.tenants` inside the one operating estate, MADSPACE administrators see every complete
project and anyone else needs an explicit grant to an existing account, and a project's address is
fixed once it is set.

### What was built

| Package                    | What exists now                                                                                                                                                                                                                                                                                                                                                                                                   | Commit                          |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| 1. Control plane           | `supabase/migrations/20260918100000_observer_project_directory.sql`: developers (`observer.tenants`, globally unique slug, reserved route names refused), a project's developer, currency, locale and time zone, a trigger that refuses re-addressing, viewer grants with their revocation history, presenter names. Eleven facades in the spine's posture, on the port, in both adapters.                        | `1ce436e`                       |
| 3. The directory seam      | `ProjectDirectory` port beside the catalogue, deal and session sources. Complete control-plane projects join the repository's world as `prj_<uuid>` and `tnt_<uuid>`, fixtures win any collision, a runtime project is always on the real clock and marked `ownDataOnly`. Grants merge into the viewer in `viewerForAccount`, so access is still the one rule of ADR-0029. One twin function, id first.           | `43fc8e5`                       |
| 2. Administration          | `/madspace/directory` registers developers. `/madspace/projects/[id]/dashboard` is new: address and settings (locked once saved), nine readiness checks read from persisted state, who can open it (grant, revoke), who presents (name a presenter).                                                                                                                                                              | `23820c9`                       |
| 4. An honest empty project | A project with only its own data never borrows the scenario's. One sentence, `NOTHING_RECEIVED_YET`, replaces every verdict that would have been invented, on Meetings, Project, Units, Features, Audience, Sales Flow, Sales Agents and Home. The header's data marker has a third state, `own`, that says neither "Demo data" nor "Live meetings".                                                              | `42131de`                       |
| 5. The building, lit       | `buildProjectPulse(context, meetings)`: for a delivered catalogue, a unit's light is the project's own meetings, joined on the unit code, counted by the showroom's dwell threshold. People are meetings. A code the catalogue does not hold lights nothing and is not evidence, and administration's readiness list names it: "2 of 3 codes not in the catalogue: B204, Z-999".                                  | `5542ab9`, `db4a97d`, `217954c` |
| 6. The presenter's name    | Names live only in `observer.project_agents`. Every surface that named an agent goes through `presenterName(projectId, agentId)`. Administration can type a name; **since `463bc6b` a showroom reports its own** on `POST /functions/v1/observer-agents` (`PD-30`): strict `{ agent_id, display_name }` entries, the project read from the credential, never an event, an administrator's name never overwritten. | `42131de`, `463bc6b`            |
| 7. The proof               | `artifacts/qa-shots/phase7-device.mjs` (gitignored): an administrator's browser, then a device that is not the application, then the customer's browser. See below.                                                                                                                                                                                                                                               | `f0e7ad5`                       |

### The proof, as run on the local control plane

From an empty estate: register a developer, create a project, save its settings (a bad time zone is
refused in words), grant it to Petra, create a source, generate a code. The device exchanges the
code over HTTP (`200`), tries it again (`401 activation_failed`, `source_id: null`), beats, sends
`diagnostic.test`, then one meeting of eight events. With `--roster` it also reports its presenter.
Petra's Meetings counts the meeting, names **Jana Horváthová** on the list, the replay and Sales
Agents, shows no demonstration marker, and nobody typed the name. Without `--roster` administration
flags "1 of 1 without a name" and the name is typed there. A CSV catalogue imported through
Integrations then lights B-204 on the building: "1 meaningful view from 1 person, rising", and
Units reads "1 of 10 units were opened". A sweep of the 14 customer routes of an empty project found
nothing borrowed.

### What the proof found, and what was done

- **React 19 resets a form after its action, and a controlled `<select>` stays reset.** A refused
  settings save lost the chosen developer. Now `defaultValue` from the returned state and a `key`
  that remounts it.
- **The handoff's heartbeat example had lost `queue.bytes_ceiling`**, which is required. A device
  written from that page was refused on every beat. Fixed in the document; the plugin already sends
  it.
- **The local control plane matched migrations by the prefix `202609`**, so an October migration
  would have been skipped silently. Now a comparison.
- **The pulse counted a view of a code the catalogue does not hold** as evidence for the picture.
- **A real project's first day reads in the singular**: one view, one person, one presentation, one
  meeting. Four sentences said "1 presentations".
- A finding said "none is verified by a CRM" of meetings whose outcome the agent recorded in the
  room; it now says so.

### Known, and left

- The **"CRM outcome" chip** sits on the agent's own recorded outcome on a project with no CRM. It is
  a documented decision in `MeetingOutcomes.tsx`; it reads wrongly there and needs the user's word.
- A segment finding is stated at n = 1 meeting.
- Overview for a runtime project says no overview is composed yet. By the plan.
- The same person on two showroom PCs is two agents, because each kiosk mints its own identifier.
- ~~No way to delete a presenter's name exists~~ **Built the same day**, see below.

### For the operator, one addition

`20260918100000_observer_project_directory.sql` joins the list in "The operator's steps", after
`20260917100000`. Until it is applied to a hosted database the application behaves as before on
that database: the directory read fails, the legacy project rows are used, no runtime project
appears, and `observer-agents` answers `503`.

### For Gate 1

Observer now holds personal data it did not hold before: **the display names of sales people**, who
are employees or contractors of a developer or an agency. One table, outside the event store, a
display name and nothing else. The privacy review has to see it: the lawful basis, what the sales
people are told, how long a name is kept and how one is removed. That is data-protection law, named
here as a signpost and not assessed.

### On this desk

`.observer-local` holds a dozen proof developers and projects (`Alder Homes …`, `Birch Estates …`).
Birch Court 215818 (`2e634c71-1081-4ff3-af93-432dec473500`, `/birch-estates-215818/birch-court-215818`)
has one real meeting and a ten-unit catalogue, and is the one to open. Nothing was pushed and
nothing hosted was touched.

### Verification

At `463bc6b`: `pnpm format:check`, `pnpm typecheck` (every package, the tests, the scripts) and
`pnpm lint` clean. `pnpm test` from Git Bash on a clean tree: **138 files, 3564 passed, 1 skipped,
none failed**, and the process still exited 1 on two `[vitest-worker]: Timeout calling
"onTaskUpdate"` errors. That is the symptom `vitest.config.ts` documents; the dev server and a
browser were running beside the suite. The closing run is recorded under it.

The live proofs are the scripts named above, run against the dev server on the local control
plane: the whole road with a typed name, the whole road with a reported roster, the catalogue
import and the lit unit, and the unit code diagnostic. Each screen they end on was looked at as a
screenshot in `artifacts/qa-shots/`.

### Closing verification, 2026-09-18, and the two things it found in the apparatus

- **The two `onTaskUpdate` timeouts were not load.** They came back with nothing else running.
  A hook and a test that each block for 35 seconds reproduce them alone: a synchronous hook and the
  synchronous tests after it are one stretch to the worker's event loop, and the release suites
  build a package synchronously for 45 seconds and then scan the branch's history for 40.
  `test-support/yield.ts` (`506f5ba`, `36d2dd3`) turns the loop before every test; five turns
  were needed on Windows, one was not enough.
- **Then one test timed out at 30 s:** "finds no token the repository cannot account for", 28.6 s
  on the first run of the day. `accountableHashes()` asked `git rev-parse` for each commit's tree,
  a process per commit, 317 today and one more with every commit, inside every `build()` and
  inside that test. One `git log --format='%H %T'` gives the same set (`2846aaa`, checked): the
  test now takes 1.9 s and the whole suite 207 s instead of 260 to 293.
- **Vitest, whole suite, clean tree, at `2846aaa`: 138 files, 3564 passed, 1 skipped, 0 failed,
  no unhandled error, exit 0.** Repeated at `47fe98a`, the last commit of the day, after the
  documentation: the same 138 files, 3564 passed, 1 skipped, 0 failed, exit 0, in 290 s.
- **Playwright against a fresh production build, desktop and mobile, twelve specs** (the nine of
  the 2026-09-17 closing plus `authorization`, `project-switching`, `agent-authorisation`):
  **288 passed, 79 skipped by viewport, 13 failed**, 18 minutes. The thirteen:
  - ten are `authorization.spec.ts` on `mobile`: it looks for the desktop header's Period
    combobox, developer switch and viewer name, which the phone shell keeps in its menu (unchanged
    since 2026-09-10). Every one passes on `desktop`. Test debt, filed as a task, not a regression.
  - two are `layout-integrity` on `mobile` at 1366 and 1280, timeouts. Rerun alone, all four
    wide widths take 31 to 32 s against a 30 s budget on the Pixel 7 profile and the narrow ones 15
    to 20 s; on `desktop` every width passes, and a timing probe put each surface at 1 to 1.4 s to
    network idle. The 2026-09-10 notes already call this case a flake on mobile. Whether this day
    added the missing second or the margin was already gone is not established; the task above
    covers it.
  - one is "Units is unharmed" on `desktop`, a 30 s sign-in wait in the long run; alone it passes
    in 3 s.
- The build is the `next build` those runs start from. Not run: `wide`, the screenshot
  generators, `m10-acceptance`, anything against the Preview.

### Next recommended action

1. **Akhilesh needs three things from this day**, and they reach him only if the branch is pushed,
   which is the user's word: the roster endpoint (handoff §8.4), the corrected heartbeat example,
   and `pnpm ue5:mock --force`. `docs/ue5-remaining-work-2026-09-17.md` carries all three.
2. The operator's steps, with the new migration.
3. The user's word on the "CRM outcome" chip for a project with no CRM.

### The four decisions the user took on 2026-09-18, and what each became

1. **Push.** The branch is on `origin` through `cc26720`. The PR stays open and unmerged. The
   Preview follows the branch and now builds this code without the directory migration, which is
   the path that was checked: the directory read fails, the older project list answers, no runtime
   project appears, and `observer-agents` answers `503`. The Preview therefore behaves exactly as
   it did yesterday.
2. **The hosted migration stays unapplied**, by the user's decision, until Akhilesh needs a live
   endpoint. The operator steps and their ordering are unchanged.
3. **A presenter's name can now be removed, not only replaced** (`observer_project_agent_name_set`
   with a null name). It is a **withdrawal and not a deletion**: the row is kept holding no name,
   `named_by = 'withdrawn'`, because a deleted row would be refilled by the next roster report
   inside the read memo's half minute, and a removal that undoes itself is not a removal. The
   showroom's report function already refused to write over anything not its own, so it refuses this
   too. Administration can name again afterwards. Proven live: the name was removed, a real
   showroom activated and reported that very name back (`200`, `recorded 0`), the screen still
   said removed, the customer's Meetings showed the identifier again, and naming again restored it
   (`artifacts/qa-shots/phase7-withdraw.mjs`). Gate 1 has the item and the facts that support it
   (`docs/11-preproduction-gates.md`); the legal question is named there and not answered here.
4. **The "CRM outcome" chip is gone from the agent's own recorded outcome.**
   `CRM_OUTCOME_CONTEXT` is defined in `@observer/contracts` as a fact the CRM holds, and this one
   is not: the agent selected it on the showroom's widget and the showroom sent it as an event. It
   now reads `IRIS observed`, which also makes the finding showroom-rooted as ADR-0023 requires.
   Two aggregate screens that listed the CRM as a source on every project — Sales Agents and Sales
   Flow — now list it only where a CRM is connected, which is what the Project screen already did.
   The two guarded ladder chips on Sales Flow were already correct.

   A screenshot of the fixed replay then showed the same contradiction one line further down: the
   journey step reading "Recorded by the agent at the end of the meeting" wore a "CRM outcome"
   chip. The caption was right and the chip was wrong; the step is now `IRIS observed`
   (`packages/synthetic/src/showroom/project.ts`), and the unit test that had encoded the old
   classification says what is true instead. The replay of a project with no CRM now names one
   nowhere at all, which `artifacts/qa-shots/phase7-chips.mjs` asserts.

   **And the same claim survives one layer down, which is NOT fixed.** The read model attaches the
   CRM source to findings through two local `WITH_OUTCOME` constants
   (`packages/synthetic/src/showroom/views3.ts:64`, thrice; `.../screens.ts:88`, nine times). At
   least one is wrong on every project: `flow-unrecorded` states "N of M meetings ended with no
   outcome recorded" — the showroom's own widget — and names the CRM. Measured live: a project with
   no CRM connected still prints "CRM outcome" once on Sales Flow, from that finding
   (`artifacts/qa-shots/phase7-chips.mjs` counts it). Others are genuinely CRM-adjacent (deal
   stages, catalogue status) and one is already behind a `crm &&` guard. Twelve call sites, each
   needing its own judgement about which source contributed; left as its own pass rather than
   half-audited here.

**A plural, found by looking at the screenshot.** Sales Agents read "1 meetings in this period, 19
short of the 20 needed for a verdict". The fix was already in the file it belongs to: a
`meetings()` helper whose own comment calls this the kind of small wrongness that makes a product
feel unfinished. Three sentences now use it.

**Verification of this follow-up.** `pnpm --filter @observer/web exec tsc --noEmit`, the migration
suite (20 cases, including a withdrawn row that a roster cannot refill and the two constraints that
refuse a nonsense row), `packages/sources` and `apps/web/test` (654 + 978 passing), and the live
proof above. **Closing run at `41d24ae`, the day's last commit, on a clean tree: 138 files, 3567 passed, 1
skipped, 0 failed, exit 0.**

Two full runs earlier in this follow-up exited 1 on `CLEAN TREE: the working tree is not clean` in
three release suites. That is the apparatus working: both were launched while an edit was still
uncommitted, which those suites refuse by design. Recorded rather than quietly re-run, because the
mistake was mine twice.

### The switcher menu, 2026-09-18 — `605cce6`

The user opened the project switcher after counting seven projects on `/projects`, found three, and
reported two things at once. Both were the same control.

**The list belonged to the operating system.** Project, developer and period were native
`<select>` elements, chosen deliberately: a project list is what a select is for, it works on a
phone with no script, and it is keyboard-correct before anybody writes any. Every word of that held
except the part a reader sees. Styling reaches a select's closed button and stops; the list it opens
is drawn by the OS, so a graphite header opened a white panel with a system-blue bar. It was the
only surface in the product that belonged to no design system, on the control a reader touches most
often.

`ContextSwitcher` now draws `.ox-menu`: a `<details>` panel on this system's ground with its
hairline, Manrope, a drawn chevron and tick at one stroke weight, and blue on one row only, which
here means "a person decided this and a person can change it". The rows are LINKS, which is what
they always were underneath — every option already carried an href — so a project opens in a new tab
like anything else, and the browser says where a row goes before it is pressed. `<details>` carries
the open state, so the control works with no script at all; the effect adds only Escape and a press
outside. `PeriodSwitcher` renders the same control instead of a second select of its own.

**The list did not say what it listed.** The project switcher holds ONE DEVELOPER'S projects,
because two developers are two businesses and no screen shows both — and a closed button showing one
project's name states none of that. Each menu now opens with the sentence its rule needs:

- Project: `Every project you can open in Alpha Estates.`, and a last row, `All 7 projects you can
open`, which is the number the reader just saw on `/projects`. The count is summed in the project
  layout from lists it already read.
- Developer: `Developers you hold. Opening one shows its first project; two developers never share a
screen.` — the second surprise on the same screen.
- Period: `Every figure on this page is measured over the period you choose here.`

**Two design-system rules answered rather than bent.** `--ox-lift` is now the one elevation,
declared once on each ground and spent by the two things that float, a dialog and a menu; its test
refuses a blurred shadow written as a literal anywhere, including a second copy of that value. And
the accessible-name rule moved from "each switcher file contains `aria-label`" to "the control names
itself and every caller passes a label", which is what it always meant.

**Verification.** `pnpm typecheck`, `pnpm lint`, `prettier --check .` clean. Full vitest on a
clean tree at `605cce6`: 138 files, 3567 passed, 1 skipped, 0 failed, exit 0. `apps/web/test` 646
passed. Four E2E specs rewritten onto the control a person actually operates — press, read, follow a
row — through one `e2e/switcher.ts`: **54 passed against a production build**, desktop. Looked at:
the project, developer and period menus on the analytical header, the Ask header's own, and the
phone sheet at 393px (`artifacts/qa-shots/menu-shots.mjs`, gitignored).

**One collision the user should know about.** The task spawned earlier for the mobile Playwright
project edits `e2e/authorization.spec.ts` for a Period **combobox** that no longer exists. Its
finding stands — at phone width these controls live inside the mobile menu and that spec never opens
it — but its selectors are stale, and both sessions touch the same file.

## 2026-09-18 — Akhilesh's fifth drop, verified rather than taken on its word

`InsightAnalytics (3).zip`, opened in the session scratchpad and never into this tree. His note
claimed four things. All four are true, and the check was not the note.

**Read in his source.** The activation screen is new (`SObserverActivationScreen.{h,cpp}`, 499
lines) and carries everything `docs/ue5-remaining-work-2026-09-17.md` §2 asked of it: a viewport
widget at z-order 2000, so a packaged Shipping kiosk needs no console; the four outcomes with the
four sentences that document specified, near enough verbatim; a live countdown fed from
`Retry-After`; and the buyer-privacy rule enforced in three places, not one. Post-activation it
sends a heartbeat and a `diagnostic.test` by itself, which is the three ticks lighting without a
click. The three unread response fields are read: `token_expires_at` with a fallback,
`environment_mismatch`, and `server_time` turned into a clock skew on the HUD. The `expires_at`
still in the subsystem is his local credential file, not the wire.

**Then over the wire.** His two payloads, built field for field as his code writes them, sent over
real HTTP to a real Observer (`artifacts/qa-shots/drop5-payloads.mjs`, gitignored): nine checks,
all green — activation `200 activated`, both heartbeat shapes `200`, `diagnostic.test`
`accepted`, and the spent code `401 activation_failed` with `source_id: null`. The payload half of
the loopback question is therefore closed before he runs it.

**What is still open, and it is the same first item.** His seventeen automation tests contain no
HTTP request at all — no `FHttpModule`, no `CreateRequest` under `Private/Tests/` — so the C++
transport has still never had a request parsed by a server. That was item §1 before this drop and it
is item §1 after it. Told to him plainly in the document, with what the payload proof already
removes from it.

**One note, no action.** He broadcasts `409` for a local outbox-source mismatch
(`ObserverAnalyticsSubsystem.cpp:733`). Nothing on our wire answers `409` — `PD-27` removed it —
so a reader of that delegate could take it for a server code. Suggested a local constant.

The reply to him is `docs/ue5-round-3-verification-2026-09-18.md`.

**Not in this drop, and not expected in it:** the presenter roster endpoint (`PD-30`, handoff
§8.4), which was specified the same day this build was made.

## 2026-09-21 — P1-04: a word the copy had dropped

The UX overhaul's first four tasks are read-only audits; this is the first one that changed the
product. Ten "mandatory clarifications" from the plan were taken one at a time against the source.
Seven were already satisfied, two name a surface that does not exist, and **one was a real defect**.

**Nothing needed a new catalogue.** The question was whether a shared definition layer exists. Four
do, and they already agree with each other: the metric registry (`packages/metrics`, 61 metrics,
from which the matrix and the UE5 spec are generated), the glossary
(`packages/readmodels/src/glossary.ts`, 21 measurements, each carrying its own `limitation`), the
absent-value vocabulary (`words.ts`), and the closed state vocabularies in `screens.ts`. A fifth
would only be a fifth place for one word to mean two things.

**The defect: a gap in the record, printed as a statement about a person.** The metric was always
careful — `people.follow_up_delay` measures days to the next _recorded_ contact and demands
`activity.occurred_at` from a CRM to do it, and `FOLLOW_UP_STATES` says outright that Observer never
sees the call that came afterwards. Two surfaces had dropped the word. The agent Overview said a
buyer "has been waiting N days for a reply" and, when the list was empty, that "Every buyer has been
contacted since their meeting" — a positive claim about an event this product cannot observe. The
Ask answer said four prospects "have had no contact since their meeting" and labelled a figure
"Uncontacted after a meeting".

`/attention` and `/showroom` were checked in the same pass and were already right: "Units shortlisted
with no follow-up recorded", with its denominator. So the fix was the same single word in eleven
strings across three files, and no field, table, metric, event or threshold moved.

**The test holds the definition, not the wording.** `apps/web/test/follow-up-definition.test.ts`:
a surface may say a contact is not recorded; it may never say one did not happen, that somebody is
waiting, or that everybody was reached. Seven banned phrasings, scanned across three source roots
including comments, plus the structural half — every follow-up reason, the verdict headline and the
metric's own rule must name the record — plus the two states that must never collapse: the four
follow-up labels stay four distinct words with only `unavailable` naming a CRM, and an unlinked
visitor never renders as a missing integration.

**The tripwire was measured, not assumed.** Stashed back to the pre-fix copy it fails two of its four
cases and names seven hits in `agent.ts`, `pulse.ts` and `overview/page.tsx`. A tripwire born green
proves nothing.

**Verification.** `pnpm typecheck` clean; `pnpm exec eslint apps packages scripts e2e supabase
test-support` exit 0; `prettier --check` clean after formatting; vitest over `packages/synthetic/test`
plus the new file, `ask` and `showroom` — 17 files, **295 passed, 0 failed**. And looked at, which is what found the last defect: the section title. "No contact recorded since the meeting" was 37 characters against a product whose longest other section head is 18, so the limit moved into the head's own `aside` and the title went back into family. Screenshot of the signed-in agent Overview taken and read, scratchpad `p104/agent-overview-desktop.png`.

**Left open, deliberately.** A real visitor name (P1-08b — recorded here as blocked by product
decision, reopened 2026-09-21, see `docs/22-visitor-name-display.md`); a standalone
IRIS-open-to-Sold metric, which would be a new canonical definition; the premium tier, the tier
editor and R14/R15, which have no surface and would need a table this phase forbids; and the
follow-up _deadline_, which no source carries — which is exactly why the copy now states a missing
record rather than a missed commitment.

The task-by-task evidence is in `_review/ROUTE_MAP_AUDIT_VERIFIED_2026-09-21.md` §10.

## 2026-09-21 — P1-05: a role list that was written down and never read

Six navigation and scope questions, taken against the source. Five were already answered. The sixth
found the first real authorisation defect this repository has had.

**What was already right, with its evidence.** `PRIMARY_NAV` is the approved four and three separate
tests pin the exact keys. Project scope lives in the path and record scope in a query parameter, and
nothing mixes them: the Ask scope row is `Current / All / Compare` and carries no "my meetings".
Every project page is a server component reading `params` and `searchParams`, so Back, Forward and
reload are the browser's own and need no state machine. The period survives every hop because
`PageHead` spends `withPeriod` on each crumb centrally and `PersonCard` does the same for a person's
link, which is why no call site wraps it and none has drifted. No route segment or query parameter
is named after a person or a credential, and the AI telemetry hashes its subject and records "no
prompt, no answer, no question, no tool arguments" by design.

**The defect: `/meetings/[meetingId]` declared three roles and checked none.** `SURFACES` restricts
it to `sales_agent`, `agency_manager` and `madspace_admin`, and the page quoted that list in its own
docblock — "is not this file's to move" — beside no call to `requireSurface`. So a developer who
typed the address got the whole replay. The product disagreed with itself in two places at once: the
_report_ of the same meeting already refused them through the identical call one file away
(`report/page.tsx`, written a fortnight after the role list), and the _brief_ half already refused
them in the repository under ADR-0018. One route, three surfaces, two guarded.

**And it was worse in prose than on screen.** `explain_meeting_journey` reconstructs exactly what the
replay renders, and had no check at all. The failing test prints what a developer used to get back:
the presenting agent by name, the section order, the duration, the units opened and how the meeting
was recorded as ending. `tools.ts` states the rule it was breaking — "a tool that answers what its
own surface refuses, or refuses what its surface answers, is the inconsistency this comment used to
warn about" — arriving from the other direction.

**The fix is one predicate, spent twice.** `maySeeSurface(role, key)` lives in `routes.ts`, which is
data; `requireSurface` is now a redirect wrapped round it, and the tool throws the
`NotPermittedError` the agent loop already reports as "refused" rather than as "no such analysis".
It does _not_ live beside `requireSurface`: `authz.ts` imports `next/navigation`, and putting it
there dragged Next's own `ProcessEnv` declaration into the compilation of every test that reaches
the tool layer and made `process.env.NODE_ENV` read-only in four unrelated suites. Found by
typecheck, moved, gone.

**The guard is structural, not anecdotal.** `surface-authorisation.test.ts` states three rules rather
than pinning today's routes: a restricted project surface enforces the list it declares unless it
only forwards; no page guards a surface other than its own, which is how the fail-open last-segment
matcher gets tripped; and the tenant and project in the URL are checked as a pair against the
viewer's grants, with a granted pair alongside so a refusal cannot pass for the wrong reason.
Stashed back to the pre-fix code, three of its eleven cases fail.

**Fixtures moved, assertions did not.** Four suites reached the replay as Petra because she is the
convenient open-anything account, not because anything asserted a developer may read one:
`ask.test.ts` (which already carried the identical note for the brief one line below), the
accessibility sweep in `showroom.spec.ts`, its "a replay states its gaps" case, and the preserved-
screens table in `ask-iris-compare.spec.ts`. Each now signs in as Monika, who runs meetings on that
project. The replay's accessibility pass is its own test now, with a URL assertion in front of it,
because a sweep that silently axes the redirect target reports a clean result.

**Verification.** `pnpm typecheck` clean; `pnpm exec eslint apps packages scripts e2e supabase
test-support` exit 0; `prettier --check` clean; vitest over `apps/web/test` and
`packages/synthetic/test` — 46 files, **907 passed**; Playwright `authorization`, `showroom` and
`ask-iris-compare` on desktop against a production build — **69 passed, 1 failed**.

**That one failure is not this change.** `ask-iris-compare.spec.ts:616` ("Projects is not in the
reference header") fails identically on `be7a46f` with everything stashed, checked rather than
assumed. It is unrelated header debt and is filed separately.

**The one decision this leaves MADSPACE.** The fix enforces the declaration, which is the only
direction that can be taken without a product decision. If developers are _meant_ to see meeting
replays, the correct fix is the opposite one — widen the `SURFACES` entry to four roles and drop
`report/page.tsx`'s guard — and the four fixture accounts go back. That is a product call, not an
implementation one.

The task-by-task evidence is in `_review/ROUTE_MAP_AUDIT_VERIFIED_2026-09-21.md` §11.

## 2026-09-21 — P1-06: two words that were written twice, and one that was lost

A gap analysis of the shared component layer, not a design system. Four questions, two real
findings, and one thing that needs a decision rather than a patch.

**The shared layer is real, and it is three families rather than one.** `@/components/product` (the
`ox-` idiom) on nine customer routes, `@/showroom/parts` (`iris-`) on five, `@observer/ui` (`obs-`)
on MADSPACE administration and its own loading boundary. That is deliberate: the repository's stated
rule, written on `components/meetings/vocabulary.ts`, is one vocabulary and several shapes —
"Nothing here invents a label… What is chosen here is only the SHAPE". A grep for copy strings
shared between the two customer families returned **exactly two**, and both belonged to one
component.

**Finding one: the demonstration-data marker said the same thing twice.** `SyntheticBadge`
(`showroom/parts.tsx`) and `Synthetic` (`components/product/Absence.tsx`) are two treatments of one
statement — a loud amber pill in the shell, a quiet chip on a page — and each carried its own copy
of both sentences, the second one's comment even pointing at the first. Nothing had diverged; the
point is that nothing would have noticed if it had, and the claim at stake is whether a reader is
looking at real meetings or at a demonstration. `DATA_SOURCE_MARKERS` now lives in
`packages/readmodels/src/words.ts`, beside `NOTHING_RECEIVED_YET`, which is the third state of the
same question. Both renderings read it; the CSS was not touched and neither treatment moved.

**Finding two: a control that truncated and never said what it had cut.** `.ox-menu-value`
ellipsises at every width the product ships, so "Northgate Residences" read "Northgate Resi…" on a
**1920px** header, where nothing is short of room, with no `title` anywhere. It came in with the
switcher rewrite (`605cce6`) and `layout-integrity.spec.ts` had been failing on it at all seven
viewports since: 16 passed, 7 failed, every failure the same clip on `/ask`. The suite's own rule is
the fix — an ellipsis with a title is a shortened label, an ellipsis without one is a clip — and it
is the answer `irs-who-name` and both synthetic markers already give. One attribute in
`ContextSwitcher.tsx`, which is the one component every switcher in the product is built from. The
accessible name never had the problem: the summary's `aria-label` carried the full value all along,
so the reader who could not recover it was the one looking at the screen.

**Responsive: nothing else breaks.** `layout-integrity` now runs **28 passed, 0 failed** across
1920/1440/1366/1280/1024/768/393 — no surface widens the document, nothing is clipped, Unit
Attention keeps all six columns at every width, and the Ask dock covers no content on any of the
eight surfaces it is checked against. Screenshots at 390/768/1440/1920 of `/ask`, `/units`,
`/agents` and `/meetings` were taken before and after and looked at.

**Keyboard: clean, and measured rather than assumed.** Forty-eight tab stops across `/units`,
`/agents`, `/meetings` and `/presentation`: **every one draws a visible ring**, measured with the
same predicate `design-lab-a11y.spec.ts` uses, and the order is identical and sensible on all four —
skip link, brand, the four sections, Projects, Settings, Sign out, project switcher, period
switcher, first in-page control. No trap, no silent `outline: none`.

**What this leaves MADSPACE, and it is not a patch.** `/overview` is the last customer-facing route
still built from `@observer/ui` — `Card`, `MetricGrid`, `AlertList`, `VerdictStrip` — which is the
M2.1 card stack `docs/12-visual-autopsy.md` rejected by name: "Every element on the Overview is a
`border-radius: 0.875rem` panel with a hairline… eight identical containers stacked vertically",
and "The card system **is** the failure". It is also reachable from nothing: a search of the whole
application finds no link to it, while `surfaces.test.ts` exempts it as "reached from within another
surface", which is not true today. Converting it is a screen redesign and belongs in the phased
review the doctrine sets out, not in a consistency pass. Three options, all MADSPACE's: convert it,
link it, or retire it.

**Verification.** `pnpm typecheck` clean; `pnpm exec eslint apps packages scripts e2e supabase
test-support` exit 0; `prettier --check` clean; full vitest on a clean tree — **140 files, 3588
passed, 1 skipped**; Playwright `layout-integrity` on desktop against a production build — **24
passed, 0 failed** after the fix, against 16/7 before it.

`shared-vocabulary.test.ts` states both rules rather than pinning today's strings: the marker's
sentences appear in no component in either idiom, every component that draws it reads the shared
constant, the two states are told apart, and the switcher's truncating value carries a title beside
its ellipsis. Stashed back to the pre-fix code, all four fail.

The task-by-task evidence is in `_review/ROUTE_MAP_AUDIT_VERIFIED_2026-09-21.md` §12.

## 2026-09-21 — P1-07: a gate that can be built, and an activation that cannot

The commercial gate. FREE, PRO and MAX, deny-by-default, restrictions that add up, and an audit of
every way a priced figure could reach a reader around it. The resolver is delivered and tested. The
activation is BLOCKED, for two reasons that are recorded rather than worked around.

**A third question, composed with the two that already work.** Which tenant and project a viewer
holds is settled by the repository, which refuses before it reads. Which role may open a screen is
settled by `maySeeSurface` and enforced by `requireSurface` inside each page. Neither was
duplicated: `entitlements.ts` answers only the commercial question and a surface has to satisfy all
three.

**It fails closed, and `maySeeSurface` fails open, and both are right.** An undeclared _surface_ is
one nobody restricted, so denying it would make a page unreachable rather than unguarded — the
failure nobody reports. An undeclared _capability_ is one nobody priced, and answering "allowed"
there gives away whatever is added next, silently, to everybody. The two defaults are opposite
because the two questions are.

**Restrictions add up and never subtract.** `requiredPlan` takes the MAXIMUM across the whole
ancestor chain rather than the most specific match, so a nested view asking for
`metric.exec.revenue` cannot be cheaper than `metric.exec` — one careless line in a child cannot
grant what its parent refuses, and a child view is exactly where nobody looks.

**Where the plan value comes from: nowhere persistent, by the plan's own permission.** There is no
tier column, no entitlement table and no key-value store to save one in — `account_preferences` has
three fixed columns and `connector_configs` is keyed by a four-value check constraint (P1-03 §9.7).
The v3 plan anticipated exactly this at line 310: where no durable tier configuration exists, a
version-controlled default registry in application code may be used, admin editing is then an
unsaved preview, and the runtime task stays BLOCKED. So `TENANT_PLANS` is empty, every tenant
resolves to `DEFAULT_PLAN`, and that default is FREE rather than MAX — a default that admits
everything means the day a capability is priced, every tenant keeps it and nobody notices the gate
does not work.

**The bypass audit found no content leak, and one structural gap.** Six API routes: four pass
through `gate()`, and the two connector routes are write paths behind a timing-safe bearer compare
and an HMAC signature that return operational status and no read model. The report export produces
no file at all — `ReportGeneration.state` is typed to the single member `preview_only`, so there is
nothing to download around a gate. Every Supabase call lives in a `server-only` module under `lib/`,
already covered by `control-plane-boundary.test.ts`. No content anywhere is hidden with CSS: the two
`display: none` rules in the product sheet are layout, not gating.

The gap is on the read path. The repository port takes a viewer, two slugs and a period, and knows
nothing about plans, so a priced capability would have to be filtered in each of the 21 project
pages that call it — which is the "one control in two places is one control and a copy that will
drift" failure `gate.ts` warns about. **So premium activation stays BLOCKED**, and deliberately not
by touching RLS, a policy or a schema, which the v3 package forbids outright. Two things unblock it,
in this order: a durable tier store, and one enforcement point on the read path rather than
twenty-one.

**Nothing changes on any screen.** Every root in the registry is FREE, so wiring it in later can
only take something away deliberately. It has no production caller yet, and that is the plan's own
sequencing — C26 spans phases 1 to 3 — rather than an omission. Adding a caller now would mean
gating a feature nobody has priced, which is a product decision and not mine.

**Verification.** `pnpm typecheck` clean; `pnpm exec eslint apps packages scripts e2e supabase
test-support` exit 0; `prettier --check` clean; `apps/web/test` — 34 files, **678 passed**; full
vitest on a clean tree — 142 files, **3601 passed, 1 skipped**.

**The guards were measured, not assumed.** Three mutations of the resolver — an unknown plan treated
as FREE, an unpriced key allowed, the deepest ancestor taken instead of the strongest — were applied
and reverted. Four of the thirteen cases failed, one per defect plus the chain case. A guard born
green proves nothing.

The task-by-task evidence is in `_review/ROUTE_MAP_AUDIT_VERIFIED_2026-09-21.md` §13.

## 2026-09-21 — P1-08a: an identifier was standing where a name should be

The presenter's name — who gave the presentation, never the buyer. Split from P1-08b by decision;
that half was recorded as blocked and nothing here moved toward it. It has since been reopened —
`docs/22-visitor-name-display.md` — and the split itself was right either way: these are two
different people and the presenter half never depended on the other.

**The defect, and it was live on delivered data.** A showroom mints its own identifier for whoever
ran a meeting, and the name for that identifier arrives separately: from the roster an
administration keeps, or from the installation's own report of who presents on it. Where neither had
arrived, `presenterName` returned the identifier itself, defended in a comment as "the truth about
it". It is the truth and it is not a name. Akhilesh's delivered demonstration showed **"agent-guid"
as the person who gave the presentation**, and a reader who does not know the shape of these ids —
which is every reader this product is for — has no way to tell that from somebody actually called
that. It is the same class of defect as a zero standing for a figure nobody measured, and `words.ts`
exists to answer exactly that class.

**The fix is one word, in the vocabulary that already owns this.** `PRESENTER_NOT_NAMED` and
`presenterWord` join `NOT_STATED`, `NOTHING_RECEIVED_YET` and `DATA_SOURCE_MARKERS` in
`packages/readmodels/src/words.ts`, and `presenterName` and `presentersIn` spend it. **The
identifier stays beside the words**, and that is the other half of the requirement rather than a
detail: two presenters nobody has named are still two presenters, and dropping the id would merge
them into one anonymous person — turning a stated absence into a false claim about who did what.

**Two people with one name were already safe, and are now proven safe.** Identity is the identifier
the showroom minted and never the label a directory gives it. Two ids named "Ján Hruška" keep two
rows, two ids, two pages, one meeting each, and both appear in the meeting filter. The world file
had argued for this in prose for the two Lucias; it is now a test over the harder case, where the
whole name matches rather than the forename.

**The boundary held and is now guarded.** A test asserts that whatever the visitor label says, it is
one of the three states `visitorLabel` declares, and that no presenter's name appears in it. P1-08b
was recorded here as blocked by product decision, citing ADR-0018, `docs/05-identity.md` and
`docs/10-policies.md`; that reading was wrong about all three and the task was reopened on
2026-09-21 — see `docs/22-visitor-name-display.md`. What is written above still holds: nothing in
this round introduced a pseudonymous handle, a stable visitor identifier or anything else, and the
boundary test still guards the label. No event, contract, connector or read-model type was touched.

**Four tests had encoded the old rule**, including one that printed `name: "agent-guid"` with a
comment explaining why. They were updated together with their comments rather than just their
strings, because a test whose prose still teaches the old rule is how the old rule comes back.

**What could not be shown on screen, and why.** The unnamed case exists on the delivered demo
project, whose sessions come from the control plane; this machine has no Docker and therefore no
local control plane (ADR-0008), so the running application shows that project as empty and the
screen could not be photographed. The last hop was verified in code instead: both surfaces print the
read model verbatim — `agent: row.agentName` in the register, `` `Presented by ${replay.agentName}.` ``
on the replay — so what the read model now says is what a reader sees. Worth a look when a control
plane is available: that lede reads "Presented by Name not available · agent-guid." The label form is
right for the table cell, the card and the filter, and is merely clumsy inside that one sentence.

**Verification.** `pnpm typecheck` clean; `pnpm exec eslint apps packages scripts e2e supabase
test-support` exit 0; `prettier --check` clean; full vitest on a clean tree — 143 files, **3608
passed, 1 skipped**. Stashing only the fix leaves four of the seven new cases failing, one of them
reading `expected 'AG-1' to be 'Name not available · AG-1'`.

The task-by-task evidence is in `_review/ROUTE_MAP_AUDIT_VERIFIED_2026-09-21.md` §14.

## 2026-09-21 — P1-09: the decision, spent once and above the port

P1-07 built the commercial decision and left it with no caller, on purpose: wiring it into
twenty-one pages is twenty-one copies of a control, and `gate.ts` already says what that costs —
"a security control that exists in two places is a security control that exists in one place and a
copy that will drift". This is the caller.

**Not in the repository, and that is the argued part.** The obvious home knows the tenant already.
But `ObserverRepository` is a contract with more than one implementor — the synthetic world today,
a database repository later (ADR-0007) — so a filter written inside one class is a filter the next
class has to remember, which is the same drift arriving by a different door. `entitled` wraps
whatever implements the port, in the composition root that is already "the single place in the
application that knows which repository is in use". Swapping implementations cannot lose the gate,
because the gate is not in the implementation. A proxy rather than thirty delegating methods: hand
delegation covers the methods somebody remembered, and forgetting one is silent.

**What it removes.** The figure — display, raw, qualifier, sampleSize, comparison, evidence,
drillHref — from any metric the plan does not reach, and the formatted value from any verdict
component quoting the same metric, which is the second door and the easier one to miss because it is
not a `MetricValue`. The number never reaches the process that renders the page, so it cannot be in
the payload, in a hidden element, in a chart's data, in a tooltip or in a summary sentence.

**The refusal is one constant**, and that is the disclosure half rather than a convenience. Two
metrics with entirely different values behind them produce objects identical field for field, and
the same metric refused on a full project and on a thin one produces the same object. It fails
closed: a response whose tenant cannot be resolved has an unknown plan, and an unknown plan reaches
nothing, including what FREE reaches.

**No new component.** A redacted metric is `unavailable` carrying its reason, which is the state this
product already draws and `Figure` already renders. A second way to draw one state is the
duplication this round exists to remove. When a family is actually priced, the region-level band in
`Absence.tsx` is where the reason belongs in full — that wiring is Phase 3, not now.

**Nothing changes today.** Every capability is FREE, and a test asserts the wrapper's output is
byte-identical in that case rather than assuming it. One test was wrong before the code was: it
asserted an evidence _href_ never appears, but an href is a route every other figure on the screen
also links to. The id identifies the record; the href identifies a page.

**Verification.** `pnpm typecheck` clean; `pnpm exec eslint apps packages scripts e2e supabase
test-support` exit 0; `prettier --check` clean; `apps/web/test` plus `packages/synthetic/test` — 50
files, 940 passed; full vitest on a clean tree — 144 files, **3617 passed, 1 skipped**. Four
mutations applied and reverted: keeping the figure (4 cases fail), letting
the message vary with the data (1), leaving the verdict's copy alone (2), guessing MAX instead of
failing closed (1).

Runtime premium activation is still BLOCKED for the two reasons P1-07 recorded — no durable tier
store, and the registry prices nothing. This is the gate installed, not the gate closed.

The task-by-task evidence is in `_review/ROUTE_MAP_AUDIT_VERIFIED_2026-09-21.md` §15.

## 2026-09-21 — P1-10: the access matrix, and the two defects it found

Observer refuses in three places and each refuses differently: the repository settles tenant and
project (`NotPermittedError` / `NotFoundError`), `maySeeSurface` settles role and **fails open** on
an undeclared key, `decideAccess` settles plan and **fails closed** on an unpriced one. Three
vocabularies, two opposite defaults — and nothing in this repository had crossed them. The role gate
was tested against real viewers with no plan in sight; the plan gate against literal strings with no
viewer at all.

**The matrix earned its keep immediately.** `decideAccess("FREE", "toString")` answered
`{allowed: true}`, and so did `constructor`, `valueOf`, `hasOwnProperty` and `__proto__`:
`registry["toString"]` is a function on every plain object, so a bare index let five key names walk
past a gate whose entire purpose is to fail closed. `planForTenant("constructor")` returned a
function typed as a `Plan`. No caller can reach it, because every key is built dotted under a
declared root — which is exactly the "safe because of how the callers happen to behave" reasoning
this product refuses everywhere else. Registry reads are own-property reads now.

**And a second.** `filtered()` rebuilt any object, so a `Date` came back as `{}` — while the
docblock directly above it claimed a date passed through untouched. Read models carry strings where
they carry instants, so nothing shipped was affected; a comment that says the opposite of the code
is worse than no comment. Only plain objects and arrays are rebuilt now.

**The fixture imports nothing**, which is the strongest available form of both constraints. A table
with no imports cannot reach a repository, cannot construct a viewer and cannot be fallen back to.
It lives in `test-support/`, which no tsconfig that builds the application includes; the six
capacities are named as strings and resolved against the real `VIEWERS` by the test. A guard asserts
no application file mentions it.

**84 cases.** Role × surface including the fail-open row and both last-segment shadowing collisions,
asserted deliberately rather than excluded. Plan × capability across three plans and thirteen
not-a-plan shapes. The full role × plan cross-product, which nothing had. Address cells: granted,
tenant-not-held, project-not-held-under-a-held-tenant, real-project-wrong-tenant (NotFound, not
Forbidden), two slugs that exist nowhere, and a derived zero-grant viewer. And the three gates
composed — address allows, role allows, the plan still removes the figure.

Adding both files to `tsconfig.tests.json` — which its own docblock asks for — surfaced three type
errors the runtime had tolerated, including `getHome` calls missing the period the port requires.

**What the matrix cannot cover is said out loud**, as data a test reads, using the P1-03
known/partial/unavailable discipline: **trial expiry is not a missing test but a missing feature**.
There is no trial, no subscription period and no expiry anywhere in the product, and a test would
have to invent the feature first. The test re-runs the grep rather than quoting it. Two others:
`MetricValue` state `error` has no producer, and a tenant priced above the base cannot exist while
`TENANT_PLANS` is empty — which an existing test requires.

**Verification.** `pnpm typecheck` clean; `pnpm exec eslint apps packages scripts e2e supabase
test-support` exit 0; `prettier --check` clean; `apps/web/test` plus `packages/synthetic/test` — 51
files, **1024 passed**. Reverting only the registry fix fails 6 of the 84 cases.

The task-by-task evidence is in `_review/ROUTE_MAP_AUDIT_VERIFIED_2026-09-21.md` §16.

## 2026-09-21 — P1-11: two dead ends, and a route that was reachable all along

**The /overview decision was offered on a false premise, and I had supplied part of it.** The brief
said nothing links to the route. My own P1-06 audit said so. So does a comment in
`packages/synthetic/src/overview.ts` and a line in `docs/observer-visual-baseline.md`. All four were
wrong for one reason: the href is built in a READ MODEL — the evidence reference on What needs
attention — so it never appears as a literal anywhere under `apps/web/src`, which is the only place
any of us looked. A grep of one directory is not a search.

So ADR-0023 is satisfied: "The conversion funnel leaves the primary navigation. It remains
reachable, labelled as outcome context" — and an evidence reference beside an outcome check is
exactly that. The ADR also rejects deletion by name ("Demotion, not deletion"), and option 3 was
never a one-line removal: `surfaces.test.ts` requires a SURFACES entry for every page, so removing
the entry means removing the page, which five e2e specs open directly. Option 1 is a rewrite of the
last `obs-` customer route, which `DESIGN.md` records as a scoped decision not yet made and the
doctrine puts inside a review cycle rather than a `should` task.

**Option 2, then — but what needed fixing was the comment, not the link.** The allow-list entry in
`surfaces.test.ts` named a justification rather than a place, the only entry in that list that did,
which is how the orphan check stayed green while nobody could say where the route was reached from.
It names the anchor now, `nav-reachability.spec.ts` follows it in the rendered DOM, and the two
other copies of the false claim are corrected.

**I also built and then removed a link.** Before verifying, I added "The CRM outcome view" to Sales
Flow's deal-ladder section on the strength of the same wrong premise. Once the real anchor turned
up, a fourth entry point had no justification and would have put the rejected M2.1 card system in
front of a reader for nothing. Reverted.

**Two real dead ends, and one of them is mine.** An Ask answer offered "Reports arrive in M4"
pointing at `/overview`, caveated "Report generation is not built yet". M4 has shipped — `/report`
is a declared surface with a real page, linked from Project and from the export dialog — so a reader
who asked for a report was told the thing they can already open does not exist, and sent to the
CRM-led surface instead. It points at `/report` now, and the caveat keeps the half that is still
true: the page composes the report and generates no file.

The second came from P1-05. Closing the `/meetings/[meetingId]` role hole left the navigation
disagreeing with it: the register drew every row as a link and every one bounced a developer back to
Ask IRIS. A pre-existing e2e test found it, by failing. Both registers now draw the row as text for
a reader who may not open one, with one shared sentence saying why. The rows stay — this is not
hiding data, it is not offering a door that is locked — and `requireSurface` is still the access
control.

**Verification.** `pnpm typecheck` clean; `pnpm exec eslint apps packages scripts e2e supabase
test-support` exit 0; `prettier --check` clean; `apps/web/test` plus `packages/synthetic/test` — 51
files, **1024 passed**; Playwright `nav-reachability` on desktop against a production build —
**17 passed, 0 failed**, against 14 passed / 1 failed when the round began.

**Not fixed, and recorded rather than passed over.** The survey found several refusal-vocabulary
inconsistencies that are real but are each a product decision rather than a dead link: a forbidden
Ask thread renders as a read failure with a retry that cannot help; a forbidden report section
returns null and vanishes; `BriefView` distinguishes "Not available to your account" from "No brief
for this meeting"; `/madspace/projects/{unknown}` renders a plausible "Unknown project" page where
its own sibling tab refuses. The last two touch ADR-0018 and the MADSPACE surface respectively, and
collapsing them would remove explanations a legitimately-refused reader currently gets. They belong
in a round that can take that decision.

The task-by-task evidence is in `_review/ROUTE_MAP_AUDIT_VERIFIED_2026-09-21.md` §17.

## 2026-09-21 — P1-12: let `pnpm verify` run, and close the Phase 1 gate

**The gate's first requirement could not be met until the gate itself was fixed.** `pnpm verify`
stopped at step one: `prettier --check .` reads the filesystem rather than git, and two inbound
directories are present but untracked — `_planning/`, the v3 task package, and `Claude outputs/`,
the reviewer's progress document. `pnpm lint` failed the same way, 228 problems in a single
delivered file nobody here may change. P1-02 recorded both as baseline conditions, which was right
at the time and is not a gate. The repository already answers this exact class and says why, in
`.prettierignore` and under the eslint config's "THE DELIVERED EXPORT IS EVIDENCE, NOT SOURCE"; the
two new directories are the same class, excluded from git the same way, and are now excluded from
both tools for the same stated reason. No product code changed, and `format:check` and `lint` now
pass on the whole repository instead of a hand-scoped subset.

**The full run, on a clean tree.** `VERIFY EXIT: 0` — prettier clean, eleven package typechecks plus
the tests and scripts projects clean, eslint clean, **145 test files / 3701 passed / 1 skipped** in
206s, and `next build` compiling 21/21 static pages. The tree stayed clean afterwards.

**End-to-end, reported split rather than blended.** Desktop: 321 passed, 130 failed, 80 skipped.
Every one of the 130 is in the three `design-lab-*` specs, and **the product specs are 315 passed,
0 failed**. The cause is not a regression: the lab route calls `notFound()` unless the local control
plane is on, which needs a non-production `NODE_ENV`, and the default harness builds and runs `next
start` — `design-lab.spec.ts`'s own docblock says so and gives the dev-server command. I invoked the
wrong command for those three specs. Not run, and not claimed: the `wide` and `mobile` projects.

**The frozen baseline holds.** All 124 files from `_review/FROZEN_BASELINE_2026-09-21.txt`
re-hashed: 124 unchanged, 0 missing, 0 changed. No schema, RLS, policy, RPC, event, contract or
ingestion byte moved during Phase 1.

**Three contributors, three purposes, not one number.** The 41-file `+3506/−90` total splits as:
this session's P1-04…P1-11 product and test work, `+3390/−88` across 39 files; `308a3cc` from the
separate background session, `e2e/ask-iris-compare.spec.ts`, `+47/−2` in 1 file; and this round's
own gate commit, infrastructure rather than product code, `+69/−0` across 3 files. The lines add up;
the file counts do not, because `docs/PROJECT-STATE.md` and `e2e/ask-iris-compare.spec.ts` each
belong to two of the three, so the union is 41 rather than 43. Git author and `Co-Authored-By` are
identical on all ten commits, so the split rests on commit identity and purpose, not on metadata —
stated rather than implied.

**Verdict: Phase 1 can close.** All three access gates are built and guarded — role
(`surface-authorisation`, 14), plan (`entitlements` 14, `entitled-repository` 9, `access-matrix` 13
its over 84 cases), tenant/project (`isolation`, 33) — and the shared vocabulary, navigation and
scope layers are ready for Phase 2 route rebuilds. Five items stay open and are listed separately in
§18.6: the durable tier store (commercial, BLOCKED), tenant-versus-account plan scope (commercial),
P1-08b's real buyer name (reopened on 2026-09-21 and in design — `docs/22-visitor-name-display.md`;
this entry originally recorded it as deliberate and permanent, which was wrong), and P1-11's four
refusal inconsistencies (product
decision — best taken inside each route's own Phase 2 round). P1-07's second blocker, the read-path
enforcement point, was resolved by P1-09 and is recorded as closed. The one named exception to
"shared components are ready": `/overview` is the last `obs-` customer route and is not a precedent.

Evidence: `_review/ROUTE_MAP_AUDIT_VERIFIED_2026-09-21.md` §18.

## 2026-09-21 — P1-08b-redesign: the record was wrong about its own reason, and about the facts

**P1-08b was never blocked by the documents it cited.** It was recorded as blocked by product
decision on ADR-0018, `docs/05-identity.md` and `docs/10-policies.md`. Read again, none of the three
says it. Rule 3 scopes itself twice — "No name, email or phone in **an event or an observation**,
ever" — and a screen is neither. ADR-0018 governs which _surfaces_ the internal brief may reach and
names the meeting drill-down as one where it belongs. `10-policies.md` §3 sets the pseudonymous
identifier for an **anonymous web visitor**, before anybody knows who they are. The over-reach was
ours: `packages/readmodels/src/screens.ts` read rule 3's behavioural scope as a display scope and
called the meeting list "the one surface where a name may never appear".

**Two findings then inverted the task.** First, the product has been printing real buyer names the
whole time: "Viktória Halász" and "Daniel and Eva Bartoš" reach the brief heading
(`BriefView.tsx:82`), the sales-agent Overview (`overview/page.tsx:224`) and the Ask IRIS answer
(`lib/ai/tools.ts:634,672`) through read-model fields that are already name-shaped — and
`e2e/observer.spec.ts:139` **requires** the brief's `h1` to contain one. Second, and this is the one
that shortens the work: a real visitor name already exists in a source Observer connects to every
sync. `packages/connectors/src/supabase-showroom.ts:20-30` records as a live confirmation that
`public.user_sessions` carries `visitor_name` beside `sales_person`, plus `session_data.UserName` —
"the same fact, twice" — and that the adapter drops both at three points: the query selects only
three columns (`:369`), `RawSessionData` does not declare `UserName` (`:97-135`), and
`mapShowroomSession` hard-codes `contactId: null` (`:319`).

**So the blocker is real but it is a different blocker.** The adapter states its own reason, and it
is not privacy doctrine: **ADR-0005 found that project's session table readable by anyone holding its
anon key with no row-level filter.** Reading a name across that boundary would pull personal data
through an interface with no authorisation on it. That is fixable on the source side, and it is now
step 2 of the Phase 2 plan rather than an unexplained prohibition. It also confirms the decision's
own premise literally: the name in that table is the one the sales person typed in.

**What the rest of the stack looks like.** Lomnio's `GET /v1/leads` returns `customer.name` with
consent flags beside it, and the adapter's own type reads `email`, `phone` and `phone_e164` while
omitting exactly `name` (`connectors/src/deals.ts:256-260`). REALPAD puts names behind
`list-excel-customers-contacts`, which no code references. `CrmDealSchema` is a `z.strictObject` that
would _reject_ a name rather than ignore it. `ContactPii.fullName` exists with zero producers and
zero consumers, and no contact table exists in any of the 22 migrations — the only name-holding
column in the schema is `observer.project_agents.display_name`, which is also the design: an opaque
ref plus a nullable name, joined at read time, withdrawal expressed as a null.

**A live defect found and deliberately not fixed.** The unit page tells the reader on screen that
"No contact name, email or telephone number appears on any surface of this product"
(`units/[unitCode]/page.tsx:402-403`). That is false, and the e2e test above proves it false. Fixing
it is a component change, which this round was told not to make, so it is recorded in
`docs/22-visitor-name-display.md` §3.1 and needs its own decision. The identical false absolute in
`components/product/Person.tsx` **is** corrected, because a docblock is not a component change. The
two neighbouring claims on the agents and meetings pages are correctly scoped to the visitor column
and are true.

**Recommendation: Phase 2, and take the showroom path rather than the CRM path.** Every remaining
step is one this phase forbids by name — a durable store, a source field, and a consent join needing
both. The open product question is visibility: the brief is gated to three roles and names people,
while the register is open to the whole agency and does not, so extending the name to the register
widens an audience the brief's gate deliberately narrowed. That decision constrains the store, so it
goes first.

**What this round shipped.** `docs/22-visitor-name-display.md`, and the corrections: `screens.ts`,
both `MeetingRegister` docblocks, `Person.tsx` and two comments in `presenter-name.test.ts` now say
the absence is current and under design rather than permanent and decided; five places in this file
say what was recorded, that it was wrong, and where the correction lives. **No component, no type and
no assertion changed — the only executable lines touched were comments.**

Evidence: `_review/ROUTE_MAP_AUDIT_VERIFIED_2026-09-21.md` §19.

## 2026-09-21 — P2-03: the history register already keeps its promises, and two findings that belong elsewhere

**R03 passes all three DoD clauses, and the mechanisms were checked rather than read.** That
distinction is the week's lesson: a docblock is reliable about intent and unreliable about state, and
the ones that name their mechanism are both the strongest claims and the cheapest to verify.

**Pin, rename and delete.** `ThreadList` draws none of them — no button, no click handler, no write
icon in its imports — and the refusal is stated **once for the whole region** by an `Unavailable`
with no action, because "the writing is not built, not merely out of this account's reach". That is
`docs/12-visual-autopsy.md` §9 applied correctly: one statement of what is missing, once, in place of
the region it affects.

**Absent metadata is not invented.** `selectionLabel === null` renders nothing, consistently in all
four places that read it. The title is the opening question, and the promise that the list and the
thread show the same string "by construction" is true: one private `plans()` function feeds both
`buildAskHistory` and `buildAskThread`.

**Premium cannot take a short cut through the list.** There is no per-method redaction that could
diverge: `entitled()` is a Proxy over every member, so the summary read and the detail read pass
through the same walker. Nothing is priced above FREE today either, so nothing redacts at all.

**A guard, because a mechanism verified once is only verified once.** `apps/web/test/history-read-only.test.ts`
holds the two named mechanisms: no interactive element and no write icon in a row, and exactly one
`<Unavailable>` on the page. Counted rather than merely found, because a test asserting the sentence
exists would pass on the screen that repeats it per row — which is the failure the autopsy recorded.
Proved by three mutations: a pin button, a pencil import, and a second refusal each fail their own
assertion and nothing else.

**Two findings that are not R03's.** The Ask landing page (R01) renders the same conversations with
**five disabled controls per row** — an inline rename, then a menu of share, rename, pin and delete,
so the rename is drawn twice — where R03 renders none. Corrected: this entry first said four, which
was a miscount of the same markup. The sibling page anticipates three (`history/page.tsx:44`), so
three numbers were in circulation for one fact, and the committed one was wrong. Its own sibling argues against it in words: the history page records that
drawing disabled controls per row "would satisfy the letter of that and break its purpose". One
product, one fact, two opposite answers. It is another route, so it is recorded rather than bundled.

The second is latent: `ask-history.ts:369` falls back to `title: first?.question ?? "Ask Observer"`,
which is a generated label standing in for a title — the thing the line's own comment argues against
two lines above. No plan literal has zero answers, so it is unreachable today, and the type is what
permits it. Named rather than patched, because an unreachable fallback cannot be mutation-proved and
a guard nobody can break is the shape this week keeps finding.

Evidence: `_review/ROUTE_MAP_AUDIT_VERIFIED_2026-09-21.md` §25.

## 2026-09-22 — P2-04: a warning nobody can open, and a sentence that outran its own condition

**The numbers did not move, and that is measured rather than asserted.** Every figure, rank,
severity, sample size, tier and subject count the attention read model produces, for three projects,
dumped before and after: twenty-nine lines, byte identical. The round changed what is claimed, not
what is counted.

**The main correction is a sentence that knew more than its branch.** The no-CRM state's detail said
"None of the N presentations in this period has a recorded outcome, and no CRM is connected to
supply one." Its branch condition is `!crm`, which establishes only the second half. Outcomes are
recorded in the room, not by the CRM — Ister Tower has a CRM connected and eleven of eighty-two
presentations unrecorded — so the two facts are independent, and they coincide on Riverside because
the fixture happens to pair them. A claim true by coincidence reads exactly like a claim that
follows. It now says what the branch knows: no CRM is connected, so nothing can confirm what the
presentations ended in. The title was already right; verification is what is missing.

**And a category error in the affected list.** `subjects` is rendered under the accessible name
"What this is about", and it held `Connect a CRM` — which is what to do about it. One item, and a
reader could not tell what it was one of. It names the scope now: every presentation in the period.

**Lateness is not claimed anywhere, and that was checked rather than assumed.** Searched the builder,
the contract and the component for `overdue`, `late`, `waiting`, `chasing`, `days since`, `deadline`,
`still not`, `too long`, `should have` and `behind`. No hits outside comment prose. The follow-up
state says "ended without an outcome that asks for a follow-up" — what was recorded, not what is
late — and its clear-state question asks whether a meeting ended without a follow-up being recorded.

**OPEN ITEM, and it is mine.** On Riverside the Briefing prints "Nothing in this period is waiting on
a decision from you" while What needs attention raises four states, one of them a warning at rank 1.
P2-02 set out to close exactly this contradiction and narrowed it instead: the Briefing leads with
the highest-ranked state only when that state has an `actionHref`, and the no-CRM branch has nowhere
to send a reader and so carries none. The parity test asserts the fallback, which means it currently
describes the gap rather than catching it; the assertion is now marked as a known gap rather than
left to read as an endorsement. Closing it is a Briefing question — what to say when the thing worth
acting on cannot be opened — and it belongs to R02's own round.

**Two raised states have no openable affected list**, which is the DoD's first clause unmet and
recorded rather than papered over: the no-CRM outcome state, and `source_offline`, whose subjects are
the quiet installations. Neither has anywhere to send this reader that exists and is permitted.
`StateList` already refuses to draw a dead link — a subject without a route renders as plain text,
because "a chip that looks identical to its neighbours and does nothing when pressed is the
control-that-does-nothing the doctrine forbids". So there is no false door; there is an absent one,
and making it real is route work rather than naming.

**The four refusal inconsistencies deferred by the P1-12 gate were checked against this route.**
`BriefView`, `ask/[threadId]`, `report/page.tsx` and `madspace/projects/[projectId]` — none is R04.

Evidence: `_review/ROUTE_MAP_AUDIT_VERIFIED_2026-09-21.md` §26.

## 2026-09-22 — The Briefing gap is closed: "Clear" is a claim about the checks, not about the links

**Yesterday's open item is closed.** Riverside printed "Nothing in this period is waiting on a
decision from you" over four raised states because the highest-ranked one carried no route of its
own. It now leads with that state's title and sends the reader to the register of warnings.

**The rule, and it is the one worth quoting later.** The Briefing leads with the rank-1 state's title
whenever any state is raised. Its button is the state's own action when the state has one, and
`/attention` when it does not. "Clear" only when no check is raised at all. A missing route is a fact
about one state; it was being reported as a fact about the period, and the period is what the
sentence is about.

**The fallback door was checked before it was offered.** Every role that can open the Briefing can
open the register: `SURFACES` declares
`["developer", "agency_manager", "sales_agent", "madspace_admin"]` on both, identically, and that is
the complete role vocabulary — `ROLE_WORDS` is typed `Record<Viewer["role"], string>`, so the
compiler requires it to name every member and it names four. Neither surface carries an entitlement
key either, so both inherit the FREE default. Without that check the fix would have reintroduced one
level up exactly the locked door P1-11 removed one level down.

**The button names where it goes.** A reader told "Look at it" who lands on a list has been misled by
one word, so the fallback says "Open what needs attention" and the read model carries the label
rather than the page assuming it.

**What moved, measured.** The Briefing's full output for three projects, before and after: three of
thirty-six lines differ, all of them the leading alert. Signal, verdict, because, every figure, every
door, sources and evidence are byte identical, and the two projects whose leading state already had
an action kept the same text and the same href.

**What the new expectation allows, written down so it can be argued with.** A leading state with no
action of its own may send the reader to `/attention` rather than to itself. The previous expectation
allowed something nobody would sign — that a project with four raised states including a rank-1
warning may correctly say nothing needs a decision, provided that warning has no link — and it
survived because a mutation proved the test could fail, which was read as proof that it guarded the
right thing. It does not follow. The guard now fails on exactly that case: restoring the old
behaviour breaks it on Riverside with "expected null not to be null".

Evidence: `_review/ROUTE_MAP_AUDIT_VERIFIED_2026-09-21.md` §27.

## 2026-09-22 — P2-05: the rule that reached one figure out of four

**The board's example was real and I found it by measuring, not by reading.** Northgate shows
"Presentations 41" in the summary row and 74 presentations everywhere below it — the board's "41 vs
74", exactly. Both are correct: the summary answers to a window the reader picks, everything below
answers to the page period.

**What was missing is why a reader could not tell.** `Progressing` has named its own window since
somebody worked out that it had to, and left the reasoning in a comment: the chip row that sets the
window is several lines away, and a reader comparing two figures needs the span on the card rather
than up the page. That reasoning was right and it reached **one figure out of four**. The other
three carried a comparison — "36 before" — and never said before what. A rule applied to one of four
places is not a rule yet.

All four name their window now, and a guard says so: it fails with the offending figure and its
qualifier printed, because the next figure added to that row will not read the comment.

**No value moved.** Values, deltas and tones for three projects across all three windows, diffed
before and after: identical. Only the qualifiers changed.

**The other two clauses were checked and hold, with the mechanisms verified rather than read.** Deal
conversion is not a meeting ratio: the ladder is built from `deals.deals` filtered by stage, drawn
with `noun="deals"` under the heading "The deal ladder, as the CRM states it" and a CRM source chip,
and the registry defines it over contacts reaching a stage. The meeting figures are named as
meetings — "Meetings, and how many progressed". And the 74-vs-39 pair on the same screen is
explained by the ladder's own note: 60 deals as they stand now, a rung counting deals at that stage
or further along, where each deal stands rather than the path it took, 21 lost beside it.

**Two figures that used to make this worse are already gone**, and that was verified rather than
assumed: a page-computed "N of M had an outcome recorded" and a per-agent "X% progressed" over a
different denominator than the ring above it. The only trace left is the docblock recording their
removal.

**A guard from the round before this one**: the Briefing's fallback destination is now declared with
its reason, and a narrowing of `/attention` fails with the excluded role named. Twenty of the
forty-three declared surfaces carry a narrower role list than the Briefing, so the fallback pointed
at one of the safe twenty-three by luck rather than by construction.

Evidence: `_review/ROUTE_MAP_AUDIT_VERIFIED_2026-09-21.md` §28.

## 2026-09-22 — P2-06: the calculator is built and proven; the data it needs is not there

**UI_READY and runtime BLOCKED, which is what the board asked to be told apart.** The shared
calculator exists, lives in the contract layer so four routes read one formula rather than four, and
every one of the seven cases the board enumerated has its own test named after the board's own word.
Nothing on this deployment can feed it.

**One reason checked, and a second that was asserted and is corrected below.** The metric's required facts are
`meeting.attended`, `online.session.observed` and `deal.stage.changed`. The online half has **no
producer at all** — `OnlineSession` appears nowhere under `packages/synthetic/src` — so "the buyer's
first recorded interaction, online or in the showroom" cannot include the online side.

**Correction, and it is the failure this phase keeps naming.** The first version of this entry gave
a second reason as a universal: that every read on the port takes an `OverviewQuery`. That is
false. Of the interface’s 33 members 26 do, and seven do not — `listTenants`, `listProjects` and
`resolveProject` take a `Viewer`; `resolvePeriod` takes a `ProjectId` and produces periods rather
than escaping them; `getPreMeetingBrief` and `getMeetingReplay` take a `BriefQuery` carrying a
single `meetingId`; `getEvidence` resolves one reference. None of the seven returns a unit’s
opening history: four are directory or resolution reads, two answer for one meeting, one resolves
one reference. The conclusion survives — the original opening time across the full accessible
history is not reachable — but it survives as a list rather than as a universal, which is the form
the rule written two rounds earlier asks for. The block therefore rests on the first reason, which
was checked; this one supports it without carrying it.

**What exists and what it answers.** `AssistedSales` already pairs a CRM-stated sale date with a
showing, and already carries `dateBasis` to say which record the date came from. But it measures the
**last** opening before the sale, because its question is proximity — did a showing precede this sale
within seventy-two hours. A cycle measured from the last opening would shrink as a unit drew more
attention, which is backwards, so the two cannot share an implementation even though they share
inputs.

**The interval sits on two clocks and the summary says so.** One end is observed by a showroom
installation, the other is a date a CRM states. Different precision, possibly different time zone,
and one is somebody else's record of an event rather than an observation of it. `clocks` is carried
on every summary rather than assumed, because a duration between two clocks is not wrong but is
uninterpretable unless the reader is told.

**Four of the seven cases describe data no fixture produces** — a sale dated before the showing that
led to it does not occur in a world written to be plausible — so the cases are built from
constructed input. That is the point of them: they are the shapes a calculator must not answer with a
number. A negative interval is not zero and not its absolute value; a sale the CRM has not dated is
not an instant sale; an opening at the edge of the data is a floor, not a fact.

**No existing figure moved, and by construction rather than by comparison**: no builder was touched.
The only edits outside the new files are one barrel export.

**What is still needed before the runtime can be unblocked**, in the order it would have to arrive:
a per-unit first-opening timestamp reachable across the full history rather than one period slice;
online session observations, or an explicit decision that the cycle starts at the first showroom
opening and says so; and the CRM's Sold transition timestamp, which the deals path already carries.

Evidence: `_review/ROUTE_MAP_AUDIT_VERIFIED_2026-09-21.md` §29.

## 2026-09-22 — P2-07: reach and time-share, told apart on the figure

**Project Overview's segment figures are three different kinds of measure behind one suffix.**
`stockShare` divides units by units, `attentionShare` divides seconds by seconds, and
`favouriteShare` / `compareShare` / `shareShare` divide counts of unit-touches by counts of
unit-touches — plus `index`, which is the second of those divided by the first. The enumeration is
the deliverable; the arithmetic was already right.

**The rule was applied in two of the three places that draw it.** The segment panel names the kind
and the denominator on every figure, and the parity scale says both per row. The quadrant matrix
drew `1.41× attention` bare, on a line whose conversion half already carried its comparison and its
sample size. It now reads `1.41× attention for its share of stock`. No figure moved: a before-and-
after dump of every share, index, count and denominator on R06 came back identical.

**No path exists from the place-of-interest demo to a real recipient list**, established four
independent ways rather than by reading the page: `AudienceMatch`
(`packages/readmodels/src/views3.ts:405-412`) has no field that could carry a recipient — its six are
`meetingId`, `startedDisplay`, `agentName`, `outcomeLabel`, `because`, `href`, and `agentName` is
staff; the audience page has no send or export of any kind; `getAudience` has one non-test consumer;
and the live showroom connector does not populate place interactions at all
(`packages/connectors/src/supabase-showroom.ts:72-76`).

**Correction, recorded because of where it landed rather than how large it was.** The review log
first cited that type at `views3.ts:236-243`, which is `SEGMENT_QUADRANTS` and `SegmentConversion` —
a different type, with different fields, in the same file. A reader following the reference arrives
somewhere that does not support the claim and has to decide whether the claim is false or the pointer
is. The mechanism is worth naming: 236-243 is where `decided`, `share` and `projectShare` live, which
is what the same round was reading for the quadrant matrix's conversion half, so the second clause's
line range was carried onto the third clause's claim. The one reference in the round that could
mislead about something off-screen is the one that was wrong; the other six checked out. A citation
is a claim about a location and needs reading back at that location, not recalling.

**The guard's own expectation was wrong, and the mutation is what proved it.** The test enumerates
R06's figures and asserts each names its denominator. Searching for the denominator's _words_ passed
a mutation that removed `of` from the one figure the type system does not protect — a `Count`, whose
`note` carries the same words but is drawn _instead of_ `of`, and only when the value is zero. A
non-zero count would have rendered bare. The assertion now looks at the `of` prop. Five of the six
figures are `Ratio`, whose `of` is required, so the compiler already guards them; the guard earns its
place on the sixth and on the matrix's free text.

Evidence: `_review/ROUTE_MAP_AUDIT_VERIFIED_2026-09-21.md` §30.

## 2026-09-22 — P2-08: the register a reader built, and what "verified" was standing on

**Everything R07 draws about status or sale is one field**, `status`, with three values. It is drawn
five times across the two surfaces, and twice under a label that promises something else: the
register's thirteenth column and the unit page's second tally item are both `VerifiedOutcome`, both
fed the catalogue's own state, and both marked with the tone this system reserves for "a person
decided this". In two of the three states the two chips print the same word. A pre-reservation
collapses to `reserved` on the delivered-catalogue path, so it reaches that column as a confirmed
reservation.

**The column's note denied a fact the same route draws.** It read "no offer, contract or CRM fact
reaches this product against a single flat". `AssistedSale` is keyed by `unitCode` and carries the
CRM's stage, its stage date and its `dateBasis`; the unit's own page renders a finding from it whose
baseline is "the … date the CRM states". A per-unit CRM fact reaches this product — it does not
reach that column, which is what the note now says. **Whether a column labelled "Verified outcome"
should draw the catalogue's state at all is left open**: the code documents the duplication as
deliberate, and overriding a recorded decision is not a correction.

**The one genuine sale figure R07 was missing is now drawn.** `ProjectPulse.totals` carries
`soldInPeriod` beside the lifetime `available`/`reserved`/`sold`, and the Briefing and the Project
overview both state it. The register did not, so a lifetime stock count sat in a sentence on a screen
where every other number is period-scoped, and "3 sold" read as three sales this quarter. Null is
still not nought: an unobserved period says so in words.

**The register survives opening a unit and coming back.** Its whole state is the query string, but
the row's link carried only the period and the "Units" crumb — the only Back this screen draws —
returned the reader to an unfiltered register. Both now go through `registerHref`. **The browser's
own Back button is not tested and is not claimed**: what a browser restores is a runtime behaviour,
and the filter living in the URL is a reason to expect it, not evidence of it.

**No time-to-sell panel exists on R07**, so P2-06's blocked calculator has no second formula
competing with it. `sale-cycle.ts` has two importers measured two ways: the barrel and its own test.

Evidence: `_review/ROUTE_MAP_AUDIT_VERIFIED_2026-09-21.md` §31.

## 2026-09-22 — The thirteenth column is gone, and what its docblock had assumed

**The register's "Verified outcome" column is removed.** It was drawn from `row.status` — the same
field the Status column two places from the left already draws — so it was never a second source
agreeing with the first. It was the first source, printed again eleven columns away, wearing the tone
this system reserves for "a person decided this". In two of its three states the two cells printed
the same word, and a `pre_reserved` unit, which the contract layer folds into `reserved`
(`packages/contracts/src/catalogue.ts:152-157`), arrived in it as a confirmed reservation.

**The decisive argument is not redundancy.** A reader who meets Status=Sold beside Verified=Sold is
entitled to conclude that two systems agree, and no two systems did. An empty space makes no claim;
that column made a false one. It is the inverse of the contradiction P2-02 fixed: there, two surfaces
said different things about one state — here one source was dressed as two.

**This overrides a recorded decision, and the record deserves to say which part gave way.**
`UnitStatus.tsx` argued the duplication at length. Its load-bearing sentence was that the verified
column "is the only column on that table a system of record stands behind". That was not a
preference; it was a factual premise, and it was false — a column fed the identical field stands on
the same source as its neighbour, not a stronger one. The same docblock also stated "there is no
per-unit CRM fact anywhere in the read models", which is false in the other direction: `AssistedSale`
(`packages/readmodels/src/deal-source.ts:133-151`) is keyed by `unitCode` and carries the CRM's
stage, its stage date and its `dateBasis`, and the unit's own page already draws a finding from it.
So this is not a deliberate decision being overruled. It is a decision whose reasons stopped being
true, measured rather than argued.

**Twelve, not thirteen, and the count was stated in five places.** `UnitRegister.tsx` said it three
times, `units/page.tsx` and `components/units/index.ts` once each. The same shape this repository
keeps meeting: a number stated in one place is a number that drifts everywhere it was also stated.

**Open — a real verified-sale column, and the three things it needs.** `AssistedSale` is the right
content for such a column and it is not free. Before it can be drawn it needs: both clocks named, as
`dateBasis` distinguishes the CRM's own stage instant from the sync that first witnessed the move; a
denominator, because coverage is partial; and the flats it has no sale for told apart from the flats
it records a zero for. Half of that would be worse than none, and would be exactly the "rule applied
to one place in four" this programme has now corrected three times.

**Open — the same pair survives one click away.** `VerifiedOutcome` now has a single caller: the unit
page, where it sits in a tally directly beside a `StatusChip` reading the same `unit.status`. That is
the removed column's argument at closer range. It is left standing and recorded rather than quietly
fixed, because the column's removal was a product decision and this is the same decision.

Evidence: `_review/ROUTE_MAP_AUDIT_VERIFIED_2026-09-21.md` §31.10.

**Correction to the entry above, from the same day.** It was written alongside a review note claiming
no test depended on the removed column. That was measured in vitest and stated about every test:
`e2e/units-register.spec.ts` carried "Verified outcome" in both its header list and its
definitions list, and its column test would have failed. Both lists are corrected and the whole
repository was swept rather than the `e2e/` directory alone. The Playwright suite is still not run,
so the spec is now consistent with the source without that consistency having been observed. This is
the third appearance of one shape: a measurement taken through one filter, reported as a claim about
everything the filter did not cover.

## 2026-09-22 — The E2E layer, measured rather than assumed

**Correction first, because it shaped the round.** A report described Playwright as never having run
in this programme. That is false: it ran at the Phase 1 gate with 315 product tests passing and 130
failures, all in the three `design-lab-*` specs. What is true is narrower and more useful — it had
not run in any of Phase 2's eight rounds. A known-green starting point is a different situation from
an unknown one.

**The desktop project now: 321 passed, 130 failed, 80 skipped, 25.3 minutes.** Every one of the 130
failures is in `design-lab-a11y` (60), `design-lab` (42) and `design-lab-stress` (28), and none is
anywhere else. The mechanism matches the record as well as the count: 44, 43 and 43 waits for
`.dla-root`, `.dlb-root` and `.dlc-root`, the three roots that do not exist because the lab route
calls `notFound()` unless the local control plane is on, which needs a non-production `NODE_ENV`
while the harness builds and starts. The spec says so itself. It is the wrong command, not a defect.
The product count moved 315 → 321 since the Phase 1 gate and the six were not investigated.

**`units-register.spec.ts` passes.** That was the round's first item: the branch carried a spec
edited in P2-08 to expect twelve columns, and nobody had run it. Both of its tests are green, so the
column removal is confirmed at runtime and not only in source.

**The browser settled what source was not allowed to claim.** Three new cases in
`e2e/register-filter-navigation.spec.ts`: the browser's Back restores the narrowed register, the
"Units" crumb does too, and submitting the filter bar puts every axis it changed into the address.
Reverting P2-08's crumb fix and rebuilding fails the crumb case with `Expected: 4, Received: 20` —
the defect as a number — while the browser-Back case stays green, which is the proof that the two
measure different things.

**Two of the three new cases were wrong before they were right, and the runs said so.** The filter
combination the last one used, `q=A` with `status=reserved`, is empty in this fixture — northgate's
four reserved flats are B-601, B-602, C-701 and C-702 — so it failed against a register behaving
correctly. And the crumb case's URL assertions passed against the mutation, because `click()`
resolves on the click rather than the navigation and the unit page's address carries those same
parameters. They now wait for the register and retry, and name the axis that was dropped.

**A fourth instance of one shape.** A sweep reported as covering the whole repository missed
"Verified outcome" where the phrase wrapped across two comment lines. Line-range filter, single
runner, single-line grep: three times the tool chose the scope while the claim was written about
everything the tool could not see.

**Not run:** the `wide` and `mobile` projects, the full `pnpm test`, and no screenshot of any
surface. The 80 skips were counted by spec but not explained.

Evidence: `_review/ROUTE_MAP_AUDIT_VERIFIED_2026-09-21.md` §32.

## 2026-09-22 — Presentation DNA: measured, then floored

**What the measuring round found, on 60 cells (5 projects × 4 presets × 3 modes, the page's default
selection).** The aggregated path exists and is drawn: the team benchmark lane is first on the plane
(`packages/synthetic/src/showroom/project.ts`, `buildLane("team", …)`). The comparison's two
denominators are on the screen three times over — lane headers, `n = L and R meetings`, the finding's
`against N and M meetings`. Four things were not right. **(a)** A side with no meetings printed as 0%
on every behaviour, because `share()` divides by nought as 0: the review project's default view read
"Changes time of day or weather: Monika Kováčová 78%, Akhilesh Undev 0%" about a colleague with no
meetings on it, and the page's "No comparison is available" branch had fired on none of the 60 cells.
**(b)** The `long_opening` note promised that timing-blind sessions are excluded from both sides; the
code's `?? 0` kept them in the denominator as "did not". **(c)** The transitions list printed six
percentages whose denominator — the moves out of each row's own `from` — was in a read-model docblock
and nowhere on the screen, so two bars were read against each other as fractions of one whole.
**(d)** No sample floor anywhere on the surface: 48 of 60 cells had a side under `AGENT_MIN_SAMPLE`,
41 had a side of nought, and the finding "The largest observed difference in how the two present" was
drawn on all of them.

**Decision, and its cost measured before it was built.** The floor is on the verdict, not on the
lanes: `AGENT_MIN_SAMPLE`'s own docblock says no agent figure is presented _as a verdict_ below it,
and a lane is a description with its count in its header. Applied to the same 60 cells: 12 keep a
"What differs", 41 fall to the null branch, 7 keep the two lanes with the refusal in place of rows.
The pre-stated stop condition was "empty on more than 48"; it is empty on 48, so it was built.

**Shipped.** A side with no meetings yields no comparison and `noComparison` says who or what was
absent; under the floor, `verdictRefusal` replaces the rows and the finding in the floor's own
sentence; a behaviour only some sessions can answer is rated over those sessions, with its own n on
the row, and withheld by name when fewer than the floor could answer it on a side; every transition
carries `outOf` and the screen prints `count of outOf` beneath the share, saying that the whole
differs by row. The two Ask Observer comparison tools say the refusal rather than "measurably similar
ways". `share()` is unchanged: its other callers print the denominator beside the rate, and the one
place a zero denominator reached a displayed rate without it is now never called with one.

**A false hypothesis, and the one that was not.** The measuring round's second task put two numbers
on one cell (Northgate, quarter to date, 74 meetings all timed): Time & weather's share of presentation
time is 3.24% as a ratio of sums and 1.93% as the median of per-meeting ratios — 5.88% over the 42
meetings that reached it, which is what P2-11 had measured on a narrower set. The stated hypothesis,
that longer meetings spend proportionally less on the section, was labelled a guess and then measured
false: Pearson 0.030 on all 74. The gap is compositional — 32 of 74 never opened the section. The mean
of ratios is 3.21%, so the ratio of sums is not skewed by a few long meetings either. One definition
stays on the surface.

**Seventeenth rule, from the same round.** A comment that names a failure mode is evidence that the
author saw it, not that it is handled. `pick()`'s docblock described "a stranger who has no meetings
on the project" for delivered projects, and the guard beside it (`!context.ownDataOnly`) protected only
that path while the synthetic roster path fell to the stranger by default. Third instance in this
programme, after `soldInPeriod`'s comment guarding the wrong edge and `Environment`'s docblock stating
the denominator rule it did not apply.

**Not run:** Playwright, any screenshot, the `mobile` and `wide` projects. The next round captures
`02-presentation`. The transitions' new fraction column and the diff-row note are unobserved in a
browser.

Evidence: commits `8ff0ab2` and the one after it on `feature/observer-ux-overhaul-phase2`.
