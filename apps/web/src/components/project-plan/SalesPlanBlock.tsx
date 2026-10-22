import type { SalesPlan as SalesPlanModel, Viewer } from "@observer/readmodels";

import { companyOf } from "@/lib/accounts";
import { maySetSalesWindow } from "@/lib/project-plan/access";
import { salesWindowStore } from "@/lib/project-plan/store";
import { currentAccount } from "@/lib/session";

import { PlanEditor } from "./PlanEditor";
import { SalesPlan } from "./SalesPlan";

/**
 * The plan as the Project page mounts it: the block, and under its window the
 * company admin's control for the two dates (ADR-0055). Anyone else reads the
 * plan; where no date is set they are told who sets one, never offered a
 * control they cannot use.
 */
export async function SalesPlanBlock({
  plan,
  role,
  tenant,
  tenantSlug,
  projectSlug,
  crmConnected,
}: {
  readonly plan: SalesPlanModel;
  readonly role: Viewer["role"];
  readonly tenant: { readonly name: string };
  readonly tenantSlug: string;
  readonly projectSlug: string;
  readonly crmConnected: boolean;
}) {
  const account = await currentAccount();
  const admin = account !== null && maySetSalesWindow(role, companyOf(account), tenant);
  const editor = admin ? (
    <PlanEditor
      tenant={tenantSlug}
      project={projectSlug}
      startsOn={plan.window?.startsOn ?? null}
      sellOutBy={plan.window?.sellOutBy ?? null}
      stored={salesWindowStore() !== null}
    />
  ) : plan.window === null ? (
    <p className="iris-plan-note">The admin of {tenant.name} sets the sell-out date.</p>
  ) : null;

  return (
    <SalesPlan plan={plan} sources={crmConnected ? ["CRM_OUTCOME_CONTEXT"] : []} editor={editor} />
  );
}
