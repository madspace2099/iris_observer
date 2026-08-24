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
  {
    route: "/[tenantSlug]/[projectSlug]/overview",
    audience: "internal",
    requiresRole: ["developer", "agency_manager", "sales_agent", "madspace_admin"],
  },
  {
    route: "/[tenantSlug]/[projectSlug]/flow",
    audience: "internal",
    requiresRole: ["developer", "agency_manager"],
  },
  {
    route: "/[tenantSlug]/[projectSlug]/project",
    audience: "internal",
    requiresRole: ["developer", "agency_manager"],
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

/** The four customer-facing sections. Administration is deliberately absent. */
export const PRIMARY_NAV = [
  { key: "overview", label: "Overview" },
  { key: "flow", label: "Sales Flow" },
  { key: "project", label: "Project" },
  { key: "people", label: "People" },
] as const;

export type NavKey = (typeof PRIMARY_NAV)[number]["key"];
