"use server";

import { cookies } from "next/headers";

import { currentAccount } from "@/lib/session";

import { parseOverride } from "./admission";
import { ASK_MODEL_COOKIE, ASK_MODEL_COOKIE_MAX_AGE } from "./model-choice";

/**
 * THE READER PICKS THE MODEL A DEMONSTRATION KEY ANSWERS WITH.
 *
 * A server action is an HTTP endpoint: a signed-in account, and a catalogue
 * id, or nothing is written. Setting the cookie renders the Ask page again, so
 * the composer names the new model at once; it answers from the next question.
 */
export async function chooseAskModel(form: FormData): Promise<void> {
  if ((await currentAccount()) === null) return;
  const asked = form.get("model");
  /* An empty value is the key's own model, where that is not a catalogue one. */
  if (asked === "") {
    (await cookies()).delete(ASK_MODEL_COOKIE);
    return;
  }
  const chosen = parseOverride(asked);
  if (chosen === null) return;
  (await cookies()).set(ASK_MODEL_COOKIE, chosen, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: ASK_MODEL_COOKIE_MAX_AGE,
  });
}
