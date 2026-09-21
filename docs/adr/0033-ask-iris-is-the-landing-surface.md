# ADR-0033 — Ask IRIS is the landing surface, and the navigation changes with it

**Status:** accepted · **Date:** 2026-09-03
**Supersedes in part:** ADR-0019 (role-aware default home screens), doctrine §7

## Context

The user designed a new front for the product in Claude Design and approved it
as the visual language for the whole site. The artefact is
`bf2bb7b8-f80c-4261-a172-f45cc881a52e`, "AI IRIS_OBSERVER PAGE".

It is not a restyling of an existing screen. It is a conversational landing
surface — one prompt, five suggested questions — with a four-item primary
navigation that differs from the approved one.

## Decision

**The primary navigation becomes: Ask IRIS · Sales Flow · Project · Sales
Agents.**

Two of the four are genuine changes rather than renames.

`Overview` becomes `Ask IRIS`. The executive briefing was the landing surface;
now a question is. The briefing's content is not deleted — it is what Ask IRIS
answers with, and it remains reachable — but the first thing a reader meets is
a prompt rather than a summary.

`People` becomes `Sales Agents`. This is narrower by name: `People` covered
agents and contacts, and the new label claims only the first. Where contacts
live is not settled by this decision.

**The visual language is adopted; the analytical surfaces are not replaced.**
The user's instruction was that this design should be on the whole site. That
was read as the shell, the palette, the typography scale and the landing
surface — not as a deletion of Showroom, Presentation Intelligence, Unit
Attention, Storytelling and Meeting Replay, which are the product.

## What was deliberately not adopted, and why

**The typeface.** The artefact ships `Anthropic Sans` and `Inter`. Anthropic
Sans is another company's corporate face and arrives only because it is the
design tool's default; Inter is the doctrine's own named example of a generic
choice. Manrope is brand-locked by ADR-0020, self-hosted, and carries the
tabular figures every number in this product depends on. The design's
typographic SCALE is adopted; its font is not.

**The accent.** The artefact uses `#2f97ff`; the brand is `#00a3ff`. The
difference is small and the brand is not ours to move. The artefact's
atmosphere — its indigo grounds and washes — is adopted exactly, so the brand
accent sits on the ground the design intended.

**The canvas grid.** The artefact draws a faint animated grid behind the page.
The doctrine allows motion that communicates and forbids motion that decorates,
and a permanently running texture communicates nothing.

**The logo as a raster.** The artefact ships the wordmark as a 5963×1351 PNG
(180KB) for an element drawn 21px tall, and "by MADSPACE" as a second 94KB PNG
at 7px. The wordmark exists as a 1.2KB vector and is used instead; the sub-brand
is letterspaced type, which reproduces it exactly and can be read aloud.

## Consequences

**Two open questions this decision does not settle**, and neither can be
guessed at from the artefact because the artefact shows one page:

1. **Where the project switcher and the period switcher live.** Every
   analytical surface depends on both — a chart without a period is a chart of
   nothing in particular — and the design shows neither.
2. **Where contacts go**, now that `People` has become `Sales Agents`.

**The rollout is staged, per `docs/12-visual-autopsy.md` §5.** The flagship is
built in isolation at `/iris/[tenantSlug]/[projectSlug]` so the design can be
judged against the real read model without disturbing twelve working surfaces.
Moving it onto the application routes and retiring the old chrome is a separate,
reviewable commit that answers the two questions above first.

**The Ask IRIS surface cannot answer yet, and says so.**
`docs/PROJECT-STATE.md` records that no model-backed answer has ever been
produced: the configured key is refused, and ADR-0030 requires each account to
bring its own connection, of which none exists. The send control is disabled and
one line explains why. A prompt that looked ready to answer would be the screen
telling its first lie, and this surface's whole value is that it does not.

**A new CSS namespace, `irs-`.** `iris.css` already owns `.iris-ask`,
`.iris-brand`, `.iris-nav` and `.iris-suggestion`. Reusing them inherited a
`999px` radius and drew a disc behind the page; scoping under a root fixed only
the properties the new sheet happened to declare. A separate namespace is the
only thing that actually isolates. When the older layer retires, `irs-` can take
the `iris-` prefix back.
