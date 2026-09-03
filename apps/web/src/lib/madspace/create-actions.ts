"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { ENVIRONMENTS } from "@observer/contracts/ue5";
import type { AdminRefusal, ObserverAdmin } from "@observer/sources";

import { currentViewer } from "@/lib/session";
import { CONTROL_PLANE_ACCOUNT, controlPlane } from "@/lib/sources/control-plane";

/**
 * REGISTERING A PROJECT AND REGISTERING A SOURCE.
 *
 * The only two writes on this surface that bring a row into existence, and the
 * only two places an operator's typing reaches `ObserverAdmin`. Everything else
 * under `/madspace` reads.
 *
 * ## Every refusal is translated before it is shown
 *
 * `ObserverAdmin` answers with `{ ok: false, refusal: { code, field } }`, and
 * the codes are deliberately coarse — `unknown_project` means "no such
 * project", "another account's project" and "archived" all at once, because
 * telling those apart would turn this form into an existence oracle for
 * somebody else's estate (see `admin.ts`). That coarseness is correct at the
 * service boundary and useless at a text field, so every code is mapped here to
 * a sentence naming the thing the operator can actually do next.
 *
 * Three things never reach the reader: the code itself, any identifier, and the
 * word "account". The first two are support vocabulary; the third names a
 * concept this surface deliberately does not expose — there is exactly one
 * estate here and `CONTROL_PLANE_ACCOUNT` is not the operator's to choose, so a
 * message mentioning it would send them looking for a control that is not
 * there.
 *
 * ## Every action re-authorises
 *
 * A server action is an HTTP endpoint. These create rows, so each one checks
 * the viewer's role before doing anything, and the account is never a
 * parameter. `demo-actions.ts` makes the same argument at greater length.
 */

/* --- what the forms get back --------------------------------------------------- */

/**
 * The answer a form renders, and the operator's own words handed back with it.
 *
 * Returning the typed values matters more than it looks: this is a server
 * action, so a refusal is a round trip, and a form that comes back empty has
 * punished the operator for the refusal it just issued.
 *
 * `field` is the name of the control the sentence belongs beside. Null means it
 * belongs to the form as a whole — a control-plane failure is not something a
 * text field did wrong, and pinning it to one would send the operator to edit a
 * value that was fine.
 */
export interface CreateProjectState {
  readonly problem: string | null;
  readonly field: "name" | null;
  readonly name: string;
}

export interface CreateSourceState {
  readonly problem: string | null;
  readonly field: "label" | "environment" | null;
  readonly label: string;
  readonly environment: string;
}

/*
 * The starting states live in the form components rather than here. A
 * "use server" module may export only async functions — every other export
 * becomes a callable endpoint or a build error — and the two interfaces above
 * are erased at compile time, so they cost nothing while a `const` would not
 * compile at all.
 */

/**
 * The one source type this control plane can register.
 *
 * `SOURCE_TYPES` holds five, and the other four — WEBIRIS, CRM, communication
 * and manual admin — are schema values with no activation endpoint, no
 * heartbeat, no ingestion path and no operations row behind them. A source
 * created as one of them would be registered and then permanently stuck at
 * "never connected", which is a row that looks like a fault and is really a
 * product that does not exist yet.
 *
 * The form therefore OMITS them rather than showing them disabled. A disabled
 * "CRM" option is a roadmap promise rendered in the interface, and this
 * repository is not making one. The type is fixed on the server rather than
 * read from the request for the same reason: a crafted POST should not be able
 * to register something the product cannot operate.
 */
const REGISTRABLE_SOURCE_TYPE = "showroom_ue5" as const;

/* --- reading the form ------------------------------------------------------------ */

/** One field, as a trimmed string. FormData yields File for a file input; this is not one. */
function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Where every screen under `/madspace` is re-read from.
 *
 * A new project changes the estate the projects list counts, and a new source
 * changes the tallies on the project it landed in. Revalidating the layout
 * covers both without either action needing to know which screens exist.
 */
const OPERATIONS_SURFACE = "/madspace";

/* --- authorisation ----------------------------------------------------------------- */

type Estate = { readonly ok: true; readonly admin: ObserverAdmin } | { readonly problem: string };

/**
 * The estate, or the reason there is not one.
 *
 * `currentViewer` rather than `requireViewer`: a redirect is the right answer
 * for a page and a baffling one for a button, which should say why nothing
 * happened. The page above these forms does its own `requireViewer` check —
 * this is the second, and it is the one that matters, because the action can be
 * called without the page ever having rendered.
 */
async function estate(): Promise<Estate> {
  const viewer = await currentViewer();
  if (viewer === null) {
    return { problem: "Sign in as a MADSPACE administrator before creating anything." };
  }
  if (viewer.role !== "madspace_admin") {
    return { problem: "Only a MADSPACE administrator may register projects and sources." };
  }

  const plane = await controlPlane();
  if (!plane.ok) {
    return {
      problem:
        plane.absence.kind === "not_enabled"
          ? "This deployment has no control plane configured, so there is nowhere to register anything. Nothing was created."
          : `The control plane would not open, so nothing was created. It said: ${plane.absence.detail}`,
    };
  }

  return { ok: true, admin: plane.admin };
}

/* --- the slug, derived rather than asked for ---------------------------------------- */

/**
 * A URL-safe short name, built from the project's name.
 *
 * `ObserverAdmin.createProject` takes a slug, and the operator is never asked
 * for one. It is display metadata — the schema comment says so, and nothing in
 * this product routes by it — so asking for it would make an operator invent a
 * second name for the same building and then wonder which one is real.
 *
 * NFKD then stripping the combining marks, so a Hungarian name survives:
 * "Óbuda Rakpart" becomes `obuda-rakpart` rather than `-buda-rakpart`. A name
 * with no Latin letters or digits at all yields nothing, and this returns null
 * rather than a placeholder — the column is nullable, and a slug of `project-1`
 * that nobody chose is invented data.
 */
function slugFrom(name: string): string | null {
  const slug = name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 120)
    .replace(/^-+|-+$/g, "");
  return slug.length === 0 ? null : slug;
}

/* --- translating a refusal ----------------------------------------------------------- */

/** The sentence shown when a code arrives that this screen cannot produce. */
const UNEXPECTED =
  "The control plane refused this, and for a reason this screen does not know how to explain. Nothing was created. Try again, and tell MADSPACE support what you were registering if it happens twice.";

function projectRefusal(refusal: AdminRefusal): { field: "name" | null; problem: string } {
  if (refusal.code === "invalid_input") {
    if (refusal.field === "name") {
      return {
        field: "name",
        problem:
          "That name cannot be used. Give the project a name of at least one visible character and no more than two hundred.",
      };
    }
    if (refusal.field === "slug") {
      return {
        field: "name",
        problem:
          "That name has no letters or digits in it, so no short name could be built from it. Include at least one.",
      };
    }
    return {
      field: null,
      problem:
        "This deployment is not configured to administer an estate, so nothing was created. That is a configuration problem rather than something you typed.",
    };
  }
  return { field: null, problem: UNEXPECTED };
}

function sourceRefusal(refusal: AdminRefusal): {
  field: "label" | "environment" | null;
  problem: string;
} {
  if (refusal.code === "unknown_project") {
    return {
      field: null,
      problem:
        "This project is no longer open to new sources. It may have been archived since this page was loaded. Nothing was created. Go back to Projects and open it again.",
    };
  }
  if (refusal.code === "invalid_input") {
    if (refusal.field === "label") {
      return {
        field: "label",
        problem:
          "That display name cannot be used. Give the installation a name of at least one visible character and no more than two hundred.",
      };
    }
    if (refusal.field === "environment") {
      return {
        field: "environment",
        problem: "Choose one of the four environments before creating the source.",
      };
    }
    if (refusal.field === "project") {
      return {
        field: null,
        problem:
          "This page was opened with a project reference the control plane cannot read. Nothing was created. Go back to Projects and open the project again.",
      };
    }
    return {
      field: null,
      problem:
        "This deployment is not configured to administer an estate, so nothing was created. That is a configuration problem rather than something you typed.",
    };
  }
  return { field: null, problem: UNEXPECTED };
}

/* --- 1. create a project -------------------------------------------------------------- */

/**
 * Register a project, then open it.
 *
 * The slug collision is checked BEFORE the write and caught again after it, and
 * both halves are needed. `createProject` documents that a slug already taken
 * within the account raises a unique-violation rather than returning a refusal
 * — deliberately, because interpreting a driver's error code there would mean
 * one branch for PGlite and another for PostgREST. That leaves the readable
 * message to be produced here, and the pre-check is what produces it in the
 * ordinary case: the operator sees a sentence beside the name field instead of
 * an unhandled exception page. The `catch` covers the narrow race where two
 * operators submit the same name between the read and the insert.
 */
export async function createProjectAction(
  _previous: CreateProjectState,
  form: FormData,
): Promise<CreateProjectState> {
  const name = text(form, "name");
  const refuse = (problem: string, field: "name" | null = null): CreateProjectState => ({
    problem,
    field,
    name,
  });

  if (name.length === 0) {
    return refuse("Give the project a name before creating it.", "name");
  }
  if (name.length > 200) {
    return refuse(
      "That name is longer than two hundred characters. Shorten it to something the estate is actually known by.",
      "name",
    );
  }

  const opened = await estate();
  if (!("ok" in opened)) return refuse(opened.problem);

  const slug = slugFrom(name);

  const existing = await opened.admin.projectsForAccount({ account: CONTROL_PLANE_ACCOUNT });
  if (existing.ok && slug !== null && existing.value.some((row) => row.slug === slug)) {
    return refuse(
      "A project with a very similar name is already registered here. Choose a name that differs by more than spacing or punctuation.",
      "name",
    );
  }

  let created;
  try {
    created = await opened.admin.createProject({
      account: CONTROL_PLANE_ACCOUNT,
      name,
      slug,
    });
  } catch {
    /*
     * The unique violation, arriving as an exception because the service layer
     * declines to interpret driver error codes. Nothing about the caught value
     * is shown: a Postgres error message quotes the row it rejected, which on
     * this path is the operator's own typing plus an identifier.
     */
    return refuse(
      "A project with a very similar name is already registered here. Choose a name that differs by more than spacing or punctuation.",
      "name",
    );
  }

  if (!created.ok) {
    const translated = projectRefusal(created.refusal);
    return refuse(translated.problem, translated.field);
  }

  revalidatePath(OPERATIONS_SURFACE, "layout");
  /*
   * Straight into the project that was just made, rather than back to the list.
   * The next thing an operator does after creating a project is register a
   * source in it, and that button is on the project screen.
   */
  redirect(`/madspace/projects/${created.value}`);
}

/* --- 2. create a source ----------------------------------------------------------------- */

/**
 * Register an installation under a project, then open it.
 *
 * The project comes from a hidden field rather than an argument because the
 * form posts it; it is validated by `ObserverAdmin` — which insists on a
 * canonical UUID and then scopes the insert to this account's ACTIVE projects —
 * so a tampered value is refused there rather than trusted here.
 *
 * Environment is the one field on this form with a consequence that cannot be
 * undone from the installation. It is registered as authoritative: a build that
 * later reports something else does not change it, it is recorded as a
 * mismatch. So it is required, has no default, and the form says why.
 */
export async function createSourceAction(
  _previous: CreateSourceState,
  form: FormData,
): Promise<CreateSourceState> {
  const projectId = text(form, "project");
  const label = text(form, "label");
  const environment = text(form, "environment");
  const refuse = (
    problem: string,
    field: "label" | "environment" | null = null,
  ): CreateSourceState => ({ problem, field, label, environment });

  if (label.length === 0) {
    return refuse("Give the installation a display name before creating it.", "label");
  }
  if (label.length > 200) {
    return refuse(
      "That display name is longer than two hundred characters. Shorten it to something an operator would say out loud.",
      "label",
    );
  }
  if (!(ENVIRONMENTS as readonly string[]).includes(environment)) {
    return refuse(
      "Choose the environment this installation runs in. It cannot be changed from the installation afterwards.",
      "environment",
    );
  }

  const opened = await estate();
  if (!("ok" in opened)) return refuse(opened.problem);

  const created = await opened.admin.createSource({
    account: CONTROL_PLANE_ACCOUNT,
    project: projectId,
    type: REGISTRABLE_SOURCE_TYPE,
    /*
     * Narrowed by the membership test above rather than by a cast at the call
     * site, so the check and the type agree by construction.
     */
    environment: environment as (typeof ENVIRONMENTS)[number],
    label,
  });

  if (!created.ok) {
    const translated = sourceRefusal(created.refusal);
    return refuse(translated.problem, translated.field);
  }

  revalidatePath(OPERATIONS_SURFACE, "layout");
  /*
   * Into the source, not back to the project. A freshly registered source needs
   * an activation code before it can do anything, and that is the next screen.
   */
  redirect(`/madspace/sources/${created.value}`);
}
