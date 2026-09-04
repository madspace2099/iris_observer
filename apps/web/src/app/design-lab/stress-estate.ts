import "server-only";

import { credentialWord, installationAnswer } from "@/lib/madspace/format";
import type { ProjectSummary } from "@/lib/madspace/estate";
import {
  classifyHealth,
  classifyStates,
  heartbeatIsFresh,
  queueFill,
  HEALTH_LABEL,
  HEALTH_TONE,
  type SourceView,
} from "@/lib/sources/control-plane";
import type { SourceOperationsRow, SourceStatusRow } from "@observer/sources";

import type { EstateSource, LabEstate } from "./lab-data";

/**
 * AN ESTATE BIG ENOUGH TO BREAK A LAYOUT, AND IT TOUCHES NOTHING.
 *
 * The review estate is four projects and ten sources, which is the truth and is
 * not enough to judge a design that has to survive a portfolio. This builds
 * twelve projects and fifty installations in memory, for one render, and
 * returns them in the same `LabEstate` shape the real loader returns.
 *
 * ## Why this is not a second read model
 *
 * `lab-data.ts` says there is no fixture, and that stands: the REVIEW route is
 * still one real read, and every screenshot a founder looks at comes from it.
 * This is a separate module behind a separate route, it is never captured, and
 * nothing in the review package is rendered from it. It exists so that
 * `design-lab-stress.spec.ts` can assert that a layout holds at a size the real
 * estate cannot yet reach.
 *
 * ## It writes nothing
 *
 * No database call, no insert, no seed. The rows are objects that live for the
 * length of one request, so "do not modify production data" is guaranteed by
 * construction rather than by being careful. There is nothing here to clean up
 * and nothing that can leak into the estate the review is judged on.
 *
 * ## Every state the brief names
 *
 * The generator is not random. Each project is built to hold a named case, so a
 * failing assertion points at a state rather than at a seed:
 *
 *   - a project with NO sources, and one with exactly ONE
 *   - a project with twenty-two, which is where a grouped list stops fitting
 *   - a very long project name and a very long source name
 *   - never activated; activated but never connected; connected but never
 *     verified; connected and refusing events; healthy
 *   - quarantined, with the local and backend counters apart
 *   - a MISSING measurement (null) beside a ZERO one, because the surface draws
 *     them differently and a fixture that only had zeros would never prove it
 *   - suspended and archived, which are decisions rather than faults
 */

const ACCOUNT = "acct_stress_only";

/** Deliberately past the width any column reserves. */
const LONG_PROJECT =
  "RIVERSIDE QUARTER PHASE TWO — NORTH TOWER, PODIUM AND THE RESIDENTS' PAVILION";
const LONG_SOURCE =
  "Ground floor sales suite presentation machine, window bay, left-hand pedestal (spare)";

const INSTANT = "2026-09-03T19:13:00.000Z";
const OLD_INSTANT = "2026-08-02T06:20:00.000Z";

/** One case, named, so an assertion can say which one broke. */
interface Case {
  readonly label: string;
  readonly state?: string;
  readonly activated: boolean;
  readonly heartbeat: string | null;
  readonly verified: string | null;
  readonly queueEvents?: number | null;
  readonly oldestPending?: number | null;
  readonly quarantine?: number | null;
  readonly backendQuarantine?: number | null;
  readonly queueUsed?: number | null;
  readonly queueCeiling?: number | null;
}

const CASES: readonly Case[] = [
  { label: "Never activated", activated: false, heartbeat: null, verified: null },
  { label: "Activated, never connected", activated: true, heartbeat: null, verified: null },
  {
    /* Connected and delivering. The only case that reaches "Healthy". */
    label: "Healthy",
    activated: true,
    heartbeat: "fresh",
    verified: INSTANT,
    queueEvents: 0,
    oldestPending: 0,
    quarantine: 0,
    backendQuarantine: 0,
  },
  {
    /* Connected, and no event has ever proved the path. */
    label: "Connected, ingestion never verified",
    activated: true,
    heartbeat: "fresh",
    verified: null,
    queueEvents: 12,
    oldestPending: 45,
    quarantine: 0,
    backendQuarantine: 0,
  },
  {
    /* Refusing events: the one verdict that is a triangle. */
    label: "Ingestion rejected",
    activated: true,
    heartbeat: "fresh",
    verified: INSTANT,
    queueEvents: 4820,
    oldestPending: 61_200,
    quarantine: 91,
    backendQuarantine: 14,
  },
  {
    label: "Quarantined, backend only",
    activated: true,
    heartbeat: "fresh",
    verified: INSTANT,
    queueEvents: 3,
    oldestPending: 8,
    quarantine: 0,
    backendQuarantine: 7,
  },
  {
    /* Heard from a month ago and silent since. */
    label: "Offline",
    activated: true,
    heartbeat: OLD_INSTANT,
    verified: OLD_INSTANT,
    queueEvents: 128,
    oldestPending: 240,
    quarantine: 1,
    backendQuarantine: null,
  },
  {
    /*
     * NOTHING MEASURED. Every counter null rather than zero, which is the pair
     * the surface has to keep apart: this machine has not told us its outbox is
     * empty, and the row must not print a confident nought.
     */
    label: "Missing measurement",
    activated: true,
    heartbeat: "fresh",
    verified: null,
    queueEvents: null,
    oldestPending: null,
    quarantine: null,
    backendQuarantine: null,
    queueUsed: null,
    queueCeiling: null,
  },
  {
    /* ZERO measured, beside the case above. Both are true and they differ. */
    label: "Zero measurement",
    activated: true,
    heartbeat: "fresh",
    verified: INSTANT,
    queueEvents: 0,
    oldestPending: 0,
    quarantine: 0,
    backendQuarantine: 0,
    queueUsed: 0,
    queueCeiling: 8_388_608,
  },
  {
    label: "Suspended",
    state: "suspended",
    activated: true,
    heartbeat: "fresh",
    verified: INSTANT,
  },
  { label: "Archived", state: "archived", activated: true, heartbeat: OLD_INSTANT, verified: null },
];

const ENVIRONMENTS = ["production", "staging", "development"] as const;
const TYPES = ["showroom_ue5", "showroom_ue5", "web"] as const;

function statusRow(
  id: string,
  project: string,
  label: string,
  index: number,
  item: Case,
): SourceStatusRow {
  return {
    source_id: id,
    project_id: project,
    source_type: TYPES[index % TYPES.length] ?? "showroom_ue5",
    environment: ENVIRONMENTS[index % ENVIRONMENTS.length] ?? "production",
    display_label: label,
    state: item.state ?? "active",
    last_seen_at: item.heartbeat === "fresh" ? INSTANT : item.heartbeat,
    last_ingest_at: item.verified,
    observed_app_version: "1.4.2",
    observed_plugin: "0.9.1",
    observed_build_id: "b-40199",
    observed_environment: ENVIRONMENTS[index % ENVIRONMENTS.length] ?? "production",
    created_at: OLD_INSTANT,
  };
}

function operationsRow(
  id: string,
  project: string,
  label: string,
  index: number,
  item: Case,
  now: Date,
): SourceOperationsRow | null {
  /* Null, not an empty row: a machine never heard from has no operations row. */
  if (item.heartbeat === null && !item.activated) return null;
  if (item.heartbeat === null) return null;

  const heartbeat =
    item.heartbeat === "fresh" ? new Date(now.getTime() - 60_000).toISOString() : item.heartbeat;

  return {
    source_id: id,
    project_id: project,
    source_type: TYPES[index % TYPES.length] ?? "showroom_ue5",
    environment: ENVIRONMENTS[index % ENVIRONMENTS.length] ?? "production",
    display_label: label,
    state: item.state ?? "active",
    last_seen_at: heartbeat,
    last_heartbeat_at: heartbeat,
    ingestion_verified_at: item.verified,
    observed_app_version: "1.4.2",
    observed_plugin: "0.9.1",
    observed_build_id: "b-40199",
    observed_engine: "UE 5.4",
    observed_environment: ENVIRONMENTS[index % ENVIRONMENTS.length] ?? "production",
    environment_mismatch: false,
    queue_event_count: item.queueEvents ?? null,
    queue_bytes_used: item.queueUsed ?? null,
    queue_bytes_ceiling: item.queueCeiling ?? null,
    oldest_pending_age_seconds: item.oldestPending ?? null,
    quarantine_count: item.quarantine ?? null,
    validation_failure_count: null,
    capacity_refusal_count: null,
    backend_quarantine_count: item.backendQuarantine ?? null,
    last_error_code: (item.quarantine ?? 0) > 0 ? "ingest_capacity_refused" : null,
  };
}

function view(
  id: string,
  project: string,
  label: string,
  index: number,
  item: Case,
  now: Date,
): SourceView {
  const status = statusRow(id, project, label, index, item);
  const operations = operationsRow(id, project, label, index, item, now);
  /* The credential row is only ever read for its existence here. */
  const states = classifyStates(item.activated ? ({ state: "active" } as never) : null, operations);
  const fresh = heartbeatIsFresh(operations?.last_heartbeat_at ?? null, now);

  return {
    status,
    operations,
    states,
    health: classifyHealth(status, operations, states, fresh),
    heartbeatFresh: fresh,
    queueFillPercent: queueFill(
      operations?.queue_bytes_used ?? null,
      operations?.queue_bytes_ceiling ?? null,
    ),
  };
}

/** Twelve projects, and how many installations each one holds. */
const SHAPE: readonly { readonly name: string; readonly sources: number }[] = [
  { name: "NORTHGATE YARD", sources: 0 },
  { name: "HARBOR VIEW RESIDENCE", sources: 1 },
  { name: LONG_PROJECT, sources: 22 },
  { name: "ISTER TOWER", sources: 4 },
  { name: "RIVERSIDE QUARTER", sources: 3 },
  { name: "CANAL HOUSE", sources: 3 },
  { name: "OLD BREWERY LOFTS", sources: 3 },
  { name: "PARKSIDE TERRACES", sources: 3 },
  { name: "STATION APPROACH", sources: 3 },
  { name: "MERIDIAN COURT", sources: 3 },
  { name: "WESTGATE PAVILION", sources: 1 },
  { name: "LAKESIDE ANNEXE", sources: 1 },
];

/**
 * The estate the stress route renders. Fifty installations across twelve
 * projects, none of which exists anywhere but in this return value.
 */
export function stressEstate(now: Date): LabEstate {
  const estate: EstateSource[] = [];
  const projects: ProjectSummary[] = [];

  SHAPE.forEach((project, projectIndex) => {
    const projectId = `stress-project-${String(projectIndex).padStart(2, "0")}`;
    const rows: SourceView[] = [];

    for (let index = 0; index < project.sources; index += 1) {
      const item = CASES[index % CASES.length]!;
      const id = `${projectId}-source-${String(index).padStart(2, "0")}`;
      /* One deliberately unreasonable label, in the project that is already the widest. */
      const label =
        project.name === LONG_PROJECT && index === 0
          ? LONG_SOURCE
          : `${item.label} ${String(index + 1)}`;
      const built = view(id, projectId, label, index, item, now);
      rows.push(built);
      estate.push({ view: built, projectName: project.name });
    }

    projects.push({
      name: project.name,
      status: "active",
      projectId,
      sourceCount: rows.length,
      connectedCount: rows.filter((row) => row.states.connected).length,
      verifiedCount: rows.filter((row) => row.states.ingestionVerified).length,
      lastActivity:
        rows.find((row) => row.operations?.last_heartbeat_at != null)?.operations
          ?.last_heartbeat_at ?? null,
    });
  });

  /* The screens that show ONE source get the busiest one, so their layouts are
     stressed too rather than being handed the quietest row in the estate. */
  const focus = estate.find((row) => row.view.health === "attention") ?? estate[0] ?? null;
  if (focus === null) throw new Error("stress estate built no sources");

  const project = projects.find((row) => row.projectId === focus.view.status.project_id) ?? null;

  return {
    accountName: `${ACCOUNT} (stress fixture — not a real account)`,
    local: true,
    projects,
    project,
    sources: estate
      .filter((row) => row.view.status.project_id === focus.view.status.project_id)
      .map((row) => row.view),
    estate,
    source: {
      view: focus.view,
      credential: null,
      answer: installationAnswer(focus.view, now),
      healthLabel: HEALTH_LABEL[focus.view.health],
      healthTone: HEALTH_TONE[focus.view.health],
      projectName: focus.projectName,
      credentialLabel: credentialWord("active").word,
      now,
    },
    /*
     * Diagnostics selects its own sections from a read this fixture does not
     * perform, so it is handed the counts it can honestly derive and empty
     * bands. The stress route does not claim to exercise Diagnostics' selection
     * logic — it exercises whether the LAYOUTS hold at fifty rows, and the two
     * list screens are where fifty rows land.
     */
    diagnostics: {
      total: estate.length,
      attention: [],
      heartbeats: [],
      verifications: [],
      pressure: [],
      unmeasured: estate.filter((row) => row.view.operations?.queue_event_count == null).length,
      quarantines: [],
      errors: [],
    },
    activation: {
      credential: null,
      state: credentialWord("active").word,
      tone: "good",
      sampleCode: "obs.SAMPLEonlyNOTaREALcode.thisVALUEisDRAWNforREVIEWandGRANTSnothing",
      isSample: true,
    },
    now,
  };
}
