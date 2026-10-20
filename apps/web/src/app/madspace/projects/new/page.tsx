import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  PROJECT_SLUG,
  RESERVED_TENANT_SLUGS,
  TENANT_SLUG,
  projectDirectoryAdmin,
} from "@observer/sources";

import { directoryView } from "@/lib/accounts";
import { requireViewer } from "@/lib/session";
import { CONTROL_PLANE_ACCOUNT, controlPlane } from "@/lib/sources/control-plane";
import { observerDepsAsync } from "@/lib/sources/deps";
import { ControlPlaneAbsent } from "@/components/madspace/ControlPlaneAbsent";
import { OnboardingWizard } from "@/components/madspace/OnboardingWizard";

export const metadata: Metadata = { title: "New project" };

/**
 * Onboarding a client: Akhilesh's "Client & Engine Onboarding" (ADR-0044).
 *
 * The page is the wizard, in the shape of his modal: client, project, machine,
 * activation code, one press. What the four separate screens did one at a time
 * (Directory, New project, the project's Customer dashboard settings, New
 * source and the code dialog) now happens here in order, and those screens
 * stay for everything after the first day.
 *
 * The control plane is checked before the wizard is offered, because a wizard
 * whose last press can only fail is worse than a stated absence. The role
 * check is repeated from the layout deliberately: a layout is not a security
 * boundary, and this page renders a control that writes.
 */
export default async function MadspaceNewProjectPage() {
  const viewer = await requireViewer();
  if (viewer.role !== "madspace_admin") redirect("/");

  const plane = await controlPlane();
  if (!plane.ok) {
    return (
      <>
        <h1 className="mad-title">New project</h1>
        <ControlPlaneAbsent absence={plane.absence} />
      </>
    );
  }

  /* No developer pills on a database that stops before the directory migration. */
  const deps = await observerDepsAsync();
  const tenants =
    deps === null
      ? null
      : await projectDirectoryAdmin(deps)
          .tenants({ account: CONTROL_PLANE_ACCOUNT })
          .catch(() => null);

  return (
    <OnboardingWizard
      developers={
        tenants?.ok === true ? tenants.value.map((row) => ({ name: row.name, slug: row.slug })) : []
      }
      currencies={Intl.supportedValuesOf("currency")}
      reservedClientIds={RESERVED_TENANT_SLUGS}
      demonstrationClientIds={directoryView().tenants.map((tenant) => tenant.slug)}
      clientIdPattern={TENANT_SLUG.source}
      domainPattern={PROJECT_SLUG.source}
    />
  );
}
