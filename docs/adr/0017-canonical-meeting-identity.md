# ADR-0017 — Observer owns the canonical meeting identifier

**Status:** accepted · 2026-08-24

## Context

A meeting can be created by a CRM booking, by WEBIRIS, or by the showroom when somebody walks in.
Each system has its own identifier. If any one of them were the canonical key, the other paths would
need a fabricated one, and a walk-in — a perfectly ordinary event — would have no identity at all
until a CRM record appeared, if it ever did.

## Decision

**Observer mints and owns `meeting_id`.** WEBIRIS and CRM booking identifiers are stored as
`SourceReference` records against it, never as the key.

Where a CRM integration exists, the CRM owns the **business status** of the appointment — scheduled,
rescheduled, cancelled, attended per their records. It does not own Observer's cross-system
identifier.

A booking and the showroom session that follows it resolve to the same `meeting_id`: whichever system
creates the record first, the other binds to it. `MeetingOrigin` records which way round it happened,
and a walk-in is a first-class origin rather than an error state.

## Consequences

- A walk-in has a full identity from the moment it starts, and can be joined to a contact later
  without reprocessing, because the meeting always had its own key.
- Two CRM records pointing at one meeting is representable; so is a meeting with none.
- Binding a showroom session to an existing booking is a real product step that needs a real
  interface, and a mis-binding needs to be correctable. That work belongs to the showroom milestone.
