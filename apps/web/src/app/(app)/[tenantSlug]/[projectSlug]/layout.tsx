import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NotFoundError, NotPermittedError } from "@observer/readmodels";
import { PrimaryNav } from "@/components/PrimaryNav";
import { ContextSwitcher } from "@/components/ContextSwitcher";
import { PRIMARY_NAV, SURFACES } from "@/lib/routes";
import { repository } from "@/lib/repository";
import { SESSION_COOKIE, requireViewer } from "@/lib/session";

/**
 * The application shell.
 *
 * Carries the three things every screen underneath depends on — which project,
 * which period, which role — and nothing else. Project and period live in the
 * URL rather than in client state, so any screen can be linked to exactly as
 * it was read.
 */

const PERIOD_LABELS = [
  ["quarter_to_date", "Quarter to date"],
  ["last_28_days", "Last 28 days"],
  ["last_quarter", "Last completed quarter"],
  ["year_to_date", "Year to date"],
] as const;

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
        <main className="obs-shell" id="main">
          <div className="obs-main" style={{ maxWidth: "40rem" }}>
            <p className="obs-kicker">Not available</p>
            <h1 style={{ margin: 0, fontSize: "var(--text-h5)" }}>
              This project is not available to your account.
            </h1>
            <p className="obs-muted">
              If you expected access, ask the developer who owns the project to grant it.
            </p>
            <div className="obs-actions">
              <a className="obs-action" data-emphasis="primary" href="/">
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
  const root = `/${tenant.slug}/${project.slug}`;

  const allowedSections = PRIMARY_NAV.filter((item) => {
    const surface = SURFACES.find((s) => s.route.endsWith(`/${item.key}`));
    return surface === undefined || surface.requiresRole.includes(viewer.role);
  }).map((item) => item.key);

  async function signOut() {
    "use server";
    const store = await cookies();
    store.delete(SESSION_COOKIE);
    redirect("/sign-in");
  }

  return (
    <div className="obs-shell">
      <header className="obs-header">
        <div className="obs-brand">
          <span className="obs-brand-mark">IRIS</span>
          <span>Observer</span>
        </div>

        <ContextSwitcher
          label="Project"
          value={project.slug}
          options={projects.map((p) => ({
            value: p.slug,
            label: p.name,
            href: `/${tenant.slug}/${p.slug}/overview`,
          }))}
        />

        <ContextSwitcher
          label="Period"
          value="quarter_to_date"
          options={PERIOD_LABELS.map(([value, label]) => ({
            value,
            label,
            href: `${root}/overview?period=${value}`,
          }))}
        />

        <div className="obs-header-end">
          {viewer.role === "madspace_admin" ? (
            <a className="obs-action" href="/madspace">
              Administration
            </a>
          ) : null}
          <div className="obs-who">
            <strong>{viewer.displayName}</strong>
            <span>
              {viewer.organisationName} · {viewer.role.replace(/_/g, " ")}
              {tenants.length > 1 ? ` · ${tenants.length} developers` : ""}
            </span>
          </div>
          <form action={signOut}>
            <button className="obs-action" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <PrimaryNav root={root} allowed={allowedSections} />

      <main className="obs-main" id="main">
        {children}
      </main>
    </div>
  );
}
