import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Kicker } from "@observer/ui";

import { requireViewer } from "@/lib/session";
import { controlPlane } from "@/lib/sources/control-plane";
import { ControlPlaneAbsent } from "@/components/madspace/ControlPlaneAbsent";
import { CreateProjectForm } from "@/components/madspace/CreateProjectForm";
import { InfoNote } from "@/components/madspace/InfoNote";

export const metadata: Metadata = { title: "New project" };

/**
 * Registering a project.
 *
 * The screen is one field, and the sentences that used to stand around it are
 * now behind the `i` beside the title and beside the label. A project is a
 * container: it holds sources, it carries a name, and nothing about it is
 * operational until an installation exists under it. That explanation is still
 * worth having — it is just no longer standing in front of the control the
 * operator came here to use.
 *
 * The account and the control plane are the exception, and they are the reason
 * the scope band exists. They are not explanation: they say which estate the
 * row lands in and which database answered. `layout.tsx` states the same pair
 * on every screen because an operator who cannot tell a local development plane
 * from a hosted one will eventually believe a demonstration estate is a
 * customer's. A caption under the lede was too quiet for that; ink as a surface
 * is what stops it reading as part of the page below.
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
          {/*
           * The control is a SIBLING of the heading, never inside it.
           *
           * A button inside the `h1` joins the heading's accessible name, so
           * this view announced as "New project About what a project is" and
           * the heading stopped naming the view. `mad-idline` puts the two on
           * one line without putting one inside the other.
           */}
          <div className="mad-idline">
            <h1 className="mad-title">New project</h1>
            <InfoNote label="what a project is">
              <p>A project is the development its installations belong to.</p>
              <p>
                Naming it is the whole of this step. Sources are registered under it afterwards, one
                per machine.
              </p>
            </InfoNote>
          </div>
        </div>
      </header>

      {/*
       * The scope of the write, on ink rather than in a caption.
       *
       * It is stated above the form and not behind a disclosure because it is
       * the party the write reaches, which is the one class of sentence that may
       * never move behind the `i`. The band lists what the write touches and
       * what it does not, and the surface change is what separates it from the
       * page underneath.
       */}
      <p className="mad-note">Nothing created here is visible to a customer surface.</p>

      <section className="mad-plane" aria-labelledby="new-project-heading">
        <div className="obs-section-head">
          <h2 id="new-project-heading">Details</h2>
        </div>

        {plane.ok ? <CreateProjectForm /> : <ControlPlaneAbsent absence={plane.absence} />}
      </section>
    </>
  );
}
