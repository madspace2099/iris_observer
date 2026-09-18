# ADR-0029 — A sales agent sees the team on their own project

**Status:** accepted
**Date:** 2026-08-29
**Branch:** `feature/observer-reference-parity`
**Supersedes:** the sales-agent clause of ADR-0027, "Authorisation is enforced on the server"

## Context

ADR-0027 closed the Sales Agents surface to sales agents. The reasoning was
plain and, on its own terms, sound: a screen that names Monika beside Akhilesh
with their outcome mixes side by side is a performance ranking whatever the
caption says, and the sign-in screen promised an agent "no league table". It was
enforced three times over — the route, the read model and the comparison tool —
precisely so that no single way in could be forgotten.

Two things have changed.

The promise it enforced was made on a screen that no longer exists. The blurb
lived on the profile picker, which was never authentication and is now confined
to the design laboratory. The product's front door is an account sign-in, and it
promises nothing about league tables.

And the requirement is the opposite one: an agent working a project should see
the results of every agent working that project. Not because ranking became
acceptable, but because the people running meetings on one development are a
team, and a team that cannot see its own figures is being managed rather than
helped. The agent who is 2.2× the team's share of time in Shortlist learns
nothing from that ratio without knowing who the team is.

## Decision

**Named comparison is bounded by the project, not by the role.**

Every role that holds a project may read that project's Sales Agents surface,
sales agents included. `mayCompareNamedColleagues` now answers `true` for every
role, and its name is kept only because renaming it would hide that a decision
was reversed here rather than never made.

The role checks are removed rather than relaxed, in all three places, because
the check that matters had already run before any of them:
`SyntheticObserverRepository.context` refuses a project the viewer's
`projectIds` do not contain, before a single session is counted.

## What this deliberately did not open

- **Another project.** The boundary that did not move is the only boundary
  there ever was. An agent granted Northgate sees Northgate's agents and
  nothing of Kingsford's — not by route, not by read model, not by tool call,
  not through Ask, and not as a total that quietly includes both.
- **Cross-project aggregation.** Two projects are two developments, often two
  competing developers. Nothing sums, averages or ranks across them, and an
  account holding both reads them one at a time.
- **The IRIS rating.** Feedback on the software, MADSPACE only, unchanged.
- **Anything that is not a working figure.** Account administration, invitations,
  credentials, billing and buyers' personal data are not a colleague's
  presentation pattern, and peer visibility is not an argument for exposing any
  of them. `/madspace` remains `madspace_admin`.

## Consequences

`e2e/authorization.spec.ts` asserted the old rule and now asserts the new one,
including the part that did not change: the same agent, on a project she does
not hold, still gets a refusal that names nothing.

The screen itself is unchanged. This is an access decision, not a visual one —
the Sales Agents surface stays frozen (`docs/observer-visual-baseline.md`).
