import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionLink, Badge, Kicker, StateMessage } from "@observer/ui";
import { requireViewer } from "@/lib/session";
import { dynamicRoute } from "@/lib/href";
import {
  CONTROL_PLANE_ACCOUNT,
  controlPlane,
  sourceViews,
  HEALTH_LABEL,
  type SourceView,
} from "@/lib/sources/control-plane";
import {
  ageSince,
  environmentWord,
  instant,
  lifecycleWord,
  reported,
  sourceTypeWord,
} from "@/lib/madspace/format";
import { CopyValue } from "@/components/madspace/CopyValue";
import { ControlPlaneAbsent } from "@/components/madspace/ControlPlaneAbsent";

export const metadata: Metadata = { title: "Project" };

/**
 * Project detail — the sources under one project.
 *
 * One row per source, and the row carries the three states as three words
 * rather than as one summary, for the same reason Source Detail does: a
 * showroom whose plugin is healthy and whose events have never landed looks
 * identical to a working one behind a single green dot, and this list is where
 * an operator would first notice the difference.
 *
 * Deliberately no analytics. What was observed belongs to Observer; whether the
 * installation observes at all belongs here.
 */
export default async function MadspaceProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const viewer = await requireViewer();
  if (viewer.role !== "madspace_admin") redirect("/");

  const { projectId } = await params;
  const plane = await controlPlane();
  const now = new Date();
  const views = plane.ok ? await sourceViews(plane.admin, projectId, now) : null;
  /*
   * The project's own row, for its name and status. A separate read because the
   * facade that carries them is account-scoped rather than project-scoped — and
   * a project this account does not hold simply is not in the list, which is the
   * same refusal every other door here gives.
   */
  const projects = plane.ok
    ? await plane.admin.projectsForAccount({ account: CONTROL_PLANE_ACCOUNT })
    : null;
  const project =
    projects?.ok === true
      ? (projects.value.find((row) => row.project_id === projectId) ?? null)
      : null;

  return (
    <>
      <header className="mad-head">
        <div className="mad-head-text">
          <Kicker>Project</Kicker>
          <h1 className="mad-title">{project?.name ?? "Unknown project"}</h1>
          <p className="mad-lede">{lede(views)}</p>
          {/*
           * The identifier is SHOWN, not merely copyable.
           *
           * `CopyValue` renders a button and a status message and no value —
           * Source Detail pairs it with the identifier in a sibling span, and
           * this screen did not. The sentence beside it therefore read "Copy —
           * the identifier, for a support conversation", pointing at nothing,
           * and an operator reading a UUID aloud down a phone line had no UUID
           * to read. Quiet, in the same way and for the same reason as the
           * source identifier: needed rarely, and never the loudest thing here.
           */}
          <p className="mad-note mad-idline">
            <span className="mad-id">{projectId}</span>
            <CopyValue value={projectId} label="Copy the project identifier" />
          </p>
          <p className="mad-note">
            The identifier, for a support conversation or a plugin configuration. The name above is
            what the estate is known by.
          </p>
        </div>

        {/*
         * `mad-tally` is the CONTAINER and `mad-tally-item` the figure, which is
         * the vocabulary the projects list already uses. An earlier version of
         * this header invented `mad-tallies` and used `mad-tally` as the item —
         * a class that exists nowhere, so the figures fell back to default `dl`
         * flow and stacked loosely down the right-hand side.
         */}
        <dl className="mad-tally">
          <div className="mad-tally-item">
            <dd className="mad-tally-value">
              {project === null ? "Unknown" : project.status === "active" ? "Active" : "Archived"}
            </dd>
            <dt className="mad-tally-label">Status</dt>
          </div>
          <div className="mad-tally-item">
            <dd className="mad-tally-value">{views?.length ?? 0}</dd>
            <dt className="mad-tally-label">Sources</dt>
          </div>
          <div className="mad-tally-item">
            <dd className="mad-tally-value">
              {(views ?? []).filter((v) => v.states.connected).length}
              <span className="mad-tally-of"> of {views?.length ?? 0}</span>
            </dd>
            <dt className="mad-tally-label">Connected</dt>
          </div>
          <div className="mad-tally-item">
            <dd className="mad-tally-value">
              {(views ?? []).filter((v) => v.states.ingestionVerified).length}
              <span className="mad-tally-of"> of {views?.length ?? 0}</span>
            </dd>
            <dt className="mad-tally-label">Ingestion verified</dt>
          </div>
        </dl>
      </header>

      <section className="mad-plane" aria-labelledby="sources-heading">
        <div className="obs-section-head">
          <div>
            <h2 id="sources-heading">Sources</h2>
            <p className="obs-dim">Each row opens the installation it describes.</p>
          </div>
          {/*
           * The action sits on the plane it changes rather than in the page
           * head. A source is added TO this list, and a reader who has just
           * counted six rows is standing where the seventh would go.
           */}
          <ActionLink href={`/madspace/projects/${projectId}/sources/new`} emphasis="primary">
            Add source
          </ActionLink>
        </div>

        <div className="mad-rows">
          {/*
           * Three outcomes, and they must not look like one. The control plane
           * being unreadable is not "no sources" — telling an operator their
           * estate is empty when the database would not open is the worst
           * possible answer, because it is the one they might believe.
           */}
          {!plane.ok ? (
            <ControlPlaneAbsent absence={plane.absence} />
          ) : views === null || views.length === 0 ? (
            <StateMessage
              title="No sources yet"
              detail="Nothing has been registered against this project. A source is created here and then activated from the showroom machine itself."
            />
          ) : (
            views.map((view) => <SourceRow key={view.status.source_id} view={view} now={now} />)
          )}
        </div>
      </section>
    </>
  );
}

/** What the header says before any number is read. */
function lede(views: readonly SourceView[] | null): string {
  if (views === null) return "The control plane could not be read.";
  if (views.length === 0) return "No sources registered against this project yet.";

  const connected = views.filter((v) => v.states.connected).length;
  const verified = views.filter((v) => v.states.ingestionVerified).length;
  const total = views.length;
  const never = views.filter((v) => !v.states.connected).length;

  const head = `${total} ${total === 1 ? "source" : "sources"}. ${connected} of ${total} have connected; ${verified} of ${total} have proved an event reaches storage.`;
  return never === 0
    ? head
    : `${head} ${never} ${never === 1 ? "has" : "have"} never been heard from at all.`;
}

/**
 * The observed build, as one line.
 *
 * Four values a heartbeat MAY carry and often does not — a plugin that cannot
 * compute one of them must still be able to say it is alive. So each is
 * rendered individually as reported or not reported, and the line collapses to
 * a single sentence only when the source has reported nothing at all.
 */
function VersionLine({ view }: { view: SourceView }) {
  const operations = view.operations;
  const parts = [
    { label: "App", reading: reported(operations?.observed_app_version ?? null) },
    { label: "Plugin", reading: reported(operations?.observed_plugin ?? null) },
    { label: "Build", reading: reported(operations?.observed_build_id ?? null) },
    { label: "Engine", reading: reported(operations?.observed_engine ?? null) },
  ];

  if (parts.every((part) => part.reading.missing)) {
    return (
      <ul className="mad-inline">
        <li>No build reported</li>
      </ul>
    );
  }

  return (
    <ul className="mad-inline">
      {parts.map((part) => (
        <li key={part.label}>
          {part.label} <strong>{part.reading.text}</strong>
        </li>
      ))}
    </ul>
  );
}

function SourceRow({ view, now }: { view: SourceView; now: Date }) {
  const { status, operations, states, heartbeatFresh } = view;
  const heartbeat = instant(operations?.last_heartbeat_at ?? null);
  const verification = instant(operations?.ingestion_verified_at ?? null);
  const age = ageSince(operations?.last_heartbeat_at ?? null, now);

  return (
    <Link
      className="mad-row mad-row--source"
      href={dynamicRoute(`/madspace/sources/${status.source_id}`)}
    >
      <div className="mad-row-id">
        <span className="mad-tally-label">{sourceTypeWord(status.source_type)}</span>
        <h3 className="mad-row-name">{status.display_label}</h3>
        <ul className="mad-inline">
          <li>{environmentWord(status.environment)}</li>
          <li>{lifecycleWord(status.state)}</li>
          <li>{HEALTH_LABEL[view.health]}</li>
          {operations?.environment_mismatch === true ? <li>Environment mismatch</li> : null}
        </ul>
      </div>

      <div className="mad-row-id">
        {/*
         * Three words, never one. The row is the first place an operator would
         * see that a healthy-looking installation has never delivered anything.
         */}
        <div className="mad-badges">
          <Badge state={states.activated ? "good" : "unknown"}>
            {states.activated ? "Activated" : "Not activated"}
          </Badge>
          <Badge state={states.connected ? (heartbeatFresh ? "good" : "watch") : "unknown"}>
            {states.connected && heartbeatFresh ? "Connected" : "Offline"}
          </Badge>
          <Badge state={states.ingestionVerified ? "good" : "unknown"}>
            {states.ingestionVerified ? "Verified" : "Not verified"}
          </Badge>
        </div>
        <VersionLine view={view} />
      </div>

      <dl className="mad-facts">
        <div>
          <dt>Last heartbeat</dt>
          <dd data-missing={heartbeat.missing}>
            {heartbeat.text}
            {age === null ? null : <span className="mad-note"> · {age}</span>}
          </dd>
        </div>
        <div>
          <dt>Ingestion verified</dt>
          <dd data-missing={verification.missing}>{verification.text}</dd>
        </div>
      </dl>
    </Link>
  );
}
