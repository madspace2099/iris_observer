import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card, SectionHead, StateMessage } from "@observer/ui";
import { requireViewer } from "@/lib/session";

export const metadata: Metadata = { title: "MADSPACE administration" };

/**
 * MADSPACE administration.
 *
 * A separate surface with its own shell, deliberately outside the customer
 * navigation. Tenant creation, branding, entitlements and integration health
 * are MADSPACE's business, and putting them in a customer's nav would both
 * confuse the product and invite a permission mistake.
 */
export default async function MadspacePage() {
  const viewer = await requireViewer();
  if (viewer.role !== "madspace_admin") redirect("/");

  return (
    <div className="obs-shell">
      <header className="obs-header">
        <div className="obs-brand">
          <span className="obs-brand-mark">MADSPACE</span>
          <span>Administration</span>
        </div>
        <div className="obs-header-end">
          <a className="obs-action" href="/">
            Back to Observer
          </a>
        </div>
      </header>

      <main className="obs-main" id="main">
        <Card as="section">
          <SectionHead title="Administration" aside={viewer.displayName} />
          {/*
            * Named for what it is, not for when it lands.
            *
            * "Arrives in M9" is internal roadmap language on a route a
            * developer can open during a consultation. It tells the reader
            * nothing they can use and quietly dates the product. The promise
            * the surface exists to keep is worth stating; the milestone number
            * is not.
            */}
          <StateMessage
            title="Not part of this demonstration"
            detail="Administration covers tenants, projects, branding, users, agencies, showroom installations, integrations, unit import and project activation — creating a project must never require a code change, and this is where that promise is kept. It is outside the scope of what is being shown today."
          />
        </Card>
      </main>
    </div>
  );
}
