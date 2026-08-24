import { redirect } from "next/navigation";
import { repository } from "@/lib/repository";
import { currentViewer } from "@/lib/session";

/**
 * The entry point sends the viewer to their first accessible project rather
 * than to a chooser. A landing page whose only content is "pick a project" is
 * a step, not a screen.
 */
export default async function Home() {
  const viewer = await currentViewer();
  if (viewer === null) redirect("/sign-in");

  const tenants = await repository.listTenants(viewer);
  const tenant = tenants[0];
  if (tenant === undefined) redirect("/sign-in");

  const projects = await repository.listProjects(viewer, tenant.id);
  const project = projects[0];
  if (project === undefined) redirect("/sign-in");

  redirect(`/${tenant.slug}/${project.slug}/showroom`);
}
