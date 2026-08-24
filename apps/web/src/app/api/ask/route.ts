import { NextResponse } from "next/server";
import { z } from "zod";
import { ask } from "@/lib/ai/agent";
import { currentViewer } from "@/lib/session";
import { repository } from "@/lib/repository";

/**
 * Ask Observer.
 *
 * Server-only by construction: the key, the tools and the read models all live
 * here, and the browser sends a question and a context rather than anything the
 * model could act on. There is no unauthenticated path — a question is answered
 * against the viewer's own grants, exactly like every screen.
 */

export const runtime = "nodejs";

const BodySchema = z.object({
  question: z.string().min(1).max(500),
  tenantSlug: z.string().min(1).max(64),
  projectSlug: z.string().min(1).max(64),
  period: z.enum(["quarter_to_date", "last_28_days", "last_quarter", "year_to_date"]),
  unitCode: z.string().max(32).nullable().default(null),
  meetingId: z.string().max(64).nullable().default(null),
});

export async function POST(request: Request) {
  const viewer = await currentViewer();
  if (viewer === null) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const body = BodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  // The roster comes through the port, like everything else a surface reads.
  const agents = await repository.listAgents({
    viewer,
    tenantSlug: body.data.tenantSlug,
    projectSlug: body.data.projectSlug,
    period: body.data.period,
  });

  const outcome = await ask(body.data.question, {
    viewer,
    tenantSlug: body.data.tenantSlug,
    projectSlug: body.data.projectSlug,
    period: body.data.period,
    agentIds: agents.map((a) => a.agentId),
    unitCode: body.data.unitCode,
    meetingId: body.data.meetingId,
  });

  return NextResponse.json(outcome, {
    // An answer is a function of the question, the viewer and the period. None
    // of that survives a shared cache.
    headers: { "Cache-Control": "no-store" },
  });
}
