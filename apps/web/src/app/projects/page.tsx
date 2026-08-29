import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { dynamicRoute } from "@/lib/href";
import { repository } from "@/lib/repository";
import { SESSION_COOKIE, destroySession, requireAccount, requireViewer } from "@/lib/session";
import "@/portal/portal.css";

export const metadata: Metadata = { title: "Projects" };

/**
 * THE PROJECT SELECTOR.
 *
 * Where every account lands after signing in, and the only way into an Observer
 * workspace. The flow is ACCOUNT then PROJECTS then OBSERVER, with nothing
 * between this page and the sign-in.
 *
 * It replaced two things: the profile picker, which asked people to choose an
 * identity they already had and is now confined to the design laboratory, and
 * the root redirect, which chose a project for them and hid the fact that there
 * were others.
 *
 * ## Generated from grants, not filtered for display
 *
 * The list comes from `repository.listProjects(viewer, tenant)` for each tenant
 * the account holds. The viewer's `projectIds` are explicit per-project grants:
 * a sales agent assigned to one project has one entry and therefore one card,
 * and adding a project to the world does not add it to their list. Hiding a
 * card would not be authorisation — so this page does not hide anything. It
 * asks what the account may see and renders the answer.
 *
 * The same grant is enforced again inside the project, by the layout, by
 * `requireSurface`, and by the repository on every read. A reader who types
 * another developer's project into the address bar does not reach a hidden
 * page; they reach a refusal.
 *
 * ## The card carries four things
 *
 * A cover, the developer, the project, and one action. No progress, no status,
 * no milestone, no next action, no analytics preview — this is a doorway, and
 * a doorway that reports figures invites somebody to read them instead of
 * opening it.
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
    <div className="mp">
      <a className="mp-skip" href="#main">
        Skip to content
      </a>

      <header className="mp-bar">
        <div className="mp-bar-inner">
          <span className="mp-bar-brand">MADSPACE</span>
          <span className="mp-bar-product">IRIS Observer</span>

          <div className="mp-bar-right">
            <span className="mp-chip">Demo</span>
            <span className="mp-bar-who">
              <strong>{account.displayName}</strong>
              <span>{viewer.organisationName}</span>
            </span>
            <form action={signOut}>
              <button type="submit" className="mp-btn" data-weight="secondary">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="mp-banner">
        <p className="mp-banner-inner">
          <span className="mp-chip">Demonstration environment</span>
          Synthetic data throughout. Nothing here is a real development.
        </p>
      </div>

      <main className="mp-main" id="main" tabIndex={-1}>
        <div className="mp-head">
          <div>
            <p className="mp-head-eyebrow">{viewer.organisationName}</p>
            <h1>Projects</h1>
          </div>
          <p className="mp-count">
            {cards.length === 1 ? "1 project" : `${cards.length} projects`}
          </p>
        </div>

        {cards.length === 0 ? (
          <div className="mp-empty">
            <strong>No project has been opened for your account yet</strong>
            <p>
              A project appears here as soon as MADSPACE grants your account access to it. Access is
              granted per project; nothing is shared automatically.
            </p>
          </div>
        ) : (
          <ul className="mp-grid">
            {cards.map(({ tenant, project }) => (
              <li className="mp-card" key={project.id}>
                {/*
                  The cover, one of the four things this card may carry.

                  No project has a photograph yet, so it shows the reference's
                  own placeholder gradient and waits for one — set through the
                  --cover-image custom property when covers arrive, without
                  touching this markup. The caption scrim is not rendered: it
                  exists to hold text against a photograph, and over a
                  placeholder it is a grey wash over a grey tile.
                */}
                <div className="mp-cover" />

                <div className="mp-card-body">
                  <p className="mp-developer">{tenant.name}</p>
                  <h2 className="mp-project">{project.name}</h2>

                  <p className="mp-card-action">
                    <Link
                      className="mp-open"
                      href={dynamicRoute(`/${tenant.slug}/${project.slug}/showroom`)}
                    >
                      Open Observer
                      <span className="obs-sr">
                        {" "}
                        for {project.name}, {tenant.name}
                      </span>
                    </Link>
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
