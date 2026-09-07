# ADR-0036 — CRM connectors are credentialed pull adapters into one canonical catalogue

**Status:** proposed · 2026-09-07
**Branch:** `feature/observer-reference-parity`
**Resolves:** the open risk in `docs/01-foundation.md` §4 ("does REALPAD expose a usable API, and under
what terms?") and the matching rows in `docs/references.md` and `docs/PROJECT-STATE.md`.

## Context

`docs/01-foundation.md` §4 named the division of responsibility — the CRM records what was agreed,
Observer records what happened — and left one thing unverified: whether REALPAD, which most clients
use, exposes an API at all. Until it was checked, the unit catalogue on every Observer surface came
from the synthetic world, and the segmentation on Project was a two-entry constant (two-room,
three-room) that a catalogue arriving from outside would not have been allowed to change.

The user's brief on 2026-09-07 settled the commercial shape: every client hands MADSPACE one
credential for their CRM, and there are three CRMs in play — **REALPAD** (most clients), **Monday**
(some), and **Lomnio** (at least one). "We get an API key from everywhere" is the operating model
this decision has to fit.

The three developer portals were read on 2026-09-07. The facts below are what they say today, with
the page they say it on; where a portal is silent, this document says so rather than filling the gap.

### REALPAD — `dev.realpadsoftware.com`

- **Transport.** `POST https://cms.realpad.eu/ws/v10/{endpoint}`, form-encoded only
  (`application/x-www-form-urlencoded`); a JSON body is refused with 415/400. Responses are XML for
  the catalogue, JSON for a few endpoints, Excel for exports, plain text for errors.
- **Credential.** Not a token. A `login` + `password` pair sent in the form body, issued by REALPAD
  support per project and per use case (`project-name-pricelist`, `project-name-leads`), activated by
  accepting an invitation email, scoped to an endpoint area. Failed logins escalate to a temporary ban
  of up to 24 hours, returned as `401` and indistinguishable from a wrong password (changelog
  2026-06-16). `418` means a deprecated API version. `429` carries `Retry-After` and is counted per
  `(endpoint, credential)`.
- **Catalogue.** `list-projects` → `get-project(developerid, projectid, screenid)` returns
  `export > project > building > floor > flat`, each flat carrying `<flat-attribute key= value=>`
  pairs: `flat_internal_id`, `flat_disposition` (Czech convention: `1+kk`, `2+1`, `3+kk`…),
  `flat_type` (integer, 1–36 and 99 — flat, parking, cellar, garage, office, villa, townhouse; the
  table is **not** in the published OpenAPI document), `flat_status` (`0` Free, `1` Pre-reserved, `2`
  Reserved, `3` Sold, `4` Not for sale, `5` Delayed), `flat_orientation` (free string — the example
  mixes Czech and English compass codes: `SV`, `J`, `W`, `S-E`), `flat_area`, `flat_area_living`,
  `flat_area_balcony` / `_terrace` / `_loggia` / `_garden`, `flat_price` and `flat_price_without_vat`,
  the before-discount and discount pairs, `associatedunits_*` for bundles, and immutable resource
  UIDs for plans and PDFs (`/resource/{uid}`, cacheable forever). There is **no per-flat modification
  time** in the export; the whole project is fetched each time. REALPAD's own guidance: fetch the
  pricelist **every hour** and store it relationally.
- **Deals and customers.** Only through the Data Takeout API, and only as Excel:
  `list-excel-business-cases` (Status `1` ACTIVE · `2` LOST · `3` WON · `4` SLEEPING, a Lifecycle id
  whose values are not published, Main Unit id, Customer id, Salesman id, creation date),
  `list-excel-customers-contacts`, `list-excel-products` (Unit id, Type id, Availability id, Deal id),
  `list-excel-customer-consents`. Use `headermode=ids` and `xlsx=1`. Five-minute cooldown per
  `(endpoint, credential)`, waived by a narrow filter (one project, a date range of at most 31 days,
  or a full-text term of six characters or more). No JSON, no webhooks.
- **The business-case export, read again on 2026-09-07 for the deals adapter**
  (`/integrations/data-takeout`, verbatim where quoted). Filters share one grammar: `projectids`
  (comma-separated integers), `fulltext`, `creationdatefrom` / `creationdateto` (`YYYY-MM-DD`,
  inclusive), `statusids`; for `list-excel-business-cases` the cooldown is waived by "1 Project, or
  fulltext ≥ 6 chars", and a `429` names when to call again. `headermode` is one of `default`,
  `labels`, `ids`, `labels_ids`, `ids_labels`; `ids` "will export headers as one row with the columns
  identified by special strings that are guaranteed to be stable", and the page says to use it "for
  any automated integration" — **but it does not list the strings.** One row per Deal, with these
  columns always present: Customer ID, Salesman ID, Status ID (enum), Lifecycle ID (enum), Main Unit
  ID, Additional Customer IDs, Additional Product IDs, Project ID; and, on by default under Column
  Selection, Deal ID and Inquiry ID. Status is published — `1` ACTIVE ("being negotiated / paid"),
  `2` LOST, `3` WON, `4` SLEEPING — Lifecycle is not. No email and no phone are in this export;
  customers are `list-excel-customers-contacts`. What follows for the adapter
  (`packages/connectors/src/realpad-deals.ts`): the header ids are typed into the column table after
  being read off one real export (`pnpm connectors:realpad-inspect`), WON and LOST map fixed, the
  Lifecycle ids go through the tenant's stage table like every other stage vocabulary, and a REALPAD
  deal has no subject key.
- **Leads.** `create-lead` accepts name, surname, one of email or E.164 phone, project, `unitid` or
  `internalid`, `preferencerooms` (`1+kk|2+1`), `preferencepricemax`, campaign, referral, consents,
  and returns the customer id — the same id for a customer REALPAD already knew, so de-duplication is
  theirs. `list-leads` returns only this integration's own leads from the last seven days and never
  their email or phone.
- **Not for integrators.** `list-customers`, `list-events`, `list-basket`, `make-prereservation` are
  tagged deprecated or internal and need a salesperson's own account. `update-units` (experimental,
  2026-01-26) writes prices back and is out of scope by §4's principle.
- **Roadmap.** `product.realpadsoftware.com` lists "New REST APIs" as in progress with no date:
  entity-shaped endpoints, JSON in and out, pagination and bulk operations, **push notification of
  changes**, and **API tokens or OAuth** in place of a user's login and password.

### Lomnio — `app.lomnio.com/docs/api` (OpenAPI 3.1, v1.0.0)

- **Transport.** `https://app.lomnio.com/api/v1/`, JSON, Laravel-style pagination
  (`data` / `links` / `meta`, `per_page` ≤ 500).
- **Credential.** A **Bearer token per project** with scopes: `project:read`, `units:read`,
  `leads:read` (never issued to a browser), `leads:create`. Limits: 100 read requests a minute, 10
  lead submissions, 120 tracking events; `X-RateLimit-Limit` / `-Remaining` / `-Reset` on every
  response.
- **Catalogue.** `GET /v1/units` (`detailed=true` for rooms, outdoor spaces, files, similar units) and
  `GET /v1/units/{unit}`: `id`, `code`, `external_id`, `status { code, label, color, is_system, labels }`,
  `type`, `layout_type`, **`room_count`** (number, nullable), `orientation[]` with labels,
  `pricing { price_with_vat, price_without_vat, discount_*, discounted_*, vat_rate, price_per_sqm, rent }`,
  `areas { area, area_floor, area_gross, area_building, area_land }`, `rooms[]`, `outdoor_spaces[]`,
  `building { id, name }`, `floor { id, name, number }`, `phase`, `available_from`, `floor_plan_url`,
  `files`, `bundle`, `custom_attributes`, `displayed_on_website`, `updated_at`. Also project, floors,
  facade maps, floor plans, sales reps.
- **Deals.** `GET /v1/leads`: `stage { id, code, name, is_won, is_lost, entered_at }`, `is_won`,
  `is_lost`, `customer { name, email, phone, phone_e164, gdpr_consent, marketing_consent }`, `utm`,
  `click_ids`, `source`, timestamps. Stage codes are the tenant's own.
- **Push.** Per-project outbound webhook: `X-Lomnio-Event` ∈ `unit.created` · `unit.updated` ·
  `unit.deleted` · `lead.created` · `lead.stage_changed` · `webhook.test`; `X-Lomnio-Delivery` for
  idempotency; `X-Lomnio-Signature: sha256=<hmac>` over the raw body under the project's signing
  secret; answer 2xx within 15 s; three retries (10 s, 60 s, 300 s); delivery is at-least-once. The
  unit payload is the full `GET /v1/units/{unit}` shape plus `changed_fields`, `deleted`, `visible`.
- **Tracking.** `POST /v1/tracking/events` with a fixed vocabulary (`page_view`, `unit_view`,
  `floor_plan_view`, `price_list_view`, `gallery_browse`, `contact_form_open`, `calculator_use`,
  `comparison_add`, `search_filter`, `time_on_page`, `download`, `video_view`) — a website analytics
  surface, not the showroom's.

### Monday — `developer.monday.com`

- **Transport.** `https://api.monday.com/v2`, GraphQL, `Authorization: <token>`, JSON; releases are
  versioned and selected per request.
- **Credential.** A personal or app API token; personal tokens mirror the user's own permissions.
- **Reading.** `boards(ids) { items_page(limit ≤ 500, cursor, query_params) { cursor items { id name
column_values { id text value type } } } }`. `query_params` and `cursor` are mutually exclusive on
  one call; a `null` cursor ends the walk.
- **Limits.** Complexity 10M points a minute on a personal token (1M on trial or free), 5M on an app
  token; 1 000 / 10 000 / 25 000 calls a day by plan; 1 000–5 000 queries a minute; 40–250 concurrent;
  5 000 requests per IP per 10 s. Every limit error carries `retry_in_seconds`.
- **Push.** `create_webhook(board_id, url, event, config)` for `change_column_value`,
  `change_status_column_value`, `create_item`, `item_deleted`, `item_archived`, `item_moved_*` and
  others; a challenge handshake on registration; retried once a minute for thirty minutes.
- **Nothing about a unit is fixed.** A board is whatever the client made it. Which column is the
  code, the room count, the floor, the price, the status — and which status label means reserved —
  is configuration per client.

## Decision

**A connector is a credentialed pull adapter that produces snapshots of one canonical catalogue, and
push is an accelerator, never the source of truth.**

1. **One credential per (tenant, project, connector), held server-side.** The thing a client hands
   over is a REALPAD login-and-password pair (pricelist scope, optionally a second pair for Data
   Takeout), a Lomnio bearer token plus its webhook signing secret, or a Monday token plus a board id.
   They are stored encrypted in the platform's own store and resolved by exactly one function on the
   request path, under the discipline ADR-0030 already set for provider keys: never logged, never
   cached, never placed on a context object. A deployment environment variable is not per-tenant and
   is therefore not where these live.

2. **Every sync is a full snapshot, diffed into append-only observations.** REALPAD offers nothing
   else (no per-unit timestamp, no push); Lomnio and Monday offer push, but at-least-once delivery
   with retries means the pull is still what reconciles. The loop runs hourly — REALPAD's own
   recommendation — for every connector; a verified webhook (Lomnio HMAC, Monday challenge) runs the
   same reconciliation early. Deltas become `catalogue.unit_changed` source observations under
   ADR-0015, so the catalogue's history is a fact sequence like everything else, and a unit that
   disappears from a snapshot is recorded as withdrawn rather than deleted.

3. **The canonical `Unit` carries the raw label beside the derived count.** `rooms` is an integer or
   null; `layout` keeps the connector's own string (`2+kk`, `layout_type`, a Monday cell) untouched.
   Room segments on Project are derived from the distinct `rooms` values the catalogue contains
   (implemented with this ADR: `roomCounts` in `packages/synthetic/src/pulse.ts`), so a catalogue with
   five counts gets five rows and nothing in a surface names a count by hand.

4. **Stage and status mapping is per-connector configuration, owned by the MADSPACE administration
   surface (M9), never inferred.** REALPAD's `flat_status` integers have fixed meanings and map
   directly; a business-case Lifecycle id, a Lomnio `stage.code`, and a Monday status label are the
   client's own vocabulary and are mapped by a person on the integrations screen before the
   connector is switched on. Until mapped, the ladder shows Reserved and Sold — which both unit
   feeds carry — and states that Offered and Negotiating are not connected, per the
   never-render-absent-as-zero rule.

5. **Matching stays email first, phone second**, as `docs/01-foundation.md` §4 rule 3 has it; REALPAD
   requires one of the two on a lead and Lomnio returns both with an E.164 phone, so the rule holds
   on every connector.

6. **Observer reads; it does not write.** `update-units`, `create-lead`, `make-prereservation` and
   their equivalents are not called. Whether a showroom visitor should become a CRM lead is a product
   decision this ADR does not take (open below).

### Rules by provenance

| Rule                                                            | Class                      | Source                                              |
| --------------------------------------------------------------- | -------------------------- | --------------------------------------------------- |
| The CRM records what was agreed; Observer records what happened | `LOCKED_FROM_BRIEF`        | `docs/01-foundation.md` §4                          |
| Nothing in the core references a connector by name              | `LOCKED_FROM_BRIEF`        | §4 rule 1                                           |
| The manual (CSV) path must always work                          | `LOCKED_FROM_BRIEF`        | §4 rule 2                                           |
| Email first, phone second                                       | `LOCKED_FROM_BRIEF`        | §4 rule 3                                           |
| One credential per (tenant, project, connector), server-side    | `DERIVED_FROM_LOCKED_RULE` | ADR-0030, user brief 2026-09-07                     |
| Hourly full snapshot, push as accelerator                       | `PROPOSED`                 | REALPAD guidance; Lomnio at-least-once delivery     |
| `flat_disposition` `N+kk` / `N+1` → `rooms = N`, kitchen kept   | `PROPOSED`                 | REALPAD examples; Czech market convention           |
| Unmappable disposition → `rooms = null`, shown as its own row   | `PROPOSED`                 | never-a-zero rule                                   |
| Orientation vocabulary is declared per tenant                   | `OPEN`                     | REALPAD's own example mixes `SV`/`J` with `W`/`S-E` |
| REALPAD `flat_type` table                                       | `OPEN`                     | not published; ask support@realpadsoftware.com      |
| REALPAD business-case Lifecycle values                          | `OPEN`                     | not published; configuration, like every stage word |
| REALPAD `headermode=ids` header strings                         | `OPEN`                     | not published; read off one real export             |
| Whether a showroom visitor becomes a CRM lead                   | `OPEN`                     | product decision, not taken here                    |
| Whether a studio is `rooms = 1` or its own layout               | `OPEN`                     | needs a real catalogue that contains one            |

## Consequences

- **The M10 milestone gains a fourth adapter** (`lomnio`) beside `realpad`, `monday` and
  `csv/manual`, and a shape: adapter → snapshot → diff → observations, with the mapping tables as
  M9 configuration. The Monday adapter and the manual adapter share the same column-mapping step,
  so building the manual path first is not a detour.
- **The REALPAD deals feed is Excel until their REST API ships.** A connector that parses `.xlsx`
  under a five-minute cooldown is unglamorous and is the only honest option today; when the new API
  arrives with tokens and push, the adapter changes and nothing above it does.
- **Segments already follow the catalogue.** With this ADR the Project surface derives its room
  segments from the stock instead of a constant, the audience builder offers only the counts the
  project has, and the verdict on Project names whichever segment departs furthest from parity on
  a sample it can stand on — so the synthetic Ister Tower now shows its one- and four-room flats,
  which the constant had been dropping from a scale that claimed to cover the stock.
- **Three questions go to the client, not to a guess:** their orientation codes, their stage
  vocabulary, and a REALPAD support request for the `flat_type` table. They belong on the
  integrations screen's checklist. The orientation codes are already a field there
  (`orientationMap`), which closes that open rule as configuration rather than as a guess.
- **The product reads a delivered catalogue through one seam** — `CatalogueSource` on the
  repository — and draws the units it can place (`placementOf`); invented sessions never touch a
  delivered unit, so a real flat shows the attention it has earned and no more.

## References

- `docs/01-foundation.md` §4 · `docs/02-views.md` §2.4 (who owns each rung) · ADR-0015 · ADR-0021 ·
  ADR-0030 · ADR-0032 (the executable-contract discipline this follows)
- REALPAD: `/integrations/readme/quickstart-guide`, `/integrations/readme/authentication-and-error-handling`,
  `/integrations/landing-page/fetching-pricelist-data`, `/integrations/landing-page/sending-leads`,
  `/integrations/data-takeout`, `/integrations/readme/changelog`, the landing-page OpenAPI YAML,
  `product.realpadsoftware.com` — all read 2026-09-07
- Lomnio: `https://app.lomnio.com/docs/api` and its `api.json` — read 2026-09-07
- Monday: `/api-reference/docs/authentication`, `/docs/rate-limits`, `/reference/items-page`,
  `/reference/webhooks` — read 2026-09-07
