# External references

No credentials, tokens or session information belong in this file.

## Design

| Reference                  | Location               | Notes                                                                                                                                                                                                  |
| -------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| MADSPACE brand identity UI | _(Figma link pending)_ | Page: **🖥️ Large Screens**. Needed at M5. A live Figma URL is preferred over a `.fig` export, because design variables and component structure can then be read directly through the Figma connection. |

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

| System                        | Question                                  | Blocks                                           |
| ----------------------------- | ----------------------------------------- | ------------------------------------------------ |
| REALPAD                       | Is there a usable API, and on what terms? | CRM connector, pipeline stages below Shortlisted |
| Interior walkthrough platform | Can it post a session summary back?       | interior dwell inside deep-dive metrics          |
