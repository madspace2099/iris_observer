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

  /* --- Showroom Intelligence, the primary surfaces (ADR-0023) ------------- */

  {
    route: "/[tenantSlug]/[projectSlug]/showroom",
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

/**
 * The primary sections.
 *
 * All four are rooted in what IRIS observed. The conversion funnel and the
 * CRM-led executive overview are no longer here: they remain reachable, but a
 * surface a product opens on is a statement about what the product is for, and
 * ADR-0023 settled what this one is for.
 *
 * Administration is deliberately absent.
 */
export const PRIMARY_NAV = [
  { key: "showroom", label: "Showroom" },
  { key: "presentation", label: "Presentation" },
  { key: "units", label: "Units" },
  { key: "storytelling", label: "Storytelling" },
] as const;

export type NavKey = (typeof PRIMARY_NAV)[number]["key"];
