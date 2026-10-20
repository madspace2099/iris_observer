"use server";

import { redirect } from "next/navigation";

import { setCompanyKey } from "@/lib/credentials/company-keys";
import { probeFor } from "@/lib/credentials/probe";
import { dynamicRoute } from "@/lib/href";
import { welcomeDestination } from "@/lib/landing";
import { requireAccount, requireViewer } from "@/lib/session";

/**
 * THE COMPANY KEY, SAVED FROM THE DIALOG OVER THE WELCOME (ADR-0043).
 *
 * The account is the signed session's, never a field. `to` came back through
 * the browser, so it is validated again exactly as the welcome page validates
 * it. `setCompanyKey` refuses anyone but the company's admin, probes the key
 * once and keeps nothing it refuses.
 *
 * The outcome travels as one word in the query, as on the settings page: the
 * key is read here, used, and out of scope when this returns; it is never in a
 * URL, a cookie, a log or the HTML that comes back.
 */
export async function saveCompanyKey(formData: FormData): Promise<void> {
  const account = await requireAccount();
  const viewer = await requireViewer();
  const to = await welcomeDestination(viewer, String(formData.get("to") ?? ""));

  const result = await setCompanyKey(account, String(formData.get("apiKey") ?? ""), probeFor());
  if (!result.ok) {
    redirect(dynamicRoute(`/welcome?to=${encodeURIComponent(to)}&key=${result.failure}`));
  }
  redirect(dynamicRoute(to));
}
