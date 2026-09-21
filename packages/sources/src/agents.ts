import { AgentRosterRequestSchema, type AgentRosterResponse } from "@observer/contracts/ue5";

import { authenticateSource } from "./authenticate";
import { describeSchemaRejection } from "./heartbeat";
import { bodyWithinCeiling, failure, ok, requirePost, type Handler } from "./http";

/**
 * THE PRESENTER ROSTER ENDPOINT — who a showroom's `agent_id` values are.
 *
 * Every session must name its presenter, and an event may not carry a name. So
 * the showroom says it here, once, and the name is kept in the project's agent
 * record: never in `analytics_events`, and never anywhere an event could pick
 * it up. The steps and their order are the heartbeat's, for the heartbeat's
 * reasons (`heartbeat.ts`): a small bounded body is validated first so a plugin
 * is told which rule it broke, and the credential gates every side effect.
 *
 * The project is read from the credential. No body field can point a roster at
 * another project, because there is no such field.
 */

/**
 * The largest roster this endpoint will read.
 *
 * A roster at every limit of the schema, one hundred entries of a 128-character
 * reference and a 120-character name, is under 80 KiB as plain UTF-8. The rest
 * is room for a serialiser that escapes what it need not. A real roster is a
 * few kilobytes.
 */
export const AGENTS_MAX_BODY_BYTES = 131072;

export const handleAgents: Handler = async (request, deps) => {
  const wrongMethod = requirePost(request);
  if (wrongMethod !== null) return wrongMethod;

  const body = await bodyWithinCeiling(request, AGENTS_MAX_BODY_BYTES);
  if (!body.ok) {
    return failure(
      "malformed_request",
      `A roster may not exceed ${String(AGENTS_MAX_BODY_BYTES)} bytes.`,
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body.text) as unknown;
  } catch {
    /* The parser's message quotes its input, and this input is people's names. */
    return failure("malformed_request", "The roster body is not valid JSON.");
  }

  const parsed = AgentRosterRequestSchema.safeParse(payload);
  if (!parsed.success) {
    /* Field paths only: `agents.3.display_name` says where, and never says who. */
    return failure(
      "malformed_request",
      `The roster does not satisfy the roster schema: ${describeSchemaRejection(
        parsed.error.issues,
      )}.`,
    );
  }

  const auth = await authenticateSource(request, deps);
  if (!auth.ok) return auth.response;

  let recorded: number;
  try {
    recorded = await deps.db.sourceAgentsReport({
      source: auth.context.sourceId,
      agents: parsed.data.agents,
    });
  } catch {
    /* Nothing was stored, and the same roster is safe to send again unchanged. */
    return failure("unavailable", "The roster could not be recorded.");
  }

  const response: AgentRosterResponse = { status: "ok", recorded };
  return ok(response);
};
