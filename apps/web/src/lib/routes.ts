import type { SurfaceDescriptor } from "@observer/readmodels";

/**
 * Surfaces, and who they are for.
 *
 * Declared as data so ADR-0018 is testable: no surface marked `buyer_facing`
 * may render an internal read model, and a test asserts it rather than a
 * reviewer remembering. Nothing in the application is buyer-facing yet, which
 * is itself worth asserting — the first one that appears must be added here
 * deliberately.
 */
export const SURFACES: readonly SurfaceDescriptor[] = [
  { route: "/sign-in", audience: "internal", requiresRole: [] },

  /*
   * The project selector, between the account and the workspace.
   *
   * Every signed-in role reaches it, because every account has to choose a
   * project before Observer has anything to show. What it lists is not a
   * function of the role but of the account grants, which is why the role list
   * here is every role rather than a subset.
   */
  {
    route: "/projects",
    audience: "internal",
    requiresRole: ["developer", "agency_manager", "sales_agent", "madspace_admin"],
  },

  /*
   * Account settings. Every signed-in role, because the thing being configured
   * is the reader's own OpenAI connection and every role asks questions.
   *
   * It is not a project surface and takes no tenant or project: a credential
   * belongs to the account and is used across every project that account may
   * open. Putting it under a project route would have been the first step
   * towards a per-project key, which is exactly the ownership model ADR-0030
   * rejects.
   */
  {
    route: "/settings/ai",
    audience: "internal",
    requiresRole: ["developer", "agency_manager", "sales_agent", "madspace_admin"],
  },

  /* --- Showroom Intelligence, the primary surfaces (ADR-0023) ------------- */

  {
    route: "/[tenantSlug]/[projectSlug]/showroom",
    audience: "internal",
    requiresRole: ["developer", "agency_manager", "sales_agent", "madspace_admin"],
  },
  /*
   * Sales Agents names colleagues beside one another, WITHIN ONE PROJECT.
   *
   * This surface was closed to sales agents on the reasoning that a comparison
   * naming colleagues is a performance ranking whoever reads it. That is now
   * reversed for the people actually working a project together: an agent
   * assigned to it sees every agent assigned to it, because the team's own
   * figures are what a meeting is prepared against. ADR-0029 records the
   * reversal and what it deliberately did not open.
   *
   * The boundary that did not move is the project. Two agents on the same
   * project see one another; an agent on one project sees nothing of another,
   * whether by this route, the read model, a tool call or Ask. And the IRIS
   * rating stays MADSPACE-only — it is feedback on the software, and it is not
   * part of what this opened.
   *
   * Enforced on the server by `requireSurface`, not by omitting a link — the
   * route was reachable by typing it.
   */
  {
    route: "/[tenantSlug]/[projectSlug]/agents",
    audience: "internal",
    requiresRole: ["developer", "agency_manager", "sales_agent", "madspace_admin"],
  },
  {
    route: "/[tenantSlug]/[projectSlug]/audience",
    audience: "internal",
    requiresRole: ["developer", "agency_manager", "sales_agent", "madspace_admin"],
  },
  {
    route: "/[tenantSlug]/[projectSlug]/presentation",
    audience: "internal",
    requiresRole: ["developer", "agency_manager", "sales_agent", "madspace_admin"],
  },
  {
    route: "/[tenantSlug]/[projectSlug]/units",
    audience: "internal",
    requiresRole: ["developer", "agency_manager", "sales_agent", "madspace_admin"],
  },
  {
    route: "/[tenantSlug]/[projectSlug]/storytelling",
    audience: "internal",
    requiresRole: ["developer", "agency_manager", "sales_agent", "madspace_admin"],
  },
  {
    route: "/[tenantSlug]/[projectSlug]/meetings",
    audience: "internal",
    requiresRole: ["developer", "agency_manager", "sales_agent", "madspace_admin"],
  },

  /* --- outcome context, deliberately not primary -------------------------- */

  {
    route: "/[tenantSlug]/[projectSlug]/overview",
    audience: "internal",
    requiresRole: ["developer", "agency_manager", "sales_agent", "madspace_admin"],
  },
  /*
   * Sales Flow and Project are two of the three doors the opening screen opens
   * onto, so every role that can reach the opening screen can reach them. They
   * used to be CRM surfaces restricted to management, and leaving that list in
   * place silently dropped two of the three doors out of the navigation.
   */
  {
    route: "/[tenantSlug]/[projectSlug]/flow",
    audience: "internal",
    requiresRole: ["developer", "agency_manager", "sales_agent", "madspace_admin"],
  },
  {
    route: "/[tenantSlug]/[projectSlug]/project",
    audience: "internal",
    requiresRole: ["developer", "agency_manager", "sales_agent", "madspace_admin"],
  },
  {
    route: "/[tenantSlug]/[projectSlug]/people",
    audience: "internal",
    requiresRole: ["developer", "agency_manager", "sales_agent"],
  },
  {
    route: "/[tenantSlug]/[projectSlug]/meetings/[meetingId]",
    audience: "internal",
    requiresRole: ["sales_agent", "agency_manager", "madspace_admin"],
  },
  /* --- the Ask IRIS rollout (ADR-0033) ------------------------------------ */

  /*
   * THE BARE PROJECT URL.
   *
   * It serves a redirect to the home segment and nothing else. The approved
   * design's own first navigation item pointed here and got a 404, because a
   * project had a layout and no page.
   *
   * Declared even though it only redirects: a surface with no declared audience
   * is how a buyer-facing page appears by accident, and "it has no body" is a
   * statement about what it renders rather than about who may open it.
   *
   * COLLISION NOTE, because `requireSurface` matches on the LAST path segment
   * and returns silently when it finds nothing. This route and
   * `/iris/[tenantSlug]/[projectSlug]` both end `/[projectSlug]`. Nothing calls
   * `requireSurface` with that key — the redirect has no screen of its own to
   * guard, and the review route guards itself — and the two entries carry the
   * SAME role list, so even if something did, either entry would give the same
   * answer. Recorded here rather than left to be rediscovered.
   */
  {
    route: "/[tenantSlug]/[projectSlug]",
    audience: "internal",
    requiresRole: ["developer", "agency_manager", "sales_agent", "madspace_admin"],
  },

  /*
   * ASK IRIS — the landing surface, and the first primary section.
   *
   * Every role that may open the project, because it is where every role now
   * arrives: a refused reader, a reader following a bare project URL, and a
   * reader opening a card on `/projects` all land here. Restricting it to a
   * subset would leave the excluded roles with no first screen at all.
   *
   * It reads the same project through the same repository as every surface
   * beside it, so what it can answer is already bounded by the reader's grants
   * rather than by this list.
   */
  {
    route: "/[tenantSlug]/[projectSlug]/ask",
    audience: "internal",
    requiresRole: ["developer", "agency_manager", "sales_agent", "madspace_admin"],
  },
  /*
   * The reader's earlier questions on this project.
   *
   * Same roles as Ask itself: a history that a reader may not open is a history
   * of questions they were never able to ask. Scoped to the account by the read
   * model rather than by this table — the route says who may have a history,
   * not whose history they see.
   */
  {
    route: "/[tenantSlug]/[projectSlug]/ask/history",
    audience: "internal",
    requiresRole: ["developer", "agency_manager", "sales_agent", "madspace_admin"],
  },
  /*
   * One question and its answer, at its own URL, so an answer can be returned
   * to and linked rather than re-asked. Same roles, same reason as the history
   * it is opened from.
   */
  {
    route: "/[tenantSlug]/[projectSlug]/ask/[threadId]",
    audience: "internal",
    requiresRole: ["developer", "agency_manager", "sales_agent", "madspace_admin"],
  },

  /*
   * One unit, opened from the register.
   *
   * Exactly the roles that may open `/units`, because this is the same analysis
   * for one row of it: what IRIS saw happen to one apartment. A narrower list
   * here would mean a reader could read the table and not the row, which is not
   * a boundary anybody asked for.
   */
  {
    route: "/[tenantSlug]/[projectSlug]/units/[unitCode]",
    audience: "internal",
    requiresRole: ["developer", "agency_manager", "sales_agent", "madspace_admin"],
  },
  /*
   * One agent, opened from the roster.
   *
   * The same list ADR-0029 settled for `/agents`: the boundary is the PROJECT,
   * not the role, so two agents assigned to one project may read one another's
   * working figures and an agent on another project may read neither. What
   * ADR-0029 did not open is not opened here either — the IRIS rating stays
   * MADSPACE-only, and nothing of another project is reachable at any scope.
   */
  {
    route: "/[tenantSlug]/[projectSlug]/agents/[agentId]",
    audience: "internal",
    requiresRole: ["developer", "agency_manager", "sales_agent", "madspace_admin"],
  },

  /*
   * FEATURES — what the building's features do to a buyer's attention.
   *
   * The successor to Storytelling, which now permanently redirects here. Every
   * role that may open Project, because it is one of the four faces of Project
   * and a tab a reader cannot open is a tab that should not be drawn.
   */
  {
    route: "/[tenantSlug]/[projectSlug]/features",
    audience: "internal",
    requiresRole: ["developer", "agency_manager", "sales_agent", "madspace_admin"],
  },
  /*
   * REPORT — the internal sales-intelligence report, as a page (M4).
   *
   * The same read models the screens draw, in the order the export dialog
   * describes, so the reference every `ReportSection.evidence` already carries
   * has somewhere to land. Every role that may open Project, because it is
   * Project's own figures on one page; the audience is stated internal on the
   * cover and nothing here is the buyer-facing contract (ADR-0018).
   */
  {
    route: "/[tenantSlug]/[projectSlug]/report",
    audience: "internal",
    requiresRole: ["developer", "agency_manager", "sales_agent", "madspace_admin"],
  },
  /*
   * ATTENTION — what is not going to sell itself.
   *
   * The list Ask IRIS points at when it is asked which apartments need
   * attention, given its own URL so the answer can be linked and returned to.
   * Every role, for the same reason as the unit register it draws from: this is
   * project analysis, not a person's record, and nothing on it is a named
   * buyer.
   */
  {
    route: "/[tenantSlug]/[projectSlug]/attention",
    audience: "internal",
    requiresRole: ["developer", "agency_manager", "sales_agent", "madspace_admin"],
  },

  { route: "/madspace", audience: "internal", requiresRole: ["madspace_admin"] },

  /*
   * The MADSPACE operations surface.
   *
   * Every one is `madspace_admin` and every one says so twice: here, and again
   * in the page, which redirects a viewer holding any other role. The duplication
   * is deliberate — this table is what the audit reads, and the redirect is what
   * actually refuses somebody who types the URL.
   *
   * Nothing on these screens is analytics. They answer whether an installation
   * is activated, connected and delivering; what it observed belongs to the
   * customer's surfaces and is not readable from here.
   */
  { route: "/madspace/projects", audience: "internal", requiresRole: ["madspace_admin"] },
  { route: "/madspace/projects/new", audience: "internal", requiresRole: ["madspace_admin"] },
  {
    route: "/madspace/projects/[projectId]",
    audience: "internal",
    requiresRole: ["madspace_admin"],
  },
  {
    route: "/madspace/projects/[projectId]/sources/new",
    audience: "internal",
    requiresRole: ["madspace_admin"],
  },
  /*
   * The CRM behind one project (ADR-0036): which connector, its sealed
   * credential, the last sync and what it changed. Internal, because a
   * client's CRM credential is MADSPACE's to hold and nobody else's to see.
   */
  {
    route: "/madspace/projects/[projectId]/integrations",
    audience: "internal",
    requiresRole: ["madspace_admin"],
  },
  { route: "/madspace/sources/[sourceId]", audience: "internal", requiresRole: ["madspace_admin"] },
  { route: "/madspace/diagnostics", audience: "internal", requiresRole: ["madspace_admin"] },
  /*
   * DIRECTORY — tenants, agencies and people (M9), read from the demonstration
   * directory because no tenant, user or agency table exists yet. The page
   * says so; MADSPACE alone may open it.
   */
  { route: "/madspace/directory", audience: "internal", requiresRole: ["madspace_admin"] },

  /*
   * The design lab. Development only, and gated twice.
   *
   * Three visual directions for Source detail, so a direction can be chosen by
   * looking at it. The layout calls `notFound()` unless the local control plane
   * is enabled, which needs a non-production NODE_ENV and an explicit
   * environment variable, so a deployment does not have this route at all. It is
   * declared here anyway: a surface with no declared audience is how a
   * buyer-facing page appears by accident, and "it cannot render in production"
   * is a runtime fact rather than a statement of who it is for.
   */
  { route: "/design-lab", audience: "internal", requiresRole: ["madspace_admin"] },
  {
    route: "/design-lab/[screen]/[variant]",
    audience: "internal",
    requiresRole: ["madspace_admin"],
  },
  /*
   * The Observer review index. Development only, gated the same way.
   *
   * Every screen the customer product has and every partial-data state it can
   * be put into, as links, so a reviewer does not have to remember which
   * project proves which absence or type a unit code out of a screenshot. It is
   * a signpost rather than a surface and is deliberately absent from the
   * product navigation.
   */
  { route: "/design-lab/observer", audience: "internal", requiresRole: ["madspace_admin"] },
  /*
   * The lab's stress sibling. Same eighteen screens, an in-memory estate of
   * twelve projects and fifty installations, and never photographed: it exists
   * so a layout can be asserted at a size the real estate cannot yet reach.
   * Gated identically, and by the same `localControlPlaneEnabled()` check, so a
   * deployment does not have it either.
   */
  {
    route: "/design-lab/stress/[screen]/[variant]",
    audience: "internal",
    requiresRole: ["madspace_admin"],
  },

  /*
   * Ask IRIS, the flagship of the approved design — under review, at a real URL.
   *
   * Declared with the same audience and the same roles as the project surfaces
   * it mirrors, because it reads the same project through the same repository
   * and enforces access the same way: `resolveProject` refuses, and forbidden
   * and missing redirect identically so the route cannot confirm that somebody
   * else's project exists.
   *
   * Not `/lab`. Those are working drawings with no customer data and are
   * MADSPACE-only for that reason; this renders a real project for the people
   * whose project it is, which is the whole point of reviewing it. When the
   * design is accepted this composition moves into
   * `(app)/[tenantSlug]/[projectSlug]` and this entry goes with it.
   */
  {
    route: "/iris/[tenantSlug]/[projectSlug]",
    audience: "internal",
    requiresRole: ["developer", "agency_manager", "sales_agent", "madspace_admin"],
  },

  /*
   * The design laboratory.
   *
   * Isolated visual concepts, reachable only by typing the URL and carrying no
   * customer data — but they are still surfaces, and a surface with no declared
   * audience is how a buyer-facing page appears by accident. MADSPACE only,
   * because these are working drawings rather than product.
   */
  { route: "/lab", audience: "internal", requiresRole: ["madspace_admin"] },
  { route: "/lab/sign-in", audience: "internal", requiresRole: ["madspace_admin"] },
  { route: "/lab/overview-a", audience: "internal", requiresRole: ["madspace_admin"] },
  { route: "/lab/overview-b", audience: "internal", requiresRole: ["madspace_admin"] },
];

/**
 * WHERE A READER LANDS, NAMED ONCE.
 *
 * `/showroom` was written as a literal in five places — the refusal redirect in
 * `authz.ts`, both context switchers in the project layout, the project card on
 * `/projects`, and the way back into Observer from account settings. Every one
 * of them meant the same thing: "the first screen of a project". None of them
 * said so, so moving that screen meant finding five strings and hoping.
 *
 * ADR-0033 moved it. The home segment is now `ask`, and it is a constant rather
 * than a string because the next time it moves this is the only line to change.
 *
 * It is deliberately NOT `PRIMARY_NAV[0].key`. The two happen to agree today,
 * and they are different claims: the first nav item is a matter of ordering,
 * and where a refused or newly arriving reader is sent is a matter of which
 * screen answers with nothing selected. Deriving one from the other would make
 * a reordering of the navigation silently change the landing destination.
 */
export const HOME_SEGMENT = "ask";

/**
 * The primary sections.
 *
 * ## Why this list moved
 *
 * It was `Briefing · Sales Flow · Project · Sales Agents`, and before that the
 * doctrine's `Overview · Sales Flow · Project · People` (skill §7, ADR-0019).
 * It is now **ASK IRIS · Sales Flow · Project · Sales Agents**.
 *
 * The user chose this information architecture in conversation, and the
 * doctrine's own source hierarchy (skill §0) puts "a decision the user has just
 * made in conversation" ABOVE this skill, above the ADRs and above the product
 * documents. `docs/adr/0033-ask-iris-is-the-landing-surface.md` records the
 * decision so that the conversation is not the only place it survives.
 *
 * One change is a rename and one is a genuine move:
 *
 *   - `Briefing` is REPLACED, not renamed. Ask IRIS is a different surface: the
 *     landing screen is now a question rather than a summary. It is also the
 *     one item that carries the sparkle in the shell, because it is the one
 *     surface that answers.
 *   - The other three keep their keys and their meaning.
 *
 * ## Briefing does not disappear
 *
 * `/showroom` is still a real surface, still declared above, and still served.
 * It stopped being a navigation item and became something Ask IRIS names —
 * "Today's briefing" — which is the relationship the two actually have: the
 * briefing is one of the answers, not a competing question. `surfaces.test.ts`
 * records it in `reachedFromAView` for exactly that reason, and would fail if
 * the link ever went away.
 *
 * Administration is deliberately absent, as it always was.
 */
export const PRIMARY_NAV = [
  { key: "ask", label: "ASK IRIS" },
  { key: "flow", label: "Sales Flow" },
  { key: "project", label: "Project" },
  { key: "agents", label: "Sales Agents" },
] as const;

export type NavKey = (typeof PRIMARY_NAV)[number]["key"];

/**
 * The four faces of Project, in the section's own tab row.
 *
 * ## Why this is a NEW list and not a rewrite of `SECONDARY_NAV`
 *
 * The two were considered for merging and deliberately kept apart, because they
 * are not the same claim wearing two names:
 *
 *   - `SECONDARY_NAV` is "the drill-downs beneath the four" — surfaces that are
 *     subordinate to the whole product. It is rendered on every section that
 *     does not own a tab row of its own.
 *   - `PROJECT_NAV` is "the four faces of Project" — one section's internal
 *     structure, with `Overview` being the Project surface itself. A row whose
 *     first item is the section it hangs from is a section's tabs, not the
 *     product's second navigation.
 *
 * Collapsing them would have deleted `presentation` and `storytelling` from the
 * product while leaving their files in the repository — which is the precise
 * failure `surfaces.test.ts` was written to catch, and which has already
 * happened once here. So `SECONDARY_NAV` stays exactly as it is, still deep-
 * equal-pinned by `reference-parity.test.ts`, and this sits beside it.
 *
 * `Overview` is keyed `project` because it IS the Project surface: the tab that
 * returns a reader to the top of the section they are already inside. `units`
 * and `meetings` appear here and in `SECONDARY_NAV` on purpose — a surface may
 * be reached from more than one place, and reachability is a floor rather than
 * an exclusivity rule.
 */
export const PROJECT_NAV = [
  { key: "project", label: "Overview" },
  { key: "units", label: "Units" },
  { key: "meetings", label: "Meetings" },
  { key: "features", label: "Features" },
] as const;

export type ProjectNavKey = (typeof PROJECT_NAV)[number]["key"];

/**
 * The detail surfaces, in their own row beneath the four.
 *
 * Presentation DNA, Unit Attention, Storytelling and Meeting Replay were moved
 * behind the three views and then linked from nowhere, which is not "behind" —
 * it is deleted with the files left in the repository. Review was right that
 * eight equal tabs is too many; the answer is a subordinate row, not an
 * unreachable route.
 *
 * KEPT UNCHANGED THROUGH THE ASK IRIS ROLLOUT, and still rendered. The IRIS
 * shell has one sub-navigation row; this list fills it on every section that
 * does not own one, and `PROJECT_NAV` fills it on the Project family. Emptying
 * this list would have made `presentation` unreachable, and `storytelling` —
 * which now permanently redirects to Features — is kept here so that the row a
 * reader used yesterday still leads somewhere real today.
 *
 * Anything added here must also be reachable, and `surfaces.test.ts` asserts
 * that every internal route is either in one of these rows or linked from a
 * view.
 */
export const SECONDARY_NAV = [
  { key: "presentation", label: "Presentation DNA" },
  { key: "units", label: "Unit Attention" },
  { key: "storytelling", label: "Storytelling" },
  { key: "meetings", label: "Meetings" },
] as const;

export type SecondaryNavKey = (typeof SECONDARY_NAV)[number]["key"];
