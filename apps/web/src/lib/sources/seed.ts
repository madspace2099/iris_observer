import "server-only";

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { ObserverAdmin } from "@observer/sources";

import { CONTROL_PLANE_ACCOUNT } from "./control-plane";
import { observerLocalDirectory } from "./local-db";

/**
 * THE DEMONSTRATION ESTATE — one project and one source, created through the
 * real services and through nothing else.
 *
 * ## Why this exists at all
 *
 * The operations screens have to describe something. The dishonest way to give
 * them something is a fixture module the screens read instead of the database,
 * which produces a surface that looks right and is describing nothing. The
 * honest way is to call `createProject` and `createSource` — the same two
 * operations an administrator will call when the admin surface exists — and let
 * every screen read the rows they wrote.
 *
 * So there is no seed data in this file. There are two names, and the rest is
 * the control plane's own work.
 *
 * ## The source is created NOT ACTIVATED, deliberately
 *
 * No code is issued here, nothing is activated, nothing heartbeats. A freshly
 * created source is the first of the five states the lifecycle passes through,
 * and it is the one a seed is most tempted to skip past — a demonstration that
 * starts at "healthy" can never show an operator what "awaiting first
 * heartbeat" looks like, which is the state a real installation spends its
 * first hour in. Walking the remaining four is `demo-actions.ts`, one operator
 * press at a time.
 *
 * ## Idempotent by READING, and what that costs
 *
 * This runs on every render of a screen that needs the estate, and the dev
 * server restarts constantly, so a second ISTER TOWER per reload is the obvious
 * bug to design against. Nothing here writes a "seeded" flag: the first thing
 * it does is read the estate and return when it is already there.
 *
 * The read is `sourceOperations` with a null project, which is the only facade
 * that spans an account — `observer_source_operations` left-joins from
 * `project_sources`, so it lists every source including one that has never been
 * heard from, which is exactly the source this file creates. A source carries
 * its `project_id`, so finding `Main Showroom PC` finds ISTER TOWER too.
 *
 * ### The honest gap, stated rather than papered over
 *
 * **There is no facade that lists projects.** `sourceStatus` takes a project
 * id, `sourceOperations` returns sources, and `ObserverAdmin` exposes nothing
 * else that reads. So a project which exists and holds NO source is invisible
 * to every read this layer has — and that is precisely the state left behind if
 * the process dies between `createProject` and `createSource`.
 *
 * The alternative to handling it is a duplicate ISTER TOWER on the next reload,
 * so the id of the project this file creates is recorded in a small JSON file
 * beside the database, written the moment the project exists. It is a ledger,
 * not a flag: it records an identifier that cannot be re-derived, it is never
 * trusted over the database, and a recorded id that the database does not
 * recognise is discarded rather than believed.
 *
 * The trade-off is that the ledger and the database must share a lifetime.
 * They do, because both live under `.observer-local/` — deleting that directory
 * resets both together, which is the documented reset. Deleting only the ledger
 * leaves a project that cannot be found again, and `projects_slug_per_account`
 * turns that into a loud unique-violation rather than a silent second estate.
 *
 * Adding a `projectsForAccount` facade would remove the ledger entirely. That
 * is a migration, and a migration is out of scope here; this file is written so
 * that the day it lands, {@link locate} grows one branch and the ledger goes.
 */

/** The project this demonstration administers. Exact, because screens assert on it. */
export const DEMONSTRATION_PROJECT_NAME = "ISTER TOWER";

/**
 * The project's slug, and it is load-bearing rather than decoration.
 *
 * `projects_slug_per_account` is a unique index, so the slug is the only thing
 * in the system that can make a second ISTER TOWER impossible at the database
 * rather than impossible by our care. A null slug would make the duplicate
 * legal and leave the whole guarantee resting on this file being correct.
 */
export const DEMONSTRATION_PROJECT_SLUG = "ister-tower";

/** The one source, as an operator will read it in the estate. */
export const DEMONSTRATION_SOURCE_LABEL = "Main Showroom PC";

export const DEMONSTRATION_SOURCE_TYPE = "showroom_ue5" as const;

/**
 * The source's AUTHORITATIVE environment, assigned at registration.
 *
 * Never what a client reports. A showroom PC is production whatever the build
 * running on it believes it is, and the divergence between the two is a fact
 * the operations screens exist to show rather than a discrepancy to smooth
 * over here.
 */
export const DEMONSTRATION_ENVIRONMENT = "production" as const;

/** The two identifiers every screen and every demonstration action needs. */
export interface DemonstrationEstate {
  readonly projectId: string;
  readonly sourceId: string;
}

/* --- the ledger ------------------------------------------------------------------ */

const LEDGER_FILE = "demonstration-estate.json";

/**
 * Canonical 8-4-4-4-12, matching what `ObserverAdmin` will accept.
 *
 * The ledger is a file on a developer's disk and is read as untrusted input for
 * that reason alone: a half-written or hand-edited value should be discarded
 * here, where it can be, rather than travel to a facade as a malformed uuid.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Ledger {
  readonly project_id: string | null;
  readonly source_id: string | null;
}

const EMPTY_LEDGER: Ledger = { project_id: null, source_id: null };

function ledgerPath(): string {
  return join(observerLocalDirectory(), LEDGER_FILE);
}

function uuidOrNull(value: unknown): string | null {
  return typeof value === "string" && UUID.test(value) ? value : null;
}

/**
 * The recorded ids, or none.
 *
 * Every failure is the same answer: no file on a fresh clone, unreadable JSON
 * after an interrupted write, a value somebody edited. None of them is worth
 * distinguishing, because the recovery is identical in all three — fall back to
 * the database, and rewrite the ledger from what it says.
 */
function readLedger(): Ledger {
  let raw: string;
  try {
    raw = readFileSync(ledgerPath(), "utf8");
  } catch {
    return EMPTY_LEDGER;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return EMPTY_LEDGER;
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return EMPTY_LEDGER;
  const record = parsed as Record<string, unknown>;
  return {
    project_id: uuidOrNull(record["project_id"]),
    source_id: uuidOrNull(record["source_id"]),
  };
}

function writeLedger(ledger: Ledger): void {
  mkdirSync(observerLocalDirectory(), { recursive: true });
  writeFileSync(ledgerPath(), `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
}

/**
 * Record what the database just told us, and only when it differs.
 *
 * The comparison is not a micro-optimisation. This function is reached on every
 * render of every screen that needs the estate, and writing an identical file
 * each time would rewrite a developer's disk a few times a second for no
 * change — and would put a file write in the path of a page that is otherwise
 * only reading.
 */
function rememberLedger(estate: DemonstrationEstate): void {
  const current = readLedger();
  if (current.project_id === estate.projectId && current.source_id === estate.sourceId) return;
  writeLedger({ project_id: estate.projectId, source_id: estate.sourceId });
}

/* --- reading the estate ----------------------------------------------------------- */

/**
 * The estate as the database has it, or null.
 *
 * `sourceOperations` with a null project is the account-wide read, and the one
 * facade that can answer "does this source exist anywhere in the account"
 * without already knowing which project to look in.
 *
 * An archived source is skipped rather than matched. Archival is terminal — a
 * resumed archive would resurrect a credential lifecycle somebody deliberately
 * ended — so treating an archived `Main Showroom PC` as the estate would wedge
 * the demonstration permanently behind a source that can never activate again.
 * Skipping it lets the next call create a live replacement, once.
 */
async function locate(admin: ObserverAdmin): Promise<DemonstrationEstate | null> {
  const operations = await admin.sourceOperations({
    account: CONTROL_PLANE_ACCOUNT,
    project: null,
  });
  if (!operations.ok) return null;

  for (const row of operations.value) {
    if (row.display_label !== DEMONSTRATION_SOURCE_LABEL) continue;
    if (row.source_type !== DEMONSTRATION_SOURCE_TYPE) continue;
    if (row.state === "archived") continue;
    return { projectId: row.project_id, sourceId: row.source_id };
  }
  return null;
}

/**
 * The estate, ensured and then returned.
 *
 * What the screens and the demonstration actions call when they need the two
 * identifiers rather than merely the guarantee. Null means the control plane
 * answered but holds nothing — a caller should say the estate is unavailable
 * rather than render an empty one as though it were an empty estate.
 */
export async function demonstrationEstate(
  admin: ObserverAdmin,
): Promise<DemonstrationEstate | null> {
  await ensureDemonstrationEstate(admin);
  return locate(admin);
}

/* --- creating what is missing ------------------------------------------------------ */

/**
 * Create the source under a project id we believe in, or say the project is gone.
 *
 * Null means and only means `unknown_project`, which the service returns for a
 * project that does not exist, belongs to another account, or is archived. All
 * three have the same recovery here — the recorded id is worthless, create a
 * fresh project — and the service conflates them deliberately, so this does not
 * try to tell them apart.
 *
 * Any other refusal is a bug in this file's arguments rather than a state of
 * the world, and is thrown so it is seen at the desk that wrote it.
 */
async function attachSource(
  admin: ObserverAdmin,
  projectId: string,
): Promise<DemonstrationEstate | null> {
  const created = await admin.createSource({
    account: CONTROL_PLANE_ACCOUNT,
    project: projectId,
    type: DEMONSTRATION_SOURCE_TYPE,
    environment: DEMONSTRATION_ENVIRONMENT,
    label: DEMONSTRATION_SOURCE_LABEL,
  });

  if (created.ok) return { projectId, sourceId: created.value };
  if (created.refusal.code === "unknown_project") return null;

  throw new Error(
    `The demonstration source could not be created: ${created.refusal.code}` +
      (created.refusal.field === null ? "" : ` (${created.refusal.field})`),
  );
}

async function createDemonstrationProject(admin: ObserverAdmin): Promise<string> {
  let created;
  try {
    created = await admin.createProject({
      account: CONTROL_PLANE_ACCOUNT,
      name: DEMONSTRATION_PROJECT_NAME,
      slug: DEMONSTRATION_PROJECT_SLUG,
    });
  } catch (error: unknown) {
    /*
     * `createProject` documents that a slug already taken raises rather than
     * refuses, and the raise is the unique index doing its job. Reaching it
     * means the project exists but its id is no longer recorded — the one
     * situation this layer genuinely cannot recover from, because no facade
     * lists projects and the id cannot be re-derived from a name.
     *
     * Said in a sentence with the fix in it, rather than as a constraint-
     * violation stack that names a Postgres index nobody outside this file has
     * heard of.
     */
    throw new Error(
      `A project with the slug "${DEMONSTRATION_PROJECT_SLUG}" already exists under ` +
        `${CONTROL_PLANE_ACCOUNT}, but ${LEDGER_FILE} no longer records its id, and no facade ` +
        "lists projects, so it cannot be found again. Delete .observer-local/ to rebuild the " +
        "demonstration estate from nothing.",
      { cause: error },
    );
  }

  if (!created.ok) {
    throw new Error(
      `The demonstration project could not be created: ${created.refusal.code}` +
        (created.refusal.field === null ? "" : ` (${created.refusal.field})`),
    );
  }
  return created.value;
}

async function seed(admin: ObserverAdmin): Promise<void> {
  const existing = await locate(admin);
  if (existing !== null) {
    rememberLedger(existing);
    return;
  }

  /*
   * The database has no source with this label, so either there is no project
   * either, or a previous run created one and died before it could create the
   * source. The ledger is the only thing that can tell the second case from the
   * first, and `attachSource` is what proves it: a recorded id that the service
   * refuses as `unknown_project` was never real, or is not any more.
   */
  const recorded = readLedger().project_id;
  if (recorded !== null) {
    const attached = await attachSource(admin, recorded);
    if (attached !== null) {
      rememberLedger(attached);
      return;
    }
  }

  const projectId = await createDemonstrationProject(admin);

  /*
   * Recorded BEFORE the source is created, and that ordering is the whole point
   * of the ledger. A crash in the next three lines is exactly the failure that
   * leaves an unfindable project behind; writing the id first means the next
   * call finds it rather than creating its twin.
   */
  writeLedger({ project_id: projectId, source_id: null });

  const attached = await attachSource(admin, projectId);
  if (attached === null) {
    /*
     * The project was created one statement ago and the service says it does
     * not exist. Not a state to recover from silently — something else is
     * writing to this account, or the two calls reached different databases.
     */
    throw new Error(
      "The demonstration project was created but immediately refused as unknown. " +
        "The control plane is not answering consistently.",
    );
  }
  rememberLedger(attached);
}

/**
 * One seed at a time within this process.
 *
 * A page render fans out into several server components and several parallel
 * requests, all of which want the estate, and none of the reads above is atomic
 * with the writes below them. Two concurrent first calls would both find
 * nothing and both create a project; the slug's unique index would refuse the
 * second, which is the right outcome but arrives as an exception on a screen.
 *
 * A module-level promise collapses them into one call, and is cleared when it
 * settles so that a failure is retried on the next request rather than cached
 * for the life of the module. It is not `globalThis` state: hot reload replaces
 * the module and the next call simply reads the database again, which is the
 * behaviour this whole file is built on.
 */
let inFlight: Promise<void> | null = null;

async function seedOnce(admin: ObserverAdmin): Promise<void> {
  try {
    await seed(admin);
  } finally {
    inFlight = null;
  }
}

/**
 * Ensure the demonstration estate exists, creating only what is missing.
 *
 * Throws when the control plane cannot be made to hold it — a caller rendering
 * a screen should catch that and say so in words, exactly as `controlPlane()`
 * turns an unopenable database into an absence a reader can act on. Returning
 * quietly would leave a screen with nothing on it and no explanation, which is
 * the one outcome worse than an error.
 */
export async function ensureDemonstrationEstate(admin: ObserverAdmin): Promise<void> {
  inFlight ??= seedOnce(admin);
  await inFlight;
}
