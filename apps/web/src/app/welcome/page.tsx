import type { Metadata } from "next";

import { welcomeDestination } from "@/lib/landing";
import { requireViewer } from "@/lib/session";
import { welcomeFacts, welcomeLines } from "@/lib/welcome";
import { WelcomeSequence } from "@/components/welcome/WelcomeSequence";

export const metadata: Metadata = { title: "Welcome" };

/**
 * THE MOMENT BETWEEN SIGNING IN AND ASK IRIS.
 *
 * A password sign-in with no destination of its own lands here, carrying the
 * landing the server already resolved as `?to=`. That value came back through
 * the browser, so it is checked again rather than trusted: `welcomeDestination`
 * keeps it only if it is an internal path this account may open, and otherwise
 * resolves the landing afresh. The lines the sequence types are read from the
 * project it opens (`lib/welcome.ts`), then the reader is handed on.
 *
 * Signed out, there is nothing to welcome: `requireViewer` sends the reader to
 * the sign-in, like every other screen.
 */
export default async function Welcome({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await requireViewer();
  const params = await searchParams;
  const raw = Array.isArray(params["to"]) ? params["to"][0] : params["to"];

  const to = await welcomeDestination(viewer, raw);
  const facts = await welcomeFacts(viewer, to);
  const heading =
    facts.project === null
      ? `Welcome, ${viewer.displayName}`
      : `Welcome, ${viewer.displayName}. Opening ${facts.project.name}.`;

  return <WelcomeSequence to={to} lines={welcomeLines(facts)} heading={heading} />;
}
