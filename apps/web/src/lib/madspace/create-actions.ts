"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { ENVIRONMENTS } from "@observer/contracts/ue5";
import {
  PROJECT_SLUG,
  PepperMisconfiguredError,
  RESERVED_TENANT_SLUGS,
  TENANT_SLUG,
  assertPeppersUsable,
  isCurrency,
  isLocale,
  isTimeZone,
  projectDirectoryAdmin,
  type AdminRefusal,
  type ObserverAdmin,
} from "@observer/sources";

import { forgetDirectoryMemo } from "@/lib/directory/live";
import { localeFits, timeZoneFits } from "@/lib/madspace/slug";
import { isSyntheticTenantSlug } from "@/lib/repository";
import { currentViewer } from "@/lib/session";
import { CONTROL_PLANE_ACCOUNT, controlPlane } from "@/lib/sources/control-plane";
import { observerDepsAsync } from "@/lib/sources/deps";

/**
 * ONBOARDING A CLIENT AND REGISTERING A SOURCE.
 *
 * The writes on this surface that bring a project or a source into existence,
 * and the places an operator's typing reaches `ObserverAdmin` for them: the
 * onboarding wizard's one press, and a further source under an existing
 * project.
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

/* --- translating a refusal ----------------------------------------------------------- */

/** The sentence shown when a code arrives that this screen cannot produce. */
const UNEXPECTED =
  "The control plane refused this, and for a reason this screen does not know how to explain. Nothing was created. Try again, and tell MADSPACE support what you were registering if it happens twice.";

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

/* --- 1. onboard a client: developer, project, source and code in one write ------------ */

/**
 * What the onboarding wizard sends: the four steps' fields, as typed.
 *
 * Plain strings rather than a form: the wizard holds them across four
 * panels and posts once. Every one is validated here again: the wizard is not
 * a gate, and this is an HTTP endpoint.
 */
export interface OnboardInput {
  /** Step 1.1. The developer's address segment, lowercased: `/client-482/...`. */
  readonly client: string;
  /** Step 1.2. */
  readonly projectName: string;
  /** Step 1.2, the "Domain": the project's address segment, fixed once created. */
  readonly projectSlug: string;
  readonly currency: string;
  readonly locale: string;
  readonly timeZone: string;
  /** Step 1.3. */
  readonly sourceLabel: string;
  readonly environment: string;
}

/** The step whose field a refusal belongs to: 1 client, 2 project, 3 source. */
type OnboardStep = 1 | 2 | 3;

const PROJECT_TAKEN =
  "A project with that domain is already registered here. Choose another domain.";

/**
 * Onboard a client in one press: developer, project, settings, source, code.
 *
 * Akhilesh's "Client & Engine Onboarding" (ADR-0044), on the services the four
 * separate screens already use. NOTHING is written until every field has
 * passed, the operator is authorised, the control plane is open and both
 * peppers would mint a code: a refusal at the last step must not leave a
 * project behind it that the next attempt then collides with.
 *
 * The developer is REUSED when one already holds the client ID, so a second
 * project for the same client is the same wizard. The project's domain is
 * checked against the estate before `createProject`, which raises rather than
 * refuses on a collision (see `admin.ts`); the `catch` covers the race.
 *
 * The activation code's plaintext leaves this function once, in the returned
 * object, exactly as `issueActivationCodeAction` returns it, and nothing here
 * logs it.
 */
export async function onboardAction(input: OnboardInput): Promise<
  | {
      readonly ok: true;
      readonly code: string;
      readonly issuedAt: string;
      readonly expiresAt: string;
      readonly projectId: string;
      readonly sourceId: string;
      readonly tenantSlug: string;
      readonly projectSlug: string;
    }
  | { readonly ok: false; readonly problem: string; readonly step: OnboardStep }
> {
  const refuse = (problem: string, step: OnboardStep) => ({ ok: false as const, problem, step });
  const field = (key: keyof OnboardInput): string => {
    const value = (input as Partial<Record<keyof OnboardInput, unknown>> | null)?.[key];
    return typeof value === "string" ? value.trim() : "";
  };

  const client = field("client").toLowerCase();
  const projectName = field("projectName");
  const projectSlug = field("projectSlug");
  const currency = field("currency").toUpperCase();
  const locale = field("locale");
  const timeZone = field("timeZone");
  const sourceLabel = field("sourceLabel");
  const environment = field("environment");

  /* --- every field, before anything is read or written --- */
  if (client.length === 0) return refuse("Give the client an ID before continuing.", 1);
  if (!TENANT_SLUG.test(client)) {
    return refuse(
      "A client ID is lowercase letters, digits and hyphens, at most sixty four characters, and starts and ends with a letter or a digit.",
      1,
    );
  }
  if (RESERVED_TENANT_SLUGS.includes(client)) {
    return refuse("That client ID is an address this application uses itself. Choose another.", 1);
  }
  if (isSyntheticTenantSlug(client)) {
    return refuse("A demonstration developer already lives at that client ID. Choose another.", 1);
  }
  if (projectName.length === 0) return refuse("Give the project a name.", 2);
  if (projectName.length > 200) {
    return refuse("That project name is longer than two hundred characters.", 2);
  }
  if (!PROJECT_SLUG.test(projectSlug)) {
    return refuse(
      "A domain is lowercase letters, digits and hyphens, and starts and ends with a letter or a digit.",
      2,
    );
  }
  if (!isCurrency(currency)) return refuse("Choose the currency the project's prices are in.", 2);
  if (!isLocale(locale) || !localeFits(locale)) {
    return refuse("That is not a locale this server can format with. Use a form such as sk-SK.", 2);
  }
  if (!isTimeZone(timeZone) || !timeZoneFits(timeZone)) {
    return refuse("That is not a time zone. Use a form such as Europe/Bratislava.", 2);
  }
  if (sourceLabel.length === 0) return refuse("Give the machine a source name.", 3);
  if (sourceLabel.length > 200) {
    return refuse("That source name is longer than two hundred characters.", 3);
  }
  if (!(ENVIRONMENTS as readonly string[]).includes(environment)) {
    return refuse(
      "Choose the environment this machine runs in. It cannot be changed from the installation afterwards.",
      3,
    );
  }

  /* --- who is asking, and whether there is anywhere to write --- */
  const opened = await estate();
  if (!("ok" in opened)) return refuse(opened.problem, 3);
  const deps = await observerDepsAsync();
  if (deps === null) {
    return refuse("This deployment has no control plane configured. Nothing was created.", 3);
  }
  const directory = projectDirectoryAdmin(deps);

  /*
   * The peppers, before the first write. Without them the code cannot be
   * minted, and finding that out after the project exists would leave a
   * project the next attempt collides with. The message names a variable and
   * a problem, never a value.
   */
  try {
    assertPeppersUsable(process.env);
  } catch (error: unknown) {
    if (!(error instanceof PepperMisconfiguredError)) throw error;
    return refuse(
      `${error.message}. No activation code can be issued until both peppers hold at least 32 bytes of random material, so nothing was created.`,
      3,
    );
  }

  /* --- reads: the developer to reuse, and the domain to keep free --- */
  const tenants = await directory.tenants({ account: CONTROL_PLANE_ACCOUNT });
  const projects = await opened.admin.projectsForAccount({ account: CONTROL_PLANE_ACCOUNT });
  if (!tenants.ok || !projects.ok) return refuse(UNEXPECTED, 3);
  if (projects.value.some((row) => row.slug === projectSlug)) return refuse(PROJECT_TAKEN, 2);

  /* --- writes, in dependency order --- */
  let tenantId = tenants.value.find((row) => row.slug === client)?.tenant_id ?? null;
  const newClient = tenantId === null;
  if (tenantId === null) {
    try {
      const created = await directory.createTenant({
        account: CONTROL_PLANE_ACCOUNT,
        name: client,
        slug: client,
      });
      if (!created.ok) return refuse(UNEXPECTED, 1);
      tenantId = created.value;
    } catch {
      /* Unique across the system: another estate holds the address, or the race. */
      return refuse("That client ID is already taken. Choose another.", 1);
    }
  }

  let projectId: string;
  try {
    const created = await opened.admin.createProject({
      account: CONTROL_PLANE_ACCOUNT,
      name: projectName,
      slug: projectSlug,
    });
    if (!created.ok) {
      return refuse(
        newClient
          ? `The client ${client} was registered, but its project was refused. Run the onboarding again with the same client ID to add the project.`
          : UNEXPECTED,
        2,
      );
    }
    projectId = created.value;
  } catch {
    /* The unique violation of the narrow race. Nothing of the driver's message is shown. */
    return refuse(PROJECT_TAKEN, 2);
  }

  /*
   * From here a refusal or a raise leaves a registered project behind, so the
   * sentence says where to finish it rather than pretending nothing happened,
   * and names the step whose fields it was writing.
   */
  const unfinished = (step: OnboardStep) =>
    refuse(
      `The project ${projectName} was registered, but this step was refused. Open it from Projects to finish it there.`,
      step,
    );

  let sourceId: string;
  let issued: { readonly plaintext: string; readonly expiresAt: string };
  const issuedAt = new Date().toISOString();
  let at: OnboardStep = 2;
  try {
    const settled = await directory.setProjectSettings({
      account: CONTROL_PLANE_ACCOUNT,
      project: projectId,
      tenant: tenantId,
      slug: projectSlug,
      currency,
      locale,
      timeZone,
    });
    if (!settled.ok) return unfinished(2);

    at = 3;
    const source = await opened.admin.createSource({
      account: CONTROL_PLANE_ACCOUNT,
      project: projectId,
      type: REGISTRABLE_SOURCE_TYPE,
      environment: environment as (typeof ENVIRONMENTS)[number],
      label: sourceLabel,
    });
    if (!source.ok) return unfinished(3);
    sourceId = source.value;

    const minted = await opened.admin.issueActivationCode({
      account: CONTROL_PLANE_ACCOUNT,
      source: sourceId,
      purpose: "activation",
    });
    if (!minted.ok) return unfinished(3);
    issued = minted.value;
  } catch {
    /* Nothing of the driver's message is shown. */
    return unfinished(at);
  }

  forgetDirectoryMemo();
  revalidatePath(OPERATIONS_SURFACE, "layout");

  /* The plaintext's one journey, read straight out of the receipt. */
  return {
    ok: true,
    code: issued.plaintext,
    issuedAt,
    expiresAt: issued.expiresAt,
    projectId,
    sourceId,
    tenantSlug: client,
    projectSlug,
  };
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
