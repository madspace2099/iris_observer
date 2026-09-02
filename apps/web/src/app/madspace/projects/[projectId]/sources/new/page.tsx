import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Kicker, StateMessage } from "@observer/ui";

import { requireViewer } from "@/lib/session";
import { CONTROL_PLANE_ACCOUNT, controlPlane } from "@/lib/sources/control-plane";
import { ControlPlaneAbsent } from "@/components/madspace/ControlPlaneAbsent";
import { CreateSourceForm } from "@/components/madspace/CreateSourceForm";

export const metadata: Metadata = { title: "New source" };

/**
 * Registering an installation under a project.
 *
 * The project is resolved and NAMED before the form is offered, for two
 * reasons. An operator arriving from a project screen should see which estate
 * they are adding to — this route can be reached by a pasted URL, and creating
 * a showroom under the wrong development is a mistake nothing on the next
 * screen would reveal. And a project that is not this account's, or has been
 * archived, cannot take a source at all: `ObserverAdmin.createSource` scopes its
 * insert to active projects and would refuse after the operator had filled the
 * form in. Refusing the door is kinder than refusing the submission.
 *
 * The refusal is the same one every other door on this surface gives — the
 * project is simply not there — because telling "no such project" apart from
 * "somebody else's project" is an existence oracle for another estate.
 */
export default async function MadspaceNewSourcePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const viewer = await requireViewer();
  if (viewer.role !== "madspace_admin") redirect("/");

  const { projectId } = await params;
  const plane = await controlPlane();

  const projects = plane.ok
    ? await plane.admin.projectsForAccount({ account: CONTROL_PLANE_ACCOUNT })
    : null;
  const project =
    projects?.ok === true
      ? (projects.value.find((row) => row.project_id === projectId) ?? null)
      : null;
  const registrable = project !== null && project.status === "active";

  return (
    <>
      <header className="mad-head">
        <div className="mad-head-text">
          <Kicker>New source</Kicker>
          <h1 className="mad-title">{project?.name ?? "Unknown project"}</h1>
          <p className="mad-lede">
            One row per machine. Registering it here is what creates something to activate; the
            installation itself is switched on afterwards, from the showroom PC, with an activation
            code issued on the source&rsquo;s own screen.
          </p>
          <p className="mad-note">
            Nothing is heard from a source until it activates, so a new row appears awaiting its
            first heartbeat. That is the expected state, not a fault.
          </p>
        </div>
      </header>

      <section className="mad-plane" aria-labelledby="new-source-heading">
        <div className="obs-section-head">
          <h2 id="new-source-heading">Details</h2>
        </div>

        {!plane.ok ? (
          <ControlPlaneAbsent absence={plane.absence} />
        ) : project === null ? (
          <StateMessage
            title="Unavailable — this project cannot be read"
            detail="No project answering to this address is registered in the estate being administered. It may never have existed, or it may belong elsewhere. Open the project from the Projects list and register the source from there."
            action={
              <a className="obs-action" href="/madspace/projects">
                Back to Projects
              </a>
            }
          />
        ) : !registrable ? (
          <StateMessage
            title="Archived — this project takes no new sources"
            detail="Archival is terminal: the project and its record are kept, and nothing further is registered against it. Create the installation under an active project instead."
            action={
              <a className="obs-action" href={`/madspace/projects/${projectId}`}>
                Back to the project
              </a>
            }
          />
        ) : (
          <>
            <CreateSourceForm projectId={projectId} />
            {/*
             * The consequence, under the button rather than beside the heading:
             * `obs-section-head` pushes its aside to the far edge, half a screen
             * from the form it was describing.
             */}
            <p className="mad-note">
              Creating the source opens it, where an activation code is issued. The code is carried
              to the showroom machine and entered in the plugin; nothing is heard from the
              installation until that exchange completes.
            </p>
          </>
        )}
      </section>
    </>
  );
}
