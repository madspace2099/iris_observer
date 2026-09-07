import { after } from "next/server";

import { parseLomnioWebhook } from "@observer/connectors";

import { liveConnectorService } from "@/lib/connectors/live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * LOMNIO'S PUSH, VERIFIED AND THEN RECONCILED BY PULL.
 *
 * The URL is not secret; the HMAC over the raw body under the project's
 * signing secret is the whole of authenticity, and a body that does not
 * verify is refused with nothing learned. A verified unit event does not
 * write the unit it carries — it schedules the ordinary sync, so push can
 * never disagree with pull about what the catalogue holds (ADR-0036).
 *
 * Lomnio expects 2xx within fifteen seconds and retries three times, so the
 * answer goes out first and the pull runs after it.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
): Promise<Response> {
  const { projectId } = await context.params;
  const rawBody = await request.text();
  const service = await liveConnectorService();
  if (service === null) return new Response("unavailable", { status: 503 });

  const verdict = await service.verifyLomnioWebhook(
    projectId,
    rawBody,
    request.headers.get("x-lomnio-signature"),
  );
  if (verdict !== "ok") {
    return new Response(verdict === "no_secret" ? "no signing secret" : "bad signature", {
      status: 401,
    });
  }

  const hook = parseLomnioWebhook(rawBody, { statusMap: {}, currency: null });
  if (hook === null) return new Response("unreadable", { status: 400 });
  if (hook.event.startsWith("unit.")) {
    after(async () => {
      await service.sync(projectId, "lomnio");
    });
  }
  return Response.json({ received: hook.event });
}
