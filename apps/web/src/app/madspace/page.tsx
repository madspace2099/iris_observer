import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Kicker } from "@observer/ui";

import { requireViewer } from "@/lib/session";
import { dynamicRoute } from "@/lib/href";
import { count } from "@/lib/madspace/format";
import {
  feedsOf,
  portfolio,
  portfolioSentence,
  type PortfolioProject,
} from "@/lib/madspace/portfolio";
import { localControlPlaneEnabled } from "@/lib/sources/local-db";
import { BuildEstate } from "@/components/madspace/BuildEstate";
import { InfoNote } from "@/components/madspace/InfoNote";
import { StatusChip, StatusMark } from "@/components/madspace/StatusMark";

export const metadata: Metadata = { title: "Projects" };

/**
 * PROJECTS: THE MADSPACE HOME (ADR-0047).
 *
 * The owner: "As a MADSPACE admin I should see ALL projects here", and the old
 * Projects screen beside it was the same list, so the two are one page and
 * `/madspace/projects` redirects here. Every project MADSPACE can see,
 * demonstration and control plane together, grouped by the company that owns
 * it, each row stating what is connected and how long ago it was heard from,
 * its roster, its meetings in two named windows, its status in words, and what
 * to do next. The figures are the repository's `ProjectDiagnostics`; this page
 * only lays them out.
 */
export default async function MadspaceHome() {
  const viewer = await requireViewer();
  /* A layout is not a security boundary; the page checks for itself. */
  if (viewer.role !== "madspace_admin") redirect("/");

  const all = await portfolio(viewer);

  return (
    <>
      <header className="mad-head">
        <div className="mad-head-text">
          <Kicker>MADSPACE administration</Kicker>
          <div className="mad-idline">
            <h1 className="mad-title">Projects</h1>
            <InfoNote label="what these figures are">
              <p>
                Meetings are counted the way each project&rsquo;s own screens count them, on the day
                that project runs on: the demonstration&rsquo;s fixed day, or today for a project
                whose showroom delivers.
              </p>
              <p>A feed last heard from more than 24 hours before that day is stale.</p>
            </InfoNote>
          </div>
          <p className="mad-lede">{portfolioSentence(all)}</p>
        </div>
        <div className="mad-head-actions">
          <Link className="ox-btn" data-weight="primary" href="/madspace/projects/new">
            New project
          </Link>
        </div>
      </header>

      {all.planeReadable ? null : (
        <p className="mad-empty">
          <strong>Projects made in administration are not listed</strong>
          <span>No control plane answered, so only the demonstration projects are shown.</span>
        </p>
      )}

      {all.companies.map((company, index) => (
        <section className="mad-plane" key={company.name} aria-labelledby={`company-${index}`}>
          <div className="mad-section-head">
            <h2 id={`company-${index}`}>{company.name}</h2>
          </div>
          <div className="mad-rows">
            {company.projects.map((project) => (
              <ProjectRow key={project.key} project={project} />
            ))}
          </div>
        </section>
      ))}

      {all.planeEmpty && localControlPlaneEnabled() ? <BuildEstate /> : null}
    </>
  );
}

function ProjectRow({ project }: { project: PortfolioProject }) {
  const { address, diagnostics, controlPlaneId } = project;
  const root = address === null ? null : `/${address.tenantSlug}/${address.projectSlug}`;
  const named = <span className="ox-sr"> {project.name}</span>;

  return (
    <article className="mad-row mad-row--portfolio">
      <div className="mad-row-id">
        <h3 className="mad-row-name">{project.name}</h3>
        <span className="mad-code">{root ?? "No address yet"}</span>
        <div className="mad-idline">
          <StatusChip tone={project.status.tone}>{project.status.word}</StatusChip>
        </div>
      </div>

      {diagnostics === null ? (
        <dl className="mad-facts mad-facts--portfolio">
          <div>
            <dt>In Observer</dt>
            <dd data-missing="true">
              {address === null
                ? "Not yet: a developer and an address come first"
                : "Its diagnosis could not be read"}
            </dd>
          </div>
        </dl>
      ) : (
        <dl className="mad-facts mad-facts--portfolio">
          <div>
            <dt>Connected</dt>
            <dd>
              <ul className="mad-feeds">
                {feedsOf(diagnostics).map((feed) => (
                  <li key={feed.label}>
                    <StatusMark tone={feed.tone} />
                    <span>
                      {feed.label} <span className="mad-feed-age">{feed.text}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </dd>
          </div>
          <div>
            <dt>Presenters</dt>
            <dd data-missing={diagnostics.roster === null}>
              {diagnostics.roster === null
                ? "No roster kept"
                : `${count(diagnostics.roster).text} on the roster`}
            </dd>
          </div>
          {diagnostics.windows.map((window) => (
            <div key={window.period.preset}>
              <dt>Meetings, {window.period.label}</dt>
              <dd className="mad-facts-figure">{count(window.meetings).text}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="mad-row-actions">
        {root === null ? null : (
          <>
            <Link className="ox-btn" href={dynamicRoute(`${root}/project`)}>
              Open in Observer{named}
            </Link>
            <Link
              className="ox-btn"
              data-weight="quiet"
              href={dynamicRoute(`/madspace/diagnostics${root}`)}
            >
              Diagnostics{named}
            </Link>
          </>
        )}
        {controlPlaneId === null ? null : (
          <>
            {root === null ? (
              <Link
                className="ox-btn"
                href={dynamicRoute(`/madspace/projects/${controlPlaneId}/dashboard`)}
              >
                Finish setup{named}
              </Link>
            ) : null}
            <Link
              className="ox-btn"
              data-weight="quiet"
              href={dynamicRoute(`/madspace/projects/${controlPlaneId}`)}
            >
              Sources{named}
            </Link>
            <Link
              className="ox-btn"
              data-weight="quiet"
              href={dynamicRoute(`/madspace/projects/${controlPlaneId}/integrations`)}
            >
              Integrations{named}
            </Link>
            {root === null ? null : (
              <Link
                className="ox-btn"
                data-weight="quiet"
                href={dynamicRoute(`/madspace/projects/${controlPlaneId}/dashboard`)}
              >
                Customer dashboard{named}
              </Link>
            )}
          </>
        )}
      </div>
    </article>
  );
}
