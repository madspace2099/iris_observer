import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NotFoundError, NotPermittedError } from "@observer/readmodels";
import { DetailNav, PrimaryNav } from "@/components/PrimaryNav";
import { ContextSwitcher } from "@/components/ContextSwitcher";
import { PeriodSwitcher } from "@/components/PeriodSwitcher";
import { ObserverRail } from "@/showroom/observer/ObserverRail";
import { ObserverVoiceProvider } from "@/showroom/observer/ObserverVoiceProvider";
import { SyntheticBadge } from "@/showroom/parts";
import { PRIMARY_NAV, SECONDARY_NAV, SURFACES } from "@/lib/routes";
import { repository } from "@/lib/repository";
import { SESSION_COOKIE, destroySession, requireViewer } from "@/lib/session";

/**
 * The application shell.
 *
 * Carries the three things every screen underneath depends on — which project,
 * which period, which role — and nothing else. Project and period live in the
 * URL rather than in client state, so any screen can be linked to exactly as
 * it was read.
 *
 * The chrome is thin by design: a top rail and a bottom command rail, with the
 * whole middle given to the subject. `docs/14-design-system.md` §3.
 */

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenantSlug: string; projectSlug: string }>;
}) {
  const viewer = await requireViewer();
  const { tenantSlug, projectSlug } = await params;

  let tenant;
  let project;
  try {
    ({ tenant, project } = await repository.resolveProject(viewer, tenantSlug, projectSlug));
  } catch (error) {
    if (error instanceof NotPermittedError || error instanceof NotFoundError) {
      // Forbidden and missing are rendered identically on purpose: telling an
      // unauthorised viewer that a project exists is itself a disclosure.
      return (
        <main className="iris" id="main" style={{ padding: "4rem 2.5rem" }}>
          <div style={{ maxWidth: "40rem" }}>
            <p className="iris-kicker">Not available</p>
            <h1 className="iris-section">This project is not available to your account.</h1>
            <p className="iris-meta">
              If you expected access, ask the developer who owns the project to grant it.
            </p>
            <div className="iris-actions" style={{ marginTop: "1.5rem" }}>
              <a className="iris-action" data-emphasis="primary" href="/">
                Back to your projects
              </a>
            </div>
          </div>
        </main>
      );
    }
    throw error;
  }

  const projects = await repository.listProjects(viewer, tenant.id);
  const tenants = await repository.listTenants(viewer);

  /*
   * The first project of each developer this viewer holds.
   *
   * Tomáš works for two developers and the shell offered no way to reach the
   * second — the grant existed, the navigation did not, and the only route was
   * typing a URL. Never a combined view: two developers are two businesses, and
   * one aggregated screen would show each of them the other's numbers.
   */
  const developers = await Promise.all(
    tenants.map(async (t) => {
      const held = await repository.listProjects(viewer, t.id);
      const first = held[0];
      return first === undefined
        ? null
        : { value: t.slug, label: t.name, href: `/${t.slug}/${first.slug}/showroom` };
    }),
  );
  const developerOptions = developers.filter((d): d is NonNullable<typeof d> => d !== null);
  const root = `/${tenant.slug}/${project.slug}`;

  const permits = (key: string) => {
    const surface = SURFACES.find((s) => s.route.endsWith(`/${key}`));
    return surface === undefined || surface.requiresRole.includes(viewer.role);
  };

  const allowedSections = PRIMARY_NAV.filter((item) => permits(item.key)).map((item) => item.key);
  const allowedDetail = SECONDARY_NAV.filter((item) => permits(item.key)).map((item) => item.key);

  async function signOut() {
    "use server";
    const store = await cookies();
    // Clearing the cookie is not enough: the server record has to go too, or a
    // copied cookie keeps working after sign-out.
    destroySession(store.get(SESSION_COOKIE)?.value);
    store.delete(SESSION_COOKIE);
    redirect("/sign-in");
  }

  return (
    <div className="iris">
      <header className="iris-top">
        <div className="iris-brand">
          <b>IRIS</b>
          <span>Observer</span>
          <SyntheticBadge />
        </div>

        <PrimaryNav root={root} allowed={allowedSections} />

        <div className="iris-ambient">
          {developerOptions.length > 1 ? (
            <ContextSwitcher label="Developer" value={tenant.slug} options={developerOptions} />
          ) : null}
          <ContextSwitcher
            label="Project"
            value={project.slug}
            options={projects.map((p) => ({
              value: p.slug,
              label: p.name,
              href: `/${tenant.slug}/${p.slug}/showroom`,
            }))}
          />
          <PeriodSwitcher />
          {/*
            The way back to the selector.
            One link, using the control class the header already has. The
            project switcher beside it moves between grants; this is how a
            reader leaves the workspace without signing out.
          */}
          <a className="iris-action" href="/projects">
            Projects
          </a>
          {viewer.role === "madspace_admin" ? (
            <a className="iris-action" href="/madspace">
              Administration
            </a>
          ) : null}
          <span
            className="iris-code"
            title={`${viewer.organisationName} · ${viewer.role.replace(/_/g, " ")}`}
          >
            {viewer.displayName}
            {tenants.length > 1 ? ` · ${tenants.length} developers` : ""}
          </span>
          <form action={signOut}>
            <button className="iris-action" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <DetailNav root={root} allowed={allowedDetail} />

      {/*
       * Observer is chrome, not a page.
       *
       * It sits on every surface and carries the current analytical context, so
       * a question about the agent or the unit already on screen does not have
       * to name it. The briefing renders the same entity at full size; here it
       * is collapsed to a presence and a prompt.
       *
       * The voice session is held out here rather than inside either body, so
       * it survives navigation and both of them read the same conversation.
       * Holding it is not starting it — that still takes a click.
       */}
      <ObserverVoiceProvider projectLabel={project.name} root={root} role={viewer.role}>
        <main className="iris-stage" id="main" style={{ display: "block", overflowY: "auto" }}>
          {children}
        </main>

        <ObserverRail projectLabel={project.name} root={root} role={viewer.role} />
      </ObserverVoiceProvider>
    </div>
  );
}
