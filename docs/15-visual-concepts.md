# Visual concepts — two Executive Overviews

**Status:** awaiting selection · **Built:** design laboratory, isolated from production
**Routes:** `/lab/sign-in`, `/lab/overview-a`, `/lab/overview-b`
**Reviewed at:** 1920×1080 and 1440×900, in repose and mid-interaction

Two concepts, one design language (`docs/14-design-system.md`), one data source. They differ in a
single decision: **what the reader looks at first.** Everything else is held constant so the choice is
about that decision and not about polish.

Both read through the same `ObserverRepository` port as production. No figure on either screen was
written for the picture.

---

## 1. Concept A — narrative-first

**The verdict is the largest thing on the screen, and it is a sentence.**

The left field opens with the finding in 44px type — _"Northgate sold 7 units this quarter against 9
in the last — 22% slower, and the loss is entirely between viewing and offer"_ — then the four
figures it rests on, then three claims each tagged with its evidence tier and record count, then two
actions. Project Pulse sits in the right field at compact size, as the supporting instrument.

**Reads well when** the reader wants to be told what happened. A developer opening Observer on Monday
morning gets the answer before they have decided what to look at.

**Costs:** the building is a 200px-tall strip. You can see _that_ attention is concentrated on the
lower-middle floors; you cannot read the plan. Selecting a unit works, but the spatial field is not
where your eye starts, so most readers will never select anything.

---

## 2. Concept B — spatial-first

**The building is the screen.**

The stacking plan fills the left field at full height: 48 real units, width proportional to floor
area, fill luminance proportional to meaningful views, outline carrying availability, a top accent bar
only where something changed in the period. The verdict and its evidence move to the right field.
Selecting any cell rewrites the entire right column — verdict, unit facts, evidence, and the Ask
Observer context chip.

**Reads well when** the reader wants to interrogate rather than be briefed. The pattern the verdict
describes in words is visible as a shape: floors 3 to 6 glow, floors 7 and 8 do not, floor 2 is sold
out. An agency manager can find the cold corner of the building in two seconds.

**Costs:** the ten-second test is weaker. The verdict is on the right at 30px, not the left at 44px,
and a reader who does not interact leaves with an impression rather than a finding.

---

## 3. What is identical in both

- **Project Pulse** — same read model, same encodings, same interaction. Only the size differs.
- **Ask Observer** — persistent bottom rail, `⌘K` or `/` to focus, context chips showing project,
  period and any selection. Answers open on the evidence field with the sentence, the figures, the
  evidence row, a caveat where one applies, an action, and follow-ups derived from the selection.
- **The period scrubber** — a tick instrument, not a dropdown.
- **Segment chips** — carrying each segment's attention index, so a chip states its own finding.
- **Honesty** — evidence tier on every claim, `counts unavailable` rather than a zero, `not
applicable` rather than a blank, and a stated caveat when a signal has expired.

---

## 4. Defects found by looking, and fixed

Recorded because `docs/12-visual-autopsy.md` concluded that the previous failure was a _process_
failure: the gates were green and nobody looked. These were all found by opening the images.

| Defect                                                                               | Fix                                                                          |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| The building drew at 400px inside a 1300px field — the spatial concept's whole point | cell width became flex-grow; the plane became a flex column that it fills    |
| The attention ramp was three indistinguishable shades                                | square-root curve, ceiling at 58% accent, legend drawn on the same curve     |
| First correction overshot into a wall of saturated blue                              | ceiling pulled back from 88% to 58%                                          |
| Delta and qualifier ran together as `-22% of 34 remaining`                           | qualifier moved onto its own line, inside the `<dd>`                         |
| The answer sheet covered the command rail at 1440                                    | sheet width tied to the evidence field; the rail steps aside when it opens   |
| The profile picker's blurb collided with the card scrim                              | the scrim belongs to the image, not to the card                              |
| Two profile cards stretched to half the screen each                                  | a fixed four-column row — the row is the composition                         |
| Monogram hues came out maroon and olive                                              | hue constrained to a 60° band around the accent                              |
| `⌘K` badge at 4.03:1 against the rail                                                | raised to secondary ink                                                      |
| The `<dl>` carried a third element per group                                         | delta moved inside the `<dd>`                                                |
| An invented fifth sales agent with invented meeting counts                           | the picker now reads the real viewer table; every figure on a card is a fact |

The last one matters most. A profile card with `Meetings 14 · This week 2` looked better than the
truth and was not the truth — precisely the failure mode this product exists to argue against.

---

## 5. Recommendation

**Concept B, with Concept A's verdict typography.**

The argument for B is that it is the only one of the two that could not be a generic dashboard. The
verdict sentence in A is excellent and should survive — but it is a _paragraph_, and a paragraph is
portable to any product. The stacking plan is not: it is the thing IRIS knows that a spreadsheet does
not, and putting it at the centre is what makes Observer look like it belongs to a company that
builds spatial software.

The cost of B — a weaker ten-second read — is fixable and A shows exactly how. The merge is: B's
composition, with the verdict set at A's scale in the evidence field and the supporting figures
directly beneath it.

Concept A is the safer choice and is not wrong. If the audience for the first demo is a developer who
will be shown the screen for thirty seconds and never touch it, A wins.

---

## 6. What was deliberately not built

- **A phone layout.** Both concepts are desktop compositions. A phone layout invented before the
  direction is chosen is work thrown away; the e2e specs skip mobile explicitly rather than silently.
- **The remaining three sections.** Sales Flow, Project and People are navigation only. The Overview
  is the argument.
- **The lower right field in Concept A.** Roughly a fifth of the frame at 1920 is unused. It is
  reserved for the "what changed this period" list, which is real data the Pulse read model already
  carries — but it belongs to whichever composition is chosen.
