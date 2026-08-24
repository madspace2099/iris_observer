# ADR-0019 — Role-aware default home screens, not a configurable dashboard

**Status:** accepted · 2026-08-24 · **Resolves** the open question from `docs/coverage-report.md`

## Context

Stano's observation was that different readers want different opening screens: a marketer, an agency
manager and a developer do not want the same six numbers. The obvious answer is a drag-and-drop
dashboard.

It is the wrong answer for an MVP, for two reasons. A reader who assembles their own view assembles a
flattering one, and the product loses the ability to say "this is what matters" — which is the whole
premise of a verdict-first page. And a configurable dashboard is a large amount of engineering spent
before anybody knows which components are worth pinning.

## Decision

**Role-aware defaults.** The developer, the agency manager and the sales agent each get a home screen
designed for their decisions. Overview is role-aware rather than role-filtered: the agent gets briefs
and follow-ups, not the executive view with cards blanked out.

No free customisation in the MVP. A later version may allow pinning or reordering a **limited set of
approved components**, and even then it must not allow changing what a metric means.

## Consequences

- The first screen can be designed, and tested, as a single argument.
- The cost is that somebody will want a component they cannot have. That is a prompt to reconsider the
  default, which is more useful feedback than a rearranged grid.
- Metric definitions stay outside the reach of layout preferences, permanently.
