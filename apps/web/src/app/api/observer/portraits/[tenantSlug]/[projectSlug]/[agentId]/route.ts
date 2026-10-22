import { portraitRight } from "@/lib/portraits/access";
import { PORTRAIT_MAX_BYTES, TOO_LARGE, admitPortrait, sniffPortrait } from "@/lib/portraits/image";
import { actorFor, resolvePortraitScope } from "@/lib/portraits/server";
import { NO_PORTRAIT_STORE, portraitStore } from "@/lib/portraits/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ONE AGENT'S PORTRAIT: SERVED, SET, REMOVED (ADR-0054).
 *
 * GET serves it to any signed-in reader who holds the project and finds the
 * agent on it; PUT takes the raw image as the body, DELETE removes the file.
 * Both change only for the tenant's company admin, or the agent replacing
 * their own (`portraitRight`). The checks run in that order every time: a
 * session, the project and the agent, a store, the right, then the bytes.
 * DELETE alone also reaches an agent who has left every period's roster, so a
 * face never outlives the only path that could remove it.
 *
 * A route handler and not a server action: an action's body is capped at 1 MB
 * unless every action in the application is raised, and a portrait may be 2 MB.
 * An action's origin check does not come with it, so `sameOrigin` is that
 * check, written out: the session cookie is SameSite=Lax, and another port on
 * localhost is the same site.
 */

type Context = { params: Promise<{ tenantSlug: string; projectSlug: string; agentId: string }> };

const PRIVATE = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

function said(status: number, message: string): Response {
  return Response.json({ ok: false, message }, { status, headers: PRIVATE });
}

const NOT_FOUND = "No such agent on a project you hold.";
const SIGNED_OUT = "Sign in first.";

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin === null || host === null) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** The body, or null past the limit, read no further than one byte over it. */
async function readCapped(request: Request, limit: number): Promise<Uint8Array | null> {
  const declared = Number(request.headers.get("content-length") ?? "NaN");
  if (Number.isFinite(declared) && declared > limit) return null;
  if (request.body === null) return new Uint8Array(0);
  const reader = request.body.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) {
      await reader.cancel();
      return null;
    }
    parts.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

export async function GET(_request: Request, context: Context): Promise<Response> {
  const { tenantSlug, projectSlug, agentId } = await context.params;
  const scope = await resolvePortraitScope(tenantSlug, projectSlug, agentId);
  if (!scope.ok) return said(scope.status, scope.status === 401 ? SIGNED_OUT : NOT_FOUND);
  if (scope.agent === null) return said(404, NOT_FOUND);

  const store = portraitStore();
  const bytes = store === null ? null : await store.read({ tenantId: scope.tenant.id, agentId });
  const type = bytes === null ? null : sniffPortrait(bytes);
  if (bytes === null || type === null) return said(404, "This agent has no portrait.");

  return new Response(bytes as BodyInit, {
    headers: {
      ...PRIVATE,
      "Content-Type": type,
      "Content-Length": String(bytes.length),
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cross-Origin-Resource-Policy": "same-origin",
    },
  });
}

/** The checks PUT and DELETE share, up to the right. */
async function changeable(request: Request, context: Context, method: "PUT" | "DELETE") {
  if (!sameOrigin(request))
    return { ok: false as const, refused: said(403, "Refused: not sent from this page.") };
  const { tenantSlug, projectSlug, agentId } = await context.params;
  const scope = await resolvePortraitScope(tenantSlug, projectSlug, agentId);
  if (!scope.ok) {
    return {
      ok: false as const,
      refused: said(scope.status, scope.status === 401 ? SIGNED_OUT : NOT_FOUND),
    };
  }
  const store = portraitStore();
  if (store === null) return { ok: false as const, refused: said(503, NO_PORTRAIT_STORE) };

  const key = { tenantId: scope.tenant.id as string, agentId };
  const existing = (await store.version(key)) !== null;
  const right = portraitRight(
    actorFor(scope.account, scope.viewer),
    scope.tenant,
    agentId,
    existing,
  );
  const { agent } = scope;
  // Off every roster, only the removal of a portrait still on disk, and only by those who may.
  if (agent === null && (method === "PUT" || !existing || right === null)) {
    return { ok: false as const, refused: said(404, NOT_FOUND) };
  }
  if (right === null) {
    const name = agent?.name ?? "the agent";
    return {
      ok: false as const,
      refused: said(
        403,
        `Only the admin of ${scope.tenant.name} can set ${name}'s portrait; ${name} can replace or remove it once it is there.`,
      ),
    };
  }
  return { ok: true as const, store, key, agent };
}

export async function PUT(request: Request, context: Context): Promise<Response> {
  const allowed = await changeable(request, context, "PUT");
  if (!allowed.ok) return allowed.refused;

  const body = await readCapped(request, PORTRAIT_MAX_BYTES);
  if (body === null) return said(413, TOO_LARGE);
  const admitted = admitPortrait(body);
  if (!admitted.ok) return said(415, admitted.reason);

  await allowed.store.write(allowed.key, admitted.bytes);
  return Response.json(
    {
      ok: true,
      message: `Saved. ${allowed.agent?.name ?? "The agent"}'s portrait shows wherever they do.`,
    },
    { headers: PRIVATE },
  );
}

export async function DELETE(request: Request, context: Context): Promise<Response> {
  const allowed = await changeable(request, context, "DELETE");
  if (!allowed.ok) return allowed.refused;

  const removed = await allowed.store.remove(allowed.key);
  return Response.json(
    {
      ok: true,
      message: !removed
        ? "There was no portrait to remove."
        : allowed.agent === null
          ? "Removed."
          : `Removed. ${allowed.agent.name}'s initials show instead.`,
    },
    { headers: PRIVATE },
  );
}
