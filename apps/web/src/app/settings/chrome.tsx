import type { ReactNode } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import type { Viewer } from "@observer/readmodels";
import { dynamicRoute } from "@/lib/href";
import { repository } from "@/lib/repository";
import { HOME_SEGMENT } from "@/lib/routes";
import { SESSION_COOKIE, destroySession } from "@/lib/session";
import { safeReturnTo } from "@/portal/return-to";

/**
 * THE ACCOUNT SETTINGS' CHROME, SHARED BY ITS PAGES.
 *
 * `/settings/ai` and `/settings/crm` are two pages of one place, so they wear
 * one header, one way back and one row naming both. Moved here from the AI page
 * unchanged when the CRM page arrived (ADR-0049); the reasons below are that
 * page's, and still hold.
 *
 * ## IT WEARS THE PRODUCT'S CHROME, NOT THE PORTAL'S
 *
 * The same header as every project surface (`.irs-header` and its parts, from
 * `iris-shell.css`), the same graphite ground and the same content system
 * (`.ox-*`). `observer-settings.css` adds only what neither already had.
 *
 * ## The shell component is NOT reused, and the reason is honesty
 *
 * `Shell` requires a `scope` — a tenant and a project — and builds its four nav
 * items from it. Account settings have no project; passing one in to get the
 * chrome would draw a navigation claiming the reader is inside a project while
 * they edit something that belongs to the account or the company. So the chrome
 * is composed from the same CSS: no project nav, no context band, no period. In
 * its place the wordmark becomes the way back into the product, and a Back
 * control names where the reader came from.
 */

export type SettingsPage = "ai" | "crm";

const PAGES: readonly { readonly key: SettingsPage; readonly label: string }[] = [
  { key: "ai", label: "AI and usage" },
  { key: "crm", label: "CRM" },
];

/** A settings page's own address, keeping the reader's origin. */
export function settingsHref(page: SettingsPage, origin: string, query = ""): string {
  const carry = origin === "" ? "" : `from=${encodeURIComponent(origin)}`;
  const parts = [query, carry].filter((part) => part !== "");
  return parts.length === 0 ? `/settings/${page}` : `/settings/${page}?${parts.join("&")}`;
}

export function SettingsFrame({
  displayName,
  roleWord,
  roleTitle,
  origin,
  current,
  children,
}: {
  readonly displayName: string;
  /** One word for the shell's role slot: "Company admin", "Member". */
  readonly roleWord: string;
  /** The sentence behind it, as the slot's title. */
  readonly roleTitle: string;
  readonly origin: Origin;
  readonly current: SettingsPage;
  readonly children: ReactNode;
}) {
  async function signOut(): Promise<void> {
    "use server";
    const store = await cookies();
    destroySession(store.get(SESSION_COOKIE)?.value);
    store.delete(SESSION_COOKIE);
    redirect("/sign-in");
  }

  return (
    /*
     * No skip link here: `app/layout.tsx` renders the one for the whole
     * application, and `<main id="main">` below is the target it has always
     * pointed at. A second one was not merely redundant — `.irs-shell > *`
     * forces `position: relative` on every child, which took the duplicate out
     * of absolute positioning, stretched it across the flex column and pushed
     * 16px off the right edge of a 1920 viewport.
     */
    <div className="irs-shell ox-root ox-graphite">
      <header className="irs-header">
        {/*
         * THE WORDMARK, AND WHERE IT GOES.
         *
         * On a project surface it is inert, because the four sections sit
         * beside it. Here there is no nav, so it becomes the way back into the
         * product — to Ask IRIS for the project the reader came from, or for
         * the first project they can open if they arrived here cold.
         *
         * `aria-label` rather than the image's `alt` alone: a link whose only
         * text is a logo announces as "IRIS", which says what it IS and not
         * where it GOES. An account with no project at all gets no link, since
         * an entry leading to a refusal is worse than no entry.
         */}
        {origin.ask === null ? (
          <Brand />
        ) : (
          <Link
            className="irs-brand os-brand-link"
            href={dynamicRoute(origin.ask)}
            aria-label={`IRIS Observer — open Ask IRIS for ${origin.projectLabel ?? "your project"}`}
          >
            <BrandParts />
          </Link>
        )}

        <p className="os-header-title">Account settings</p>

        <div className="irs-header-end">
          <div className="irs-who">
            <div className="irs-who-name">{displayName}</div>
            <div className="irs-who-role" title={roleTitle}>
              {roleWord}
            </div>
          </div>
          <Link className="ox-btn" data-weight="quiet" href={dynamicRoute("/projects")}>
            Projects
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
          {/*
           * BACK, NAMING ITS DESTINATION.
           *
           * "← Sales Flow" rather than "← Back". The page knows where the
           * reader came from — it was told, and it checked — so saying it is
           * free. The arrow is decorative and hidden, so the label carries the
           * direction and the visible text stays the destination.
           */}
          <Link
            className="os-back"
            href={dynamicRoute(origin.back)}
            aria-label={`Back to ${origin.backLabel}`}
          >
            <svg
              className="os-back-arrow"
              aria-hidden="true"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M19 12H5" />
              <path d="m12 19-7-7 7-7" />
            </svg>
            {origin.backLabel}
          </Link>

          {/* The settings' own pages, side by side: AI and usage, and the CRM. */}
          <nav className="ox-btn-row" aria-label="Account settings">
            {PAGES.map((page) => (
              <Link
                key={page.key}
                className="ox-btn"
                data-weight={page.key === current ? "primary" : "quiet"}
                aria-current={page.key === current ? "page" : undefined}
                href={dynamicRoute(settingsHref(page.key, origin.from))}
              >
                {page.label}
              </Link>
            ))}
          </nav>

          {children}
        </div>
      </main>
    </div>
  );
}

/* ===================================================================== brand */

function BrandParts() {
  return (
    <>
      {/*
       * A plain `img`, not `next/image` — the same 1.2KB vector the shell
       * draws, at the same fixed 21px height, so there is nothing to optimise
       * and a loader in front of it would only add a request.
       */}
      <img className="irs-brand-mark" src="/brand/iris-wordmark.svg" alt="" />
      <span className="irs-brand-sub">by MADSPACE</span>
    </>
  );
}

function Brand() {
  return (
    <div className="irs-brand">
      <img className="irs-brand-mark" src="/brand/iris-wordmark.svg" alt="IRIS" />
      <span className="irs-brand-sub" aria-label="by MADSPACE">
        by MADSPACE
      </span>
    </div>
  );
}

/* ==================================================================== origin */

/**
 * WHERE THE READER CAME FROM, AND WHERE THE WORDMARK GOES.
 *
 * One parameter answers both, so the two can never disagree — which they would
 * within a week if Back read `from` while the wordmark guessed at the first
 * project.
 *
 * Two checks, and they prove different things:
 *
 *   `safeReturnTo` proves the SHAPE. It is an allow-list of route families on
 *   this origin, written for exactly this hazard: a value the browser controls,
 *   handed to a link. A scheme, a protocol-relative `//host`, a backslash, a
 *   query, a fragment or a route this application does not serve all resolve to
 *   null, which means "use the default" and never "use it anyway".
 *
 *   `resolveProject` proves the GRANT. A reader can hand-edit
 *   `?from=/rival/tower/ask` — a perfectly well-shaped path — and the allow-list
 *   has no opinion on whether they may open it. Only the repository does. It
 *   refuses identically for forbidden and missing, so this cannot be used to
 *   discover that a project exists.
 */
export type Origin = {
  /** The validated `from`, for carrying through a form. Empty when there is none. */
  readonly from: string;
  /** Where Back goes. Always a real destination. */
  readonly back: string;
  /** What Back is called. Names the destination rather than saying "Back". */
  readonly backLabel: string;
  /** Ask IRIS for the project in context, or null if the account holds none. */
  readonly ask: string | null;
  readonly projectLabel: string | null;
};

const SECTION_LABEL: Readonly<Record<string, string>> = Object.freeze({
  ask: "Ask IRIS",
  flow: "Sales Flow",
  project: "Project",
  agents: "Sales Agents",
  showroom: "Briefing",
  units: "Units",
  meetings: "Meetings",
  attention: "Unit Attention",
  features: "Features",
  presentation: "Presentation DNA",
  storytelling: "Storytelling",
  audience: "Audience",
  people: "People",
  overview: "Overview",
});

export async function originFrom(viewer: Viewer, raw: string | undefined): Promise<Origin> {
  const from = safeReturnTo(raw);

  if (from === "/projects") {
    const fallback = await firstProject(viewer);
    return {
      from,
      back: "/projects",
      backLabel: "Projects",
      ask: fallback?.ask ?? null,
      projectLabel: fallback?.label ?? null,
    };
  }

  if (from !== null) {
    /* `/tenant/project/section…` — the allow-list guarantees at least three. */
    const [, tenantSlug = "", projectSlug = "", section = "", sub = ""] = from.split("/");
    try {
      const { tenant, project } = await repository.resolveProject(viewer, tenantSlug, projectSlug);
      return {
        from,
        back: from,
        backLabel:
          section === "flow" && sub === "iris-led"
            ? "IRIS-led sales"
            : (SECTION_LABEL[section] ?? project.name),
        ask: `/${tenant.slug}/${project.slug}/${HOME_SEGMENT}`,
        projectLabel: project.name,
      };
    } catch {
      /*
       * Well-formed and not theirs. Fall through to the default rather than
       * refusing: the reader asked for their settings, which they may have, and
       * the only thing that failed is a hint about where they had been.
       */
    }
  }

  const fallback = await firstProject(viewer);
  return {
    from: "",
    back: "/projects",
    backLabel: "Projects",
    ask: fallback?.ask ?? null,
    projectLabel: fallback?.label ?? null,
  };
}

/**
 * The first project this account may open, or null.
 *
 * Asked of the repository so the wordmark is a grant rather than a guess, and
 * so an account with none simply does not get the link — an entry leading to a
 * refusal is worse than no entry.
 */
async function firstProject(viewer: Viewer): Promise<{ ask: string; label: string } | null> {
  const tenants = await repository.listTenants(viewer);
  for (const tenant of tenants) {
    const projects = await repository.listProjects(viewer, tenant.id);
    const project = projects[0];
    // The home segment, not a named screen — ADR-0033 owns which one that is.
    if (project !== undefined) {
      return { ask: `/${tenant.slug}/${project.slug}/${HOME_SEGMENT}`, label: project.name };
    }
  }
  return null;
}
