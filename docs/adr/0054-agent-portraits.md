# ADR-0054 — A face for every presenter: agent portraits, set by their company

**Status:** accepted · **Date:** 2026-10-22
**Decided by:** the product owner, commenting on Sales Flow while recording the Shark Residence demo
**Extends:** ADR-0043 (company admins), ADR-0044 (the demo's local plane)
**Keeps:** CLAUDE.md non-negotiable 4 (no personal data in event payloads), `docs/01-foundation.md`
§1 and §4 (the tenant owns its showroom and its data), `docs/14-design-system.md` (no fabricated
people)
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
   404, the same answer as a project the reader does not hold — except that DELETE also reaches an
   agent who has left every period's roster while a portrait of theirs is still kept, for those
   who may change it (§3), so a face never outlives the only path that removes it.
2. **Which company puts a face to an agent: the tenant's.** The owner's Company is the one that
   "receives the agents' names from Unreal Engine": the showroom is the tenant's installation and
   its roster arrives on the tenant's projects. ADR-0043 makes a company the capacity's organisation
   with exactly one admin, so on Shark Residence the admin who adds the five presenters' portraits
   is **Clara Weiss**, admin of **Shark Developments**, the tenant; on ISTER TOWER it is Petra
   Novák, for every presenter there whichever agency they sell for. `portraitRight` compares the
   actor's company with the tenant's name, the comparison `mayConnectCrm` (ADR-0049) already makes.
   The agent's own agency is not the test: `docs/01-foundation.md` §2 places an agent in an agency,
   but the UE5 roster carries only `agent_id` and `display_name`
   (`packages/contracts/src/ue5/agents.ts`), so every presenter delivered from a showroom reads
   "Agency not stated" and an agency test would give nobody the right. The first version of this
   ADR made that mistake and gave the right to Daniel Hart, admin of Shark Sales; see the review
   round.
3. **Who may change a portrait** (`lib/portraits/access.ts`, enforced in the route):

   | Who                                                                                 | May                                                                         |
   | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
   | The admin of the tenant's company (Clara Weiss for Shark's five)                    | add, replace, remove — any agent on its projects, delivered ones included   |
   | The agent, on their own page                                                        | replace or remove their own, once there                                     |
   | The agency's manager, its company's admin (Daniel Hart; Tomáš Varga on ISTER TOWER) | nothing: the presenters' faces are the tenant's to set                      |
   | The tenant's company members (Nora Lind)                                            | nothing; they see the portraits                                             |
   | Other agents (Lena on Marek)                                                        | nothing                                                                     |
   | A reader of another tenant                                                          | a 404: the project is not theirs                                            |
   | MADSPACE administrators                                                             | nothing: MADSPACE runs the platform and does not curate a customer's people |

   "The agent can change their own" is read as the owner wrote it: the company adds the first; the
   agent replaces or removes it. An agent with none is told who adds it.

4. **A face is personal data, kept apart.** It never enters an event payload or a read model. It is
   kept behind a port (`PortraitStore`, `lib/portraits/store.ts`) with one adapter: a file per
   tenant and agent under the local control plane's state directory
   (`OBSERVER_LOCAL_STATE_DIR/portraits/<sha256(tenantId)>/<sha256(agentId)>`; `.observer-local/demo`
   on the demo, so `rm -rf` of it resets portraits with everything else). Each name is the SHA-256 of
   the id's UTF-8 bytes in hex: the UE5 contract's `agent_id` is any string of 1–128 characters, and
   hashed, every one of them is a file name, none leaves its directory, and two ids that differ only
   in case stay two files on NTFS. Written to a temporary name and renamed, so a portrait is whole
   or absent. **Where there is no local plane** (a hosted
   deployment) there is no store: an upload is refused with "Portraits are kept only on a local
   demonstration server for now. On this deployment every agent shows their initials." and every
   surface draws initials. **The hosted store** — Supabase Storage, a private bucket, RLS by tenant
   and the same right — **is a later milestone**; nothing of it is built.
5. **The trust boundary** (`lib/portraits/image.ts`). PNG, JPEG and WebP, recognised by their first
   bytes; the declared type and the file name are never read. At most 2 MB, checked on the
   declared length and again while reading the stream. No image library resolves from `apps/web`
   (sharp is not installed), so the metadata is cut out by walking each container. JPEG: APP1–APP15
   (EXIF with GPS, XMP, ICC, maker notes) and COM go wherever they stand, between progressive scans
   too; the walk steps through each scan's coded data (FF00 stuffing, RST0–7) and ends at the first
   EOI, so a second image, a motion-photo video or a vendor trailer after it is not kept. PNG and
   WebP keep an **allowlist** of the chunks that draw the picture — PNG IHDR, PLTE, IDAT, IEND,
   tRNS, gAMA, cHRM, sRGB, iCCP, sBIT, pHYs, bKGD and APNG's acTL, fcTL, fdAT; WebP VP8, VP8L, VP8X,
   ALPH, ANIM, ANMF, ICCP — and drop everything else (text, eXIf and the older exIf, C2PA, tIME,
   private chunks, anything after IEND), with VP8X's two metadata flags cleared and the RIFF size
   rewritten. A file that does not walk cleanly, a JPEG scan that never ends included, is refused.
   SVG is never accepted. Every refusal is a sentence.
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
   agent's own card on Sales Agents reads "Your profile →". There the control is always the same
   `PortraitEditor`: with no portrait it says "The admin of Shark Developments adds your portrait.
   Once it is here you can replace or remove it." and offers no button; with one, "You can replace it
   or remove it; so can the admin of Shark Developments." — true whoever put it there. Removing her
   own keeps the control mounted through the page's refresh, so its "Removed." status stays, and the
   focus moves to its heading.
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
- An agent who has left every period's roster has no page, so the removal §1 allows has no button
  yet: the route takes it from the tenant's admin or the agent. The hosted store must also tie a
  portrait's removal to an agent's erasure (`docs/05-identity.md`).
- An animated WebP's ANMF frames are kept whole, so a chunk an encoder put inside a frame would be
  kept with it; the container allows unknown chunks there, and no common encoder writes metadata
  there. Walking the frame's own chunks is the upgrade if one ever does.
- The seat colour is the period's: an agent with no meeting in the period shifts the colours after
  them (the same ceiling `seatTone` already records).

## Review round (2026-10-22)

Two adversarial reviewers read the branch: twelve findings, several of them one defect reported
twice. Each was confirmed in the code before it was changed; none was rejected.

| Finding                                                                                                      | Verdict and change                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JPEG stripping stopped at the first SOS: data after EOI and APPn/COM between scans survived (reported twice) | Confirmed: `image.ts` copied `b.subarray(i)` from the first scan. The walk now steps through each scan and ends at the first EOI; fixtures for an appended JPEG with GPS, a motion-photo trailer, and XMP/COM between progressive scans. |
| An agent id outside `SAFE_ID` threw in `portraitSources` and took three pages down (reported twice)          | Confirmed: the contract's `agent_id` is 1–128 of any character, and the store threw a plain `Error`. File names are now the SHA-256 of the id, so every id has one and case-only twins do not share it.                                  |
| Every agent from Unreal read "Agency not stated", so nobody could add their portrait (reported twice)        | Confirmed: `presentersIn`, and the UE5 roster has no organisation. The right is now the tenant's company admin (§2), which every delivered agent has; a unit case on a braced GUID with no agency.                                       |
| The write right went to the agency manager the brief refuses, and not to the tenant's admin                  | Confirmed against the brief's refused list and the owner's "the Company that receives the names". Clara Weiss now holds it and Daniel Hart is refused; the matrix's cells and both e2e specs follow.                                     |
| PNG and WebP metadata removal was a denylist: exIf, C2PA, tIME kept                                          | Confirmed. Both are allowlists now (§5); a fixture carries exIf, caBX, tIME, a WebP C2PA and a private chunk.                                                                                                                            |
| A portrait could not be removed once its agent left every period's roster                                    | Confirmed, latent on the synthetic clock. DELETE reaches such an agent while the file exists, for the right-holders only (anyone else gets the same 404); GET and PUT do not. The missing button is a consequence above.                 |
| Removing her own portrait unmounted the editor: the status vanished and the focus fell to the page           | Confirmed: `portraitRight(..., false)` is null for the agent, so the page swapped elements. Her own page now always renders the same `PortraitEditor`, the focus moves to its heading, and the lab spec asserts both.                    |
| The roster cards' names lost the kit's card title                                                            | Confirmed: `.d-card > h3:first-child` no longer matched. `portrait.css` restates it; measured equal in Chromium.                                                                                                                         |
| The agent's own note always said "Your company's admin added this"                                           | Confirmed. The note is now true whoever put the picture there (§8).                                                                                                                                                                      |

## 2026-10-23: a plain circle, beside every presenter's name

The owner uploaded the five Shark presenters' portraits through the product and asked, recording
the demo: _"Egy minimalisztikus körben legyenek a képek, color stroke nélkül"_ — the pictures in a
minimalist circle, without a colour stroke — and the profile photos shown "on every possible page".
A decision the owner has just made outranks every other rule; the honesty rules hold.

1. **No ring (amends §7).** `AgentPortrait` is the photograph cropped to a disc (`object-fit:
cover`) and nothing round it: no border, outline or shadow. Without a portrait the initials stand
   on a quiet fill, which the seat colour may tint (18% into the ground) and never outline. The
   initials are drawn from `data-initials` by the stylesheet, so they are no part of the name's text
   beside them ("Lena Fischer", not "LFLena Fischer", to a copy, a search and a test). Sizes: `chip`
   20px inside a pill or a short line, `inline` 24px in a table cell or a sentence, `row` 32px beside
   a name and its count line, `card` 40px, `head` 48–64px, `editor` 88px. `AgentName` is a name with
   the face before it. **No face in print**: the printed report names people in words alone.
2. **Where a face now stands** (§7's list, extended), always with an empty text alternative because
   the name is printed beside it: Sales Flow — how each agent's meetings end (rows, the 20px face
   on the name's line so the bars keep their width, and cards), whose the not-interested meetings
   were, the bubble lens's agent key and its tip, the nearest meetings, the longest presentations,
   presentations given; the meeting register's agent column; a replay's
   "Presented by"; a unit's related meetings and "Who showed it"; Presentation's agent chips and
   every presenter's DNA lane (the team's, a cohort's and a period's lane wear none); the report on
   screen (agent table, meeting summary, a meeting's "Presented by", an agent summary's heading);
   Audience's agent column; IRIS-led sales' key, after each presenter's colour. The Sales Agents
   pages already had them.
3. **Ids, never faces, in the read models (keeps §4).** A page finds a face by the presenter's id,
   so `MeetingSummary` (every register row), `MeetingReplay` and `AudienceMatch` carry `agentId`,
   and `RankedRow` and `TextRow` may, where a row about a meeting names one presenter (the longest
   presentations, the lens's nearest). No read model carries a picture or its address;
   `packages/synthetic/test/presenter-ids.test.ts` holds each id to the name in its row. Each page
   reads `portraitSources` once for the presenters it names and reuses one address per agent.
4. **Kept by the reader's browser, asked again before use (amends §6).** GET serves a portrait with
   `Cache-Control: private, no-cache` and an `ETag` of its bytes, and answers a matching
   `If-None-Match` with a bodiless 304 — after the session, project and agent checks, so a reader
   signed out or refused gets 401 or 404 and no cached face. Every refusal stays
   `private, no-store`. On the demo's build one of two first loads of Sales Agents fetched each face
   twice under no-store (React preloads an image it renders on the server, and Chromium reloads a no-store
   response rather than reuse it). Measured on a loopback page with a preload and nine `<img>` per
   face: one request per face on a first load, none on a client-side navigation, one bodiless 304
   per face on a reload. (Review round 1 replaced `private, max-age=3600, immutable`, which kept a
   face an hour past sign-out and past its removal.)

**Not done here.** Ask's answers: an answer is `ObserverAnswer` (`packages/contracts`, frozen) and
carries no presenter id to find a face by. IRIS-led sales' table keeps "Shown by" as names: up to five
a sale, a face each doubled every row's height (46 to 92px at 1440), and the key above it pairs each
face with its name and colour; the same holds for the showing lines inside a sale's meetings. A
unit's timeline names the presenter inside a line of text, which stays text. Briefing and Attention
name no presenter.

**Consequence.** A face is never used from a browser's cache without the route's checks, so signing
out, losing the grant or removing the portrait ends it at once; a page load costs one small request
per face (a 304 when unchanged). The hosted store (§4) should keep the same header.

### Review round 1 (2026-10-23)

Two adversarial reviewers read the branch: seven findings, two of them reported twice. Each was
confirmed in the code and, where it was about a screen, measured on the demo's build (`be3ac396`)
with this round's stylesheet and markup applied in the reviewer's browser only.

| Finding                                                                                                              | Verdict and change                                                                                                                                                                                                                                                                      |
| -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Faces on the agents' outcome rows push Sales Flow's agents screen past one panel at 1440×900 (reported twice)        | Confirmed: 771 to 798px. The 32px face beside both lines widened the shared name column by 42px; Iva Horváth's counts need 803px and the bars had 838. Those rows now wear the 20px face on the name's line, the count under the name (26px): measured 771px, every row its old height. |
| The face widens the register's agent column at 1280×720; the Follow-up chips hide behind the scroll (reported twice) | Confirmed: 45px of overflow before the faces, 76px with them. Between a phone and 90rem the register's cells keep 7px a side (`meetings.css`): at 1280 `scrollWidth == clientWidth`, and 1366 and 1440 stay flush.                                                                      |
| IRIS-led sales names presenters without faces                                                                        | Confirmed. The key wears them now; the table's names stay text (above).                                                                                                                                                                                                                 |
| In print, a marked name's grid lays the name and count side by side                                                  | Confirmed, for the ranked rows too. A print rule after the marked rules restores the unmarked layout; checked under print media.                                                                                                                                                        |
| An immutable hour in the browser outlives sign-out, a revoked grant and the portrait's removal                       | Confirmed (`store.ts` says a face is read back only through the authenticated route). Changed as in point 4.                                                                                                                                                                            |
