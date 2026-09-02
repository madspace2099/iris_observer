import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ActionLink, Kicker, StateMessage } from "@observer/ui";
import { requireViewer } from "@/lib/session";
import {
  controlPlane,
  runningLocally,
  CONTROL_PLANE_ACCOUNT_NAME,
} from "@/lib/sources/control-plane";
import { projectSummaries, type ProjectSummary } from "@/lib/madspace/estate";
import { ageSince, instant } from "@/lib/madspace/format";
import { ControlPlaneAbsent } from "@/components/madspace/ControlPlaneAbsent";
import { BuildEstate } from "@/components/madspace/BuildEstate";
import { localControlPlaneEnabled } from "@/lib/sources/local-db";

export const metadata: Metadata = { title: "Projects" };

/**
 * Projects — the estate, one row per project.
 *
 * The row answers one question: how much of this project is actually
 * delivering? So the three counts are always shown against the same
 * denominator, because "four connected" is not a fact and "four of six" is.
 *
 * There are no analytics here, and there should never be. This screen is about
 * whether installations work, not about what they observed.
 */
export default async function MadspaceProjectsPage() {
  const viewer = await requireViewer();
  if (viewer.role !== "madspace_admin") redirect("/");

  const plane = await controlPlane();
  /*
   * Read before the header renders, because the header's own sentence is the
   * answer rather than an introduction to it. A page whose first line describes
   * what the page is has spent its best line on the reader's least useful
   * question.
   */
  const summaries = plane.ok ? await projectSummaries(plane.admin) : null;

  return (
    <>
      <header className="mad-head">
        <div className="mad-head-text">
          <Kicker>MADSPACE operations</Kicker>
          <h1 className="mad-title">Projects</h1>
          <p className="mad-lede">{lede(summaries)}</p>
          <p className="mad-note">
            Administering {CONTROL_PLANE_ACCOUNT_NAME} through the{" "}
            {runningLocally() ? "local development" : "hosted"} control plane. Every figure on this
            screen is scoped to that account.
          </p>
        </div>

        {/*
         * The one write on this screen, and it sits beside the sentence that
         * says how much of the estate there is. It is offered whether or not
         * the control plane opened: the form behind it states the absence
         * itself, which is a better answer than a button that has silently
         * disappeared.
         */}
        <div className="mad-head-actions">
          <ActionLink href="/madspace/projects/new" emphasis="primary">
            New project
          </ActionLink>
        </div>
      </header>

      {plane.ok ? (
        <Estate summaries={summaries ?? []} />
      ) : (
        <section className="mad-plane">
          <ControlPlaneAbsent absence={plane.absence} />
        </section>
      )}
    </>
  );
}

/**
 * The estate in one sentence, composed from the counts and nothing else.
 *
 * Written so the commonest reading of this screen — a glance — lands on the
 * number that decides whether anybody has work to do today.
 */
function lede(summaries: readonly ProjectSummary[] | null): string {
  if (summaries === null) {
    return `The estate of ${CONTROL_PLANE_ACCOUNT_NAME} cannot be read right now, and the reason is stated below rather than guessed at.`;
  }
  if (summaries.length === 0) {
    return `${CONTROL_PLANE_ACCOUNT_NAME} holds no readable sources, so there is no project to list yet.`;
  }

  const sources = summaries.reduce((total, project) => total + project.sourceCount, 0);
  const connected = summaries.reduce((total, project) => total + project.connectedCount, 0);
  const verified = summaries.reduce((total, project) => total + project.verifiedCount, 0);
  const scale = `${sources} ${sources === 1 ? "source" : "sources"} across ${summaries.length} ${summaries.length === 1 ? "project" : "projects"}.`;

  if (connected === 0) {
    return `${scale} None has ever been heard from — no heartbeat has been accepted from any of them.`;
  }
  if (connected === sources && verified === sources) {
    return `${scale} All of them have connected, and all have proved an event reaches storage.`;
  }
  return `${scale} ${connected} of ${sources} have connected; ${verified} of ${sources} have proved an event reaches storage.`;
}

function Estate({ summaries }: { summaries: readonly ProjectSummary[] }) {
  if (summaries.length === 0) {
    return (
      <section className="mad-plane">
        <StateMessage
          title="Empty — this account holds no sources"
          detail="Projects are listed here through the sources they own, and the control plane exposes no project read, so a project created without a source cannot appear yet. Create a source under a project to see it."
        />
        {/*
         * The way out of this screen, on this screen. Every other route into
         * the demonstration estate runs through Source Detail, which is reached
         * only through the list above — so an empty list was a dead end, and
         * the reset `seed.ts` recommends in its own error message led straight
         * into it.
         */}
        {localControlPlaneEnabled() ? <BuildEstate /> : null}
      </section>
    );
  }

  return (
    <section className="mad-plane" aria-labelledby="projects-heading">
      <div className="obs-section-head">
        <h2 id="projects-heading">Projects</h2>
        <p className="obs-dim">
          Most recently active first. A project that has never been heard from sorts below the live
          ones rather than above them.
        </p>
      </div>

      <div className="mad-rows">
        {summaries.map((summary) => (
          <ProjectRow key={summary.projectId} summary={summary} />
        ))}
      </div>
    </section>
  );
}

function ProjectRow({ summary }: { summary: ProjectSummary }) {
  const last = instant(summary.lastActivity, "No activity recorded");
  const age = ageSince(summary.lastActivity, new Date());

  return (
    <article className="mad-row mad-row--project">
      <div className="mad-row-id">
        <span className="mad-tally-label">Project</span>
        <h3 className="mad-row-name">
          <span className="obs-sr">Project </span>
          {summary.name}
        </h3>
        <ul className="mad-inline">
          <li>{summary.status === "active" ? "Active" : "Archived"}</li>
          <li>
            <strong>{summary.sourceCount}</strong>{" "}
            {summary.sourceCount === 1 ? "source" : "sources"}
          </li>
        </ul>
      </div>

      <div className="mad-tally">
        <div className="mad-tally-item">
          <span className="mad-tally-value">{summary.sourceCount}</span>
          <span className="mad-tally-label">Sources</span>
        </div>
        <div className="mad-tally-item">
          <span className="mad-tally-value">
            {summary.connectedCount}
            <span className="mad-tally-of"> of {summary.sourceCount}</span>
          </span>
          <span className="mad-tally-label">Connected</span>
        </div>
        <div className="mad-tally-item">
          <span className="mad-tally-value">
            {summary.verifiedCount}
            <span className="mad-tally-of"> of {summary.sourceCount}</span>
          </span>
          <span className="mad-tally-label">Ingestion verified</span>
        </div>
      </div>

      <div className="mad-meta-item">
        <span className="mad-meta-label">Last activity</span>
        <span className="mad-meta-value" data-missing={last.missing}>
          {last.text}
        </span>
        {age === null ? null : <span className="mad-note">{age}</span>}
      </div>

      <ActionLink href={`/madspace/projects/${summary.projectId}`}>Open project</ActionLink>
    </article>
  );
}
