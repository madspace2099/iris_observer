import { timingSafeEqual } from "node:crypto";

import { liveConnectorService } from "@/lib/connectors/live";
import { CONTROL_PLANE_ACCOUNT, controlPlane } from "@/lib/sources/control-plane";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * THE SCHEDULED PULL.
 *
 * Every enabled connector with a credential, on every project the control
 * plane holds, one after another. Vercel's scheduler calls this with
 * `Authorization: Bearer <CRON_SECRET>`; anything else is refused before a
 * database is opened, and a deployment without the secret refuses everything
 * — an unauthenticated sync endpoint is a way to spend a client's rate limit.
 *
 * The answer is counts and categories: nothing in it names a credential, a
 * unit or a CRM's own words.
 */

function authorised(request: Request): boolean {
  const secret = process.env["CRON_SECRET"];
  if (secret === undefined || secret.length === 0) return false;
  const header = request.headers.get("authorization") ?? "";
  const want = Buffer.from(`Bearer ${secret}`, "utf8");
  const got = Buffer.from(header, "utf8");
  return want.length === got.length && timingSafeEqual(want, got);
}

export async function GET(request: Request): Promise<Response> {
  if (!authorised(request)) return Response.json({ refused: "unauthorised" }, { status: 401 });

  const plane = await controlPlane();
  const service = plane.ok ? await liveConnectorService() : null;
  if (!plane.ok || service === null) {
    return Response.json({ refused: "control plane unavailable" }, { status: 503 });
  }
  const projects = await plane.admin.projectsForAccount({ account: CONTROL_PLANE_ACCOUNT });
  if (!projects.ok) return Response.json({ refused: "projects unreadable" }, { status: 503 });

  const results: { project: string; connector: string; outcome: string }[] = [];
  for (const project of projects.value) {
    const connectors = await service.list(project.project_id);
    for (const c of connectors) {
      if (!c.enabled || c.kind === "csv" || !c.hasCredential) continue;
      const result = await service.sync(project.project_id, c.kind);
      results.push({
        project: project.project_id,
        connector: c.kind,
        outcome: result.ok ? (result.outcome.ok ? "ok" : result.outcome.reason) : "refused",
      });
      /*
       * The deals, where the CRM offers them to a pull: Lomnio's leads, a
       * Monday deals board and REALPAD's business-case export. A connector
       * with no deals board or no export columns named answers with a
       * sentence, which is recorded as refused and costs nothing.
       */
      if (c.kind === "lomnio" || c.kind === "monday" || c.kind === "realpad") {
        const deals = await service.syncDeals(project.project_id, c.kind);
        results.push({
          project: project.project_id,
          connector: `${c.kind}:deals`,
          outcome: deals.ok ? (deals.outcome.ok ? "ok" : deals.outcome.reason) : "refused",
        });
      }
    }
  }
  return Response.json({ synced: results.length, results });
}
