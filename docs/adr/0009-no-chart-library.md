# ADR-0009 — No chart library; hand-built SVG on d3-scale

**Status:** accepted · 2026-08-24

## Context

The product must not look like a generic admin template, and the brief rules out stock component
appearance explicitly. Chart libraries impose their own visual language, their own theming escape
hatches, and a large dependency for a small set of chart types.

## Decision

Charts are hand-built React SVG components in `@observer/ui`, using `d3-scale` and `d3-shape` for
mathematics only. No rendering library.

## Consequences

- Every chart uses the design tokens directly, so theming and per-developer branding work without
  fighting a library API.
- Accessibility and responsive behaviour are our responsibility, deliberately.
- The chart vocabulary stays small on purpose: the page pattern calls for one decisive chart per
  screen, not a gallery.
