import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { dynamicRoute } from "@/lib/href";
import { HOME_SEGMENT } from "@/lib/routes";
import { repository } from "@/lib/repository";
import { SESSION_COOKIE, destroySession, requireAccount, requireViewer } from "@/lib/session";

export const metadata: Metadata = { title: "Projects" };

/**
 * THE PROJECT CHOOSER.
 *
 * No longer the normal post-sign-in destination — `resolveLandingPath` now
 * sends most accounts straight to a project's Ask IRIS. This page is what
 * that resolution falls back to: no last project remembered, no default, or
 * more than one project and no way to guess which one. It is also reachable
 * on purpose, from the account-settings "Projects" link and this page's own
 * header, for a reader who wants to switch deliberately.
 *
 * ## It wears Observer's own chrome, not a separate portal
 *
 * This was `.mp-*` (`portal.css`) — a light MADSPACE-portal composition sharing
 * nothing with Ask IRIS, Sales Flow, Project or Sales Agents. A reader landing
 * here mid-session, from a project's own header, met a different product.
 *
 * It now uses the same shell (`.irs-header`/`.irs-shell`, `iris-shell.css`), the
 * same graphite ground and content system (`.ox-*`, `observer-product.css`) as
 * every project surface, and the same account-level header treatment already
 * established for `/settings/ai` (`.os-*`, `observer-settings.css`) — the other
 * page with no project to scope a nav to. `portal.css` is untouched: `/sign-in`
 * still uses it, and darkening those classes would have redesigned sign-in as
 * a side effect of this page.
 *
 * ## The shell component is not reused, for the same reason `/settings/ai`
 * doesn't either
 *
 * `Shell` builds its four-item nav from a tenant and a project. This page is
 * how a reader gets to one — passing it a project to draw the chrome would
 * claim they are already inside it. So the header is composed from the same
 * CSS instead: no project nav, no context band, no period. The wordmark is
 * plain rather than a link home, because this page IS the way home when there
 * is no single project to send it to.
 *
 * ## Still four things, on purpose
 *
 * A row carries the project's name, its developer, and one action — no
 * status, no last-activity figure, no analytics preview. That was true of the
 * previous `.mp-card` and stays true here: a chooser that reports figures
 * invites a reader to read them instead of opening the project, and no such
 * figure exists yet that isn't better read inside Observer itself.
 */
export default async function Projects() {
  const account = await requireAccount();
  const viewer = await requireViewer();

  const tenants = await repository.listTenants(viewer);
  const grouped = await Promise.all(
    tenants.map(async (tenant) => ({
      tenant,
      projects: await repository.listProjects(viewer, tenant.id),
    })),
  );

  const cards = grouped.flatMap(({ tenant, projects }) =>
    projects.map((project) => ({ tenant, project })),
  );

  async function signOut(): Promise<void> {
    "use server";
    const store = await cookies();
    destroySession(store.get(SESSION_COOKIE)?.value);
    store.delete(SESSION_COOKIE);
    redirect("/sign-in");
  }

  return (
    <div className="irs-shell ox-root ox-graphite">
      <header className="irs-header">
        <div className="irs-brand">
          <img className="irs-brand-mark" src="/brand/iris-wordmark.svg" alt="IRIS" />
          <span className="irs-brand-sub" aria-label="by MADSPACE">
            by MADSPACE
          </span>
        </div>

        <p className="os-header-title">Projects</p>

        <div className="irs-header-end">
          <div className="irs-who">
            <div className="irs-who-name">{account.displayName}</div>
            <div className="irs-who-role">{viewer.organisationName}</div>
          </div>
          {/*
           * Administration, for the role that holds it — reachable without
           * opening a project first. Gated by role, not by hiding, the same
           * way every other Administration link in the app is.
           */}
          {viewer.role === "madspace_admin" ? (
            <Link className="ox-btn" data-weight="quiet" href={dynamicRoute("/madspace")}>
              Administration
            </Link>
          ) : null}
          <Link className="ox-btn" data-weight="quiet" href={dynamicRoute("/settings/ai?from=%2Fprojects")}>
            Settings
          </Link>
          <form action={signOut}>
            <button className="ox-btn" data-weight="quiet" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main className="irs-main" id="main" tabIndex={-1}>
        <div className="os-column">
          <div className="ox-head">
            <div className="ox-head-text">
              <p className="ox-kicker">{viewer.organisationName}</p>
              <h1 className="ox-title">Projects</h1>
              <p className="ox-lede">
                Select the project you want to open in Observer.{" "}
                {cards.length === 1 ? "1 project" : `${cards.length} projects`} available to your
                account.
              </p>
            </div>
          </div>

          {cards.length === 0 ? (
            <p className="ox-lede">
              No project has been opened for your account yet. A project appears here as soon as
              MADSPACE grants your account access to it — access is granted per project, and
              nothing is shared automatically.
            </p>
          ) : (
            <ul className="ox-threads">
              {cards.map(({ tenant, project }) => (
                <li className="ox-thread-row" key={project.id}>
                  <p className="ox-thread-title">{project.name}</p>
                  {/*
                    The doorway, pointed at the home segment rather than at a
                    named screen — ADR-0033 moved where a project opens, and
                    this row does not need to know which surface answers
                    first.
                  */}
                  <Link
                    className="ox-btn"
                    data-weight="primary"
                    href={dynamicRoute(`/${tenant.slug}/${project.slug}/${HOME_SEGMENT}`)}
                  >
                    Open
                    <span className="ox-sr">
                      {" "}
                      Observer for {project.name}, {tenant.name}
                    </span>
                  </Link>
                  <p className="ox-thread-context">{tenant.name}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
