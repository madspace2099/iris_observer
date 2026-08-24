import {
  AgentIdSchema,
  ProjectIdSchema,
  TenantIdSchema,
  type AgentId,
  type ProjectId,
  type TenantId,
} from "@observer/contracts";
import type { ProjectSummary, TenantSummary, Viewer } from "@observer/readmodels";

/**
 * The synthetic world.
 *
 * Deterministic by construction: fixed identifiers, a pinned "today", no
 * randomness anywhere. A demo that changes shape between runs cannot be
 * asserted against, and a screenshot of it proves nothing.
 *
 * Two tenants exist so that isolation is testable as a property rather than
 * assumed, and one agency works for both — the case that would quietly leak if
 * scoping were done per screen instead of in the repository.
 */

/**
 * Fixture identifiers are parsed rather than cast.
 *
 * Casting would silence the branded types and let a malformed identifier into
 * the fixtures unnoticed; parsing means a typo in this file fails at module
 * load, which is where a typo in a fixture should fail.
 */
const tenantId = (value: string): TenantId => TenantIdSchema.parse(value);
const projectId = (value: string): ProjectId => ProjectIdSchema.parse(value);
const agentId = (value: string): AgentId => AgentIdSchema.parse(value);

/** Everything relative to this instant. Never `new Date()`. */
export const TODAY = "2026-08-24T09:00:00.000+02:00";

export const TENANTS: readonly TenantSummary[] = [
  { id: tenantId("tnt_demoalpha01"), slug: "alpha", name: "Alpha Estates" },
  { id: tenantId("tnt_demobeta002"), slug: "beta", name: "Beta Development" },
] as const;

export const PROJECTS: readonly ProjectSummary[] = [
  {
    id: projectId("prj_northgate01"),
    tenantId: tenantId("tnt_demoalpha01"),
    slug: "northgate",
    name: "Northgate Residences",
    currency: "EUR",
    locale: "en-GB",
    timeZone: "Europe/Bratislava",
    // The complete case. Everything renders.
    connectedSources: ["webiris", "showroom", "crm", "catalogue"],
  },
  {
    id: projectId("prj_riversidew1"),
    tenantId: tenantId("tnt_demoalpha01"),
    slug: "riverside",
    name: "Riverside Walk",
    currency: "EUR",
    locale: "en-GB",
    timeZone: "Europe/Bratislava",
    // No CRM. Everything below the meeting must render its unavailable state
    // rather than a smaller number — this project exists to prove that.
    connectedSources: ["webiris", "showroom", "catalogue"],
  },
  {
    id: projectId("prj_beta0000001"),
    tenantId: tenantId("tnt_demobeta002"),
    slug: "kingsford",
    name: "Kingsford Yard",
    currency: "GBP",
    locale: "en-GB",
    timeZone: "Europe/London",
    // Three weeks live. Every verdict must be suppressed for want of sample.
    connectedSources: ["showroom", "catalogue"],
  },
] as const;

/**
 * Viewers.
 *
 * `agencyManager` deliberately holds projects in both tenants: one agency
 * selling for two developers is the ordinary commercial arrangement and the
 * sharpest isolation test the product has.
 */
export const VIEWERS = {
  developer: {
    userId: "usr_dev_alpha",
    displayName: "Petra Novák",
    role: "developer",
    tenantIds: [tenantId("tnt_demoalpha01")],
    projectIds: [projectId("prj_northgate01"), projectId("prj_riversidew1")],
    agentId: null,
    organisationName: "Alpha Estates",
  },
  agencyManager: {
    userId: "usr_mgr_shared",
    displayName: "Tomáš Varga",
    role: "agency_manager",
    tenantIds: [tenantId("tnt_demoalpha01"), tenantId("tnt_demobeta002")],
    projectIds: [projectId("prj_northgate01"), projectId("prj_beta0000001")],
    agentId: null,
    organisationName: "Meridian Sales",
  },
  salesAgent: {
    userId: "usr_agent_monika",
    displayName: "Monika Kováčová",
    role: "sales_agent",
    tenantIds: [tenantId("tnt_demoalpha01")],
    projectIds: [projectId("prj_northgate01")],
    agentId: agentId("agt_monika0001"),
    organisationName: "Meridian Sales",
  },
  madspace: {
    userId: "usr_madspace_ops",
    displayName: "MADSPACE Operations",
    role: "madspace_admin",
    tenantIds: [tenantId("tnt_demoalpha01"), tenantId("tnt_demobeta002")],
    projectIds: [
      projectId("prj_northgate01"),
      projectId("prj_riversidew1"),
      projectId("prj_beta0000001"),
    ],
    agentId: null,
    organisationName: "MADSPACE",
  },
} satisfies Record<string, Viewer>;

export type ViewerKey = keyof typeof VIEWERS;

export const VIEWER_KEYS = Object.keys(VIEWERS) as readonly ViewerKey[];

export function viewerByKey(key: string): Viewer | undefined {
  return (VIEWERS as Record<string, Viewer>)[key];
}

/* --- units ---------------------------------------------------------------- */

export interface SyntheticUnit {
  readonly id: string;
  readonly projectId: ProjectId;
  readonly code: string;
  readonly rooms: number;
  readonly floor: number;
  readonly areaSqm: number;
  readonly orientation: "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";
  readonly price: number;
  readonly status: "available" | "reserved" | "sold";
}

export const UNITS: readonly SyntheticUnit[] = [
  {
    id: "unt_a402000001",
    projectId: projectId("prj_northgate01"),
    code: "A-402",
    rooms: 2,
    floor: 4,
    areaSqm: 63,
    orientation: "S",
    price: 214_000,
    status: "available",
  },
  {
    id: "unt_b301000002",
    projectId: projectId("prj_northgate01"),
    code: "B-301",
    rooms: 2,
    floor: 3,
    areaSqm: 59,
    orientation: "SW",
    price: 202_000,
    status: "available",
  },
  {
    id: "unt_a505000003",
    projectId: projectId("prj_northgate01"),
    code: "A-505",
    rooms: 2,
    floor: 5,
    areaSqm: 66,
    orientation: "S",
    price: 229_000,
    // Viktória favourited this one and it went while she was deciding. Her
    // agent has to learn that from the brief, before the meeting, not from her.
    status: "sold",
  },
  {
    id: "unt_c204000004",
    projectId: projectId("prj_northgate01"),
    code: "C-204",
    rooms: 3,
    floor: 2,
    areaSqm: 88,
    orientation: "W",
    price: 268_000,
    status: "reserved",
  },
  {
    id: "unt_a204000005",
    projectId: projectId("prj_northgate01"),
    code: "A-204",
    rooms: 2,
    floor: 2,
    areaSqm: 61,
    orientation: "N",
    price: 189_000,
    status: "available",
  },
] as const;

export function unitsForProject(project: ProjectId): readonly SyntheticUnit[] {
  return UNITS.filter((u) => u.projectId === project);
}

export function unitById(id: string): SyntheticUnit | undefined {
  return UNITS.find((u) => u.id === id);
}

/* --- people ---------------------------------------------------------------- */

export interface SyntheticContact {
  readonly id: string;
  readonly projectId: string;
  readonly displayName: string;
  readonly isReturning: boolean;
}

export const CONTACTS: readonly SyntheticContact[] = [
  {
    id: "cnt_viktoria001",
    projectId: projectId("prj_northgate01"),
    displayName: "Viktória Halász",
    isReturning: false,
  },
  {
    id: "cnt_danielpair1",
    projectId: projectId("prj_northgate01"),
    displayName: "Daniel Bartoš",
    isReturning: true,
  },
  {
    id: "cnt_evapair0002",
    projectId: projectId("prj_northgate01"),
    displayName: "Eva Bartošová",
    isReturning: true,
  },
] as const;

export function contactById(id: string): SyntheticContact | undefined {
  return CONTACTS.find((c) => c.id === id);
}
