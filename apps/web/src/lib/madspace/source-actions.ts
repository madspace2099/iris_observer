"use server";

import { revalidatePath } from "next/cache";

import {
  ACTIVATION_CODE_PEPPER,
  SOURCE_TOKEN_PEPPER,
  describePepper,
  type AdminRefusal,
  type ObserverAdmin,
} from "@observer/sources";

import { currentViewer } from "@/lib/session";
import { CONTROL_PLANE_ACCOUNT, controlPlane } from "@/lib/sources/control-plane";

/**
 * THE OPERATIONS AN ADMINISTRATOR PERFORMS ON ONE SOURCE.
 *
 * `demo-actions.ts` walks the demonstration estate's single source through its
 * whole lifecycle so a reviewer can produce every state without an Unreal
 * machine. This module is the other thing: the operations an administrator
 * performs on **whichever** source they are looking at, reached from Source
 * Detail and scoped by the identifier in the URL.
 *
 * The two do not share a code path on purpose. The driver's presses are a
 * sequence — issue, activate, heartbeat, diagnose — and its source is fixed at
 * the estate's own. These take a source identifier from a client, and every one
 * of them changes a lifecycle column or mints a credential, so the shape that
 * matters here is the guard rather than the sequence.
 *
 * ## Every action re-authorises, and the account is never a parameter
 *
 * A server action is an HTTP endpoint that anyone who can reach the deployment
 * can call. So each function below checks the viewer's role before it touches
 * the admin service, and the ACCOUNT is taken from
 * {@link CONTROL_PLANE_ACCOUNT} rather than from the caller. The only value a
 * client supplies is the source identifier, and every facade in
 * `ObserverAdmin` is account-scoped: a well-formed identifier belonging to
 * somebody else's estate matches nothing and comes back `unknown_source`, the
 * same answer as an identifier that does not exist. That conflation is the
 * tenant boundary working, not an error message that needs improving.
 *
 * ## The activation code's plaintext
 *
 * `issueActivationCodeAction` returns it, once, because that is what an
 * activation code is for — a human carries it to a machine. Nothing here logs
 * the issuance result, and nothing here keeps a reference: the value is built
 * into the returned object and this module forgets it. The selector is
 * deliberately NOT returned. It is public and harmless, and an operations
 * screen that shows it teaches an operator to read credential internals off a
 * page, so the only things that cross the wire are the code and the two
 * instants that describe it.
 */

/* --- results a screen renders -------------------------------------------------- */

/**
 * Every refusal is one sentence for a reader, never a code and never a stack.
 *
 * Deliberately not exported: a `"use server"` module may export only async
 * functions, and the client components infer these shapes from the actions'
 * return types instead, which keeps them from drifting.
 */
interface Refused {
  readonly ok: false;
  readonly problem: string;
}

const refuse = (problem: string): Refused => ({ ok: false, problem });

/**
 * An admin refusal, said in words, with the operation named.
 *
 * `unknown_source` covers four situations at once and the sentence says so,
 * because the alternative — a second, differently-scoped query to tell them
 * apart — is precisely the existence oracle the account scoping exists to
 * refuse.
 */
function sentenceFor(refusal: AdminRefusal, operation: string): string {
  if (refusal.code === "invalid_input") {
    return `${operation} was refused: the ${refusal.field ?? "request"} is not in a form this control plane accepts.`;
  }
  if (refusal.code === "unknown_source") {
    return `${operation} was refused: no source is operable under this identifier. It does not exist, it belongs to another account, it is archived and therefore terminal, or — for a revocation — it holds no active credential.`;
  }
  return `${operation} was refused: no project is readable under this identifier.`;
}

/* --- authorisation --------------------------------------------------------------- */

/**
 * The admin service, or the reason there is not one.
 *
 * `currentViewer` rather than `requireViewer`: a redirect is the right answer
 * for a page and a confusing one for a button, which should say why nothing
 * happened rather than navigate away from the operator's own screen.
 */
async function operator(): Promise<{ readonly ok: true; readonly admin: ObserverAdmin } | Refused> {
  const viewer = await currentViewer();
  if (viewer === null) return refuse("Sign in as a MADSPACE administrator to operate this source.");
  if (viewer.role !== "madspace_admin") {
    return refuse("Only a MADSPACE administrator may operate a source.");
  }

  const plane = await controlPlane();
  if (!plane.ok) {
    return refuse(
      plane.absence.kind === "not_enabled"
        ? "This deployment has no control plane, so there is nothing to operate."
        : `The control plane could not be opened: ${plane.absence.detail}`,
    );
  }
  return { ok: true, admin: plane.admin };
}

/**
 * The identifier, bounded where it ENTERS rather than where it lands.
 *
 * `ObserverAdmin` checks the canonical UUID shape itself and refuses anything
 * else, so this is not the security boundary. It is the cheap rejection of a
 * value that never came from this application's own links, taken before it is
 * carried through three awaits to be refused at the far end.
 */
function unusable(sourceId: unknown): boolean {
  return typeof sourceId !== "string" || sourceId.length === 0 || sourceId.length > 64;
}

/** Where the operations surface lives. Every press below changes what it reads. */
const OPERATIONS_SURFACE = "/madspace";

/* --- 1. the activation code -------------------------------------------------------- */

/**
 * Issue a real activation code for this source and return its plaintext ONCE.
 *
 * The purpose is derived from whether a credential row exists at all —
 * including a revoked or a superseded one — because a machine that was
 * reimaged and is coming back is a REACTIVATION and the audit trail should say
 * so rather than record a second first-time activation.
 *
 * `issuedAt` is this server's clock at the moment the code was minted. The
 * receipt the service returns carries only the expiry, and rather than leave
 * the screen to subtract a TTL it does not know, the instant is stated by the
 * process that did the issuing. It is the same clock the expiry was computed
 * from.
 */
export async function issueActivationCodeAction(sourceId: string): Promise<
  | {
      readonly ok: true;
      readonly code: string;
      readonly purpose: string;
      readonly issuedAt: string;
      readonly expiresAt: string;
    }
  | Refused
> {
  const held = await operator();
  if (!held.ok) return held;
  if (unusable(sourceId)) return refuse("That is not a source identifier.");

  /*
   * The peppers, checked before anything is minted, so a machine that has not
   * set them is told which variable and what is wrong with it. Without this the
   * same misconfiguration arrives as a thrown PepperMisconfiguredError from
   * inside the service — an unreadable failure for one missing line in
   * `.env.local`. `describePepper` returns a description, never the value.
   */
  for (const variable of [ACTIVATION_CODE_PEPPER, SOURCE_TOKEN_PEPPER]) {
    const verdict = describePepper(variable, process.env);
    if (!verdict.ok) {
      return refuse(
        `${variable} ${verdict.problem}. No activation code can be issued until it holds at least 32 bytes of random material.`,
      );
    }
  }

  const existing = await held.admin.credentialStatus({
    account: CONTROL_PLANE_ACCOUNT,
    source: sourceId,
  });
  const purpose = existing.ok && existing.value !== null ? "reactivation" : "activation";

  const issuedAt = new Date().toISOString();
  const issued = await held.admin.issueActivationCode({
    account: CONTROL_PLANE_ACCOUNT,
    source: sourceId,
    purpose,
  });
  if (!issued.ok) return refuse(sentenceFor(issued.refusal, "Issuing an activation code"));

  revalidatePath(OPERATIONS_SURFACE, "layout");
  /*
   * The plaintext's one and only journey. It is read straight out of the
   * receipt into this literal and this module keeps no other reference to it —
   * no variable that outlives the return, no log line, and deliberately no
   * `console` anywhere in this file, because `IssuedActivation.toJSON` narrows
   * that accident rather than preventing it.
   */
  return {
    ok: true,
    code: issued.value.plaintext,
    purpose: issued.value.purpose,
    issuedAt,
    expiresAt: issued.value.expiresAt,
  };
}

/* --- 2. the lifecycle ---------------------------------------------------------------- */

/**
 * Stop accepting from this source, reversibly.
 *
 * Not a credential revocation, and the distinction is the whole reason resume
 * can exist: a suspended source keeps its credential and stops being accepted,
 * so switching it back on is one operation rather than a second activation with
 * an operator driving to the machine.
 */
export async function suspendSourceAction(
  sourceId: string,
): Promise<{ readonly ok: true } | Refused> {
  const held = await operator();
  if (!held.ok) return held;
  if (unusable(sourceId)) return refuse("That is not a source identifier.");

  const moved = await held.admin.suspendSource({
    account: CONTROL_PLANE_ACCOUNT,
    source: sourceId,
  });
  if (!moved.ok) return refuse(sentenceFor(moved.refusal, "Suspending this source"));

  revalidatePath(OPERATIONS_SURFACE, "layout");
  return { ok: true };
}

/** Accept from this source again. Refuses on an archived source: archival is terminal. */
export async function resumeSourceAction(
  sourceId: string,
): Promise<{ readonly ok: true } | Refused> {
  const held = await operator();
  if (!held.ok) return held;
  if (unusable(sourceId)) return refuse("That is not a source identifier.");

  const moved = await held.admin.resumeSource({
    account: CONTROL_PLANE_ACCOUNT,
    source: sourceId,
  });
  if (!moved.ok) return refuse(sentenceFor(moved.refusal, "Resuming this source"));

  revalidatePath(OPERATIONS_SURFACE, "layout");
  return { ok: true };
}

/**
 * Retire this source permanently.
 *
 * The one operation on this surface with no inverse. `ObserverAdmin` enforces
 * that rather than trusting a screen to: an archived source refuses suspension,
 * resumption and issuance alike with `unknown_source`, so a stale tab cannot
 * bring one back.
 */
export async function archiveSourceAction(
  sourceId: string,
): Promise<{ readonly ok: true } | Refused> {
  const held = await operator();
  if (!held.ok) return held;
  if (unusable(sourceId)) return refuse("That is not a source identifier.");

  const moved = await held.admin.archiveSource({
    account: CONTROL_PLANE_ACCOUNT,
    source: sourceId,
  });
  if (!moved.ok) return refuse(sentenceFor(moved.refusal, "Archiving this source"));

  revalidatePath(OPERATIONS_SURFACE, "layout");
  return { ok: true };
}

/**
 * End the credential relationship without changing the lifecycle.
 *
 * The source stays ACTIVATED in the record, because activated-then-revoked has
 * to look different from never-activated — that distinction is the reason
 * `credentialStatus` exists at all, and a revocation that erased the row would
 * destroy it.
 */
export async function revokeCredentialAction(
  sourceId: string,
): Promise<{ readonly ok: true } | Refused> {
  const held = await operator();
  if (!held.ok) return held;
  if (unusable(sourceId)) return refuse("That is not a source identifier.");

  const revoked = await held.admin.revokeCredential({
    account: CONTROL_PLANE_ACCOUNT,
    source: sourceId,
  });
  if (!revoked.ok) return refuse(sentenceFor(revoked.refusal, "Revoking this credential"));

  revalidatePath(OPERATIONS_SURFACE, "layout");
  return { ok: true };
}
