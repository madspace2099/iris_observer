# ADR-0020 — Manrope is self-hosted

**Status:** accepted · 2026-08-24

## Context

The first build loaded Manrope from Google Fonts. Two problems, one visible and one not.

The visible one: in an environment without outbound access to that host, the stylesheet never
resolved, the page blocked on `load`, and the interface rendered in the system fallback. Reviewing
visual fidelity in Segoe UI is reviewing a different design from the one that ships.

The other: a first paint that waits on a third party depends on their uptime and hands them a request
log of everyone using the product.

## Decision

Self-hosted from `@fontsource-variable/manrope` — a pinned package, so the woff2 files and the licence
are reproducible from the lockfile and travel with the repository. `font-display: swap` comes from the
package.

A metric-adjusted `"Manrope Fallback"` face stands in while the woff2 arrives, with overridden ascent,
descent and width, so the swap changes the letterforms without moving the layout. Metric cards also
carry a `min-height`, so a grid of figures cannot reflow under the reader mid-render.

Three automated checks: a Manrope face reports as loaded, the computed family on `body` is Manrope,
and no request reaches a third-party font host.

## Consequences

- The interface a reviewer sees is the interface that ships.
- Approving visual fidelity while the fallback is rendering is now impossible to do by accident.
- The bundle carries the font. At variable-woff2 sizes this is a fair trade for removing an external
  dependency from the critical path.
