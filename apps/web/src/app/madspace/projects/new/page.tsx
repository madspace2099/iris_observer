import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Kicker } from "@observer/ui";

import { requireViewer } from "@/lib/session";
import {
  CONTROL_PLANE_ACCOUNT_NAME,
  controlPlane,
  runningLocally,
} from "@/lib/sources/control-plane";
import { ControlPlaneAbsent } from "@/components/madspace/ControlPlaneAbsent";
import { CreateProjectForm } from "@/components/madspace/CreateProjectForm";

export const metadata: Metadata = { title: "New project" };

/**
 * Registering a project.
 *
 * The screen is one field and the sentences around it, and that ratio is the
 * design. A project is a container: it holds sources, it carries a name, and
 * nothing about it is operational until an installation exists under it. So the
 * page says what happens next rather than pretending the form is bigger than it
 * is.
 *
 * The control plane is checked before the form is offered. A form whose submit
 * button can only ever fail is worse than a stated absence, and the absence
 * here is a configuration fact with a fix in it.
 *
 * The role check is repeated from the layout deliberately: a layout is not a
 * security boundary, and this page is the one that renders a control that
 * writes.
 */
export default async function MadspaceNewProjectPage() {
  const viewer = await requireViewer();
  if (viewer.role !== "madspace_admin") redirect("/");

  const plane = await controlPlane();

  return (
    <>
      <header className="mad-head">
        <div className="mad-head-text">
          <Kicker>MADSPACE operations</Kicker>
          <h1 className="mad-title">New project</h1>
          <p className="mad-lede">
            A project is the development its installations belong to. Naming it is the whole of this
            step — sources are registered under it afterwards, one per machine.
          </p>
          <p className="mad-note">
            It will be created in {CONTROL_PLANE_ACCOUNT_NAME}, through the{" "}
            {runningLocally() ? "local development" : "hosted"} control plane. Nothing here is
            visible to a customer surface.
          </p>
        </div>
      </header>

      <section className="mad-plane" aria-labelledby="new-project-heading">
        <div className="obs-section-head">
          <h2 id="new-project-heading">Details</h2>
        </div>

        {plane.ok ? <CreateProjectForm /> : <ControlPlaneAbsent absence={plane.absence} />}

        {/*
         * What pressing the button does, under the button rather than beside
         * the heading. `obs-section-head` justifies its aside to the far edge,
         * which on a page whose form is capped at a readable measure left this
         * sentence stranded half a screen away from anything it described.
         */}
        {plane.ok ? (
          <p className="mad-note">
            Creating the project opens it, ready for its first source. Nothing is registered against
            it until then.
          </p>
        ) : null}
      </section>
    </>
  );
}
