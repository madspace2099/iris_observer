import type { Metadata } from "next";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { requireViewer } from "@/lib/session";
import {
  CONTROL_PLANE_ACCOUNT_NAME,
  controlPlane,
  runningLocally,
  type ControlPlane,
} from "@/lib/sources/control-plane";
import { OpsNav } from "@/components/madspace/OpsNav";

export const metadata: Metadata = {
  title: { default: "MADSPACE", template: "%s · MADSPACE" },
};

/**
 * Which control plane answered, in words. Never a coloured dot.
 *
 * Two readings became three, and the third is the honest one. `runningLocally()`
 * is an environment read: it says whether this process MAY open the development
 * database, never whether anything opened. Every other case, including a
 * process with no control plane configured at all, was therefore asserted to be
 * "Hosted control plane" — the header stated which database answered without
 * ever asking whether one had.
 *
 * `controlPlane()` already separates a plane that is not configured from one
 * that was configured and would not open, and it does so because a deployment
 * without a database and a development machine that has not set the flag are
 * different problems with different fixes. The shell says which.
 *
 * The word and the sentence are the same statement at two lengths, never two
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

  return local
    ? {
        word: "Local control plane",
        sentence: "Local control plane, a development database running inside this dev server.",
      }
    : {
        word: "Hosted control plane",
        sentence: "Hosted control plane, the Postgres a deployment reaches.",
      };
}

/**
 * The MADSPACE shell.
 *
 * A separate surface with its own chrome, deliberately outside the customer
 * navigation — tenancy, activation and integration health are MADSPACE's
 * business, and putting them in a customer's nav would both confuse the product
 * and invite a permission mistake.
 *
 * It uses the shell classes the rest of the application uses rather than a
 * second app shell. What differs is what the surface states before anything it
 * scopes: the ACCOUNT being administered and WHICH control plane is answering.
 * Both open every screen because every figure underneath them is scoped by the
 * first and only exists because of the second — an operator who cannot tell a
 * local development database from a hosted one will eventually believe a
 * demonstration estate is a customer's.
 *
 * They are a scope band at the top of the content rather than a chip in the
 * header, and the reason is that same sentence: the chip was hidden below
 * 768px, so the one fact this comment calls load-bearing left the screen on a
 * phone. Ink as a surface is what the system gives anything whose effect
 * reaches past the current screen, and the band survives to 390.
 *
 * The role check is repeated in each page. A layout is not a security boundary:
 * Next may render a page without re-running an ancestor layout, so the page
 * that reads the data does its own check.
 */
export default async function MadspaceLayout({ children }: { children: ReactNode }) {
  const viewer = await requireViewer();
  if (viewer.role !== "madspace_admin") redirect("/");

  const plane = controlPlaneReading(await controlPlane(), runningLocally());

  /*
   * Required in the type is not the same as present. An empty display name
   * rendered an empty element, and the header lost the operator identity it
   * exists to state rather than saying a word matched to the field.
   */
  const operator = viewer.displayName.trim();

  return (
    /*
     * `mad-portal` is the boundary of the client-portal design system.
     *
     * Everything inside it is warm paper and ink; everything outside stays the
     * dark IRIS product. The class carries no layout of its own: it redeclares
     * the tokens the rules underneath already speak, which is how a surface
     * this size turns over without a rule-by-rule rewrite. The system's own
     * dark theme works the same way and says why — a token swap keeps modals
     * and fixed headers intact where a CSS filter would break both.
     */
    <div className="obs-shell mad-portal">
      <header className="obs-header">
        <div className="obs-brand">
          <span className="obs-brand-mark">MADSPACE</span>
          <span>Operations</span>
        </div>

        <div className="obs-header-end">
          <div className="obs-who">
            {/*
             * The name, and nothing under it. "MADSPACE administrator" was true
             * of every reader of every screen here, because the check above
             * redirects everybody else: the line restated the surface's own
             * precondition and said nothing about the person reading it.
             */}
            <strong>{operator === "" ? "Name not set" : operator}</strong>
          </div>
          <a className="obs-action" href="/">
            Back to Observer
          </a>
        </div>
      </header>

      <OpsNav />

      <main className="obs-main" id="main">
        {/*
         * The scope, stated before the things it scopes, and the first thing
         * the skip link lands on.
         *
         * "Local control plane" is a development database running inside the
         * dev server; a deployment says "Hosted" and means Postgres. That
         * difference lived only in this comment, where an operator could not
         * read it, so it is on the band in one clause.
         */}
        <div className="mad-scope-band">
          <span className="mad-scope-band-kicker">Account</span>
          <p className="mad-scope-band-title">{CONTROL_PLANE_ACCOUNT_NAME}</p>
          <p className="mad-scope-band-detail">{plane.sentence}</p>
        </div>

        {children}
      </main>

      {/*
       * The fourth landmark, and the scope again where a long page ends.
       *
       * The contract names header, nav, main and footer; the shell had three.
       * What it carries is what the figures above were counted against, rather
       * than a second copy of the navigation.
       */}
      <footer className="mad-note">{`${CONTROL_PLANE_ACCOUNT_NAME}, ${plane.word}`}</footer>
    </div>
  );
}
