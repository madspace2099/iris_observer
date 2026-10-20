import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, destroySession, requireViewer } from "@/lib/session";
import {
  CONTROL_PLANE_ACCOUNT_NAME,
  controlPlane,
  runningLocally,
  type ControlPlane,
} from "@/lib/sources/control-plane";
import { MadspaceHeader } from "@/components/madspace/MadspaceHeader";

export const metadata: Metadata = {
  title: { default: "MADSPACE", template: "%s · MADSPACE" },
};

/**
 * Which control plane answered, in words. Never a coloured dot.
 *
 * Three readings, because `runningLocally()` says whether this process MAY open
 * the development database, never whether anything opened; `controlPlane()`
 * separates a plane that is not configured from one that was configured and
 * would not open, and those are different problems with different fixes. The
 * word and the sentence are the same statement at two lengths, never two
 * different claims.
 */
function controlPlaneReading(
  plane: ControlPlane,
  local: boolean,
): { readonly word: string; readonly sentence: string } {
  if (!plane.ok) {
    return plane.absence.kind === "not_enabled"
      ? {
          word: "Control plane not configured",
          sentence: "Control plane not configured, so there is no estate to read.",
        }
      : {
          word: "Control plane would not open",
          sentence: "The control plane was configured but would not open.",
        };
  }

  /* Under `next start` the local plane opens only for the recorded demo (ADR-0044). */
  return local
    ? {
        word: "Local control plane",
        sentence:
          process.env.NODE_ENV === "production"
            ? `Local control plane for ${CONTROL_PLANE_ACCOUNT_NAME}, a demonstration database running inside this server.`
            : `Local control plane for ${CONTROL_PLANE_ACCOUNT_NAME}, a development database running inside this dev server.`,
      }
    : {
        word: "Hosted control plane",
        sentence: `Hosted control plane for ${CONTROL_PLANE_ACCOUNT_NAME}, the Postgres a deployment reaches.`,
      };
}

/**
 * The MADSPACE shell: the product's own shell, with MADSPACE's sections in it.
 *
 * `irs-shell ox-root ox-graphite` is the ground, atmosphere and type scale every
 * project page stands on, and `MadspaceHeader` draws the product's header from
 * the same classes (ADR-0047). `mad-portal` keeps what is MADSPACE's own: the
 * status vocabulary and the operations components (ADR-0037).
 *
 * The role check is repeated in each page. A layout is not a security boundary:
 * Next may render a page without re-running an ancestor layout, so the page
 * that reads the data does its own check.
 */
export default async function MadspaceLayout({ children }: { children: ReactNode }) {
  const viewer = await requireViewer();
  if (viewer.role !== "madspace_admin") redirect("/");

  const plane = controlPlaneReading(await controlPlane(), runningLocally());

  async function signOut() {
    "use server";
    const store = await cookies();
    // Clearing the cookie is not enough: the server record has to go too.
    destroySession(store.get(SESSION_COOKIE)?.value);
    store.delete(SESSION_COOKIE);
    redirect("/sign-in");
  }

  return (
    <div className="irs-shell ox-root ox-graphite mad-portal" data-surface="madspace">
      <MadspaceHeader
        operator={viewer.displayName.trim()}
        plane={plane}
        account={
          <>
            <Link className="ox-btn" data-weight="quiet" href="/">
              Back to Observer
            </Link>
            <form action={signOut}>
              <button className="ox-btn" data-weight="quiet" type="submit">
                Sign out
              </button>
            </form>
          </>
        }
      />
      <main className="irs-main irs-main--wide mad-main" id="main">
        {children}
      </main>
    </div>
  );
}
