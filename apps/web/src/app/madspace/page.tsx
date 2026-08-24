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
          <StateMessage
            title="Arrives in M9"
            detail="Tenants, projects, branding, users, agencies, showroom installations, integrations, unit import, feature flags, event health and project activation. Creating a project must never require a code change, so this surface is where that promise is kept."
          />
        </Card>
      </main>
    </div>
  );
}
