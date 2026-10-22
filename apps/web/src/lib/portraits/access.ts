import type { Viewer } from "@observer/readmodels";

/**
 * WHO MAY CHANGE AN AGENT'S PORTRAIT (ADR-0054).
 *
 * Observer never creates, renames or removes an agent: the roster arrives from
 * the IRIS showroom. It may only put a face to a name it already holds, and
 * only two people may do that:
 *
 *   - **the admin of the agent's own company** (ADR-0043), for any agent of
 *     that company. An agent belongs to the agency they present for
 *     (`docs/01-foundation.md` §2 and §6; the roster's `organisationName`), so
 *     on Shark Residence that is Daniel Hart, admin of Shark Sales, not Clara
 *     Weiss, whose company is the developer;
 *   - **the agent themselves**, to replace or remove a portrait that is there.
 *     The owner's words: the company adds it, the agent can change their own.
 *
 * Everyone else is refused, MADSPACE included: it runs the platform and does
 * not curate a customer's people. Whether the reader holds the project at all,
 * and whether the agent is on it, is settled before this is asked
 * (`resolvePortraitScope`); this decides only the right.
 */
export type PortraitRight = "company_admin" | "self";

export interface PortraitActor {
  readonly role: Viewer["role"];
  readonly agentId: string | null;
  readonly companyName: string;
  readonly companyRole: "admin" | "member";
}

export function portraitRight(
  actor: PortraitActor,
  agent: { readonly agentId: string; readonly organisationName: string },
  hasPortrait: boolean,
): PortraitRight | null {
  if (actor.role === "madspace_admin") return null;
  if (actor.companyRole === "admin" && actor.companyName === agent.organisationName) {
    return "company_admin";
  }
  if (actor.role === "sales_agent" && actor.agentId === agent.agentId && hasPortrait) return "self";
  return null;
}
