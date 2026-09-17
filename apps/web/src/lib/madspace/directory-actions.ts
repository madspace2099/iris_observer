"use server";

import { revalidatePath } from "next/cache";

import {
  PROJECT_SLUG,
  RESERVED_TENANT_SLUGS,
  TENANT_SLUG,
  isCurrency,
  isLocale,
  isTimeZone,
  projectDirectoryAdmin,
  type AdminRefusal,
  type ProjectDirectoryAdmin,
} from "@observer/sources";

import { grantableAccounts } from "@/lib/accounts";
import { forgetCatalogueMemo } from "@/lib/connectors/catalogue-source";
import { forgetDealMemo } from "@/lib/connectors/deal-source";
import { forgetSessionMemo } from "@/lib/connectors/session-source";
import { forgetDirectoryMemo } from "@/lib/directory/live";
import { isSyntheticTenantSlug } from "@/lib/repository";
import { currentViewer } from "@/lib/session";
import { CONTROL_PLANE_ACCOUNT } from "@/lib/sources/control-plane";
import { observerDepsAsync } from "@/lib/sources/deps";

/**
 * WHAT TURNS A PROJECT INTO A CUSTOMER'S DASHBOARD, AS AN ADMINISTRATOR DOES IT.
 *
 * A developer to belong to, an address and three settings, who may see it, and
 * the names of the people who present on it (`docs/21-self-served-projects.md`).
 *
 * The same guard as every other operation here: each action re-authorises,
 * because a server action is an HTTP endpoint, and the account is the estate's
 * constant and never a parameter. What a client supplies is a project
 * identifier and what it typed; both are validated again in the service.
 *
 * Every change forgets what the customer side had memoised, so a grant or a
 * completed project shows on this instance at once rather than thirty seconds
 * later.
 */

/** The shape every form here renders: one sentence, the field it belongs to, what was typed. */
interface FormState {
  readonly problem: string | null;
  readonly field: string | null;
  readonly values: Readonly<Record<string, string>>;
  readonly done: string | null;
}

const OPERATIONS_SURFACE = "/madspace";

function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function values(form: FormData, keys: readonly string[]): Record<string, string> {
  return Object.fromEntries(keys.map((key) => [key, text(form, key)]));
}

type Operator =
  | { readonly ok: true; readonly admin: ProjectDirectoryAdmin; readonly by: string }
  | { readonly ok: false; readonly problem: string };

async function operator(): Promise<Operator> {
  const viewer = await currentViewer();
  if (viewer === null) {
    return { ok: false, problem: "Sign in as a MADSPACE administrator before changing anything." };
  }
  if (viewer.role !== "madspace_admin") {
    return { ok: false, problem: "Only a MADSPACE administrator may change this." };
  }
  const deps = await observerDepsAsync();
  if (deps === null) {
    return {
      ok: false,
      problem:
        "This deployment has no control plane configured, so there is nowhere to keep this. Nothing was changed.",
    };
  }
  return { ok: true, admin: projectDirectoryAdmin(deps), by: viewer.userId };
}

function changed(): void {
  forgetDirectoryMemo();
  forgetSessionMemo();
  forgetCatalogueMemo();
  forgetDealMemo();
  revalidatePath(OPERATIONS_SURFACE, "layout");
}

const UNEXPECTED =
  "The control plane refused this for a reason this screen cannot explain. Nothing was changed. Try again, and tell MADSPACE support what you were doing if it happens twice.";

/* --- 1. a developer ------------------------------------------------------------------ */

export async function createDeveloperAction(
  _previous: FormState,
  form: FormData,
): Promise<FormState> {
  const typed = values(form, ["name", "slug"]);
  const refuse = (problem: string, field: string | null = null): FormState => ({
    problem,
    field,
    values: typed,
    done: null,
  });
  const name = typed["name"] ?? "";
  const slug = typed["slug"] ?? "";

  if (name.length === 0) return refuse("Give the developer a name.", "name");
  if (name.length > 200) return refuse("That name is longer than two hundred characters.", "name");
  if (!TENANT_SLUG.test(slug)) {
    return refuse(
      "An address is lowercase letters, digits and hyphens, at most sixty four characters, and starts and ends with a letter or a digit.",
      "slug",
    );
  }
  if (RESERVED_TENANT_SLUGS.includes(slug)) {
    return refuse("That word is an address this application uses itself. Choose another.", "slug");
  }
  if (isSyntheticTenantSlug(slug)) {
    return refuse(
      "A demonstration developer already lives at that address. Choose another.",
      "slug",
    );
  }

  const opened = await operator();
  if (!opened.ok) return refuse(opened.problem);

  const existing = await opened.admin.tenants({ account: CONTROL_PLANE_ACCOUNT });
  if (existing.ok && existing.value.some((row) => row.slug === slug)) {
    return refuse("A developer is already registered at that address. Choose another.", "slug");
  }

  try {
    const created = await opened.admin.createTenant({ account: CONTROL_PLANE_ACCOUNT, name, slug });
    if (!created.ok) return refuse(refusalWords(created.refusal), created.refusal.field);
  } catch {
    /* The unique violation of the narrow race, or another estate holding the address. */
    return refuse("That address is already taken. Choose another.", "slug");
  }

  changed();
  return { problem: null, field: null, values: {}, done: `${name} was registered.` };
}

/* --- 2. a project's address and settings ---------------------------------------------- */

export async function setProjectSettingsAction(
  _previous: FormState,
  form: FormData,
): Promise<FormState> {
  const typed = values(form, ["project", "tenant", "slug", "currency", "locale", "timeZone"]);
  const refuse = (problem: string, field: string | null = null): FormState => ({
    problem,
    field,
    values: typed,
    done: null,
  });
  const project = typed["project"] ?? "";
  const tenant = typed["tenant"] ?? "";
  const slug = typed["slug"] ?? "";
  const currency = (typed["currency"] ?? "").toUpperCase();
  const locale = typed["locale"] ?? "";
  const timeZone = typed["timeZone"] ?? "";

  if (tenant.length === 0) return refuse("Choose the developer this project belongs to.", "tenant");
  if (!PROJECT_SLUG.test(slug)) {
    return refuse(
      "An address is lowercase letters, digits and hyphens, and starts and ends with a letter or a digit.",
      "slug",
    );
  }
  if (!isCurrency(currency)) {
    return refuse("That is not a currency code. Use the three letters, such as EUR.", "currency");
  }
  if (!isLocale(locale)) {
    return refuse(
      "That is not a locale this server can format with. Use a form such as sk-SK.",
      "locale",
    );
  }
  if (!isTimeZone(timeZone)) {
    return refuse("That is not a time zone. Use a form such as Europe/Bratislava.", "timeZone");
  }

  const opened = await operator();
  if (!opened.ok) return refuse(opened.problem);

  /*
   * Read first, so the refusals the database gives as one `false` can be said in
   * words: an address another project holds, and a project that already has a
   * developer or an address and would be moved by this.
   */
  const directory = await opened.admin.directory({ account: CONTROL_PLANE_ACCOUNT });
  if (directory.ok) {
    const current = directory.value.find((row) => row.project_id === project);
    if (directory.value.some((row) => row.project_id !== project && row.slug === slug)) {
      return refuse(
        "Another project of this estate already has that address. Choose another.",
        "slug",
      );
    }
    if (current !== undefined && current.tenant_id !== null) {
      if (current.tenant_id !== tenant) {
        return refuse(
          "This project already belongs to a developer, and a project does not move.",
          "tenant",
        );
      }
      if (current.slug !== slug) {
        return refuse(
          "This project already has an address, and links to it have been sent. It stays where it is.",
          "slug",
        );
      }
    }
  }

  let result;
  try {
    result = await opened.admin.setProjectSettings({
      account: CONTROL_PLANE_ACCOUNT,
      project,
      tenant,
      slug,
      currency,
      locale,
      timeZone,
    });
  } catch {
    return refuse("Another project already has that address. Choose another.", "slug");
  }
  if (!result.ok) return refuse(refusalWords(result.refusal), result.refusal.field);

  changed();
  return { problem: null, field: null, values: typed, done: "Saved." };
}

/* --- 3. who may see it ------------------------------------------------------------------ */

export async function grantViewerAction(_previous: FormState, form: FormData): Promise<FormState> {
  const typed = values(form, ["project", "viewer"]);
  const refuse = (problem: string, field: string | null = null): FormState => ({
    problem,
    field,
    values: typed,
    done: null,
  });
  const viewer = typed["viewer"] ?? "";
  if (viewer.length === 0) return refuse("Choose who to give this project to.", "viewer");
  /* Only an account this deployment can actually sign in. A grant to nobody is a row that lies. */
  const account = grantableAccounts().find((a) => a.accountId === viewer);
  if (account === undefined) return refuse("That account cannot be found here.", "viewer");

  const opened = await operator();
  if (!opened.ok) return refuse(opened.problem);

  const result = await opened.admin.grantViewer({
    account: CONTROL_PLANE_ACCOUNT,
    project: typed["project"] ?? "",
    viewer,
    by: opened.by,
  });
  if (!result.ok) return refuse(refusalWords(result.refusal));

  changed();
  return {
    problem: null,
    field: null,
    values: {},
    done: `${account.displayName} can now open this project.`,
  };
}

export async function revokeViewerAction(form: FormData): Promise<void> {
  const opened = await operator();
  if (!opened.ok) return;
  await opened.admin.revokeViewer({
    account: CONTROL_PLANE_ACCOUNT,
    project: text(form, "project"),
    viewer: text(form, "viewer"),
    by: opened.by,
  });
  changed();
}

/* --- 4. the name of somebody who presents ------------------------------------------------ */

export async function nameAgentAction(_previous: FormState, form: FormData): Promise<FormState> {
  const typed = values(form, ["project", "agent", "name"]);
  const refuse = (problem: string, field: string | null = null): FormState => ({
    problem,
    field,
    values: typed,
    done: null,
  });
  const name = typed["name"] ?? "";
  if (name.length === 0) return refuse("Type the name this person presents under.", "name");
  if (name.length > 120)
    return refuse("That name is longer than one hundred and twenty characters.", "name");

  const opened = await operator();
  if (!opened.ok) return refuse(opened.problem);

  const result = await opened.admin.nameAgent({
    account: CONTROL_PLANE_ACCOUNT,
    project: typed["project"] ?? "",
    agent: typed["agent"] ?? "",
    name,
  });
  if (!result.ok) return refuse(refusalWords(result.refusal), result.refusal.field);

  changed();
  return { problem: null, field: null, values: typed, done: "Saved." };
}

function refusalWords(refusal: AdminRefusal): string {
  if (refusal.code === "invalid_input") {
    return `The ${refusal.field ?? "request"} is not in a form the control plane accepts. Nothing was changed.`;
  }
  if (refusal.code === "unknown_project") {
    return "No project of this estate can be changed under this identifier. It may have been archived since this page was opened. Nothing was changed.";
  }
  return UNEXPECTED;
}
