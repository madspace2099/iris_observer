# ADR-0016 — Meaningful dwell is derived at query time, never at ingestion

**Status:** accepted · 2026-08-24

## Context

"Did the buyer actually look at this unit, or scroll past it?" needs a threshold. The tempting
implementation is to apply it where the data arrives and store a boolean.

That is precisely the mistake the legacy module made with its pre-aggregated counters: a decision
taken at write time cannot be revised, and the raw material to revise it is gone. A threshold is a
product judgement, and product judgements are wrong at first.

## Decision

**Raw active duration is always retained.** Meaningful dwell is a derived, versioned policy applied
when a metric is computed.

Initial thresholds, as product settings rather than truths:

| Channel  | Threshold         |
| -------- | ----------------- |
| WEBIRIS  | 10 active seconds |
| Showroom | 15 active seconds |

They differ because the behaviour differs. Online the buyer scrolls alone and dismisses quickly; in
the showroom an agent is talking over the screen, so a unit stays up longer before it means anything.

Excluded from active time at the source: hidden browser tabs, backgrounded application time, idle
time with no interaction, and time after another unit became the active one.

The measurement method travels with the fact. Where a source could only report ungated wall-clock
time, the threshold is **not** applied and the figure is reported separately — twelve seconds of
elapsed wall clock is not twelve seconds of attention, and thresholding it would launder a weak
measurement into a strong-looking one.

## Consequences

- Both raw views and meaningful views are shown. A large gap between them is itself a signal.
- A revised threshold re-applies to all history, immediately.
- Reports state which dwell policy version produced them.
- Adapters must be honest about `measurementMethod`. Claiming `active_foreground` for a wall-clock
  measurement would defeat the whole arrangement, so it belongs in the adapter review checklist.
