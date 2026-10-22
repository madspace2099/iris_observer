"use server";

import { revalidatePath } from "next/cache";

import { companyOf } from "@/lib/accounts";
import { repository } from "@/lib/repository";
import { currentAccount, currentViewer } from "@/lib/session";

import { maySetSalesWindow, parseSalesWindow } from "./access";
import { NO_PLAN_STORE, salesWindowStore } from "./store";

/**
 * THE COMPANY ADMIN SETS THE SALES WINDOW (ADR-0055).
 *
 * A server action is an HTTP endpoint, so it re-authorises every time: a
 * signed-in account, a project it holds (`resolveProject`, the check every
 * page makes), and the right (`maySetSalesWindow`). Then the two dates are
 * parsed, kept, and the Project page is rendered again from the read model,
 * which reads them back. What comes back is a sentence.
 */

export interface PlanActionState {
  /** Null before the first submit. */
  readonly ok: boolean | null;
  readonly message: string | null;
}

const refused = (message: string): PlanActionState => ({ ok: false, message });

const field = (form: FormData, key: string): string => {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
};

const DAY = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const day = (iso: string) => DAY.format(new Date(`${iso}T00:00:00Z`));

export async function saveSalesWindow(
  _previous: PlanActionState,
  form: FormData,
): Promise<PlanActionState> {
  const account = await currentAccount();
  const viewer = await currentViewer();
  if (account === null || viewer === null) return refused("Sign in first.");

  const tenantSlug = field(form, "tenant");
  const projectSlug = field(form, "project");
  let resolved;
  try {
    resolved = await repository.resolveProject(viewer, tenantSlug, projectSlug);
  } catch {
    return refused("That project is not one your account holds. Nothing was saved.");
  }
  if (!maySetSalesWindow(viewer.role, companyOf(account), resolved.tenant)) {
    return refused(
      `Only the admin of ${resolved.tenant.name} sets this project's sales dates. Nothing was saved.`,
    );
  }

  const store = salesWindowStore();
  if (store === null) return refused(NO_PLAN_STORE);
  const window = parseSalesWindow(field(form, "startsOn"), field(form, "sellOutBy"));
  if (typeof window === "string") return refused(`${window} Nothing was saved.`);

  await store.write(resolved.project.id as string, window);
  revalidatePath(`/${tenantSlug}/${projectSlug}/project`);
  return {
    ok: true,
    message: `Saved: selling from ${day(window.startsOn)}, sold out by ${day(window.sellOutBy)}.`,
  };
}
