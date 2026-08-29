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
  { route: "/madspace", audience: "internal", requiresRole: ["madspace_admin"] },

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
 * The primary sections.
 *
 * Showroom is the opening screen — a verdict and three doors. The other three
 * are those doors: how the process performs, what buyers want, and how each
 * person presents.
 *
 * Presentation DNA, Unit Attention, Storytelling and Meeting Replay are still
 * here and still reachable; they moved *behind* the three views rather than
 * competing with them in the navigation. Review found four analytical tabs
 * beside each other overwhelming, and it was right: a top-level tab is a claim
 * that the reader should choose between things, and these are drill-downs.
 *
 * Administration is deliberately absent.
 */
export const PRIMARY_NAV = [
  { key: "showroom", label: "Briefing" },
  { key: "flow", label: "Sales Flow" },
  { key: "project", label: "Project" },
  { key: "agents", label: "Sales Agents" },
] as const;

export type NavKey = (typeof PRIMARY_NAV)[number]["key"];

/**
 * The detail surfaces, in their own row beneath the four.
 *
 * Presentation DNA, Unit Attention, Storytelling and Meeting Replay were moved
 * behind the three views and then linked from nowhere, which is not "behind" —
 * it is deleted with the files left in the repository. Review was right that
 * eight equal tabs is too many; the answer is a subordinate row, not an
 * unreachable route.
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
