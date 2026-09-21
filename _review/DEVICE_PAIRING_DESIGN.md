# Device-pairing wizard — survey and design

**Status:** design note · 2026-09-21 · no implementation, no migration
**Branch:** `feature/observer-device-pairing`, based on `origin/main` at `3515402`
**Reference:** `_planning/ad-onboarding-wizard-reference/` (Akhilesh's 4-step wizard, a different product)

---

## 0. The headline

**The mechanism already exists, and it is better than the thing we were about to design.** OBSERVER
issues activation codes today through authenticated server actions, over three SECURITY DEFINER
database façades, with an HMAC verifier keyed by a pepper the database never sees, a 900-second
default TTL, single use, an audit trail, and one byte-identical refusal for all six failure modes.
Nothing in §3 needs to be built.

**But the wizard cannot sit on it entirely unchanged.** Four specific things are missing or in the
way (§4), and none of them is a new table. And three security findings came out of the survey that
matter more than the wizard does (§6) — one of them is an open oracle the project already closed on
a sibling endpoint.

**Correction to an earlier claim of mine in this session:** I said "no backend change needed". That
was too strong, and §4 is the retraction.

## 1. Where to read this

`origin/main` is **373 commits behind** `feature/observer-ux-overhaul-phase1` and zero ahead.
`packages/sources/src/activate.ts`, `admin.ts`, `packages/connectors/`, `apps/web/src/lib/madspace/`
and the activation migration **do not exist on main**. Every citation below is against the ref
`feature/observer-ux-overhaul-phase1`; a survey of the working tree would have reported almost all of
this as absent, which is the same false-negative trap that reopened P1-08b.

## 2. Does a mechanism exist? Yes — the survey's answer to task 1

| Layer                   | What exists                                                                                                                                                                                     | Where                                                                           |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **Mint**                | `issueActivationCode` — validates, mints, derives expiry from an injected clock, returns plaintext once                                                                                         | `packages/sources/src/admin.ts:447-514`                                         |
| **Secret construction** | `obs.<22-char selector>.<43-char secret>`, base64url; selector 16 random bytes, secret 32                                                                                                       | `packages/sources/src/secrets.ts:274-283`                                       |
| **Storage**             | Only an HMAC-SHA256 verifier over `domain‖selector‖secret`, keyed by `OBSERVER_ACTIVATION_CODE_PEPPER`; domain `observer.activation-code.v1`                                                    | `secrets.ts:70-90`                                                              |
| **TTL**                 | `ACTIVATION_TTL_DEFAULT_SECONDS = 900`, min 60, max 3600, **refused rather than clamped** outside the range                                                                                     | `admin.ts:148-150,455-459`                                                      |
| **Admin API**           | `ObserverAdmin` — `createProject`, `createSource`, `issueActivationCode`, `suspend/resume/archiveSource`, `revokeCredential`, `projectsForAccount`, `sourceStatus`, a credential-lifecycle read | `admin.ts:315-345`                                                              |
| **Server actions**      | `createDeveloperAction`, `createProjectAction`, `createSourceAction`, `issueActivationCodeAction` — all `"use server"`                                                                          | `directory-actions.ts:98`, `create-actions.ts:244,327`, `source-actions.ts:147` |
| **UI**                  | `ActivationCodeDialog` — already does clipboard copy with spoken confirmation, expiry tracking and a relative countdown                                                                         | `apps/web/src/components/madspace/ActivationCodeDialog.tsx:203-241`             |
| **Claim**               | Unauthenticated `POST /functions/v1/observer-activate` → `handleActivate`                                                                                                                       | `apps/web/src/app/functions/v1/observer-activate/route.ts:30`                   |
| **Tables**              | `observer.activation_codes`, `observer.source_credentials`, `observer.source_audit` + SECURITY DEFINER functions                                                                                | `supabase/migrations/20260902093000_observer_activation_and_credentials.sql`    |
| **Tests**               | `packages/sources/test/admin.test.ts:363-405` proves the 15-minute default against a frozen clock, and the min/max refusals                                                                     | —                                                                               |

**So this is task 2's branch, not task 3's.** There is no new concept to invent: Client → Project →
Source is already tenant → project → source in OBSERVER's own model, with an action for each.

### 2.1 The one door, and what it refuses

`activate.ts`'s own docblock states the property the file is arranged around:

> A caller holding a guessed code must learn **nothing**. Not whether the code ever existed, not
> whether it expired rather than being spent, not whether the source behind it is suspended, and
> above all not that a source exists at all.

All six failure modes go through `refused()`, which **takes no arguments** — it cannot be given a
`source_id` or a reason, and `observer_activation_consume` returns `null` for all six so there is no
distinction reaching the handler to leak. `ActivationFailure` carries a **required, always-null**
`source_id` so nothing can be inferred from a field's presence, including by response length.

### 2.2 Three layers of authorisation on the issue path

1. **Role.** The server action requires `viewer.role === "madspace_admin"` — `source-actions.ts:99-103`.
2. **Account.** Never caller-supplied. It is the constant `CONTROL_PLANE_ACCOUNT`
   (`control-plane.ts:45`); the client sends only a source id.
3. **Database.** `observer_activation_issue` is SECURITY DEFINER with EXECUTE **revoked from
   `public`, `anon`, `authenticated`** and granted only to `service_role` — migration `:492-506`.

## 3. RLS — task 3's requirement is already satisfied, and no new table is needed

`alter table … enable row level security` is applied to all three tables (migration `:476-478`). The
posture is documented where it was established:

> No policies, **deliberately**, and this is the repository's established posture rather than an
> omission. RLS with no policy denies every role that is not the table owner, and the owner is a role
> nobody can log in as. The definer functions run as that owner and are the only way in.
>
> Worth stating plainly because a Supabase linter reports "RLS enabled, no policy" as a finding:
> **that is the control working, not a gap.** — `20260902090000_observer_source_identity_spine.sql:374-386`

And the grant that answers "backend soha nem anon key" structurally rather than by convention:

```sql
revoke all on schema observer from public, anon, authenticated, service_role;
```

**The `anon` role cannot reach the `observer` schema at all.** The reference wizard's client-side
`insert`/`select` pattern is not merely forbidden here — it has nothing to address. No BYPASSRLS role
exists.

**One honest tension, since the task asked about ADR-0005.** The sentence quoted in the task —
"device ingest credentials are write-only and scoped to a single project" — is in the ADR's
**Decision** paragraph (`docs/adr/0005-rls-isolation.md:19`), not Consequences. Consequences is three
bullets (`:23-26`), and the last one says _"Every new table needs a policy before it ships."_ The
existing tables satisfy that rule's **intent** (deny-all) but not its **letter** (there is no
`create policy` statement anywhere in this repository). That is a documented, deliberate divergence,
not drift — but anyone citing ADR-0005 as authority for a policy statement should know it is cited
against the repository's actual practice.

## 4. What the wizard cannot reuse unchanged — the four real gaps

None needs a table. All four are application-layer.

| #   | Gap                                                                                                                                                                                                                                                                                | Evidence                                                                    | Smallest fix                                                                                                                                                                                                                                                                                  |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Both creation actions `redirect()` on success**, navigating away and destroying a modal wizard's step state                                                                                                                                                                      | `create-actions.ts:309,380`                                                 | extract the action bodies; keep the redirecting wrappers for the existing pages, add non-redirecting variants returning the new id                                                                                                                                                            |
| 2   | **No browser-reachable "was it claimed?" read.** `source-actions.ts` exports exactly five actions and none reads status; the credential-lifecycle read exists on `ObserverAdmin` but is never exposed. The only status refresh reachable from a client today is `router.refresh()` | `source-actions.ts:147,218,236,261,286`; `ActivationCodeDialog.tsx` dismiss | one read-only server action wrapping the existing read. Nothing new anywhere: `observer_credential_status(text, uuid)` is already a granted SECURITY DEFINER function (migration `:492-506`), and `ObserverAdmin` already calls it _"the authoritative answer to 'is this source ACTIVATED'"_ |
| 3   | **The code cannot be displayed in an `ACT-XXXX-XXXX` box** — see §5                                                                                                                                                                                                                | `secrets.ts:261-283`                                                        | change the wizard's presentation, never the code                                                                                                                                                                                                                                              |
| 4   | **Nothing binds a project to a client without also demanding currency, locale and time zone**                                                                                                                                                                                      | `create-actions.ts:244`                                                     | a wizard decision: either collect them in step 1.2, or default them explicitly and say so on screen                                                                                                                                                                                           |

Everything else the wizard shows — the stepper, the countdown, copy-to-clipboard with confirmation,
"Onboard Another Client", a recent-codes panel — is presentation over data that already exists.
`ActivationReceipt.selector` is documented as _"Public, indexed, and safe to display beside an audit
entry. No secret material."_ (`admin.ts:200`), which is exactly what a recent-codes list needs.

## 5. The code format: do not copy `ACT-XXXX-XXXX`

The task said to copy the reference's code format. **Copying it would be wrong twice**, and the
second reason is not a judgement call.

**It is a security decision the repository already made, explicitly** (`secrets.ts:261-272`):

> Same construction as a token, **deliberately**. An activation code is typed by a person, so a
> shorter, friendlier alphabet is tempting — and **it is exactly the temptation that produces
> guessable codes**. Length is the whole defence for a value that is accepted unauthenticated, so it
> stays a full random token and an operator **copies it rather than reads it aloud**.

`ACT-XXXX-XXXX` is eight characters — on the order of 40 bits against an endpoint that is
unauthenticated and, today, unrate-limited (§6.2). OBSERVER's code carries 32 random bytes.

**And it would break parsing** (`secrets.ts:30-37`): the token is `obs.<selector>.<secret>`, and

> **The separator is `.`, and it has to be.** Both halves are base64url, whose alphabet is
> `A-Za-z0-9-_` — so an underscore separator makes the token split into an unpredictable number of
> parts the moment random material happens to contain one.

A dash-grouped reformat is therefore not a cosmetic change; it would corrupt roughly half of all
codes, intermittently, in a way that reads as a corrupt store rather than a format bug.

**The UX survives this intact.** The reference's own copy-to-clipboard button _is_ the interaction
the code's designer prescribes. What changes is one visual decision: render the code as a selectable
monospace block with a copy button and a "Copied" confirmation, not as a short grouped code a person
reads aloud. `ActivationCodeDialog.tsx:233-236` already does exactly this, including the fallback
sentence for when the clipboard is unavailable.

## 6. Three security findings, in descending order of how much they matter

### 6.1 The role gate rests on a session that is explicitly not authentication

`issueActivationCodeAction` is gated on `viewer.role === "madspace_admin"`. That role comes from a
signed cookie, and `session.ts` is candid about what it is (`:11-25`, ADR-0022):

> **This is not production authentication and must not be described as such.** […] The security
> property it does hold […] is that **the browser cannot grant itself a tenant or a role.**

And the signing secret (`session.ts:41-56`):

> `OBSERVER_SESSION_SECRET` when it is set. Otherwise a value derived from the deployment id, which
> is **not secret** — and that is stated rather than hidden, because of what a forged token would
> actually buy: the ability to pick a profile from a screen where every profile is already freely
> selectable, over data that is entirely synthetic.

**That justification is sound today and stops being sound the moment this wizard is real.** What a
forged token buys changes from "pick a synthetic profile" to "mint ingestion credentials for a real
installation". The reasoning was correct for what was behind the gate when it was written; a pairing
wizard puts something else behind the same gate.

**Requirement:** before the wizard is used against any real installation, either
`OBSERVER_SESSION_SECRET` is set to real secret material, or real authentication lands
(`docs/11-preproduction-gates.md`). This is a gate on _shipping the feature_, not on designing it.

### 6.2 A timing oracle the project already closed on the sibling endpoint

`activate.ts:421-422` returns immediately when the code fails to parse, with no HMAC and no database
round trip. A well-formed but unknown code costs a full HMAC plus a `activationConsume` round trip
before returning **identical bytes**. The difference is readable on the clock.

The file's own comment two lines above shows the author reasoning about exactly this bit — and
closing it only in the body:

> separating it would tell a caller that their guess had the wrong _shape_, which is the first bit of
> an enumeration.

**The project has already solved this, on the other endpoint.** `authenticate.ts:76-93` introduces
`DECOY_VERIFIER` for precisely this reason:

> an early return is a measurably faster answer than a full HMAC plus a constant-time compare. That
> difference is precisely the oracle the indistinguishable 401 was built to close: an attacker who
> cannot read the body can still read the clock.

`activate.ts` has no equivalent. The fix is the pattern already in the repository, applied to the
other door. The leaked bit is weaker here than on `authenticate.ts` — "your guess had the right
shape", not "this selector exists" — which is why this is a finding to schedule rather than an
emergency, but it is the first bit of an enumeration by the file's own definition.

**Also:** the rate limiter on `handleActivate` is optional (`activate.ts:403-410`) and
`apps/web/src/lib/sources/deps.ts` never supplies it, and a failed guess writes **nothing** to
`source_audit` (the audit insert is reached only after a successful consume, migration `:333-351`).
Failed guesses are therefore unthrottled and invisible. The 32-byte secret still makes brute force
infeasible — the conclusion survives — but it is resting on entropy alone rather than defence in
depth, and §5's short-code proposal would have removed the only thing holding it up.

### 6.3 The demo path returns the selector to the browser; the production dialog deliberately does not

`ActivationCodeDialog` is careful: its docblock notes the selector _"which `issueActivationCodeAction`
does not even return"_. But `demo-actions.ts:473-479` returns `{ code, selector, purpose, expiresAt }`
to a client component (`LifecycleDriver.tsx:79-81`), gated only on the role check plus
`controlPlane()` being available — which is a service key being configured, not an environment
check (`control-plane.ts:64-68`).

Worth correcting a comfortable framing while we are here: **credential material does reach the
browser, by design.** The plaintext code must, because an operator has to copy it. The defensible
statement is narrower and still good: the _source token_ never reaches the browser, and the code is
held in component state, never logged, and dropped on dismiss
(`ActivationCodeDialog.tsx:220-229`). The wizard must keep that discipline and must not widen it to
the selector.

## 7. What to build, in order

1. **Decide gap 4** — whether step 1.2 collects currency, locale and time zone, or defaults them
   visibly. A product decision; it sets the form.
2. **Non-redirecting variants** of the two creation actions (gap 1). Extract the bodies; leave the
   existing pages' behaviour untouched.
3. **One read-only status action** wrapping the existing credential-lifecycle read (gap 2). This is
   what the wizard polls. No new query and no new table.
4. **The wizard UI** — four steps over those actions, `docs/20-madspace-admin-design-system.md` for
   the visual rules, the code rendered per §5.
5. **Before any real installation:** §6.1's session-secret requirement, and §6.2's decoy-verifier
   and rate-limiter work. Neither blocks building the wizard; both block trusting it.

**Not in scope and not started:** any migration, any schema change, any ingestion change, any change
to `activate.ts` or the existing MADSPACE screens.
