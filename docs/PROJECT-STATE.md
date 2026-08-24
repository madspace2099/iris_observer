# Project state

**Read this first in every session.** Then `.claude/skills/iris-observer-product/SKILL.md`, then
whatever it points at. Update this file at the end of every meaningful session.

**Last updated:** 2026-08-24 · **Branch:** `main` · **Never pushed.**

---

## Where the project is

| Milestone                                    | Status                                                 |
| -------------------------------------------- | ------------------------------------------------------ |
| M0 Workspace foundation                      | ✅ accepted · `d73ba18`, `3214b51`                     |
| M1 Product Intelligence Contract             | ✅ accepted · `a30fcb8`                                |
| M1 closure amendment                         | ✅ accepted · `b7d4869`                                |
| M2 UI foundation and first slices            | ✅ **technically** accepted · `2bb84eb`                |
| M2.1 Visual acceptance and model corrections | ✅ model, security and typography accepted · `50d0349` |
| **M2.1 visual layer**                        | ❌ **rejected.** See `docs/12-visual-autopsy.md`       |
| M2.2 Visual reboot — concepts                | 🔵 in progress                                         |
| M3 Remaining intelligence surfaces           | ⛔ blocked on the visual selection                     |

## What is true right now

- 82 metrics in the registry, 47 source requirements, 0 uncovered, 0 open decisions, 1 review gate.
- 22 ADRs. 152 unit tests, 89 Playwright tests across 1920×1080, 1440×900 and Pixel 7, zero axe
  violations, production build green.
- No database, no ingestion, no LLM, no production authentication. All deliberate; see the roadmap.
- The synthetic repository is the only data source and sits behind `ObserverRepository`.

## The one decision waiting on the user

**Which Executive Overview concept to build on** — narrative-first, spatial-first, or a described
hybrid. Both are implemented as isolated laboratory routes and neither has replaced a production
route. Nothing else proceeds until this is chosen.

## Next recommended action

1. User reviews the two concept screenshots and chooses.
2. Promote the chosen system into `@observer/ui` as production components.
3. Rebuild the two existing production slices — Executive Overview and the pre-meeting brief — on it.
4. Re-run the visual review, including every surface that was never inspected.
5. Only then start M3 (Sales Flow, Project, People).

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

## Unresolved decisions

| Question                                              | Blocks                              | Owner             |
| ----------------------------------------------------- | ----------------------------------- | ----------------- |
| Narrative-first or spatial-first Executive Overview   | the visual rollout                  | **the user, now** |
| Does REALPAD expose a usable API                      | the CRM connector milestone         | MADSPACE          |
| Interior platform — can it post back                  | interior dwell in deep-dive metrics | MADSPACE          |
| WEBIRIS stable visitor identifier and cookie lifetime | deterministic back-linking          | MADSPACE          |
| Which system mints the booking                        | `meeting_id` ownership in practice  | MADSPACE          |
| Seats per project or per installation                 | the entitlement model               | MADSPACE          |

## Review gates before production

`docs/11-preproduction-gates.md` — privacy and legal review, production authentication, device
credentials, data processing agreement.

---

## Visual review history

| Date       | Surface                        | Outcome                                                                                                                                                                           |
| ---------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-24 | M2.1, 7 surfaces × 3 viewports | **Rejected.** Generic dark SaaS; no spatial intelligence; no IRIS language; AI is a decorative card; MADSPACE admin shipped 86% empty and unreviewed. `docs/12-visual-autopsy.md` |
| 2026-08-24 | Figma inspection               | `4:20`, `7843:300`, `7813:1334`, `4:25` inspected; `3:16` empty. Matrix in `docs/13-figma-adoption-matrix.md`                                                                     |

## Where the artefacts are

Review screenshots and Figma renders live outside the repository, under the session scratchpad:

```
…/scratchpad/review    42 rejected M2.1 screenshots
…/scratchpad/figma     Figma renders inspected for the adoption matrix
…/scratchpad/lab       concept screenshots
…/scratchpad/fig       extracted .fig archives (HORIZONTAL MENU, BASIC SCREEN HERE, IRIS FIGMA BOT)
```

The scratchpad root is recorded in `e2e/review-screenshots.spec.ts` and can be overridden with
`OBSERVER_SHOTS`. Screenshots are never committed — there is no visual-baseline policy yet.
