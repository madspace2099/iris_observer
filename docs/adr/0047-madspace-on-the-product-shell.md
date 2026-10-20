# ADR-0047 — MADSPACE on the product's shell: projects home, client diagnostics, companies first

**Status:** accepted · **Date:** 2026-10-20
**Amends:** ADR-0037 (the graphite MADSPACE surface: its chrome is now the product's),
`docs/20-madspace-admin-design-system.md` (the shell and the plane), the Directory of
`docs/21-self-served-projects.md`
**Keeps:** ADR-0044 (the onboarding wizard, untouched), ADR-0043 (company roles), ADR-0042 (dark on
screen, paper in print), doctrine §7 (MADSPACE is a separate surface, never a nav item inside a
client's project)

## Context

The owner looked at `/madspace` while recording the demo and compared it with a project page. His
words, verbatim, each followed by a translation (they override the documents where the two
disagree, per the doctrine's source hierarchy):

> "ennek a http://localhost:3400/madspace weboldalnak a UI dizájnja teljesen eltér a
> http://localhost:3400/shark/shark-residence/project?period=year_to_date -tól. Pl. fejléc/logó bal
> oldalon nincs. Nem igazán hasonlít! Ezt javítani kell!"
>
> The UI design of /madspace is completely different from the project page. E.g. there is no
> header/logo on the left. It does not really resemble it. This must be fixed.

> "Itt kellene látnom mint MADSPACE admin az összes projektet: http://localhost:3400/madspace"
>
> "http://localhost:3400/madspace/projects - értelemszerűen itt is látnom kellene tehát az előző két
> oldalt össze lehetne rakni egy oldalba!"
>
> As a MADSPACE admin I should see all projects here. On /madspace/projects obviously too, so the
> two pages could be put together into one.

> "http://localhost:3400/madspace/diagnostics - itt a klienseink projetjeit tudnánk diagnosztizálni
> pl. látnánk az összes CLARITY kliens projektet itt mint pl. amilyen a Shark Residence is és ott
> pedig hasznos diagnosztizálható infókat tudnánk meglátni a projektről. Pl. hány agentjük
> használja, stb."
>
> Here we could diagnose our clients' projects: we would see every CLARITY client project, such as
> Shark Residence, and useful diagnosable information about it, e.g. how many of their agents use
> it.

> "http://localhost:3400/madspace/directory - ez azért nem jó logikailag mert először itt a
> cégeknek (Tenants) kellene lenniük. Majd mindegyik company lenyitható lehetne amin belül
> megtalálhatóak az adott company-hoz tartozó emberek. Nem értem miért kellett külön választani a
> Tenants és az Agencies-t. Ezt az oldalt logikailag újra kellen gondolni."
>
> Logically wrong, because first there should be the companies (Tenants). Then each company could be
> expandable, with the people belonging to it inside. I don't understand why Tenants and Agencies
> had to be separated. This page has to be rethought.

Before this, `/madspace` had its own header (a MADSPACE wordmark, an account band, a second
navigation row), an Administration landing with a heading and one button, a Projects list of the
control plane only, a Diagnostics screen of installation health only, and a Directory of three
tables: Tenants, Agencies, People.

## Decision

1. **One shell.** `/madspace` stands on `irs-shell ox-root ox-graphite`, the ground, atmosphere and
   type scale of every project page. `MadspaceHeader` draws the product header from the product's
   own classes and wordmark (`Brand` and `MenuMark`, exported from `Shell.tsx`; nothing forked): the
   IRIS by MADSPACE mark on the left, Projects · Diagnostics · Directory centred, the operator and
   "MADSPACE administrator" with Back to Observer and Sign out on the right, and below 1200px the
   product's menu sheet. Which control plane answers is a quiet chip in the header, not a second
   row. `OpsNav` and the old chrome rules are deleted. A MADSPACE plane takes the product's dark
   card (black, an 8% hairline, 24px inside) without its elevation; the title takes `.ox-title`'s
   scale.
2. **`/madspace` is the projects home**, and `/madspace/projects` redirects to it. Every project
   MADSPACE can see, the demonstration world and the control plane joined in
   `lib/madspace/portfolio.ts`, grouped by company. A control-plane project that is the twin of an
   Observer project lends that row its Sources, Integrations and Customer dashboard pages; one
   Observer does not hold yet is listed under its developer as "Needs setup: no developer or address
   yet" with Finish setup. Each row: address, status in words (Live data · Demonstration data ·
   Needs setup, saying which), each feed's last-seen age, the roster, meetings in the last 28 days
   and the quarter to date with the period named, Open in Observer and Diagnostics. New project opens
   the onboarding wizard.
3. **A read model for diagnosis.** `ProjectDiagnostics` (`packages/readmodels/src/diagnostics.ts`),
   built in `packages/synthetic/src/diagnostics.ts` behind `getProjectDiagnostics` on the port,
   `madspace_admin` only. Both windows are sliced the way `slices()` slices a period, on the clock
   the project runs on, so a figure here is the figure its own screens count. Per window: presenters,
   of the roster who presented, those not on it, outcomes recorded, meetings without timing and
   through WEB IRIS, catalogue units opened; overall: meetings to date, legacy imports, the last
   meeting, each feed's age and a stale flag (more than 24 hours before the project's today), the
   CRM's deal count, the catalogue's units. Absent stays `null`.
4. **Diagnostics opens on client projects.** One row per client project in Observer, then the
   installation health that was there before, unchanged. Each row opens
   `/madspace/diagnostics/[tenantSlug]/[projectSlug]`: the same lines with what each was counted
   from, and the control plane's installations with their activation and heartbeat state, with Open
   in Observer, Sources and Onboard a source. Presenters are counted and never named, so nothing
   ranks a client's people.
5. **The Directory is companies first.** One list (`lib/madspace/companies.ts`): developers (the
   demonstration's and the control plane's), sales agencies and MADSPACE, each with its kind in a
   word, each a native `<details>` holding its people (role, company role, address, projects held),
   a developer's projects linked into Observer, an agency's clients. One sentence on the page says
   why a sales agency is a company of its own (it sells for developers and is granted one project at
   a time, `docs/01-foundation.md` §1). Registering a developer moves behind Add company. A tenant
   named after MADSPACE (the integration sandbox) is listed under MADSPACE, not as a developer.

## Consequences

- The routes are the same plus one: `/madspace/diagnostics/[tenantSlug]/[projectSlug]`, in
  `SURFACES` and `reference-parity.test.ts`. Old links to `/madspace/projects` land on the home.
- The home and Diagnostics build a diagnosis per project, two windows each, through the repository:
  six demonstration projects cost twelve slices per request, which the synthetic world answers in
  well under a second. A portfolio of hundreds will want a summary read instead.
- The e2e acceptance and screenshot specs select a row by its article and its Sources or
  Integrations link instead of "Open project".
- `madspace-design-system.test.ts` still holds: no dash in front of a reader, no hand-drawn mark in
  the MADSPACE files (the mark and the menu icon come from `Shell.tsx`), the 12px floor, no shadow
  on a plane.
