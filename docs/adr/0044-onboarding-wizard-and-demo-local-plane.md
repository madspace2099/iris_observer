# ADR-0044 — Akhilesh's onboarding wizard, and a local plane for the recorded demo

**Status:** accepted · **Date:** 2026-10-19 · **Amended:** 2026-10-20 (short codes, recent
codes, no environment question, his look)
**Amends:** the local control plane's gate (`apps/web/src/lib/sources/local-db.ts`) for one local
case; `docs/21-self-served-projects.md` work package 2 (the creation screens)
**Keeps:** ADR-0040 (what a local demonstration is), ADR-0037 (the graphite MADSPACE surface),
ADR-0008 (no Docker, PGlite locally), the activation contract (`docs/ue5-ingestion-contract.md`)

## Context

The product owner said that MADSPACE must add a new project the way Akhilesh designed the "Add"
interface, and that what `/madspace/projects/new` showed was not that. Akhilesh's design is the
"Client & Engine Onboarding" modal of his AD panel (`_review/ad-panel`, read only): four steps,
1.1 Client, 1.2 Project, 1.3 Source, 1.4 Activation, ending in a 15-minute code for Unreal Engine.
Observer had every service behind it, spread over four screens: a developer in Directory, a
one-field project form, the project's settings on its Customer dashboard screen, and a source with
its code dialog.

The owner records the demo on a local production build (`scripts/demo-start.mjs`, `next start` on
:3400). The local control plane refused to open under `NODE_ENV=production`, so `/madspace` there
said "Control plane not configured" and the wizard would have had nowhere to write.

## Decision

1. **The wizard replaces the one-field form.** `/madspace/projects/new` renders
   `OnboardingWizard`, his modal as the page's main panel: his title, his subtitle without
   "Supabase", his stepper, his step intros, his button labels, his source pills, the countdown
   that warns at three minutes and expires at zero, Copy that says Copied for three seconds, the
   summary grid and the Step 2.1 hint. Fields: client ID (the developer's address, lowercased,
   Generate ID, registered developers as pills, demonstration and reserved addresses refused), project
   name, domain (the project's address, filled from the name, fixed once created), currency (no
   default), locale and time zone (filled visibly from the browser), source name. (The environment
   question was removed by the amendment below.)
2. **One press, nothing written until everything passes.** `onboardAction` validates every field,
   re-authorises `madspace_admin`, opens the plane and checks both peppers (`assertPeppersUsable`)
   before the first read of the estate, refuses a taken domain before `createProject`, then
   writes developer (reused when one holds the client ID), project, settings, a `showroom_ue5`
   source and an activation code. A refusal names the step whose field it belongs to and the
   wizard returns there. The code's plaintext leaves the server once, as
   `issueActivationCodeAction`'s does, and is never logged.
3. **Activated, never Connected.** `activationClaimedAction` answers his four-second poll from the
   credential the exchange mints, the same derivation as `ActivationCodeDialog`. A heartbeat is a
   different fact and this screen does not claim it.
4. **A production exception for the local plane, and only one.** `localControlPlaneEnabled()`
   keeps both gates and also opens under `NODE_ENV=production` when `OBSERVER_DEMO_LOCAL_PLANE=1`
   and ADR-0040's local-demonstration conditions hold: the synthetic account directory,
   development or the synthetic harness, and no deployment platform's marker. The marker check is
   what an `.env` file cannot remove, so the same lines in a hosted project open nothing. It is a
   copy of `env.ts`'s check beside the gate, not an import, to keep `env.ts` untouched.
5. **A separate state directory.** `OBSERVER_LOCAL_STATE_DIR` (absolute, or relative to the
   repository root; default `.observer-local`) moves the PGlite data and the demonstration ledger
   together. `demo-start.mjs` uses `.observer-local/demo`: two processes on one PGlite
   directory corrupt it and the browser suite's lab server holds `.observer-local`. It also sets
   two demo-only activation peppers in the subject pepper's style; `describePepper` refuses them
   wherever the harness flag is absent. It binds `next start` to 127.0.0.1: the plane is
   writable, its peppers are public constants and its sign-in is a scenario selector, so nobody
   else on the network may reach it.

## What was deliberately not ported

- **The browser's insert into Supabase.** Codes are minted and stored by the control plane's
  facades, as an HMAC verifier, never as plaintext.
- **`localStorage`.** It kept every code in plaintext in the browser. (His recent-codes list itself
  is restored by the amendment below, from the server.)
- ~~**`ACT-XXXX-XXXX` codes.**~~ Superseded by the amendment below.
- **Purple, glows and emoji.** IRIS blue; a state is a word with its mark (`StatusChip`), never a
  colour alone. (His pulsing dot, icons and blue gradients are restored by the amendment below.)
- **"Connected".** See decision 3.

## Amendment (2026-10-20): his code, his list, his look, no environment question

The owner compared the wizard with Akhilesh's again: step 1.3 asked for an environment his did not,
his "View recent activation codes" was missing, his code is `ACT-66SV-J9RJ` where ours was seventy
characters, and his was nicer and clearer. His words override the paragraphs above where they
conflict.

1. **A short alias for the code, on the local plane only** (`lib/madspace/activation-aliases.ts`).
   The issuer and its `obs.<selector>.<secret>` stay frozen. When `onboardAction` or Source Detail's
   `issueActivationCodeAction` issues a code where the local control plane is the plane in use
   (`localControlPlaneEnabled()` and no hosted database ahead of it), it also mints
   `ACT-XXXX-XXXX` from `crypto.randomBytes` over his 32 symbol alphabet (no 0, 1, I or O; upper
   case L stays, there being no 1, and 32 symbols make each byte's low five bits unbiased), and
   keeps `sha256(alias) → { real code, expiry, client, project, source }` in process memory on
   `globalThis`. The operator sees only the alias. The activation route normalises an alias
   (upper case, dashes and spaces optional), swaps it for the real code and hands the body to the
   frozen `handleActivate`; the wire contract allows any 8 to 64 character code and says the prefix
   is not semantic. The alias is removed on success, expires with the real code, and an unknown,
   spent or expired alias is replaced by a well-formed code nobody was issued, so it gets the
   unknown code's 401 byte for byte and pays the same database round trip; a value longer than the
   handler's 128 character wire bound is not read as an alias at all, so padding one gets the same
   400 whether it is known or not. **Why memory only:** the alias exists to be read aloud for fifteen minutes; nothing about
   it is worth a migration, and a restart loses only codes that are reissued from the source's page
   anyway. **Why local only:** a hosted plane runs several instances, and an alias minted on one
   would be unknown on the next, so there no alias is minted and the long code is shown as before.
   **Threat model:** 40 bits, live 15 minutes, single use. The endpoint is unauthenticated and the
   frozen handler applies no rate limit, so alias lookups are capped at thirty a minute for the
   whole plane through the handler's own `rateLimit` seam (its 429). One budget, not one per
   address: a route handler cannot see the socket, and Next keeps an `x-forwarded-for` the caller
   sent, so a per-address key would be the guesser's choice. The price is that a flood holds up a
   real engine's alias for the rest of that minute. At the cap a code's fifteen minutes allow 450
   guesses against 2^40, about one chance in two billion. `demo-start.mjs` binds the demo plane to
   127.0.0.1, but `pnpm dev` and the e2e lab bind every interface and mint aliases too, so there the
   cap and the entropy are the guard, not the bind. The alias store holds the real
   code in plaintext while the alias lives, as `company-keys.ts` holds a company key: process
   memory, never disk, never a log, never a response.
2. **His recent codes, from the server.** "View recent activation codes" under the steps reads
   `recentActivationCodesAction` (MADSPACE administrators only, like every action here): the last
   fifteen codes this server issued, newest first, with client, project, source, issue time and
   status (Active with time left, Activated, Expired). An active alias is shown in full with Copy;
   a spent or expired one masked (`ACT-66SV-••••`), its plaintext and its real code dropped from
   the store. The real code is never listed. A hosted plane keeps no list and says so.
3. **No environment question.** Step 1.3 asks for the source name only. The server decides: the
   local demonstration plane registers the source as `demo`, any other plane as `production`
   (`onboardAction`). Step 1.4's summary states it read only, and its Step 2.1 hint tells the
   operator to set the plugin's environment to the same, because the handler compares the build's
   `reported_environment` with the source's and a plugin left on `development` (the handoff's own
   example) activates with `environment_mismatch`, a red chip on the project page and Source Detail.
   A machine that is neither is registered from the project's New source form, which still asks.
4. **His look, in our tokens.** Header with an icon badge, the stepper joined by lines, a tile and
   one line of his text beside each step's intro (without "Supabase"), the activation card under a
   3px rule, "Unreal Engine onboarding code", the countdown pill with a pulse that stops for reduced
   motion, the code large, centred and letter-spaced in a dashed well, a Copy Code button with its
   icon, the status chip ("Active, waiting for the engine", then "Activated"; never "Connected"),
   "Expires in 14m 51s", a two-column summary (Client ID, Project, Domain, Source, Environment), the
   blue "Next in Unreal Engine (Step 2.1)" box, the footer. IRIS blue for his blue to purple: a
   gentle blue to blue gradient on the badge, Copy Code and Next, no purple, no glow and no shadow.
   Icons are CSS masks over `currentColor` in `madspace.css`, so the design test's rule that no
   MADSPACE component draws its own shapes holds. One column at phone width.

## Consequences

- On the demo server `/madspace` reads a real, initially empty estate. The ISTER TOWER synthetic
  pages are unchanged by it: a control-plane project changes a synthetic one only as its
  incomplete twin with delivered sessions. The wizard makes complete projects, with one exception:
  when a write after `createProject` is refused or raises, the project stays registered without
  its settings, and the wizard says so and sends the operator to Projects to finish it. Locale and
  time zone are held to the table's CHECK shapes before the first write, so a value Intl accepts
  and the table refuses (`en-US-u-hc-h23`, `+01:00`) is not one of those writes. An unfinished
  project whose domain is a fixture's slug would be that fixture's twin; the placeholders name no
  fixture.
- The other routes behind the same gate open on the demo server too: `/design-lab`, `/lab`, the
  projects list's Build the estate button and Source Detail's lifecycle driver, all for MADSPACE
  administrators only. Pressing Build the estate there creates the ISTER TOWER twin, as it does on
  the lab server.
- `.observer-local/demo` is the demo's reset button, as `.observer-local` is the lab's.
- PGlite runs under `next start` through `serverExternalPackages` and the dynamic import, the same
  path `next dev` takes; the first production start applies the control-plane migrations.
