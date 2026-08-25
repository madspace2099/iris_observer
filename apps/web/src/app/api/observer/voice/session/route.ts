import { NextResponse } from "next/server";

import { gate } from "@/lib/ai/gate";
import { ModelConfigurationError } from "@/lib/ai/provider";
import { createVoiceSession, publicBlocker, voiceBlocker } from "@/lib/ai/voice";

/**
 * Mints the browser's realtime credential.
 *
 * The one endpoint in this product whose entire job is to *not* hand something
 * over. The browser needs to talk to a realtime model; it must not therefore
 * hold an API key. So it receives an ephemeral client secret scoped to one
 * session and expiring in ten minutes, and the permanent key never leaves the
 * server — a test asserts that no client component can reach it.
 *
 * Gated exactly like a question, because it is one: an unauthenticated caller
 * minting realtime credentials against this account is the same problem as an
 * unauthenticated caller asking a thousand questions, with a microphone.
 */

export const runtime = "nodejs";

export async function GET() {
  /*
   * The capability check is public to a signed-in reader and costs nothing.
   *
   * The interface has to know whether to render a microphone at all, and
   * rendering a control that cannot work is worse than rendering none.
   */
  const blocker = voiceBlocker();
  return NextResponse.json(
    { available: blocker === null, blocker: publicBlocker(blocker) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const admitted = await gate(await request.json().catch(() => null), request);

  if (!admitted.ok) {
    return NextResponse.json(
      { error: admitted.message },
      {
        status: admitted.httpStatus,
        headers: {
          "Cache-Control": "no-store",
          ...(admitted.retryAfterSeconds === null
            ? {}
            : { "Retry-After": String(admitted.retryAfterSeconds) }),
        },
      },
    );
  }

  const blocker = voiceBlocker();
  if (blocker !== null) {
    /*
     * The reader's half of the blocker, and only that half.
     *
     * A variable name is not a key, but it is still configuration, and this
     * deployment is a public demonstration: the operator's diagnosis goes to
     * the server log, where the operator is.
     */
    console.info(`[observer] voice unavailable: ${blocker.detail}`);
    return NextResponse.json(
      { error: "Voice is not available on this deployment.", blocker: publicBlocker(blocker) },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const session = await createVoiceSession();
    return NextResponse.json(session, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    /*
     * A configuration fault says so; anything else is one fixed sentence.
     *
     * "The account cannot reach gpt-realtime-2.1" is the difference between a
     * five-minute fix and an afternoon, and it contains nothing sensitive. An
     * upstream body might; it is never forwarded.
     */
    if (error instanceof ModelConfigurationError) {
      return NextResponse.json(
        {
          error: "Voice is not available on this deployment.",
          blocker: { kind: "model_not_allowed", detail: error.message },
        },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      { error: "Voice could not be started. The text interface is unaffected." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
