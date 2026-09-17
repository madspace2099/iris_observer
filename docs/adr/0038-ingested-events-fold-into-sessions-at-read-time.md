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

1. **A new facade, `observer_events_for_project`.** The session-scoped events of one project, all
   sources, with the identity the envelope carried. It excludes `diagnostic.%` (the contracts'
   `READ_MODEL_EXCLUSION_RULE`) and events with no session. The old facade is not widened: the local
   control plane re-applies every migration on every start, and `create or replace` cannot change a
   return type, so the original definition would fail on the second start.
2. **It answers one page behind a keyset cursor, and the read pages.** PostgREST cuts a response at
   its `max-rows` (1000 on Supabase, lower if an operator says so) and says nothing, so a facade
   answering a whole project would work on PGlite and silently lose most of it on the hosted
   database, its newest meetings first. The facade never answers more than a thousand rows, ordered
   by `(ingested_at, source_id, event_id)`, and returns that tuple as one opaque `page_cursor` with
   microsecond precision. `readProjectEvents` hands the last cursor back verbatim and the facade
   compares strictly, so no row repeats and none is skipped. Three choices in that sentence were
   each a bug first:
   - **not a timestamp.** Every event of a batch carries the same `now()`, so `ingested_at` alone
     is not unique, and the port's instants are formatted to the millisecond while the column holds
     microseconds.
   - **not an offset.** Arrival order is what makes paging safe on an append-only store: a row
     ingested during the read lands after the cursor, never inside a page already taken.
   - **stop on an empty page, never a short one.** A server that cuts at 300 returns full pages of
     300, and a reader that stopped on a short page would call them the whole project.
     A read that runs out of pages says `complete: false`, and the caller logs that the project was
     read in part. The migration drops the function before creating it, because its first draft
     (applied nowhere shared) had no cursor column and `create or replace` cannot change a return
     type.
3. **A pure fold, `foldUe5Sessions`** (`packages/connectors/src/ue5-events.ts`), from those rows to
   the `ShowroomSession` the legacy mapper already produces. Every surface downstream is reused
   unchanged. The fold accepts the names the shipped plugin sends and the aliases in
   `docs/03-event-map.md`, reads a property whether it arrived as a string or a number, and never
   estimates: a view with no `view.ended` has no dwell, a session nobody signed into is attributed to
   `agt_unattributed`, and `contactId` is always null.
4. **Read time, not ingest time.** `liveSessionSource` reads and folds behind its existing 30 second
   memo. A failed event read costs the V2 path only; a configured connector's sessions are still
   delivered, which is what keeps a database that has not yet applied the migration working.
5. **Both sources may answer.** Folded sessions and a connector's sessions are delivered together;
   on the same session id the showroom's own events win.

## Consequences

- A project twin with ingested events stops showing synthetic sessions, by ADR-0036's rule.
- A read is fifty pages at most, so fifty thousand events per project. Past that, sessions should
  be materialised at ingest; the fold is pure so that move does not change what a session means.
- Event names are matched literally until the registry (M8) exists. The plugin's names that differ
  from the event map (`unit.balcony_viewed`, `unit.floor_cut_viewed`, the three `environment.*`
  events) are accepted as aliases rather than rejected.
- Agent ids arriving from the plugin are its own GUIDs. No roster maps them to a person yet, so
  Sales Agents shows the id. Naming them is a directory decision, not a fold.
- The migration must be applied to the hosted database by the operator before hosted deployments
  see V2 sessions. Until then they behave exactly as before.
