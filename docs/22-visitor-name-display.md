# 22 — Displaying a visitor's real name

**Status:** design note · 2026-09-21 · no implementation
**Task:** P1-08b-redesign · supersedes the "permanently blocked" framing of P1-08b

This note settles where a real visitor name would come from, where it would be joined, and what may
never change to accommodate it. It stops short of writing the code, and §7 says why.

**Two findings invert the question this task was written to ask.**

1. Observer **already prints real buyer names** on three agent-facing surfaces, and a committed e2e
   test requires one of them to.
2. A real visitor name **already exists in a source system Observer connects to today**. The
   showroom's own `public.user_sessions` table carries `visitor_name`, and the adapter deliberately
   declines to read it — for a **security** reason recorded in ADR-0005, not for the privacy doctrine
   the old comments cited.

So P1-08b was never "may we show a name, and can we find one". It is: **the register names nobody
while the brief names somebody; the name we already reach is being dropped on purpose; and the names
we do show came from nowhere.**

---

## 1. The decision this note implements

P1-08b was recorded as blocked by product decision. That record was wrong about its own reason, and
the correction matters more than the task:

> The real visitor/buyer name is **entered by the Sales Agent**, not by the visitor. Observer's only
> reader is the Sales Agent. `docs/05-identity.md` rule 3 forbids personal data in the behavioural
> event and observation pipeline; it does not forbid displaying a name on an authenticated screen.
> ADR-0018 is about a different problem — the internal brief on a buyer-visible surface — not about
> whether an agent may see who they are meeting.

Both halves check out against the sources (§2). §3.3 also confirms the first half literally: the name
in the showroom's session table is the one **the sales person typed in**, alongside `sales_person`.

## 2. What the rules actually say

**`docs/05-identity.md:63` rule 3, verbatim:**

> **3. Behavioural payloads carry internal identifiers only.** No name, email or phone in an event or
> an observation, ever. `Contact` is a strict object with no PII fields, which makes the separation
> structural rather than a matter of remembering to omit columns.

The rule names its own scope twice — "an event or an observation", and the `Contact` record. A screen
is neither. The rule is not weakened by this note, and §6 lists what enforces it.

**ADR-0018** prohibits the internal brief "from every buyer-visible surface", and then names where it
_does_ belong:

> It exists only in authenticated sales-agent surfaces: the agent's own device, the agent workspace,
> **the meeting drill-down**.

So ADR-0018 does not merely permit an agent-only identification surface — it names one. It governs a
_surface_, not a _field_.

**`docs/10-policies.md:55` §3** sets the WEBIRIS visitor identifier to a first-party pseudonymous UUID
on a 180-day rolling lifetime. That governs how an **anonymous web visitor** is tracked before anybody
knows who they are. It says nothing about a contact the agent has since identified.

**The one claim that over-reached is ours**, not the documents':
`packages/readmodels/src/screens.ts` called the meeting list "the one surface where a name may never
appear" and asserted that "a label assembled from a `ContactPii` record would defeat both". It read
rule 3's _behavioural_ scope as a _display_ scope. That comment is corrected alongside this note; the
type it describes is unchanged.

## 3. What already exists

### 3.1 The product already shows real buyer names

| Surface                    | Renders                                                      | File                                                                      |
| -------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------- |
| Pre-meeting brief heading  | `view.participantNames.join(" and ")`                        | `apps/web/src/showroom/BriefView.tsx:82`                                  |
| Sales-agent Overview       | `meeting.participantNames.join(" and ")`                     | `apps/web/src/app/(app)/[tenantSlug]/[projectSlug]/overview/page.tsx:224` |
| Ask IRIS `prepare_meeting` | `brief.participantNames.join(", ")` and the drafted sentence | `apps/web/src/lib/ai/tools.ts:634,672`                                    |

The read models are already name-shaped: `participantNames` is `readonly string[]` on both
`PreMeetingBriefView` and `UpcomingMeeting` (`packages/readmodels/src/views.ts:46,104`), and
`FollowUpItem.displayName` is a string. What reaches the screen is **"Viktória Halász"** and
**"Daniel and Eva Bartoš"** — string literals in `packages/synthetic/src/agent.ts:372,415,427,449`,
not a join. The world's own `CONTACTS` roster (`packages/synthetic/src/world.ts:902`) is dead code:
its only reader, `contactById` at `:923`, has no callers.

**And a committed test requires the name to be there.** `e2e/observer.spec.ts:139` asserts the
brief's `h1` contains "Viktória Halász". Any implementation has to satisfy this as well as the
tripwires in §4 — they point in opposite directions, which is correct: the brief names, the register
does not.

> **A live defect this note does not fix, because this round may not touch a component.**
> `apps/web/src/app/(app)/[tenantSlug]/[projectSlug]/units/[unitCode]/page.tsx:402-403` tells the
> reader, on screen: _"A visitor is a privacy-safe identifier. **No contact name, email or telephone
> number appears on any surface of this product.**"_ The second sentence is false, and
> `e2e/observer.spec.ts:139` proves it false. The same false absolute was in
> `components/product/Person.tsx` and is corrected there because a docblock is not a component
> change. **The rendered sentence needs its own decision and a one-line fix**; the two neighbouring
> claims (`agents/[agentId]/page.tsx:644`, `meetings/page.tsx:111`) are correctly scoped to the
> visitor column and are true.

### 3.2 The layers behind it

| Layer                  | State                                                                                                                                                                                                                       | Evidence                                                           |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| **Showroom source**    | **The name is there and we already connect to it.** See §3.3                                                                                                                                                                | `packages/connectors/src/supabase-showroom.ts:20-30`               |
| **CRM API (Lomnio)**   | **The name is there.** `GET /v1/leads` returns `customer { name, email, phone, phone_e164, gdpr_consent, marketing_consent }`; the adapter's own interface omits it                                                         | `docs/adr/0036…md:100`, `packages/connectors/src/deals.ts:256-260` |
| **CRM API (REALPAD)**  | **Behind a second endpoint nothing pulls.** The business-case export carries Customer ID only — "No email and no phone are in this export; customers are `list-excel-customers-contacts`". No code references that endpoint | `docs/adr/0036…md:50,64-66`                                        |
| **Canonical deal**     | **Rejects a name by construction.** `CrmDealSchema` is a `z.strictObject` carrying only `subjectKey` — "Keyed hash of the buyer's email, else phone. Never the value."                                                      | `packages/contracts/src/deals.ts:33-54`                            |
| **Contract**           | **A type with nothing behind it.** `ContactPiiSchema` declares `fullName: string \| null` keyed by `contactId`, is exported from `@observer/contracts`, and has zero producers and zero consumers                           | `packages/contracts/src/identity.ts:101-109`                       |
| **Database**           | **No contact table of any kind** across all 22 migrations. The only name-holding column in the schema is `observer.project_agents.display_name` — the presenter                                                             | `supabase/migrations/`                                             |
| **Display (register)** | **Structurally cannot carry one.** `VisitorLabel` has three fields and `visitorLabel(kind, priorMeetings)` has no parameter a name could pass through                                                                       | `packages/readmodels/src/screens.ts:75-113`                        |

### 3.3 The name is already in a connected source, and we decline it

This is the finding that shortens the work, and it is recorded in the adapter's own docblock as a
live confirmation (`packages/connectors/src/supabase-showroom.ts:20-30`):

> One row per visitor session: `session_id`, `sales_person`, **`visitor_name`**, a `session_data`
> JSONB blob holding everything the legacy dashboard showed, and `created_at`/`updated_at`.
>
> ## What is dropped on the way in, and why
>
> `visitor_name` (top level) and `session_data.UserName` (**the same fact, twice**) are never read
> into anything this function returns. `ShowroomSession` "holds no name, phone or email" by contract;
> **ADR-0005 found this exact project's session table readable by anyone holding its anon key with no
> row-level filter**, which is one more reason this adapter […]

The drop is enforced at three independent points, and an implementation has to undo all three
deliberately rather than by accident:

| Point                | What it does                                                                               | Line      |
| -------------------- | ------------------------------------------------------------------------------------------ | --------- |
| the query            | selects only `session_id,created_at,session_data` — `visitor_name` never crosses the wire  | `:369`    |
| `RawSessionData`     | does not declare `UserName`, so the blob field arrives in memory and no code path reads it | `:97-135` |
| `mapShowroomSession` | hard-codes `contactId: null`                                                               | `:319`    |

**Two things follow.** First, §1's premise is literally true in the data: the name sits beside
`sales_person`, entered by the agent. Second, **the blocker is not privacy doctrine — it is an access
posture.** The source table is readable by anyone holding the project's anon key with no row-level
filter, so reading a name through it would pull personal data across a boundary that has no
authorisation on it at all. That is a real blocker, it is a different blocker from the one recorded,
and it is fixable on the source side rather than by a new Observer table.

### 3.4 The join already exists, for the other person in the room

The pattern this feature needs is **already built and in production, for presenters**:

`observer.project_agents` (`supabase/migrations/20260918100000_observer_project_directory.sql:197`) is
introduced under the heading _"the names of the people who present"_. It holds an opaque `agent_ref`
exactly as a showroom sends it, plus a nullable `display_name` whose comment reads _"Null exactly when
the name was withdrawn"_. The name is resolved at read time into `DeliveredSessions.agentNames` and
spent by `presenterName`, which falls back to `PRESENTER_NOT_NAMED` beside the identifier when no name
has arrived (P1-08a).

That is the whole design: **a separate name table keyed by an opaque reference, joined at read time,
with withdrawal expressed as a null.** A contact-name store should copy it rather than invent
anything.

## 4. Where the join would happen — and where it may not

**Not in the component.** ADR-0012 is explicit, and the canonical timeline contract quotes it:

> The UI renders these; it must never join WEBIRIS, CRM and showroom records itself (ADR-0012),
> because the reconciliation rules — ordering across clock skew, deduplicating the same fact reported
> by two systems, hiding entries whose consent has been withdrawn — belong in one place that can be
> tested. — `packages/contracts/src/engagement.ts:224-228`

The third reason is this feature's own problem: consent withdrawal must hide a name, and a component
that joined its own would have to remember to check. The join belongs in the **read model**, beside
`visitorLabel`, exactly where `presenterName` already sits.

**The join key is in place.** `DealSchema.contactId` (`engagement.ts:206`) and
`ContactPiiSchema.contactId` (`identity.ts:102`) are the same `ContactId`, and `ShowroomSession`
carries a `contactId` the label builder consumes — currently always null from the live adapter
(§3.3).

**The display targets.** Each prints `VisitorLabel.display` today and names nobody:

| Surface                       | File                                                   | Line                       |
| ----------------------------- | ------------------------------------------------------ | -------------------------- |
| Meeting register (project)    | `apps/web/src/components/meetings/MeetingRegister.tsx` | column `:118`, cell `:186` |
| Meeting register (agent page) | `apps/web/src/components/agents/MeetingRegister.tsx`   | column `:71`, cell `:125`  |
| Showroom screens read model   | `packages/synthetic/src/showroom/screens.ts`           | `:245`                     |

The meeting **replay** has no visitor field at all, so it would need a new field rather than a join —
worth knowing before somebody treats all four as one change.

**Two tripwires constrain the shape, and both are right.**

| Test                                             | Asserts                                                                                                                                                                          | Breaks if                                        |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `packages/synthetic/test/screens.test.ts:78-101` | "never puts a person in a visitor label" — checked against every staff name the world holds **and against the contact identifier itself**, citing rule 3 and `10-policies.md` §3 | a name or an id is put **inside** `VisitorLabel` |
| `packages/synthetic/test/presenter-name.test.ts` | the visitor label is one of its three declared states and carries no presenter's name                                                                                            | the same                                         |
| `e2e/observer.spec.ts:139`                       | the brief's `h1` **contains** "Viktória Halász"                                                                                                                                  | the brief stops naming participants              |

**The shape that satisfies all three** is a **field beside the label**, never inside it:

- `VisitorLabel` keeps its three states and its structural guarantee, untouched — so both read-model
  tests keep passing unchanged.
- A sibling `visitorName: string | null`, resolved by the read model, null whenever there is no
  record, no consent, or no permission.
- The component prints the name when present and falls back to `display` when not — the same
  absent-value discipline `words.ts` owns, and the same reason P1-08a kept the presenter's identifier
  _beside_ `PRESENTER_NOT_NAMED` rather than choosing between them.

## 5. Who may see it

`maySeeSurface` gates the meeting drill-down to three roles. The meeting **register** is a surface "a
whole agency can open" — the agent register's own docblock gives that as the reason the column is safe
today (`agents/MeetingRegister.tsx:28`).

That reason survives the reopening. §1 says Observer's reader is the Sales Agent; it does not say
every agency seat should see every buyer's name. Note the asymmetry with §3.1: the brief is gated to
three roles and shows a name, while the register is open to the agency and does not. Extending the
name to the register widens the audience the brief's gate deliberately narrowed.

**This is the one genuinely open product question in this note**, and §7 lists it rather than
answering it.

## 6. What must never change

1. **No name in an event or an observation.** Rule 3 stands. What enforces it, honestly stated,
   because overstating this would be the same mistake this note exists to correct:
   - `deals_current` carries a SQL CHECK refusing a `name`, `email`, `phone` or `customer` key in the
     stored deal JSON — `supabase/migrations/20260907180000_observer_deals.sql:68`. A hard guard.
   - `CrmDealSchema` is a `z.strictObject` (`packages/contracts/src/deals.ts:33-54`), so an adapter
     that started passing `customer.name` through would **fail validation** rather than quietly widen
     the record. This fails closed on a field nobody anticipated, which makes it the strongest of the
     three.
   - `scanForForbiddenContent` (`packages/contracts/src/ue5/privacy.ts:185`) runs on
     `event.properties` in the ingestion validation path (`ue5/validation.ts:371`) and rejects
     `buyername`, `visitorname`, `customername`, `fullname` and `displayname` after normalisation.
     **It is a key-name heuristic and says so itself** (`privacy.ts:8-17`): _"It **cannot** prove an
     absence of personal data… Anyone who claims a scanner guarantees the absence of PII is selling
     something. What actually provides the guarantee is the **per-event schema registry**… That is a
     later milestone (ADR-0013)."_ A bare `name` is deliberately exempt — `unit_name`, `preset_name`
     and `scene_name` are ordinary — and a test fixes that as intended behaviour
     (`contracts/test/ue5/privacy.test.ts:192-194`). Anybody adding a name field near ingestion
     should assume the scanner will not catch them.
2. **`Contact` stays PII-free.** The strict object and its test
   (`contracts/test/identity.test.ts:35`) are what make the separation structural.
3. **Nothing persists the joined name** into anything the event rules govern. The join is resolved for
   a render, not stored.
4. **Consent withdrawal removes the name**, which is why §4 puts the join in the read model. Both CRMs
   deliver consent beside the name — Lomnio as `gdpr_consent` / `marketing_consent` on the same
   object, REALPAD as a separate `list-excel-customer-consents` export.
5. **Erasure still deletes.** `docs/05-identity.md:147` — "`ContactPii` is deleted outright." A store
   holding the name inherits that obligation, and `project_agents.display_name` already models the
   withdrawal half of it.

## 7. Recommendation

**Do this in Phase 2. It cannot close as a Phase 1 task, and the reason is not scheduling.**

Every remaining step is one this phase forbids by name — a durable store (a new table), a source
field (an ingestion change), and a consent join that needs both. A Phase 1 version could only be a
display path fed by nothing, or fed by another invented literal. The second is forbidden outright —
doctrine §3, _never fabricate data to make a visualisation work_, and CLAUDE.md non-negotiable 2 —
and §3.1 shows what it costs when it has already happened: three surfaces show a confident name that
no source stands behind, and one page tells the reader in plain words that this never happens.

**Take the showroom path, not the CRM path.** §3.3 changes the order of work. The name Observer wants
is the one the sales person already typed beside their own, in a table the product already reads
every sync — not one to be reconstructed from a CRM that keys deals by a hash. The CRM path stays
available and §3.2 records what it would cost, but it is the longer of the two.

**What Phase 2 should take, in order:**

1. **Decide the §5 visibility question.** Every agency seat, or the meeting's own agent plus the three
   roles already gated on the drill-down. A product decision, and it constrains the store.
2. **Resolve the ADR-0005 access finding on the source table** — the actual blocker named in §3.3. A
   name must not be read across a boundary where the anon key grants unfiltered row access. This is
   a conversation with whoever owns that Supabase project, not an Observer change, and **nothing else
   in this list may start before it lands.**
3. **Add the store**, copying `observer.project_agents` rather than inventing: keyed by an opaque
   contact reference, `display_name` nullable to express withdrawal, and this repository's actual
   posture — `enable row level security` with no policy plus `SECURITY DEFINER` access functions,
   which is what every existing table does, rather than a `create policy` this repository has never
   used anywhere.
4. **Widen the showroom adapter** at the three points §3.3 names, deliberately and in one change, so
   the reason is visible in the diff.
5. **Resolve `visitorName` in the read model** beside `visitorLabel`, and let the two registers print
   it. A few lines, and last for a reason: it is the only step with nothing left to decide.
6. **Then retire the literals** in `packages/synthetic/src/agent.ts` and fix the false sentence on the
   unit page (§3.1), so the brief, the Overview and the copy all describe the same product.

**What is done already, and cost nothing:** the corrections this note ships with — `screens.ts`, both
`MeetingRegister` docblocks, `Person.tsx` and two comments in `presenter-name.test.ts` now say the
absence is current and under design rather than permanent and decided, and five places in
`docs/PROJECT-STATE.md` say what was recorded, that it was wrong, and where the correction lives.
