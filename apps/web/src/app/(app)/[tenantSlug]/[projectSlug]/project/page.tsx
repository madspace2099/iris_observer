import type { Metadata } from "next";
import { Card, SectionHead, StateMessage } from "@observer/ui";
import { requireViewer } from "@/lib/session";
import { repository } from "@/lib/repository";

export const metadata: Metadata = { title: "Project" };

/**
 * Project.
 *
 * Deliberately not built yet. M2 ships two surfaces at final quality rather
 * than five at placeholder quality — a screen of grey boxes teaches a reviewer
 * nothing and costs the same to maintain as a real one.
 *
 * The section exists in the navigation because the information architecture is
 * part of what M2 is for, and because an honest "not yet" is more useful than
 * a fabricated chart.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ tenantSlug: string; projectSlug: string }>;
}) {
  const viewer = await requireViewer();
  const { tenantSlug, projectSlug } = await params;
  const { project } = await repository.resolveProject(viewer, tenantSlug, projectSlug);

  return (
    <Card as="section">
      <SectionHead title="Project" aside={project.name} />
      <StateMessage
        title="Arrives in M3"
        detail="This section will carry segment interest, the attention index, the attention-versus-conversion matrix, the unit competition graph and demand trends. The metrics behind it are already declared in the registry, and the measurement matrix lists every fact each one depends on."
      />
    </Card>
  );
}
