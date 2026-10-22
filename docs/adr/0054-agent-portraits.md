# ADR-0054 — A face for every presenter: agent portraits, set by their company

**Status:** accepted · **Date:** 2026-10-22
**Decided by:** the product owner, commenting on Sales Flow while recording the Shark Residence demo
**Extends:** ADR-0043 (company admins), ADR-0044 (the demo's local plane)
**Keeps:** CLAUDE.md non-negotiable 4 (no personal data in event payloads), `docs/01-foundation.md`
§2 and §6 (agents belong to the agency), `docs/14-design-system.md` (no fabricated people)
**Amends:** the comment on `Initials` in `components/product/Person.tsx`, which said this product
would never show a photograph
**Numbered 0054** because 0052 and 0053 are the two streams working on the same page in parallel
(layout, and the drill-downs); 0046 stays unused.

## Context

On 2026-10-22 the owner wrote, about "Presentations given" on `/shark/shark-residence/flow`:

> ide lehetne mindegyik sales agent profilhoz feltölteni egy profilképet tehát ezt a funkciót építsd
> bele hogy a Company a sales agent neveit majd az unreal engine-ből fogják kapni mivel ott tud majd
> létrehozni a user új sales agent profilt. Viszont a Weben az Observerben a megtalálható Sales
> agent-ekhez itt lehet hozzáadni a sales agent-hez egyéni profilképet tehát nem a sales agent ad
> hozzá saját profilképet hanem a Company aki a fő admin. Viszont tudja a saját profilképét cserélni
> a sales agent a saját profilján belül is.

Translated: each sales agent profile could get a profile picture. The Company will receive the
agents' names from Unreal Engine, where a user creates a new agent profile. In Observer, a custom
picture can be added to the agents found there — not by the agent, but by the Company, the main
admin. The agent can, however, change their own picture within their own profile.

## Decision

1. **Observer never creates, renames or deletes an agent.** The roster arrives from the IRIS
   showroom. A portrait is put only on an agent Observer already knows: one who presented on the
   project, in any period a reader can choose (`resolvePortraitScope`). An unknown agent id is a
   404, the same answer as a project the reader does not hold.
2. **Which company an agent belongs to: their agency.** `docs/01-foundation.md` §2 ("Agents belong to
   the agency, act on the project") and §6 (`Organisation (agency) ── Agent`), and the roster's own
   `organisationName`, place every Shark Residence presenter in **Shark Sales**. ADR-0043 makes a
   company the capacity's organisation with exactly one admin, so the admin who adds the five
   presenters' portraits is **Daniel Hart**, admin of Shark Sales. Clara Weiss is the admin of
   **Shark Developments**, the tenant: the developer owns the behavioural data and its project, not
   its supplier's staff. Where a developer sells with its own people, their `organisationName` is
   the developer and its admin is the one. If the owner meant the developer's admin, the change is
   one comparison in `portraitRight` (`companyName === tenant.name` instead of the agent's
   organisation) and the matrix's cells.
3. **Who may change a portrait** (`lib/portraits/access.ts`, enforced in the route):

   | Who                                                                        | May                                                                         |
   | -------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
   | The admin of the agent's own company (Daniel Hart for Shark's five)        | add, replace, remove — any agent of it                                      |
   | The agent, on their own page                                               | replace or remove their own, once there                                     |
   | An agency manager who is not their company's admin (none in the directory) | nothing: the right is the company role, not the product role                |
   | The developer's admin (Clara) and its members (Nora)                       | nothing; they see the portraits                                             |
   | Other agents (Lena on Marek)                                               | nothing                                                                     |
   | Another company's admin (Tomáš, for Tatra Realty's Sabina on ISTER TOWER)  | nothing                                                                     |
   | A reader of another tenant                                                 | a 404: the project is not theirs                                            |
   | MADSPACE administrators                                                    | nothing: MADSPACE runs the platform and does not curate a customer's people |

   "The agent can change their own" is read as the owner wrote it: the company adds the first; the
   agent replaces or removes it. An agent with none is told who adds it.

4. **A face is personal data, kept apart.** It never enters an event payload or a read model. It is
   kept behind a port (`PortraitStore`, `lib/portraits/store.ts`) with one adapter: a file per
   tenant and agent under the local control plane's state directory
   (`OBSERVER_LOCAL_STATE_DIR/portraits/<tenantId>/<agentId>`; `.observer-local/demo` on the demo,
   so `rm -rf` of it resets portraits with everything else). The name is built only from ids that
   pass `^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$` — no dot, no separator. Written to a temporary name and
   renamed, so a portrait is whole or absent. **Where there is no local plane** (a hosted
   deployment) there is no store: an upload is refused with "Portraits are kept only on a local
   demonstration server for now. On this deployment every agent shows their initials." and every
   surface draws initials. **The hosted store** — Supabase Storage, a private bucket, RLS by tenant
   and the same right — **is a later milestone**; nothing of it is built.
5. **The trust boundary** (`lib/portraits/image.ts`). PNG, JPEG and WebP, recognised by their first
   bytes; the declared type and the file name are never read. At most 2 MB, checked on the
   declared length and again while reading the stream. No image library resolves from `apps/web`
   (sharp is not installed), so the metadata is cut out by walking each container: JPEG APP1–APP15
   (EXIF with GPS, XMP, ICC, maker notes) and COM; PNG tEXt, zTXt, iTXt, eXIf and anything after
   IEND; WebP EXIF and XMP chunks, with VP8X's two flags cleared and the RIFF size rewritten. A file
   that does not walk cleanly is refused. SVG is never accepted. Every refusal is a sentence.
6. **One route** (`/api/observer/portraits/[tenantSlug]/[projectSlug]/[agentId]`). GET serves any
   signed-in reader who holds the project and finds the agent on it, with the type its bytes name,
   `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`,
   `Content-Security-Policy: default-src 'none'; sandbox` and `Cross-Origin-Resource-Policy:
same-origin`. PUT takes the raw image as the body; DELETE removes the file. **A route handler,
   not a server action**: an action's body is capped at 1 MB unless every action is raised
   (`serverActions.bodySizeLimit`), and a portrait may be 2 MB. The action's origin check does not
   come with a route, so PUT and DELETE require `Origin` to name the request's own host: the
   session cookie is SameSite=Lax, and another port on localhost is the same site.
7. **Display.** `AgentPortrait`: round, ringed in the agent's seat colour (`seatSeries`, the hue that
   person wears on every chart of the page), the initials on a dark tint of it where there is no
   portrait — never a generated picture. On Sales Flow's and Sales Agents' "Presentations given"
   (an optional `marks` on `RankedBars`), the roster's cards, and the agent page's heading. The text
   alternative is empty wherever the name stands beside it, which is everywhere it is drawn; the
   editor's preview is named.
8. **The control** (`PortraitEditor`) is on the agent page's aside: Choose image → a preview →
   Save portrait or Cancel; Replace; Remove → "Remove Lena Fischer's portrait? Their initials show
   instead." → Remove portrait (focused) or Keep it. States: saving, refused (the server's own
   sentence), saved. The oversize check runs in the browser too, so a 3 MB photograph is refused
   before it is sent. **The agent's own profile is their agent page**: no new navigation item; the
   agent's own card on Sales Agents reads "Your profile →".
9. **Lena Fischer signs in** (`lena.fischer@shark-sales.example`, `acct_lena`, capacity
   `agentShark`, bound to `agt_sharklena01`, a member of Shark Sales), so the demo can show the
   agent's side. The synthetic world now has nine capacities; the access matrix names them.

## Consequences

- No portrait is seeded. The demonstration's people are fictional, and a photograph of somebody who
  does not exist is the fabrication the doctrine forbids; a recording uses a real photograph its
  subject agreed to.
- Re-encoding is not done. The stripping walks containers; a hostile file with pixels crafted for a
  decoder bug is served to the browser's own decoder as an image, sandboxed and same-origin, as any
  uploaded image would be. Re-encoding through sharp is the upgrade if it is ever installed.
- Stripping JPEG's APP2 drops an embedded ICC profile: a wide-gamut photograph may shift slightly in
  colour.
- Each image request checks the roster in up to four periods: the synthetic repository answers from
  memory; a database repository would want one roster read.
- The seat colour is the period's: an agent with no meeting in the period shifts the colours after
  them (the same ceiling `seatTone` already records).
