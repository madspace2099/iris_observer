import type { Metadata } from "next";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { Badge } from "@observer/ui";
import { requireViewer } from "@/lib/session";
import { CONTROL_PLANE_ACCOUNT_NAME, runningLocally } from "@/lib/sources/control-plane";
import { OpsNav } from "@/components/madspace/OpsNav";

export const metadata: Metadata = {
  title: { default: "MADSPACE", template: "%s · MADSPACE" },
};

/**
 * The MADSPACE shell.
 *
 * A separate surface with its own chrome, deliberately outside the customer
 * navigation — tenancy, activation and integration health are MADSPACE's
 * business, and putting them in a customer's nav would both confuse the product
 * and invite a permission mistake.
 *
 * It uses the shell classes the rest of the application uses rather than a
 * second app shell. What differs is what the header states: the ACCOUNT being
 * administered and WHICH control plane is answering. Both are on every screen
 * because every figure underneath them is scoped by the first and only exists
 * because of the second — an operator who cannot tell a local development
 * database from a hosted one will eventually believe a demonstration estate is
 * a customer's.
 *
 * The role check is repeated in each page. A layout is not a security boundary:
 * Next may render a page without re-running an ancestor layout, so the page
 * that reads the data does its own check.
 */
export default async function MadspaceLayout({ children }: { children: ReactNode }) {
  const viewer = await requireViewer();
  if (viewer.role !== "madspace_admin") redirect("/");

  const local = runningLocally();

  return (
    <div className="obs-shell">
      <header className="obs-header">
        <div className="obs-brand">
          <span className="obs-brand-mark">MADSPACE</span>
          <span>Operations</span>
        </div>

        <div className="obs-context mad-scope">
          <span className="mad-scope-label">Account</span>
          <span className="mad-scope-value">{CONTROL_PLANE_ACCOUNT_NAME}</span>
          {/*
           * Which database answered, in words. "Local control plane" is a
           * development database running inside the dev server; a deployment
           * says "Hosted" and means Postgres. Never a coloured dot.
           */}
          <Badge tone="accent">{local ? "Local control plane" : "Hosted control plane"}</Badge>
        </div>

        <div className="obs-header-end">
          <div className="obs-who">
            <strong>{viewer.displayName}</strong>
            <span>MADSPACE administrator</span>
          </div>
          <a className="obs-action" href="/">
            Back to Observer
          </a>
        </div>
      </header>

      <OpsNav />

      <main className="obs-main" id="main">
        {children}
      </main>
    </div>
  );
}
