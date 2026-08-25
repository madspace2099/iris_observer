# ADR-0027 — The production remediation milestone

**Status:** accepted
**Date:** 2026-08-25
**Audited deployment:** https://iris-observer.vercel.app/ at commit `3515402`

## Context

A review of the deployed build found defects across four categories: data that
was not scoped, authorisation that existed only in the navigation, a period
control that disagreed with the page beneath it, and layout that clipped its own
content at the widths most laptops use.

They shared one property. **Every one passed the existing test suite**, including
axe at three viewports. A product can be fully accessible, fully typed and fully
green while showing one developer another developer's figures.

## The corrections

### Every query is scoped to a project

`sessionsInPeriod(from, to)` took a date range and nothing else, and the
generator stamped `projectId: "prj_northgate"` — an id belonging to no project —
onto every session. Northgate, Riverside and Kingsford therefore rendered the
same presentation counts, the same progression rate, the same unit demand and
the same agent results.

Each project now has its own dataset: its own building, its own presenters, its
own volume, its own seed, its own connected sources. `sessionsInPeriod` takes a
project id with no default, and the repository passes the one the viewer already
resolved — which is what makes the authorisation reach the data rather than
stopping at the page.

Beta Development has its own agency and its own people. Reusing one team across
two tenants would put a developer's staff on a competitor's screen.

### Missing data is stated, never rendered as zero

Riverside has no CRM. It reported "0% progressing against 0% before", which says
nobody progressed when the truth is that nothing recorded whether they did.
Kingsford, three weeks live, reported "0% in the previous period" for a period
that does not exist.

Both now say so. The progression figure renders as unavailable, the verdict
names the gap, and the signal is not graded on a rate the project cannot
measure.

### Authorisation is enforced on the server

`SURFACES` declared which roles may open which screen and **nothing read it
except the navigation builder**. A sales agent who typed
`/alpha/northgate/agents` was shown every colleague's outcome mix side by side —
the league table the sign-in screen promises they will not get.

`requireSurface` now runs on every project surface before anything is read. The
read model refuses too, and so does the comparison tool, because a route is one
of several ways in. The suggested questions are scoped by role, since offering a
question and then refusing it reads as a broken product rather than a policy.

An agency manager holding two developers had no way to reach the second. The
shell now offers a developer switch, and never aggregates: two developers are
two businesses.

### The period is the URL

The selector rendered `value="quarter_to_date"` unconditionally, so
`?period=last_28_days` produced a headline about the last 28 days beside a
control that said "Quarter to date". Navigation dropped the period entirely.

`PeriodSwitcher` reads the URL, stays on the current surface, and every
navigation link carries the selection.

### Layout is measured, not assumed

- **Presentation DNA** clipped more than thirty section labels at 1366px. Steps
  are sized by how often a section was reached, so how much room one has is not
  knowable from the viewport — a container query on the step itself asks the
  only question that matters. Full names while they fit, three-letter codes when
  they do not, and never a truncation.
- **Unit Attention** ran under the detail plane and hid Shortlisted and Trend
  below 75rem. The table is now container-sized and becomes a labelled two-line
  row rather than losing two metrics.
- **The shell** jumped from a three-column desktop grid straight to a phone
  layout at 48rem, leaving 769–1200px unsupported and the document 36px wider
  than the viewport. There is an intentional small-desktop state now.
- **The Observer rail** covered the last rows of six surfaces. Clearance is
  reserved on the scrolling container, so surfaces not yet written get it too.
- **The orb** slid down the page when an answer expanded the column beside it,
  because the console centred its two columns. It is anchored.

### Failure keeps the evidence

A model that cannot be reached lost the reader their *figures*: a configuration
fault ended the request before a single tool had run. Every figure on the page
is computed by read models that never needed the network. The fault is recorded,
the status says the prose is not a model's, and the analysis still runs.

`insufficient_quota` was classified as a deployment misconfiguration. It is a
billing condition — the deployment is correct and the account is empty — and the
reader now gets one neutral sentence rather than an operator's diagnosis.

### "Why" is a different question from "what"

Observer answered `Explain why Compare mode fell` with three descriptive
figures, one of them stated twice in different words, and never said that the
evidence cannot establish a cause.

`findAnswerDefects` now rejects an answer to a causal question that neither
declines the causal step nor makes one, and rejects two findings that state the
same measurement. The system prompt gives the four moves a "why" answer must
make, ending in the specific next comparison that would narrow it.

## What this milestone added to the test suite

Geometry, roles and scope — the three things axe cannot see:

- `packages/synthetic/test/isolation.test.ts` — 13 tests
- `e2e/authorization.spec.ts` — 17 tests
- `e2e/layout-integrity.spec.ts` — 23 tests at seven viewports
- `packages/contracts/test/causality.test.ts` — 13 tests
- `packages/ui/test/collisions.test.ts` — rewritten around ownership

## Known limitations

- **The OpenAI account has no quota.** Every model call fails, so Observer
  answers from its own composition. The evidence, the tools and the refusal
  wording are all exercised; the model's prose is not.
- **The rate limiter is per-instance.** Stated in ADR-0026 and unchanged.
- **The pre-meeting brief** has been reconciled with the plane language at the
  container level rather than rebuilt. Its internal structure still differs from
  the analytical surfaces.
