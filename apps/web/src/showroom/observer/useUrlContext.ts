"use client";

import { usePathname, useSearchParams } from "next/navigation";

import type { ObserverContext } from "./types";

/**
 * What Observer is looking at, read off the URL.
 *
 * Extracted because two things now need the same answer: the rail, which asks
 * questions about the current screen, and the voice provider above it, which
 * has to mint a session for that same screen. Two copies of this derivation
 * would drift, and the failure would be quiet — a spoken question answered
 * about the wrong period is still a fluent answer.
 *
 * Project and period live in the URL rather than in client state, which is why
 * this can be derived at all rather than threaded down.
 */
export function useUrlObserverContext({
  root,
  role,
  projectLabel,
}: {
  /** `/tenantSlug/projectSlug`, as the layout builds it. */
  readonly root: string;
  readonly role: ObserverContext["role"];
  readonly projectLabel: string;
}): ObserverContext {
  const pathname = usePathname();
  const params = useSearchParams();
  const [, tenantSlug = "", projectSlug = ""] = root.split("/");

  return {
    tenantSlug,
    projectSlug,
    projectLabel,
    role,
    period: params.get("period") ?? "quarter_to_date",
    unitCode: params.get("unit"),
    meetingId: /\/meetings\/([^/?]+)/.exec(pathname)?.[1] ?? null,
    agentId: params.get("agent"),
    // The URL knows the identifier, not the person. The console is given the
    // name by the server, which is the only place identity is resolved.
    agentName: null,
    segment: params.get("segment"),
  };
}
