import {
  AgentIdSchema,
  ProjectIdSchema,
  TenantIdSchema,
  type AgentId,
  type ProjectId,
  type TenantId,
} from "@observer/contracts";
import type { ProjectSource, ProjectSummary, TenantSummary, Viewer } from "@observer/readmodels";

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

/**
 * A source that has never sent anything.
 *
 * Written as a helper rather than repeated, so the one property that matters —
 * a disconnected feed has `lastSeenAt: null`, not a plausible-looking date — is
 * true by construction everywhere rather than by four people remembering it.
 */
function neverSeen(id: string, displayName: string, kind: ProjectSource["kind"]): ProjectSource {
  return { id, displayName, kind, connected: false, lastSeenAt: null };
}

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
    /*
     * One installation, in the sales gallery on site. The last-seen instants
     * are all within the working day before TODAY, which is what a healthy
     * project looks like — and what makes Riverside's and Kingsford's gaps
     * legible by contrast.
     */
    sources: [
      {
        id: "src_ng_showroom",
        displayName: "Sales Gallery PC",
        kind: "showroom",
        connected: true,
        lastSeenAt: "2026-08-24T08:12:00.000+02:00",
      },
      {
        id: "src_ng_webiris",
        displayName: "WEB IRIS",
        kind: "webiris",
        connected: true,
        lastSeenAt: "2026-08-24T07:58:00.000+02:00",
      },
      {
        id: "src_ng_crm",
        displayName: "Alpha Estates CRM",
        kind: "crm",
        connected: true,
        lastSeenAt: "2026-08-23T22:10:00.000+02:00",
      },
      {
        id: "src_ng_catalogue",
        displayName: "Northgate unit catalogue",
        kind: "catalogue",
        connected: true,
        lastSeenAt: "2026-08-21T09:05:00.000+02:00",
      },
    ],
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
    /*
     * The CRM row is present and says it is not connected.
     *
     * Dropping it would leave a reader to infer the absence from a shorter
     * list, and "there is no CRM here" and "nobody has wired the CRM up yet"
     * are different sentences with different next actions.
     */
    sources: [
      {
        id: "src_rw_showroom",
        displayName: "Riverside Marketing Suite PC",
        kind: "showroom",
        connected: true,
        lastSeenAt: "2026-08-24T07:41:00.000+02:00",
      },
      {
        id: "src_rw_webiris",
        displayName: "WEB IRIS",
        kind: "webiris",
        connected: true,
        lastSeenAt: "2026-08-23T19:26:00.000+02:00",
      },
      neverSeen("src_rw_crm", "Alpha Estates CRM", "crm"),
      {
        id: "src_rw_catalogue",
        displayName: "Riverside unit catalogue",
        kind: "catalogue",
        connected: true,
        lastSeenAt: "2026-08-18T11:32:00.000+02:00",
      },
    ],
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
    /*
     * Nothing here predates 3 August, because nothing here existed before it.
     * A last-seen instant earlier than the project's own launch would be the
     * quietest possible way to make three weeks of data look like a year of it.
     */
    sources: [
      {
        id: "src_ky_showroom",
        displayName: "Kingsford Yard Showroom PC",
        kind: "showroom",
        connected: true,
        lastSeenAt: "2026-08-24T08:35:00.000+01:00",
      },
      neverSeen("src_ky_webiris", "WEB IRIS", "webiris"),
      neverSeen("src_ky_crm", "Beta Development CRM", "crm"),
      {
        id: "src_ky_catalogue",
        displayName: "Kingsford Yard unit catalogue",
        kind: "catalogue",
        connected: true,
        lastSeenAt: "2026-08-03T09:00:00.000+01:00",
      },
    ],
  },
  /*
   * ISTER TOWER — THE COMPLETE CASE, AND THE ONE THE PRODUCT IS REVIEWED ON.
   *
   * Northgate is already a four-source project, so a second one is not here to
   * prove that four sources work. It is here because every surface in the
   * application is judged against a single development, and judging them
   * against Northgate has a cost: Northgate's catalogue is *generated* from a
   * stacking plan, its meetings run on one installation, and its history is two
   * quarters long. None of those is wrong, and none of them exercises the
   * cases a reviewer needs in front of them at once — a named unit that keeps
   * its exact attributes, a split between the showroom and WEB IRIS, a team
   * where one member is genuinely below the reporting minimum, and enough
   * history that every period preset returns a different answer.
   *
   * It is added rather than substituted. Riverside proves the no-CRM state and
   * Kingsford proves verdict suppression; repurposing either to make room would
   * trade a proof for a demonstration.
   *
   * Listed last so that `listProjects` still returns Northgate first for every
   * account that holds both, which is what the browser suite opens by default.
   */
  {
    id: projectId("prj_istertower1"),
    tenantId: tenantId("tnt_demoalpha01"),
    slug: "ister-tower",
    name: "ISTER TOWER",
    currency: "EUR",
    locale: "en-GB",
    timeZone: "Europe/Bratislava",
    connectedSources: ["webiris", "showroom", "crm", "catalogue"],
    /*
     * Two IRIS surfaces, and they are named because they are different rooms.
     * "Main Showroom PC" is the installation in the tower's sales lounge;
     * WEB IRIS is the same content in a browser, which is where the remote
     * presentations run. The session records carry the same distinction, so a
     * reader can go from "WEB IRIS last heard from at 08:57" to the meetings it
     * produced without either surface guessing.
     */
    sources: [
      {
        id: "src_it_showroom",
        displayName: "Main Showroom PC",
        kind: "showroom",
        connected: true,
        lastSeenAt: "2026-08-24T08:41:00.000+02:00",
      },
      {
        id: "src_it_webiris",
        displayName: "WEB IRIS",
        kind: "webiris",
        connected: true,
        lastSeenAt: "2026-08-24T08:57:00.000+02:00",
      },
      {
        id: "src_it_crm",
        displayName: "Alpha Estates CRM",
        kind: "crm",
        connected: true,
        lastSeenAt: "2026-08-24T06:15:00.000+02:00",
      },
      {
        id: "src_it_catalogue",
        displayName: "ISTER TOWER unit catalogue",
        kind: "catalogue",
        connected: true,
        lastSeenAt: "2026-08-22T17:30:00.000+02:00",
      },
    ],
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
  /*
   * PETRA NOVÁK IS THE DEVELOPER, AND SHE IS ONLY EVER THE DEVELOPER.
   *
   * The ISTER TOWER brief names a "Petra Novák" among the sales team. She is
   * not created here, and the omission is deliberate rather than an oversight.
   * `docs/05-identity.md` treats one person appearing twice as a *defect the
   * product exists to catch*; a demonstration that put the same name on the
   * developer's account and on an agent row would be exhibiting the bug it
   * claims to find, and a reader could not tell which Petra a figure was about.
   *
   * She holds ISTER TOWER instead, which is what the brief actually needs: the
   * developer can open the flagship project.
   */
  developer: {
    userId: "usr_dev_alpha",
    displayName: "Petra Novák",
    role: "developer",
    tenantIds: [tenantId("tnt_demoalpha01")],
    projectIds: [
      projectId("prj_northgate01"),
      projectId("prj_riversidew1"),
      projectId("prj_istertower1"),
    ],
    agentId: null,
    organisationName: "Alpha Estates",
  },
  agencyManager: {
    userId: "usr_mgr_shared",
    displayName: "Tomáš Varga",
    role: "agency_manager",
    tenantIds: [tenantId("tnt_demoalpha01"), tenantId("tnt_demobeta002")],
    projectIds: [
      projectId("prj_northgate01"),
      projectId("prj_istertower1"),
      projectId("prj_beta0000001"),
    ],
    agentId: null,
    organisationName: "Meridian Sales",
  },
  /*
   * Monika presents on two projects for the same developer.
   *
   * Not the same case as Akhilesh below: his two grants come from competing
   * developers, hers from one. Both matter, because a surface that totals a
   * person's meetings across projects is wrong in her case and *leaks* in his.
   */
  salesAgent: {
    userId: "usr_agent_monika",
    displayName: "Monika Kováčová",
    role: "sales_agent",
    tenantIds: [tenantId("tnt_demoalpha01")],
    projectIds: [projectId("prj_northgate01"), projectId("prj_istertower1")],
    agentId: agentId("agt_monika0001"),
    organisationName: "Meridian Sales",
  },
  /*
   * ISTER TOWER's lead presenter, and the account the agent surfaces are
   * reviewed through.
   *
   * A sales agent's own Observer is only worth looking at when it has a day in
   * it, and Monika's grant list opens on Northgate. Martin holds the flagship
   * and nothing else, so signing in as him lands on the project the whole
   * frontend is judged against, with a full period of his own meetings behind
   * it. His colleague Lucia Horváth is deliberately the thin sample on that
   * team — see `SYNTHETIC_AGENTS` — and she is visible from his Sales Agents
   * screen rather than needing an account of her own.
   */
  salesAgentIster: {
    userId: "usr_agent_martin",
    displayName: "Martin Kováč",
    role: "sales_agent",
    tenantIds: [tenantId("tnt_demoalpha01")],
    projectIds: [projectId("prj_istertower1")],
    agentId: agentId("agt_martinkovac"),
    organisationName: "Meridian Sales",
  },
  /*
   * A SECOND SALES AGENT, ASSIGNED TO TWO PROJECTS BY TWO DIFFERENT DEVELOPERS.
   *
   * Monika above is the single-project case, and a single-project agent cannot
   * demonstrate the property that matters most about per-project grants: that
   * holding two of them gives access to each SEPARATELY and never to the two
   * combined. Akhilesh holds Northgate (Alpha Estates) and Kingsford Yard
   * (Beta Development), which are competitors — so every read he makes must be
   * scoped to whichever project he is looking at, and no surface may total,
   * average or rank across the pair.
   *
   * He is a real name from the agent roster rather than an invention: the same
   * person appears in Northgate's Sales Agents surface, which is what makes the
   * peer-visibility case checkable.
   */
  salesAgentDual: {
    userId: "usr_agent_akhilesh",
    displayName: "Akhilesh Undev",
    role: "sales_agent",
    tenantIds: [tenantId("tnt_demoalpha01"), tenantId("tnt_demobeta002")],
    projectIds: [projectId("prj_northgate01"), projectId("prj_beta0000001")],
    agentId: agentId("agt_akhilesh"),
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
      projectId("prj_istertower1"),
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
  /**
   * Which block or wing the unit sits in.
   *
   * Added rather than parsed back out of `code`, and the reason is that the
   * codes do not agree with each other: Northgate spells a unit `A-402` and
   * ISTER TOWER spells one `IT-A-12-07`, so "the block is the text before the
   * first hyphen" is true of one scheme and wrong about the other. The Pulse
   * groups the stacking plan by block, which means a wrong answer here is a
   * building drawn with its wings swapped rather than an error anybody sees.
   * Stating it once, beside the unit, is cheaper than two parsers that must be
   * kept in step.
   */
  readonly block: string;
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
    block: "A",
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
    block: "B",
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
    block: "A",
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
    block: "C",
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
    block: "A",
    rooms: 2,
    floor: 2,
    areaSqm: 61,
    orientation: "N",
    price: 189_000,
    status: "available",
  },

  /* --- ISTER TOWER ---------------------------------------------------------
   *
   * THE STACKING PLAN, WRITTEN OUT RATHER THAN GENERATED.
   *
   * The other three developments derive their catalogues from a `BuildingSpec`
   * — blocks times floors times units per floor — and that is the right shape
   * for a scheme nobody names a flat in. ISTER TOWER is named down to the unit:
   * the brief sends a reviewer to `IT-A-12-07` by code, and a generated
   * catalogue can only promise that *a* unit lands on that code, not that it is
   * the two-room south-facing flat on level twelve that the brief describes. So
   * this one is enumerated, and `pulse.ts` reads it instead of deriving.
   *
   * How to read the code: `IT-<block>-<floor>-<line>`. The line is the
   * apartment's position on the floor plate, which is how a tower is numbered
   * in practice and why the numbers are not contiguous — this release holds two
   * apartments per level, not seven. Block A is the south and east face and
   * starts at level three, above the podium; block B wraps the north and west
   * and begins at level two.
   *
   * `IT-A-12-07` is the one the whole demonstration turns on: the last of block
   * A's five compact two-room apartments that anybody can still buy — two are
   * sold, two are held, and it is the only one of them facing due south.
   * Buyers keep opening it and nobody has reserved it, which is the "high
   * interest, no conversion" state the brief sends a reviewer to Unit Detail
   * for.
   *
   * That state is *arranged to be reachable*, not asserted. Nothing here says
   * the unit is interesting; what the attributes do is put it at the top of
   * both attention models the product already has — two rooms and due south
   * make it the heaviest draw in the showroom's unit sampler, and being the
   * only available flat with both attributes makes it the only unit the Pulse
   * can call `high` intent. Every figure a surface prints about it is still
   * counted from the session records, like every other unit's.
   *
   * Prices follow one stated rule so a reader can check any of them:
   * `area × €4,050 + (floor − 2) × €5,200 + aspect`, where the aspect premium is
   * €12,000 south, €7,000 south-east or south-west, €3,000 east or west and
   * nothing facing north, rounded to the nearest thousand. It is a city tower,
   * so the rate per square metre is well above Northgate's suburban one.
   */
  {
    id: "unt_itb0201006",
    projectId: projectId("prj_istertower1"),
    code: "IT-B-02-01",
    block: "B",
    rooms: 1,
    floor: 2,
    areaSqm: 34,
    orientation: "NE",
    price: 138_000,
    // The cheapest flat in the tower went first, and it draws almost nothing
    // now. It is the unit that stays below UNIT_MIN_SAMPLE all period, which is
    // a state the units screen has to be able to show.
    status: "sold",
  },
  {
    id: "unt_itb0204007",
    projectId: projectId("prj_istertower1"),
    code: "IT-B-02-04",
    block: "B",
    rooms: 3,
    floor: 2,
    areaSqm: 86,
    orientation: "E",
    price: 351_000,
    status: "available",
  },
  {
    id: "unt_ita0302008",
    projectId: projectId("prj_istertower1"),
    code: "IT-A-03-02",
    block: "A",
    rooms: 3,
    floor: 3,
    areaSqm: 88,
    orientation: "SE",
    price: 369_000,
    status: "reserved",
  },
  {
    id: "unt_itb0305009",
    projectId: projectId("prj_istertower1"),
    code: "IT-B-03-05",
    block: "B",
    rooms: 3,
    floor: 3,
    areaSqm: 84,
    orientation: "NW",
    price: 345_000,
    status: "available",
  },
  {
    id: "unt_ita0403010",
    projectId: projectId("prj_istertower1"),
    code: "IT-A-04-03",
    block: "A",
    rooms: 4,
    floor: 4,
    areaSqm: 112,
    orientation: "SW",
    price: 471_000,
    status: "available",
  },
  {
    id: "unt_itb0406011",
    projectId: projectId("prj_istertower1"),
    code: "IT-B-04-06",
    block: "B",
    rooms: 3,
    floor: 4,
    areaSqm: 87,
    orientation: "W",
    price: 366_000,
    status: "available",
  },
  {
    id: "unt_ita0502012",
    projectId: projectId("prj_istertower1"),
    code: "IT-A-05-02",
    block: "A",
    rooms: 3,
    floor: 5,
    areaSqm: 89,
    orientation: "SE",
    price: 383_000,
    status: "available",
  },
  {
    id: "unt_itb0501013",
    projectId: projectId("prj_istertower1"),
    code: "IT-B-05-01",
    block: "B",
    rooms: 1,
    floor: 5,
    areaSqm: 36,
    orientation: "N",
    price: 161_000,
    status: "reserved",
  },
  {
    id: "unt_ita0603014",
    projectId: projectId("prj_istertower1"),
    code: "IT-A-06-03",
    block: "A",
    rooms: 4,
    floor: 6,
    areaSqm: 114,
    orientation: "SW",
    price: 490_000,
    status: "available",
  },
  {
    id: "unt_itb0605015",
    projectId: projectId("prj_istertower1"),
    code: "IT-B-06-05",
    block: "B",
    rooms: 3,
    floor: 6,
    areaSqm: 85,
    orientation: "NW",
    price: 365_000,
    status: "available",
  },
  {
    id: "unt_ita0707016",
    projectId: projectId("prj_istertower1"),
    code: "IT-A-07-07",
    block: "A",
    rooms: 2,
    floor: 7,
    areaSqm: 61,
    orientation: "SE",
    price: 280_000,
    status: "reserved",
  },
  {
    id: "unt_itb0704017",
    projectId: projectId("prj_istertower1"),
    code: "IT-B-07-04",
    block: "B",
    rooms: 3,
    floor: 7,
    areaSqm: 88,
    orientation: "E",
    price: 385_000,
    status: "available",
  },
  {
    id: "unt_ita0807018",
    projectId: projectId("prj_istertower1"),
    code: "IT-A-08-07",
    block: "A",
    rooms: 2,
    floor: 8,
    areaSqm: 61,
    orientation: "SE",
    price: 285_000,
    status: "sold",
  },
  {
    id: "unt_itb0806019",
    projectId: projectId("prj_istertower1"),
    code: "IT-B-08-06",
    block: "B",
    rooms: 2,
    floor: 8,
    areaSqm: 58,
    orientation: "W",
    price: 269_000,
    status: "available",
  },
  {
    id: "unt_ita0902020",
    projectId: projectId("prj_istertower1"),
    code: "IT-A-09-02",
    block: "A",
    rooms: 3,
    floor: 9,
    areaSqm: 90,
    orientation: "SE",
    price: 408_000,
    status: "available",
  },
  {
    id: "unt_itb0901021",
    projectId: projectId("prj_istertower1"),
    code: "IT-B-09-01",
    block: "B",
    rooms: 1,
    floor: 9,
    areaSqm: 37,
    orientation: "N",
    price: 186_000,
    status: "available",
  },
  {
    id: "unt_ita1007022",
    projectId: projectId("prj_istertower1"),
    code: "IT-A-10-07",
    block: "A",
    rooms: 2,
    floor: 10,
    areaSqm: 62,
    orientation: "SE",
    price: 300_000,
    status: "reserved",
  },
  {
    id: "unt_itb1005023",
    projectId: projectId("prj_istertower1"),
    code: "IT-B-10-05",
    block: "B",
    rooms: 3,
    floor: 10,
    areaSqm: 86,
    orientation: "NW",
    price: 390_000,
    status: "available",
  },
  {
    id: "unt_ita1107024",
    projectId: projectId("prj_istertower1"),
    code: "IT-A-11-07",
    block: "A",
    rooms: 2,
    floor: 11,
    areaSqm: 62,
    orientation: "S",
    price: 310_000,
    status: "sold",
  },
  {
    id: "unt_itb1104025",
    projectId: projectId("prj_istertower1"),
    code: "IT-B-11-04",
    block: "B",
    rooms: 2,
    floor: 11,
    areaSqm: 59,
    orientation: "E",
    price: 289_000,
    status: "available",
  },
  {
    /*
     * The unit the brief names.
     *
     * Two rooms, due south, still available, on a level high enough to hold the
     * view — and the last of its line that is. Everything a surface says about
     * it is derived from the session records like every other unit's figures;
     * what is arranged here is only that the arrangement is *possible*, which
     * is the difference between extending the synthetic model and faking a
     * screenshot.
     */
    id: "unt_ita1207026",
    projectId: projectId("prj_istertower1"),
    code: "IT-A-12-07",
    block: "A",
    rooms: 2,
    floor: 12,
    areaSqm: 63,
    orientation: "S",
    price: 319_000,
    status: "available",
  },
  {
    id: "unt_itb1206027",
    projectId: projectId("prj_istertower1"),
    code: "IT-B-12-06",
    block: "B",
    rooms: 4,
    floor: 12,
    areaSqm: 118,
    orientation: "W",
    price: 533_000,
    status: "available",
  },
  {
    id: "unt_ita1301028",
    projectId: projectId("prj_istertower1"),
    code: "IT-A-13-01",
    block: "A",
    rooms: 4,
    floor: 13,
    areaSqm: 126,
    orientation: "SW",
    price: 575_000,
    status: "available",
  },
  {
    id: "unt_itb1303029",
    projectId: projectId("prj_istertower1"),
    code: "IT-B-13-03",
    block: "B",
    rooms: 4,
    floor: 13,
    areaSqm: 122,
    orientation: "NE",
    price: 551_000,
    status: "reserved",
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
