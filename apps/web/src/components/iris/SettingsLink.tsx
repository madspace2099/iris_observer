"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { dynamicRoute } from "@/lib/href";

/**
 * THE WAY TO ACCOUNT SETTINGS, CARRYING THE WAY BACK.
 *
 * `/settings/ai` is not a project route and takes no tenant, so once a reader
 * is there the server has no idea where they came from. Two things on that
 * page need to know: the Back control, and the wordmark — which returns to Ask
 * IRIS for the project the reader was actually looking at.
 *
 * ## Why a client component for one link
 *
 * The link lives in the project layout, which is a server component, and a
 * LAYOUT cannot know which of its child routes rendered. `/flow`, `/project`
 * and `/agents` all share it. A layout-built parameter could therefore only
 * ever say "some page in this project", and requirement was explicit that Back
 * from Sales Flow returns to Sales Flow.
 *
 * `usePathname()` is the smallest thing that knows. It costs one client
 * component holding a single `<Link>` — no state, no effect, no hydration
 * beyond the anchor itself.
 *
 * ## Why not the Referer header
 *
 * A server component can read it, and it is wrong often enough to be worse
 * than useless: Next prefetches, so the header can name a page the reader only
 * hovered, and it is absent on a hard reload or a pasted URL. A back control
 * that is right most of the time and silently wrong the rest teaches a reader
 * not to trust it.
 *
 * ## The value is not trusted on arrival
 *
 * It is a query parameter, so the browser controls it, and it is handed to a
 * redirect target — the classic open redirect. `/settings/ai` validates it
 * through `safeReturnTo`'s allow-list and then re-resolves the project through
 * the repository, because the allow-list proves the shape and only the
 * repository proves the grant.
 */
export function SettingsLink({
  className = "ox-btn",
  weight = "quiet",
}: {
  readonly className?: string;
  readonly weight?: string;
}) {
  const pathname = usePathname();

  /*
   * The path only. `safeReturnTo` refuses anything carrying `?` or `#`, so
   * appending the query here would produce a value the page then discards —
   * failing silently, which is the one behaviour this parameter must not have.
   */
  const href = `/settings/ai?from=${encodeURIComponent(pathname)}`;

  return (
    <Link className={className} data-weight={weight} href={dynamicRoute(href)}>
      Settings
    </Link>
  );
}
