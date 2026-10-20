# ADR-0048 — The verdict is said by IRIS

**Status:** accepted · **Date:** 2026-10-20
**Decided by:** the product owner, directly, while recording the Shark Residence demo
**Extends:** the welcome sequence's instrument (`ask-iris.css` §12), ADR-0035 (Ask IRIS's own
identity), ADR-0042 (dark on screen, paper in print)
**Numbered 0048** because 0045 is taken and 0046–0047 were held for parallel streams.

## Context

Sales Flow, Sales Agents and Project open on a verdict: one sentence, composed by the read model,
that answers "is this going well, and against what". It was an `<h1 className="iris-section">` at
20px under an 11px kicker, the same weight as a section heading. On 2026-10-20 the owner, on
`/shark/shark-residence/flow?period=year_to_date&window=all`, wrote (translated from Hungarian):

> The text "Meetings are holding up and progressing well: 66 meetings this month against 65 last
> month, first 24 days, and 54% of recorded meetings progressed, against 53% before." is very
> inconspicuous, my attention almost slides over it — yet this should be the main message! It must
> get a more serious appearance, e.g. it should appear on the screen with a "type" animation, and
> next to it there should be an AI-based motion icon, as if JARVIS were saying it.

## Decision

1. **One component, `SpokenVerdict`** (`apps/web/src/components/iris/SpokenVerdict.tsx`), replaces
   the `<h1>` on the three pages. It is still the page's only `<h1>`, now the headline in earnest:
   Manrope 600, `clamp(1.5rem, 0.95rem + 1.75vw, 2.25rem)`, leading 1.18, balanced, at most 42ch,
   tabular figures.
2. **The sentence types itself in, from HTML the server wrote.** A server component: every
   character is a span in the first byte of HTML, laid out from the first paint at opacity 0 and
   shown at its own `animation-delay` — 20ms a character, the whole sentence inside 2.4s however
   long it is. Nothing below moves, and there is no client script to hydrate. Each character's
   `::after` is the caret for exactly its own step, and the last blinks three times and fades. A
   character is shown whole as its step begins, not faded in: the caret takes its character's
   opacity, and an 80ms fade drew it at a fifth of its strength while the sentence typed.
   The block is keyed on the period (and on Sales Flow the summary window) and the sentence, so a
   change remounts it and IRIS says it again.
3. **One accessible name, once.** The heading is named by `aria-label`; its characters are
   `aria-hidden`, so a screen reader hears the sentence, not its letters. The characters are the
   only text in the `<h1>`, so the text the e2e specs read is the sentence exactly once.
4. **The mark is the welcome's instrument at 56px** (44px on a phone), so it reads as the same family as Ask IRIS: a
   hairline ring, a tick ring, a blue inner ring, one arc of `#00A3FF` on graphite. While the
   sentence types the arc turns, a ring pings outward and five level bars swing like a voice; then
   the bars fade, the arc rests dimmed where it stopped, and one ring breathes slowly round a blue
   core. SVG and CSS, transform and opacity only, `aria-hidden`. No purple, no sparkle, no generic
   "AI" glyph. On a phone the mark stands above the sentence, beside its label.
5. **Honest about who is speaking.** The sentence is Observer's read model, not a language model,
   so the label beside the mark says, for example, **"IRIS · read from 131 meetings"** — the
   product's name and the meetings the sentence was read from, passed in by the page from the view
   and formatted in the project's locale. On Sales Flow that is `SalesFlowView.verdictMeetings`:
   both sides of the comparison the sentence states, so "66 meetings this month against 65 last
   month" is read from 131, not from the period's `meetingCount`, a figure that sentence never
   uses. On Sales Agents and Project the verdict is built from the period's meetings, so it is
   `meetingCount`. With no meeting the label is "IRIS" alone, never "read from 0 meetings". It
   comes first in the DOM, as it is painted above the sentence. It never says "AI", "GPT" or a
   model's name. "Meetings", not "recorded meetings": in the verdict "recorded meetings" is the set
   with an outcome recorded, and the label must not read as that rate's denominator.
6. **Reduced motion and print show the finished frame**: the whole sentence, no caret, the mark at
   rest. The e2e suite runs under reduced motion (`playwright.config.ts`), so its screenshots and
   axe scans read that frame.

## Consequences

- The verdict is the first thing read on each of the three pages, and it carries the sample it
  was read from beside it.
- The text of the heading and its accessible name are unchanged, so no e2e expectation moved. The
  reading-order check in `e2e/a11y-contract.spec.ts` counted only blocks with their own text, and
  the heading's letters are now `aria-hidden`; it counts a heading named by `aria-label` too, so
  the verdict stays in that check.
- `packages/synthetic/test/period-buckets.test.ts` holds Sales Flow's `verdictMeetings` to the
  two figures its sentence states, on a running and on a closed period.
- `apps/web/test/spoken-verdict.test.ts` holds the markup (the name once, the text once, every
  character server-written, the count as given, no model named) and the stylesheet (every rule
  that animates is switched off under reduced motion and in print).
- Not done: the agent detail page, the Overview and the Briefing keep their own verdict styles; the
  owner named Sales Flow, and the three pages that share its pattern follow it.
