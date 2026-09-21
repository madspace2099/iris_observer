# ADR-0035 — The composer's perimeter glow is a WebGL shader

**Status:** accepted
**Date:** 2026-09-04
**Narrows:** ADR-0025's "Canvas 2D rather than WebGL", which is hereby scoped to
the orb and does not govern the Ask composer

## Context

The Ask composer and the docked prompt bar were delivered with a travelling
light around their perimeter. The delivered artefact draws it in a fragment
shader; an HTML export does not carry a shader intact, so the first two attempts
reconstructed it from the geometry.

Both were rejected on sight, in the same words: _"a Travelling effektus
ugyanolyan rossz mint volt"_. The second attempt fixed everything the first got
wrong — additive compositing via `mix-blend-mode: plus-lighter`, an unclipped
bloom behind the card, the head and its halo on a shared `offset-path` — and
still read as a dim speck dragging a smudge.

The reason is not effort, and this is the part worth recording, because it is
the general lesson and not a fact about one card:

**The shader tone-maps an accumulated field.** It sums four bloom scales — 1.6px,
6px, 16px and 38px of falloff — and only then applies `I = 1 - exp(-1.35 * I)`.
The soft knee runs on the SUM. That single step is what drives the head to white
while leaving its tail blue, and it is what makes the light read as light.

CSS composites pairwise: layer onto layer, in order. There is no point in the
pipeline at which the total exists as a value, so there is nothing to apply a
knee to. `plus-lighter` over four gradients reproduces the geometry exactly and
loses the physics entirely — which is precisely how it looked.

`perimT` is the second thing that does not survive translation. It converts a
pixel to its normalised arc-length position along the _actual rounded_ outline,
measuring straight runs and corner arcs separately, so the head holds one speed
through the corners. `offset-path: padding-box` approximates it. `atan2` — the
obvious substitute — does not attempt it, and produces a rectangular gradient
being rotated, which is a different effect that happens to also move.

Two independent, competent CSS reconstructions failing the same way is the
evidence that this is not a CSS effect that was built badly. It is not a CSS
effect.

## Decision

**Port the delivered `handoff/prompt-glow.js` rather than reimplement it.** One
transparent WebGL1 canvas per composer, overhanging the card by 130px on every
side, `pointer-events: none`, inserted behind the card in the same
`position: relative` wrapper. Additive blending, premultiplied alpha, DPR clamped
to 1.75. `apps/web/src/components/ask-iris/prompt-glow.ts` is that file moved to
TypeScript; **every constant in the fragment shader is the reference's, and none
is tuned**. Anyone changing one is changing the delivered design.

**ADR-0025's WebGL prohibition is narrowed to the orb, not lifted.** Its stated
reason was that a shader "would need a context-loss path, a compile-failure path
and a software-rendering path to say the same thing" — a fair price for an orb
that Canvas 2D draws just as well, and a cheap one here, where Canvas 2D cannot
draw this at all. All three paths exist and converge on one line: if the context
is refused or the program fails to build, the canvas is removed from the DOM.
`ask-iris.css` keys the still CSS halo on the canvas being ABSENT, so removing it
restores the halo. There is no flag, no state and no second code path — the
presence of the canvas _is_ the condition, which is also why it is the
pre-hydration paint.

**The animation never reaches React.** The canvas is created imperatively and
`uTime` is a uniform, so a frame costs one `gl.uniform1f` and one draw call —
zero renders, zero reconciliation. The loop stops when
`document.visibilityState !== "visible"`, and the context is explicitly
surrendered via `WEBGL_lose_context` on unmount, because browsers cap live
contexts near 16 and silently drop the oldest.

**Reduced motion freezes rather than removes.** `uMotion = 0`, `uTime` pinned at
2.1, one frame drawn, no loop started — and the media query is _observed_, so
changing the setting mid-session takes effect without a reload. 2.1 rather than 0
deliberately: at 0 the breath sits at its floor and the head lands on top of an
anchor, making the one still frame both the dimmest and the least legible of the
lap.

## Consequences

The effect now matches the delivered design, which two CSS reconstructions did
not. The cost is a WebGL context per mounted composer — at most two, since the
dock is hidden by `display: none` on Ask IRIS — and a render loop while the tab
is visible.

The glow is additive light spreading up to 130px beyond the card, so on the
docked bar it lays a faint wash over the page content immediately above it. This
is the reference's own geometry and the brief forbids changing the card, so it
stands; the wash is far below the `far` term's half-power distance and does not
approach the contrast floor ADR-0034 sets for text.

`e2e/ask-iris-compare.spec.ts` tests it by reading the framebuffer — the only
honest method left, since there is no longer a computed style that means
anything. Six tests: the head moves on both composers, a lap takes 6.45s
(measured by return, not by speed), the peak is white-hot rather than a smudge,
reduced motion freezes it while leaving it lit, the still halo hands over exactly
once and comes back when the canvas is taken away, and a filmstrip of the lap.

The white-hot assertion is the one that matters most. Both rejected versions
would have passed "it moves"; neither would have passed this.
