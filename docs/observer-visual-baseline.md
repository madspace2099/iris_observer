# Observer visual baseline

The frozen appearance and behaviour of the Observer frontend. Later milestones
build on this; they do not redraw it.

## What is frozen

|                   |                                                                                                      |
| ----------------- | ---------------------------------------------------------------------------------------------------- |
| Branch            | `feature/observer-reference-parity`                                                                  |
| Baseline commit   | `6eef70f` (M0 closes at the commit that adds this document)                                          |
| Reference archive | `iris_observer-main.zip`, SHA-256 `bd0f456b7ad05b1daa057089a281954ce53822d683ae9bf9ea4a4a8d812fb9f7` |
| Reference commit  | `3515402` — _Observer becomes the interface_, 2026-08-25 02:30:52 +0200                              |

The archive is not a separate application. All 238 of its files are
byte-identical to commit `3515402` of this repository, so the "reference" is
this product's own history and every comparison below is a comparison with an
earlier version of itself.

## Canonical route inventory

Nineteen page routes. Any change to this list is a product decision, not a
refactor, and `apps/web/test/reference-parity.test.ts` fails if the list moves.

**Primary navigation** — Briefing, Sales Flow, Project, Sales Agents:

- `/[tenantSlug]/[projectSlug]/showroom`
- `/[tenantSlug]/[projectSlug]/flow`
- `/[tenantSlug]/[projectSlug]/project`
- `/[tenantSlug]/[projectSlug]/agents`

**Detail row** — Presentation DNA, Unit Attention, Storytelling, Meetings:

- `/[tenantSlug]/[projectSlug]/presentation`
- `/[tenantSlug]/[projectSlug]/units`
- `/[tenantSlug]/[projectSlug]/storytelling`
- `/[tenantSlug]/[projectSlug]/meetings`
- `/[tenantSlug]/[projectSlug]/meetings/[meetingId]`

**Reached from a view, never from a navigation row:**

- `/[tenantSlug]/[projectSlug]/audience`
- `/[tenantSlug]/[projectSlug]/people`
- `/[tenantSlug]/[projectSlug]/overview` (demoted; kept for comparison)

**Outside the project shell:**

- `/`, `/sign-in`, `/projects`, `/madspace`
- `/lab`, `/lab/sign-in`, `/lab/overview-a`, `/lab/overview-b`

`/projects` was added after the reference and is the screen every account lands
on after signing in. `/` is a redirect and nothing else: to `/sign-in` without a
session, to `/projects` with one. It never chooses a project.

Lab routes and MADSPACE administration stay out of the customer navigation, as
in the reference. `/lab/sign-in` is where the superseded profile picker lives;
it is internal, MADSPACE-only, and not part of any product journey.

## Reviewed and frozen

The user has visually reviewed and accepted:

- Briefing
- Sales Flow
- Project
- Sales Agents
- a successful Ask response in English
- a successful Ask response in Hungarian
- the Ask refusal state

**Sales Agents: who may open it changed, what it looks like did not.** ADR-0029
opened the surface to sales agents for a project they hold. That is an access
decision; the composition, the rings, the radars and the ranked bars are exactly
as accepted, and the four-reason rule below still governs any change to them.

## Accepted later fixes

Changes made after the reference commit that alter what a reader sees, each kept
because it corrects a defect the reference has. Evidence is in
`artifacts/parity/PARITY-INDEX.md`.

### Matrix columns follow the container, not the viewport

The reference decides how many Unit Attention columns to show from the viewport
width. Measured:

| Width | Reference      | Current        |
| ----- | -------------- | -------------- |
| 1440  | 6 of 6 metrics | 6 of 6 metrics |
| 1200  | **4 of 6**     | 6 of 6         |
| 900   | **4 of 6**     | 6 of 6         |

The reference silently drops _Shortlisted_ and _Trend_ below 1200px with no way
to reach them. A container query keeps all six at every width.

### The two planes stack at 90rem instead of 78rem

Paired with the above, and needed by it. At 1440 the reference truncates **26
labels** on Presentation DNA. Affects Presentation DNA, Unit Attention,
Storytelling and Meeting Replay.

A narrower correction was attempted during parity — scoping the threshold to
Presentation alone — and reverted: it produced a third layout, two planes with
stacked matrix rows, worse than either build.

### The demonstration badge is two words

"Synthetic demonstration data" wrapped to three lines and dragged the header
down. The visible text is _Demo data_; the full phrase remains the accessible
name and the `title`.

### One page, one set of meetings

`8ccf882`. The Meetings page is shorter than the reference by design.

### Project scoping and the rolling window

`184739e` and `310cb89`. Figures move by one: 73 → 74 presentations, 66/73 →
67/74 audience matches, index 1.38× → 1.39×; meeting identifiers are namespaced
per project (`mtg_0131` → `mtg_ng0132`). This is the contamination correction —
one project must never show another's sessions. Thirty-three checks in
`packages/synthetic/test/isolation.test.ts` hold it.

## Ask Observer

### Answer anatomy

The frozen structure, richer than the reference's:

1. the question, restated
2. `OBSERVATION` — a headline sentence, then prose
3. `MEASURED` — each figure with its own sentence and source count
4. `OBSERVER'S READING` — interpretation, and the limit on it
5. `WHAT TO DO` — one recommendation
6. `Evidence and limits` — a disclosure carrying references and limitations
7. follow-up suggestions, and _Clear_

The sheet is 704px wide at x = 560. Orb (352 × 336), prompt placeholder,
suggestions, `Ctrl+K`, loading state, close and focus restoration are all
identical to the reference.

### Refusal

Asked _"Which buyer will purchase next, and what is their income?"_:

- the reference **answered anyway**, with unrelated presentation statistics;
- the current build refuses: _"Could not answer. The available evidence cannot
  identify the next buyer or their income."_

Refusing what the evidence cannot support is part of the baseline. A later
milestone may not trade it for a more helpful-sounding answer.

### The boundary later work must not cross

Frozen until explicitly reopened: the Ask layout, the English and Hungarian
answer structure, the refusal behaviour, the deterministic tools, and the
Playwright-only synthetic pepper seam. No model provider is configured for local
review, and none may be added without approval.

## The way in — superseded, and what replaced it

**The ProfilePicker is no longer a product screen.** It is not the sign-in, it
is not a step after the sign-in, and no route, redirect or link in the product
reaches it. The flow is:

    ACCOUNT  →  PROJECTS  →  OBSERVER

A reader signs in with an email address and a credential, lands on `/projects`
— always, including when their account holds exactly one project — and opens
one. There is no profile selection anywhere in that sequence.

### What the picker was, and where it went

The reference archive served a stacked list of four text rows with _Continue_
buttons at `/sign-in`; the picker existed there too, at `/lab/sign-in` only, and
was later promoted to production. It has now been demoted back: the component at
`apps/web/src/showroom/ProfilePicker.tsx` renders only at `/lab/sign-in`, which
is declared `audience: "internal"` and `requiresRole: ["madspace_admin"]` in
`apps/web/src/lib/routes.ts`. It is a design laboratory exhibit and a fixture for
the automated suite. It is not authentication and must not be described as one.

Its screenshots in `artifacts/parity/sign-in/` are a record of a screen that no
longer ships. They no longer need user acceptance, and the earlier
`PENDING USER ACCEPTANCE` label on them is withdrawn as moot.

### The sign-in that replaced it — `PENDING USER ACCEPTANCE`

The MADSPACE Client Portal composition, transcribed from `Klient Portál.zip`
including its own assets:

- two equal columns, `minmax(0, 1fr)` each, at a 48px inset;
- the founders photograph — `assets/madspace-founders-1100.jpg`, copied
  byte-for-byte to `apps/web/public/portal/` — under a four-stage scrim at
  55% / 10% @32% / 75% @78% / 92%;
- the white MADSPACE mark at 16px tall, top left;
- the hero line, then the caption block: a 13px uppercase label at 0.16em and
  the two founders at 17px with 14px roles, 40px apart;
- on the right, a 360px form: eyebrow, `Sign in`, work email, company single
  sign-on, an `or password` divider, password, `Sign in with password`,
  invitation, and the protocol note.

Four deliberate departures from the reference, all of them repairs:

| Reference                      | Here                                          | Why                                                 |
| ------------------------------ | --------------------------------------------- | --------------------------------------------------- |
| `aria-label` and a placeholder | a visible `<label>` bound by `for`/`id`       | a placeholder disappears the moment it is needed    |
| `outline: none` on every field | a 2px focus ring at 2px offset                | keyboard readers must be able to see where they are |
| authentication in the browser  | a server action                               | the credential never reaches the bundle             |
| no mobile breakpoint at all    | one column below 900px, the photograph a band | the reference is unusable on a phone                |

The hero remains one value: `<LoginHero image="url('/portal/observer.jpg')" />`
replaces the photograph, and the caption travels with it from the caller.

### The projects page — `PENDING USER ACCEPTANCE`

Generated from grants, never filtered for display. Each card carries a cover, the
developer, the project and one `Open Observer` action — no figure, status,
milestone, next action or administration control appears on it.

## The development-only "1 Issue" indicator

Red `1 Issue` badges appear in screenshots taken from the development server in
a browser that has the ClickUp extension installed. The cause is that extension,
not this application:

```
<body
-   className="clickup-chrome-ext_installed"
>
```

React's own message names it: _"It can also happen if the client has a browser
extension installed which messes with the HTML before React loaded."_

Established by measurement, not inference:

|                                   | development | production |
| --------------------------------- | ----------- | ---------- |
| `nextjs-portal` elements          | 1           | **0**      |
| dev-tools indicator               | present     | **absent** |
| `<body>` class in a clean browser | none        | none       |
| console errors or warnings        | none        | none       |

`apps/web/src/app/layout.tsx` renders a bare `<body>` and sets no class; the
string `clickup` appears nowhere in the repository. No code change was made,
because there is no application defect to fix.

**To demonstrate without it:** run the production build, or use a browser
profile with no extensions. Do not hide the indicator with CSS and do not
disable it to tidy a screenshot — it is a real signal about the page it is on.

## Screenshots

| Location                                          | Contents                                            |
| ------------------------------------------------- | --------------------------------------------------- |
| `artifacts/parity/reference/`                     | 36 captures of the reference build                  |
| `artifacts/parity/current/`                       | 36 captures of the parity branch                    |
| `artifacts/parity/contact-sheet.png`              | 30 labelled pairs, reference left, current right    |
| `artifacts/parity/PARITY-INDEX.md`                | every panel, its difference and its reason          |
| `artifacts/parity/sign-in/`                       | The superseded ProfilePicker, kept as a record only |
| `artifacts/parity/sign-in/sign-in-comparison.png` | reference beside current                            |

Viewports: 1920 × 1080, 1440 × 900, Pixel 7 (412 × 915).

Screenshots are not tracked in Git. `artifacts/` is generated output and is
excluded from the format check; the repository has never carried baseline
images, and this document does not start that practice.

## The rule

**Later milestones do not redesign this UI.**

A visual change is permitted only for one of four reasons, and the reason is
stated in the commit that makes it:

1. a **proven bug** — demonstrated, not suspected;
2. an **accessibility defect** — measured against the contract, not an opinion
   about taste;
3. a **security defect**;
4. **explicit user approval** for that specific change.

"More modern", "more consistent", "while I was in there" and "the newer version
has more lines" are not reasons. Where a later change is desirable but none of
the four applies, it waits for approval.
