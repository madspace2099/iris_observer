"use server";

import { redirect } from "next/navigation";

import { dynamicRoute } from "@/lib/href";
import { requireAccount } from "@/lib/session";
import { probeFor } from "@/lib/credentials/probe";
import { removeConnection, saveConnection, testConnection } from "@/lib/credentials/service";

/**
 * THE THREE THINGS A READER MAY DO TO THEIR OWN CONNECTION.
 *
 * Server actions, which is what makes this milestone possible at all: the raw
 * key travels from the form to this process in the request body and stops here.
 * It is never in a URL, never in a cookie, never in browser storage, never in
 * the client bundle, and never in the HTML that comes back.
 *
 * ## Every action re-authorises
 *
 * `requireAccount()` runs first in all three, on every call. Not once at page
 * load, not passed down as a prop, not read from a hidden field — an account id
 * carried in a form is an account id the browser chose, and a settings screen
 * whose target comes from the client is a settings screen that edits anybody.
 *
 * The account id is deliberately not a parameter to any of these. There is no
 * shape of request that can make one act on somebody else's credential.
 *
 * ## Why they redirect rather than return
 *
 * The page is a server component and the form is plain HTML: an uncontrolled
 * `<input type="password">` whose value exists in the DOM until submit and
 * nowhere else. Holding it in React state to render a result would put the key
 * in client memory, in a component's props, and in whatever a future devtools
 * user is looking at. So the outcome travels as one word in the query string
 * and the page renders from that.
 */

const PATH = "/settings/ai";

/**
 * Saves a key, after proving it works.
 *
 * The probe runs before the write, so a key OpenAI rejects never reaches
 * storage and a previously working connection survives a failed replacement
 * untouched. That is "atomic" from the reader's side; the single upsert
 * statement is the other half.
 */
export async function connect(formData: FormData): Promise<void> {
  const account = await requireAccount();

  /*
   * Read, used, and out of scope when this function returns. Not logged, not
   * echoed back into the form, not attached to the redirect.
   */
  const raw = String(formData.get("apiKey") ?? "");

  const result = await saveConnection(account.accountId, raw, probeFor());

  redirect(
    dynamicRoute(
      result.ok
        ? `${PATH}?done=${result.replaced ? "replaced" : "connected"}`
        : `${PATH}?failed=${result.failure}`,
    ),
  );
}

/** Tests the key already stored for this account. */
export async function test(): Promise<void> {
  const account = await requireAccount();
  const result = await testConnection(account.accountId, probeFor());
  redirect(dynamicRoute(result.ok ? `${PATH}?done=tested` : `${PATH}?failed=${result.failure}`));
}

/**
 * Deletes the stored credential.
 *
 * Reached only from the confirmation panel, because this is not undoable: the
 * key was never shown again after saving, so a mistaken removal means going
 * back to OpenAI for a new one.
 */
export async function remove(): Promise<void> {
  const account = await requireAccount();
  const removed = await removeConnection(account.accountId);
  redirect(dynamicRoute(removed ? `${PATH}?done=removed` : `${PATH}?failed=provider_unavailable`));
}
