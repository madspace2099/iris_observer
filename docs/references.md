# External references

No credentials, tokens or session information belong in this file.

## Design — MADSPACE brand identity

**Official reference:** [IRIS Observer — Large Screens](https://www.figma.com/design/X9a85nibp1YYMppGxQ8iVQ/IRIS-private?node-id=4-20)

|                   |                             |
| ----------------- | --------------------------- |
| File key          | `X9a85nibp1YYMppGxQ8iVQ`    |
| Primary page node | `4:20` — `🖥️ Large Screens` |

Other pages in the same file:

| Node   | Page             | Relevance                                                                                |
| ------ | ---------------- | ---------------------------------------------------------------------------------------- |
| `3:16` | Touch Screens    | The showroom's touch surface. Informs touch-target sizing and the agent's tablet layout. |
| `4:21` | Prototype        | Interaction and transition intent.                                                       |
| `4:25` | Local Components | The component inventory — the most direct source for Observer's own primitives.          |

> **Figma is the visual and component-language reference. It is not the product-requirements
> authority.** Where a screen in Figma implies a behaviour that contradicts `docs/01`–`docs/10`, the
> documents win and the discrepancy is raised. Design shows how Observer should look and feel; it does
> not decide what Observer measures, who may see it, or what a number means.

> **The `t=` parameter is deliberately absent.** The URL as shared carried a Figma session token. It
> is stripped here: session information must not enter the repository, and the link resolves without
> it for anyone who already has access to the file.

**Access verified 2026-08-24** through the Figma connection. Design variables and component structure
are read directly from the live file rather than from an exported `.fig`, so this reference stays
current as the design evolves.

### What the file contains

57 top-level nodes on the page: 1920×1080 showroom screens plus component sections.

- **Screens** — Welcome, Home (menu expanded, several states), Units Flow, Filters and unit types,
  Amenities · Surroundings · Sustainability, Share Favorite List, Customers, Customer Sheet,
  Settings · Help & Guide.
- **Components and states** — toolbar screens and states, sidebar item states, share modal (default,
  images attached, multiple email entries), button states, exit feedback, popup examples.

### What this means for M2 (design tokens)

**This is the Showroom IRIS interface, not an Observer dashboard design.** No Observer screen is drawn
here, and none should be expected — Observer is a different product, for a different audience, on
different hardware.

The relationship is therefore _derivation, not reuse_: Observer takes the brand's typography, colour
and component language so the two products read as one family, then applies them to a dense,
responsive analytical interface rather than to a 1920×1080 presentation surface.

Confirmed so far, to be extended during M2 token extraction:

| Token        | Value                                                                                |
| ------------ | ------------------------------------------------------------------------------------ |
| Typeface     | Manrope                                                                              |
| Type scale   | `Subheading/X Small` 12/16, `Label/Small` 14/20, `Label/Medium` 16/24 — all SemiBold |
| Accent       | `#00a3ff`                                                                            |
| Also present | an orange gradient, not yet resolved to a value                                      |

Variable coverage in the file is partial, so M2 must derive a fuller token set — a neutral ramp,
semantic status colours for verdicts, and a data-visualisation palette — anchored on the typeface and
accent above. The `Customers` and `Customer Sheet` screens are worth studying: they overlap with
Observer's contact model and should not contradict it.

## Product input

| Reference                                                | Location                                                                                                                                             |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Observer Analytics consultation with Stano Bajaník, 2026 | Held outside the repository. Its conclusions are recorded in `docs/01-foundation.md` and `docs/02-views.md`; the transcript itself is not committed. |
| Showroom IRIS sales-agent UX flow                        | Recorded in `docs/03-event-map.md` §2.                                                                                                               |

## Legacy system, for reference only

| Reference                     | Location                       | Notes                                                                                                                               |
| ----------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `InsightAnalytics` UE5 module | Held outside the repository    | The superseded measurement implementation. Read-only reference; not committed.                                                      |
| Legacy analytics dashboard    | Public GitHub Pages deployment | Functional reference only. Its data layer is superseded, and its authentication gate was found to be non-functional — see ADR-0005. |

## Integrations to verify

| System                        | Question                                                             | Blocks                                           |
| ----------------------------- | -------------------------------------------------------------------- | ------------------------------------------------ |
| REALPAD                       | Is there a usable API, and on what terms?                            | CRM connector, pipeline stages below Shortlisted |
| WEBIRIS                       | Is there a stable visitor identifier, and with what cookie lifetime? | deterministic same-device back-linking           |
| Booking flow                  | Does it live in WEBIRIS, in the CRM, or both?                        | which system mints `meeting_id`                  |
| Interior walkthrough platform | Can it post a session summary back?                                  | interior dwell inside deep-dive metrics          |
