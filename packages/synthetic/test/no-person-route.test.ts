import { describe, expect, it } from "vitest";
import { NotFoundError, NotPermittedError, type Viewer } from "@observer/readmodels";
import {
  PROJECTS,
  SyntheticObserverRepository,
  TENANTS,
  VIEWERS,
  VIKTORIA_MEETING_ID,
} from "../src/index";

/**
 * NO READ MODEL LINKS TO A PERSON PAGE, BECAUSE THERE IS NONE.
 *
 * `/people` has been a permanent redirect to the agents roster since ADR-0033,
 * and Observer has no contact page: identity resolution is deferred
 * (ADR-0011), and nothing joins a deal's buyer to the visitor in the room
 * (ADR-0039). Every link the read models still pointed at `/people` — the
 * brief's timeline and its evidence, the executive overviews' evidence and
 * their "Open the buyer" alert, the agent overview's verdict, two prepared Ask
 * answers — therefore took the reader to a page about agents while promising
 * one about a person. 94 such anchors were photographed on 2026-09-23.
 *
 * P2-16's second clause says the button does not guess where the person link
 * is unknown. The decision taken with it: where there is no person surface,
 * the correct form of the link is its absence, and a link to some other page
 * is the same guess under another name. So nothing here is re-pointed. An
 * evidence reference keeps its tier and count with an empty route (the
 * convention `Evidence` in `apps/web/src/components/product/Provenance.tsx`
 * already draws as text); an action keeps its label with no route, which the
 * renderers draw as "… — no surface for this yet".
 *
 * `#` is caught as well: it is where a missing route used to fall back to
 * (`contactHref ?? "#"`), and a link to the top of the same page is a guess
 * too.
 */

const repo = new SyntheticObserverRepository();
const PEOPLE = /\/people(?:[?#]|$)/;

/** Every string under `value` that routes to the people page, and every href-named field set to "#". */
function offending(value: unknown, path: string, out: string[]): void {
  if (typeof value === "string") {
    if (PEOPLE.test(value)) out.push(`${path} = ${value}`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => offending(item, `${path}[${i}]`, out));
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (/href$/i.test(key) && item === "#") out.push(`${path}.${key} = "#"`);
      offending(item, `${path}.${key}`, out);
    }
  }
}

/** A read model the viewer is refused, or that this project does not have, is not a link. */
async function viewOrNothing(read: () => Promise<unknown>): Promise<unknown> {
  try {
    return await read();
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof NotPermittedError) return null;
    throw error;
  }
}

describe("no read model links to a person page that does not exist", () => {
  it("no read model links to the people route, or to '#'", async () => {
    const found: string[] = [];
    let walked = 0;

    for (const viewer of Object.values(VIEWERS) as readonly Viewer[]) {
      for (const project of PROJECTS) {
        if (!viewer.projectIds.includes(project.id)) continue;
        const tenant = TENANTS.find((t) => t.id === project.tenantId);
        if (tenant === undefined) throw new Error(`${project.slug} has no tenant`);
        const where = { viewer, tenantSlug: tenant.slug, projectSlug: project.slug };
        const query = { ...where, period: "quarter_to_date" as const };

        const views: Record<string, unknown> = {
          "executive overview": await viewOrNothing(() => repo.getExecutiveOverview(query)),
          "agent overview": await viewOrNothing(() => repo.getAgentOverview(query)),
          "Ask session": await viewOrNothing(() => repo.getAskSession(query, null)),
          brief: await viewOrNothing(() =>
            repo.getPreMeetingBrief({ ...where, meetingId: VIKTORIA_MEETING_ID }),
          ),
        };
        for (const [name, view] of Object.entries(views)) {
          if (view === null) continue;
          walked += 1;
          offending(view, `${viewer.displayName} · ${project.slug} · ${name}`, found);
        }
      }
    }

    // Guards the guard: a walk over nothing finds nothing.
    expect(walked, "no read model was built, so nothing was checked").toBeGreaterThan(10);
    expect(found, found.join("\n")).toEqual([]);
  });
});
