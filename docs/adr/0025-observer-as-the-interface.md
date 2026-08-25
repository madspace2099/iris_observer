# ADR-0025 — Observer is the interface, not a panel on it

**Status:** accepted
**Date:** 2026-08-25
**Supersedes in part:** the Ask rail introduced under ADR-0024

## Context

The product had become an analytics dashboard with a chat field at the bottom
of it. Everything the intelligence layer could do was real — typed read-only
tools, a controlled loop, evidence on every claim (ADR-0024) — and none of it
was where the reader would find it. The prompt was a 38px pill floating over the
foot of the page, which is where a site search box lives. That placement is a
claim about priority, and it was the wrong claim.

## Decision

**Observer is the primary interface.** The opening surface is a briefing: an
embodied presence, a greeting, one sentence about what was found, a prominent
prompt, and three or four context-aware offers. The analytical figures follow
it as the evidence for the sentence rather than competing with it.

**Observer has a body.** A canvas-drawn orb — a translucent field, orbiting
filaments, a radially displaced waveform and an abstract synthetic iris with an
aperture that opens and closes. It is not decoration: its state is the
application's state, and it is a control that focuses the prompt.

Canvas 2D rather than WebGL. At this size the cost is a few hundred arcs a
frame, and the fallback is one frame; a shader would need a context-loss path, a
compile-failure path and a software-rendering path to say the same thing. No
video, no sprite sheet, no animation library, no runtime network asset.

**The state mapping is a contract, not a look.** `packages/…/orb/profile.ts`
holds one profile per state and is asserted by the unit suite: every state is
distinguishable, every state has a sentence a screen reader can use, `thinking`
turns inward, `insight` opens up, `unavailable` desaturates rather than turning
red, and `listening` says the microphone is on.

**Observer speaks in the first person and never claims to feel anything.** The
same voice with or without a model key — a product whose assistant changes
person depending on an environment variable is two products. Observer states the
read models' sentences; it never writes a figure.

**No voice control is shown.** Voice is not implemented, so there is no
microphone button. A decorative microphone that does nothing is worse than none.

## What was removed from the interface

Product-boundary explanations: "Observer does not report on the commercial
process itself — the CRM owns that", "Observer does not produce one", "Shown to
segment the presentations above". These describe the architecture to the reader,
who did not ask. The interface now states the finding.

Kept, because they are honesty rather than explanation: evidence tiers, sample
sizes, source provenance, data-completeness, the synthetic-data badge, the
measured-versus-interpreted labels on every answer, and the privacy guarantee
that family status is never inferred from where attention went.

## Consequences

- The opening screen is no longer titled "Showroom". It is the **Briefing**.
- The collapsed rail carries Observer on every other surface and reads the
  analytical context off the URL, so a question about the agent or unit already
  on screen does not have to name it.
- One Observer per screen: the rail hides on the briefing, where the console is.
- `prefers-reduced-motion` renders one frame per state. State is still carried
  by colour, luminance and aperture, and by the words beside the orb.

## Costs accepted

- A canvas that runs an animation frame loop while the briefing is open. It is
  cancelled on unmount and does not run under reduced motion.
- Three CSS class collisions were found while building this (`.obs-briefing`,
  `.obs-evidence`, and earlier `.iris-stack`). A guard in
  `packages/ui/test/collisions.test.ts` now fails the build on a fourth.
