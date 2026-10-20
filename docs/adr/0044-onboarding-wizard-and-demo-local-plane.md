# ADR-0044 — Akhilesh's onboarding wizard, and a local plane for the recorded demo

**Status:** accepted · **Date:** 2026-10-19
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
   default), locale and time zone (filled visibly from the browser), source name, environment (no
   default).
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
- **`localStorage` and the recent-codes list.** It kept every code in plaintext in the browser and
  offered Copy on old ones. A code is shown once; another is issued from the source's page.
- **`ACT-XXXX-XXXX` codes.** The real code is `obs.<selector>.<secret>`, about seventy characters,
  so the code box breaks it anywhere rather than letter-spacing it.
- **Gradients, glows, pulsing dots, emoji and the panel icons.** IRIS blue is solid; a state is a
  word with its mark (`StatusChip`), never a colour alone.
- **"Connected".** See decision 3.

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
