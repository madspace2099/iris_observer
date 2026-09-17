import { redirect } from "next/navigation";
import { dynamicRoute } from "@/lib/href";
import { viewerForAccount } from "@/lib/accounts";
import { currentAccount } from "@/lib/session";
import { resolveLandingPath } from "@/lib/landing";

/**
 * The entry point, which now agrees with sign-in about what happens next.
 *
 * It used to send every signed-in reader to `/projects` unconditionally, on
 * the argument that opening a project is a decision a reader makes rather
 * than one made for them — correct the first time an account with several
 * projects signs in, wrong as the ONLY behaviour for an account with one, or
 * for an agent who visits `/` after already opening ISTER TOWER five minutes
 * ago. Sign-in stopped making that unconditional call in favour of
 * `resolveLandingPath`; a bare `/` disagreeing with it would mean the same
 * account gets a different answer depending on which door it walked through,
 * which is not a distinction a reader can see the reason for.
 *
 * `/projects` remains exactly what it was: reachable from the header on every
 * surface, and what `resolveLandingPath` itself falls back to when nothing
 * resolves — it stops being the unconditional destination.
 */
export default async function Home() {
  const account = await currentAccount();
  redirect(
    dynamicRoute(
      account === null ? "/sign-in" : await resolveLandingPath(await viewerForAccount(account)),
    ),
  );
}
