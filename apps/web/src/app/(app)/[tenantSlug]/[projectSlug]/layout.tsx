import type { ReactNode } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NotFoundError, NotPermittedError } from "@observer/readmodels";

import { SettingsLink } from "@/components/iris/SettingsLink";
import { Shell } from "@/components/iris/Shell";
import type { SwitchOption } from "@/components/ContextSwitcher";
import { AskDock } from "@/components/ask-iris/AskDock";
import { SyntheticBadge } from "@/showroom/parts";
import { HOME_SEGMENT } from "@/lib/routes";
import { repository } from "@/lib/repository";
import { liveSessionSource } from "@/lib/connectors/session-source";
import { SESSION_COOKIE, destroySession, requireViewer } from "@/lib/session";

/**
 * The application shell, for the whole customer-facing product.
 *
 * It carries the three things every screen underneath depends on — which
 * project, which period, which role — and nothing else. Project and period live
 * in the URL rather than in client state, so any screen can be linked to and
 * shared exactly as it was read.
 *
 * ## What changed here, and what deliberately did not
 *
 * The chrome is now the approved IRIS shell (`components/iris/Shell.tsx`): one
 * header carrying the four sections, one context band carrying the switchers,
 * one sub-navigation row, and one `<main id="main">`. It replaces a hand-rolled
 * header, `PrimaryNav` and `DetailNav`, all of which said the same things in a
 * different vocabulary.
 *
 * What did not change is every rule this layout was already enforcing:
 * `requireViewer` first, the project resolved through the repository port, and
 * forbidden and missing rendered IDENTICALLY — telling an unauthorised reader
 * that a project exists is itself a disclosure, so the refusal cannot vary with
 * the reason for it.
 *
 * ## THE PERIOD, AND WHY IT IS NOT READ HERE
 *
 * A layout does not receive `searchParams`. That is not an oversight to work
 * around: a layout is not re-rendered when only the query changes, so a period
 * read here would be correct exactly once and stale from the reader's first use
 * of the period switcher.
 *
 * The shell therefore reads the period — and the current section — from the
 * router itself, which is the mechanism Next provides for this and the one this
 * file already relied on: `PrimaryNav`, `DetailNav` and `PeriodSwitcher` all
 * sat here and all read the URL that way. `headers()` was considered and
 * rejected: the URL a proxy reports is not the URL the router is on, and a
 * layout that reads one while linking with the other is a layout that lies
 * about where the reader is standing.
 *
 * ## Role filtering of the navigation
 *
 * This layout used to hide nav items the viewer's role could not open. Every
 * key in `PRIMARY_NAV`, `PROJECT_NAV` and `SECONDARY_NAV` now carries all four
 * roles in `SURFACES`, so that filter had become a no-op; and hiding a link was
 * never the control in any case. `requireSurface` refuses on the server, inside
 * each page, and a reader who types the URL meets the same refusal as a reader
 * who was never shown the link.
 */

export default async function ProjectLayout({
  children,
  params,
}: {
  children: ReactNode;
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
      /*
       * Forbidden and missing are rendered identically on purpose: telling an
       * unauthorised viewer that a project exists is itself a disclosure.
       *
       * This branch keeps its own `<main id="main">`, because the shell is not
       * rendered at all here and the skip link in the root layout still needs
       * somewhere to land.
       */
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

  /*
   * THE MODEL LIST IS NO LONGER RESOLVED HERE, AND THAT IS THE POINT.
   *
   * This layout used to read the account's connected providers so the floating
   * Observer rail could render a model picker. The rail is gone: the user asked
   * for the delivered prompt box at the foot of every surface instead, and that
   * box does not choose between models because nothing on this deployment
   * answers with one. `AskDock` names what actually composes an answer — the
   * read models — and its own menu says so.
   *
   * The grants machinery is untouched and still enforced where it matters: the
   * gate re-checks any model named in a request against the same grants, so
   * nothing about access depended on this list. Removing it also removes two
   * awaits from the critical path of every project page.
   */
  const held = await repository.listProjects(viewer, tenant.id);
  const tenants = await repository.listTenants(viewer);

  /*
   * Every project this account may open in this developer's portfolio.
   *
   * Each option carries its own href, because a server component cannot hand a
   * client control a function to build one — and because it keeps every route
   * shape in this file rather than scattered through the switcher. The target
   * is the home segment, not a named screen: ADR-0033 owns which screen that
   * is, and this file did not have to be told when it moved.
   */
  const projectOptions: readonly SwitchOption[] = held.map((p) => ({
    value: p.slug,
    label: p.name,
    href: `/${tenant.slug}/${p.slug}/${HOME_SEGMENT}`,
  }));

  /*
   * The first project of each developer this viewer holds.
   *
   * An agency manager works for more than one, and the shell offered no way to
   * move between them — the grant existed, the navigation did not, and the only
   * route was typing a URL. Never a combined view: two developers are two
   * businesses, and one aggregated screen would show each of them the other's
   * numbers.
   */
  const developers = await Promise.all(
    tenants.map(async (t) => {
      const held = await repository.listProjects(viewer, t.id);
      const first = held[0];
      return first === undefined
        ? null
        : {
            count: held.length,
            option: {
              value: t.slug,
              label: t.name,
              href: `/${t.slug}/${first.slug}/${HOME_SEGMENT}`,
            },
          };
    }),
  );
  const reachable = developers.filter((d): d is NonNullable<typeof d> => d !== null);
  const developerOptions: readonly SwitchOption[] = reachable.map((d) => d.option);

  /*
   * How many projects this account can open ALTOGETHER.
   *
   * Counted here because the lists were already read: the loop above asks each
   * developer for its projects and used to keep only the first. The project
   * switcher names this number to account for its own shorter list, which is
   * the one thing that screen could not say for itself.
   */
  const projectTotal = reachable.reduce((sum, d) => sum + d.count, 0);

  const root = `/${tenant.slug}/${project.slug}`;

  async function signOut() {
    "use server";
    const store = await cookies();
    // Clearing the cookie is not enough: the server record has to go too, or a
    // copied cookie keeps working after sign-out.
    destroySession(store.get(SESSION_COOKIE)?.value);
    store.delete(SESSION_COOKIE);
    redirect("/sign-in");
  }

  /*
   * THE ACCOUNT CONTROLS, RENDERED HERE AND PASSED IN AS A NODE.
   *
   * The shell is a client component — it has to be, to read the period off the
   * router — and a server action cannot cross that boundary as a function. It
   * can cross as rendered output, which is what this is: the form is built on
   * the server and handed to the shell already formed.
   *
   * Administration appears for `madspace_admin` and for nobody else. It is not
   * a navigation section (doctrine §7) and never becomes one; the surface
   * itself refuses every other role a second time.
   */
  const accountControls = (
    <>
      <SyntheticBadge />
      <Link className="ox-btn" data-weight="quiet" href="/projects">
        Projects
      </Link>
      {/*
        The way to the account's own settings, from inside a project. A reader
        told their questions are answered from evidence alone because they have
        no model connection must be able to reach the page that fixes it
        without leaving through the browser's Back button.
      */}
      <SettingsLink />
      {viewer.role === "madspace_admin" ? (
        <Link className="ox-btn" data-weight="quiet" href="/madspace">
          Administration
        </Link>
      ) : null}
      <form action={signOut}>
        <button className="ox-btn" data-weight="quiet" type="submit">
          Sign out
        </button>
      </form>
    </>
  );

  /**
   * The same account area, reduced to what the Ask IRIS reference draws.
   *
   * The delivered design puts two things on the right of that header: the
   * reader's name, and a bordered `Sign out` pill. No demonstration badge, no
   * Projects, no Settings. Those are not deleted from Observer — they are on
   * every other surface's header, one keystroke away — they are simply not in
   * the composition this screen is being matched to.
   *
   * The sign-out is the same server action as above. Two nodes, one action:
   * a second `signOut` would be a second place for the session contract to
   * drift.
   */
  const accountControlsAsk = (
    <form action={signOut}>
      <button className="irs-signout" type="submit">
        Sign out
      </button>
    </form>
  );

  /*
   * THE SOURCES BAND IS NOT FED, AND SAYS SO BY BEING ABSENT.
   *
   * `Shell` can name each installation and whether it is reporting. The read
   * models describe a surface's inputs only as a string union —
   * `webiris | showroom | crm | catalogue` — which is enough to decide whether
   * a figure can be computed and not enough to say WHICH machine went quiet.
   * There is no per-project source roster on the repository port, and inventing
   * one here would be fabricating the very fact the band exists to report. So
   * the prop is omitted, the band renders nothing, and the hole is left typed
   * and named for whoever adds `listProjectSources` to the port.
   */

  /*
   * Observer is chrome, not a page.
   *
   * It sits on every surface and carries the current analytical context, so a
   * question about the agent or the unit already on screen does not have to
   * name it. The voice session is held out here rather than inside either body,
   * so it survives navigation and both of them read the same conversation.
   * Holding it is not starting it — that still takes a click.
   *
   * It stands at the end of the main column now, in the flow, after the
   * page's content — not fixed over it. A fixed bar over a scrolling document
   * covers something at some scroll position whatever its size, and the
   * roster measured nine such positions of twenty-four. ASK IRIS in the
   * header is the full-size door to the same entity from the top of any page.
   */
  /*
   * Whether this project's meetings are its own showroom's. The one place it is
   * decided: the markers below and on every page read it off this wrapper.
   * `display: contents` keeps the wrapper out of the layout it surrounds.
   */
  const delivered = (await liveSessionSource.sessionsFor(project)) !== null;
  /*
   * Three answers, not two. A project made in administration shows only what its
   * own sources delivered: calling it a demonstration is false, and so is the
   * delivered marker's promise that whatever is missing is demonstration data.
   * It wears neither.
   */
  const world = project.ownDataOnly === true ? "own" : delivered ? "delivered" : "synthetic";

  return (
    <div data-sessions={world} style={{ display: "contents" }}>
      <Shell
        scope={{ tenantSlug: tenant.slug, projectSlug: project.slug }}
        viewer={{ displayName: viewer.displayName, roleLabel: roleLabel(viewer.role) }}
        projects={projectOptions}
        developerName={tenant.name}
        projectTotal={projectTotal}
        tenants={developerOptions}
        account={accountControls}
        accountAsk={accountControlsAsk}
      >
        {children}
        {/* The last child of `<main>`, after the content, in the flow. */}
        <AskDock root={root} periodParam="" projectLabel={project.name} />
      </Shell>
    </div>
  );
}

/**
 * The capacity, in the words a reader uses rather than the enum's.
 *
 * The shell states the reader's role beside their name, because more than one
 * of these surfaces shows a different thing to a developer than to an agent,
 * and the reader should never have to work out which one they are being shown.
 */
function roleLabel(role: string): string {
  switch (role) {
    case "developer":
      return "Developer";
    case "agency_manager":
      return "Agency manager";
    case "sales_agent":
      return "Sales agent";
    case "madspace_admin":
      return "MADSPACE administrator";
    default:
      return role;
  }
}
