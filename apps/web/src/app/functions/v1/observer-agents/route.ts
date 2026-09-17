import { handleAgents, failure } from "@observer/sources";

import { observerDepsAsync } from "@/lib/sources/deps";

/**
 * `POST /functions/v1/observer-agents`
 *
 * Records the display name behind each `agent_id` a showroom sends, so every
 * session can name its presenter. Never creates an analytics fact. Every rule
 * lives in `@observer/sources`, as it does for the heartbeat beside it; a name
 * reaches a reader's screen when the read memo next expires, within the half
 * minute a new meeting takes too.
 */

export const runtime = "nodejs";

/** Never cached, never statically rendered: every call mutates or authenticates. */
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const deps = await observerDepsAsync();
  if (deps === null) {
    return failure("unavailable", "This deployment is not configured to accept Observer traffic.");
  }
  return handleAgents(request, deps);
}
