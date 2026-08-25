import { NextResponse } from "next/server";
import { z } from "zod";

import { ask, runTools } from "@/lib/ai/agent";
import { AskBodySchema, gate } from "@/lib/ai/gate";
import { LIMITS } from "@/lib/ai/limits";
import { TOOL_NAMES } from "@/lib/ai/tools";
import { DELEGATE_TOOL_NAME } from "@/lib/ai/voice";

/**
 * Where the voice agent's tool calls are actually executed.
 *
 * The realtime model runs in the browser's WebRTC session, so its tool calls
 * arrive at the browser first. The browser cannot execute them — it has no read
 * models, no repository and no grants — so it relays the *name and arguments*
 * here, and this route does what the text agent does: checks the name against
 * the compile-time allowlist, validates the arguments against the tool's own
 * Zod schema, and runs it through the repository port under the viewer's
 * grants.
 *
 * That relay is the security boundary. A realtime model that has been talked
 * into asking for `delete_project` sends a name that is not in `TOOL_NAMES`,
 * and receives a refusal — the browser is a courier, never an authority.
 */

export const runtime = "nodejs";

const BodySchema = AskBodySchema.omit({ question: true, depth: true }).extend({
  tool: z.string().min(1).max(64),
  /** Arguments as the model produced them. Validated, never trusted. */
  args: z.record(z.string(), z.unknown()).default({}),
  /** Present only for the delegation tool. */
  question: z.string().min(1).max(LIMITS.maxQuestionChars).nullable().default(null),
});

export async function POST(request: Request) {
  const raw: unknown = await request.json().catch(() => null);
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  /*
   * The same gate as a typed question.
   *
   * A voice tool call is a question with a different input device, and it is
   * metered, authenticated and authorised identically. It is also the reason
   * the gate takes a question at all here: the delegation path needs one, and
   * the ordinary path supplies a placeholder that is never sent anywhere.
   */
  const admitted = await gate({
    ...parsed.data,
    question: parsed.data.question ?? "voice tool call",
    depth: "standard",
  }, request);

  if (!admitted.ok) {
    return NextResponse.json({ error: admitted.message }, { status: admitted.httpStatus });
  }

  /* The delegation path: hand the question to the server-side Sol pipeline. */
  if (parsed.data.tool === DELEGATE_TOOL_NAME) {
    if (parsed.data.question === null) {
      return NextResponse.json({ error: "No question supplied." }, { status: 400 });
    }
    const outcome = await ask(
      parsed.data.question,
      admitted.context,
      AbortSignal.timeout(LIMITS.requestTimeoutMs * 2),
    );
    return NextResponse.json(
      {
        /*
         * What the voice model is given to say.
         *
         * The validated answer's own fields, never the raw pipeline output —
         * so the spoken version rests on exactly the evidence the written one
         * does, and a schema failure means voice has nothing to say either.
         */
        spoken:
          outcome.answer === null
            ? (outcome.refusal ?? "I could not answer that from the measured evidence.")
            : `${outcome.answer.answer} ${outcome.answer.interpretation}`,
        limitations: outcome.answer?.limitations ?? [],
        orbState: outcome.answer?.orbState ?? "error",
        tools: outcome.toolsUsed,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  /* The direct path: one read-only analysis. */
  if (!TOOL_NAMES.includes(parsed.data.tool)) {
    // Named refusal rather than silence, so the model stops asking rather than
    // rephrasing the same request in a loop.
    return NextResponse.json(
      { error: `No such analysis: ${parsed.data.tool}.` },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const run = await runTools(
    [{ tool: parsed.data.tool, args: parsed.data.args }],
    admitted.context,
  );

  if (run.results.length === 0) {
    return NextResponse.json(
      {
        error: run.forbidden
          ? "This account is not permitted to read that analysis."
          : "That analysis returned nothing for this project and period.",
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    {
      results: run.results.map((result) => ({
        tool: result.tool,
        sampleSize: result.sampleSize,
        facts: result.facts,
        caveats: result.caveats,
        spoken: result.draft,
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
