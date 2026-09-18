import type { Metadata } from "next";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { Kicker } from "@observer/ui";

import { requireViewer } from "@/lib/session";
import { CONTROL_PLANE_ACCOUNT, controlPlane } from "@/lib/sources/control-plane";
import { lifecycleWord } from "@/lib/madspace/format";
import { ControlPlaneAbsent } from "@/components/madspace/ControlPlaneAbsent";
import { CreateSourceForm } from "@/components/madspace/CreateSourceForm";
import { InfoNote } from "@/components/madspace/InfoNote";

export const metadata: Metadata = { title: "New source" };

/**
 * A refusal, in the shape `StateMessage` renders, composed here for one reason.
 *
 * The primitive takes its title as a `string`, and this design system puts the
 * information disclosure beside the title it explains. Everything else is the
 * primitive's own markup, and its contract is carried over unchanged: empty,
 * insufficient, unavailable and error are four different situations, told apart
 * by the sentence they carry and never by a blank or a zero.
 */
function Refusal({
  title,
  about,
  detail,
  action,
}: {
  readonly title: string;
  /** The disclosure, when there is a definition to move off the surface. */
  readonly about?: ReactNode;
  readonly detail: string;
  readonly action: ReactNode;
}) {
  return (
    <div className="obs-state" role="status">
      <strong>
        {title}
        {about}
      </strong>
      <span>{detail}</span>
      {action}
    </div>
  );
}

/**
 * Why a project that is not active refuses the form, in that project's own words.
 *
 * `ObserverAdmin.createSource` scopes its insert to ACTIVE projects, so every
 * other status arrives here. This used to be one hard-coded branch: the title
 * said "Archived" and the note beside it called the decision terminal, which
 * told the operator of a SUSPENDED project two things that are false of it. A
 * suspension is a decision a person made and can lift; archival is not.
 *
 * So the status names itself through `lifecycleWord` — the same vocabulary the
 * project screens use, and the one that prints an unrecognised column value as
 * such rather than relabelling it with a confident guess — and only archival
 * carries the claim that nothing further is ever registered against the
 * project. The refusal's reason stays on the surface in every branch; the
 * disclosure holds only what the word means.
 *
 * Returns `null` for the one status that takes a source, so the caller has a
 * single value deciding between the form and the door.
 */
function lifecycleRefusal(status: string): {
  readonly title: string;
  readonly about?: ReactNode;
  readonly detail: string;
} | null {
  if (status === "active") return null;

  const title = `${lifecycleWord(status)}. This project takes no new sources`;

  if (status === "archived") {
    return {
      title,
      about: (
        <InfoNote label="what archiving a project settles">
          <p>
            Archival is terminal: the project and its record are kept, and nothing further is
            registered against it.
          </p>
        </InfoNote>
      ),
      detail: "Create the installation under an active project instead.",
    };
  }

  if (status === "suspended") {
    return {
      title,
      about: (
        <InfoNote label="what suspending a project holds">
          <p>
            Suspension is a decision somebody made, and it is not the end of the project. Its record
            and its existing sources are kept.
          </p>
          <p>
            Nothing new is registered against the project for as long as the suspension stands, and
            registering resumes once the project is active. It is not lifted from this screen.
          </p>
        </InfoNote>
      ),
      detail:
        "Create the installation under an active project, or register it here once this project is active again.",
    };
  }

  /*
   * A status this screen has never heard of. `lifecycleWord` has already said
   * which value the row actually holds, so the sentence states the rule that
   * refused rather than guessing at what the status means.
   */
  return {
    title,
    detail:
      "Only an active project accepts a new source. Open the project to see where it stands, and create the installation under an active project meanwhile.",
  };
}

/**
 * Registering an installation under a project.
 *
 * The project is resolved and NAMED before the form is offered, for two
 * reasons. An operator arriving from a project screen should see which estate
 * they are adding to — this route can be reached by a pasted URL, and creating
 * a showroom under the wrong development is a mistake nothing on the next
 * screen would reveal. And a project that is not this account's, or is not
 * active, cannot take a source at all: `ObserverAdmin.createSource` scopes its
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
  /* Null when the project is active, which is the only status that registers. */
  const refusal = project === null ? null : lifecycleRefusal(project.status);

  return (
    <>
      <header className="mad-head">
        <div className="mad-head-text">
          <Kicker>New source</Kicker>
          {/*
           * The disclosure is a SIBLING of the h1, not a child of it.
           *
           * A button inside a heading is folded into that heading's accessible
           * name, so the view announced as the project's name followed by the
           * whole title of the explanation beside it.
           */}
          <div className="mad-idline">
            <h1 className="mad-title">{project?.name ?? "Unknown project"}</h1>
            {/*
             * What registering does, and what it does not do, behind the
             * control rather than in front of the form. The second paragraph
             * is the one that must survive word for word: it is the difference
             * between a source that has not activated yet and a source that is
             * broken, and an operator who reads the new row as a fault will go
             * looking for a fix that does not exist.
             */}
            <InfoNote label="what registering a source does">
              <p>
                One row per machine. Registering it here is what creates something to activate; the
                installation itself is switched on afterwards, from the showroom PC, with an
                activation code issued on the source&rsquo;s own screen.
              </p>
              <p>
                Nothing is heard from a source until it activates, so a new row appears awaiting its
                first heartbeat. That is the expected state, not a fault.
              </p>
            </InfoNote>
          </div>
        </div>
      </header>

      <section className="mad-plane" aria-labelledby="new-source-heading">
        <div className="obs-section-head">
          <h2 id="new-source-heading">Details</h2>
        </div>

        {!plane.ok ? (
          <ControlPlaneAbsent absence={plane.absence} />
        ) : project === null ? (
          <Refusal
            title="Unavailable. This project cannot be read"
            detail="No project answering to this address is registered in the estate being administered. It may never have existed, or it may belong elsewhere. Open the project from the Projects list and register the source from there."
            action={
              <a className="obs-action" data-emphasis="primary" href="/madspace/projects">
                Back to Projects
              </a>
            }
          />
        ) : refusal !== null ? (
          <Refusal
            title={refusal.title}
            about={refusal.about}
            detail={refusal.detail}
            action={
              <a
                className="obs-action"
                data-emphasis="primary"
                href={`/madspace/projects/${projectId}`}
              >
                Back to the project
              </a>
            }
          />
        ) : (
          <CreateSourceForm projectId={projectId} />
        )}
      </section>
    </>
  );
}
