# Project state

**Read this first in every session.** Then `.claude/skills/iris-observer-product/SKILL.md`, then
whatever it points at. Update this file at the end of every meaningful session.

**Last updated:** 2026-09-07 · **Branch:** `feature/observer-reference-parity`, pushed to `origin` on
2026-09-07 through `d9879e3` · **PR #1 open. Not merged.** Twenty-three commits since then are local only.

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
| M7 Ingestion                                 | 🟡 partial — activation, heartbeat, ingest endpoints live and proven; no simulator package, no CRM/WEBIRIS adapters into `SourceObservation`                                                                                                                                                                                                                                                                                                                                                                   |
| M8 Event catalogues                          | ⛔ not started — `EventRegistry` is null; the UE5 spec is a candidate (ADR-0032)                                                                                                                                                                                                                                                                                                                                                                                                                               |
| M9 MADSPACE administration                   | 🟡 partial — projects, installations, activation, diagnostics, **integrations** (`7226e07`), **directory** (tenants, agencies, people from the demonstration directory, `c85f469`); no tenant/user/agency tables, no branding, no flags; no tenants, users, agencies, branding, flags                                                                                                                                                                                                                          |
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
