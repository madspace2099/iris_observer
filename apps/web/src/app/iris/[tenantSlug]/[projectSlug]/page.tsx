import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NotFoundError, NotPermittedError } from "@observer/readmodels";

import { Shell } from "@/components/iris/Shell";
import { AskIris } from "@/components/iris/AskIris";
import { repository } from "@/lib/repository";
import { requireViewer } from "@/lib/session";

export const metadata: Metadata = { title: "Ask IRIS" };

/**
 * ASK IRIS — the landing surface, in the approved design.
 *
 * ## Why this route exists beside the application rather than inside it
 *
 * `docs/12-visual-autopsy.md` §5 sets the order for visual work: audit,
 * direction, isolated flagship prototype, visual review, user selection,
 * rollout. This is the flagship. It renders the new shell whole, at a real URL,
 * against the real read model — and it disturbs nothing, so the twelve existing
 * surfaces keep working while the design is judged.
 *
 * Rolling it out means moving this composition into
 * `(app)/[tenantSlug]/[projectSlug]` and retiring the old chrome. That is one
 * commit once the design is accepted, and it is deliberately not this one.
 *
 * ## One question the design does not answer
 *
 * The current application shell carries a project switcher and a period
 * switcher, and every analytical surface depends on both — a chart without a
 * period is a chart of nothing in particular. The artefact shows neither,
 * because it shows only this page, where neither is needed.
 *
 * So they are absent here, honestly, rather than invented in a style the design
 * never specified. Where they live is the open question the rollout has to
 * settle, and it is stated in the report rather than guessed at in code.
 */
export default async function IrisAskPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; projectSlug: string }>;
}) {
  const viewer = await requireViewer();
  const { tenantSlug, projectSlug } = await params;

  let project;
  try {
    ({ project } = await repository.resolveProject(viewer, tenantSlug, projectSlug));
  } catch (error) {
    /*
     * Forbidden and missing render identically, exactly as the existing layout
     * does it: telling an unauthorised viewer that a project exists is itself a
     * disclosure.
     */
    if (error instanceof NotPermittedError || error instanceof NotFoundError) redirect("/projects");
    throw error;
  }

  return (
    <Shell
      scope={{ tenantSlug, projectSlug }}
      viewer={{ displayName: viewer.displayName, roleLabel: roleLabel(viewer.role) }}
      current="ask"
    >
      <AskIris projectName={project.name} />
    </Shell>
  );
}

/** The capacity, in the words a reader uses rather than the enum's. */
function roleLabel(role: string): string {
  switch (role) {
    case "developer":
      return "Developer";
    case "agency_manager":
      return "Agency manager";
    case "sales_agent":
      return "Sales agent";
    case "madspace_admin":
      return "MADSPACE administrator";
    default:
      return role;
  }
}
