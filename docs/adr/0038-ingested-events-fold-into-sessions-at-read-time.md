# ADR-0038 — Ingested UE5 events fold into showroom sessions at read time

**Status:** accepted · **Date:** 2026-09-17
**Extends:** ADR-0032 (the UE5 wire contract), ADR-0036 (a delivered source is authoritative for
what it delivers), ADR-0007 (no mock data layer)

## Context

By the third InsightAnalytics drop the showroom plugin activates, heartbeats and ingests against the
wire contract, and `observer.analytics_events` stores what it sends. Nothing read it back. The only
way a real session reached Sales Flow, Project or Sales Agents was the legacy Supabase connector
(`supabase_showroom`), which pulls a table the V2 plugin no longer writes. A showroom could be
correctly integrated and still be invisible in the product.

The only event read that existed, `observer_events_for_source`, is an operations view: newest first,
one source, a thousand rows, and without `agent_id`, `visitor_subject` or the entity. A session
cannot be rebuilt from it.

## Decision

1. **A new facade, `observer_events_for_project`.** Every session-scoped event of one project, all
   sources, ordered by session then sequence, with the identity the envelope carried. It excludes
   `diagnostic.%` (the contracts' `READ_MODEL_EXCLUSION_RULE`) and events with no session. The old
   facade is not widened: the local control plane re-applies every migration on every start, and
   `create or replace` cannot change a return type, so the original definition would fail on the
   second start.
2. **A pure fold, `foldUe5Sessions`** (`packages/connectors/src/ue5-events.ts`), from those rows to
   the `ShowroomSession` the legacy mapper already produces. Every surface downstream is reused
   unchanged. The fold accepts the names the shipped plugin sends and the aliases in
   `docs/03-event-map.md`, reads a property whether it arrived as a string or a number, and never
   estimates: a view with no `view.ended` has no dwell, a session nobody signed into is attributed to
   `agt_unattributed`, and `contactId` is always null.
3. **Read time, not ingest time.** `liveSessionSource` reads and folds behind its existing 30 second
   memo. A failed event read costs the V2 path only; a configured connector's sessions are still
   delivered, which is what keeps a database that has not yet applied the migration working.
4. **Both sources may answer.** Folded sessions and a connector's sessions are delivered together;
   on the same session id the showroom's own events win.

## Consequences

- A project twin with ingested events stops showing synthetic sessions, by ADR-0036's rule.
- The fold is capped at 50 000 events per project per read. Past that, sessions should be
  materialised at ingest; the fold is pure so that move does not change what a session means.
- Event names are matched literally until the registry (M8) exists. The plugin's names that differ
  from the event map (`unit.balcony_viewed`, `unit.floor_cut_viewed`, the three `environment.*`
  events) are accepted as aliases rather than rejected.
- Agent ids arriving from the plugin are its own GUIDs. No roster maps them to a person yet, so
  Sales Agents shows the id. Naming them is a directory decision, not a fold.
- The migration must be applied to the hosted database by the operator before hosted deployments
  see V2 sessions. Until then they behave exactly as before.
