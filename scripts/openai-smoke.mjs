#!/usr/bin/env node
/**
 * The one live check against OpenAI, and it has to be asked for.
 *
 * Everything else in this repository's test suite runs against the fake
 * provider: offline, free and reproducible. This is the single script that
 * spends money, and it is deliberately not wired into `pnpm verify` or CI —
 * a suite that bills the account on every push is a suite somebody eventually
 * disables, and then nobody notices when it breaks.
 *
 * Run it by hand, when the configuration changes:
 *
 *     pnpm smoke:openai
 *
 * ## What it will not print
 *
 * The key, in whole or in part. The full prompt. Any personal data. The raw
 * provider response. It prints a verdict per check and a token count, because
 * that is what somebody running it needs and nothing more.
 *
 * ## What it costs
 *
 * One models listing, which is free, and at most two completions capped at a
 * few dozen output tokens each. Fractions of a cent.
 */

const MODELS_URL = "https://api.openai.com/v1/models";
const RESPONSES_URL = "https://api.openai.com/v1/responses";

const config = {
  text: process.env.OPENAI_TEXT_MODEL ?? "gpt-5.6-sol",
  fast: process.env.OPENAI_FAST_MODEL ?? "gpt-5.6-luna",
  voice: process.env.OPENAI_VOICE_MODEL ?? "gpt-realtime-2.1",
  effort: process.env.OPENAI_REASONING_EFFORT ?? "medium",
};

let failures = 0;

function report(name, ok, detail) {
  const mark = ok ? "PASS" : "FAIL";
  if (!ok) failures += 1;
  console.log(`  ${mark}  ${name}${detail === undefined ? "" : ` — ${detail}`}`);
}

/**
 * The key check never touches the value.
 *
 * Not even its length or its prefix. A script that reads a secret in order to
 * describe it is one bad format string away from printing it, and that has
 * already happened once on this project.
 */
function keyPresent() {
  const key = process.env.OPENAI_API_KEY;
  return typeof key === "string" && key.length > 0;
}

async function main() {
  console.log("\nOpenAI smoke test — IRIS Observer\n");
  console.log(`  text  ${config.text}`);
  console.log(`  fast  ${config.fast}`);
  console.log(`  voice ${config.voice}`);
  console.log(`  effort ${config.effort}\n`);

  if (!keyPresent()) {
    report("OPENAI_API_KEY is set", false, "not present in the environment");
    console.log("\nNothing else can be checked without it.\n");
    process.exit(1);
  }
  report("OPENAI_API_KEY is set", true);

  const auth = { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` };

  /* 1. Which models this account can actually reach. Free, read-only. */
  let reachable = new Set();
  try {
    const response = await fetch(MODELS_URL, { headers: auth });
    if (!response.ok) {
      report(
        "models listing",
        false,
        `HTTP ${response.status} — the key was rejected or has no access`,
      );
      console.log("\nStopping: no further check can succeed.\n");
      process.exit(1);
    }
    const body = await response.json();
    reachable = new Set((body.data ?? []).map((m) => m.id));
    report("models listing", true, `${reachable.size} models visible`);
  } catch {
    report("models listing", false, "the request could not be completed");
    process.exit(1);
  }

  for (const [role, id] of Object.entries({
    text: config.text,
    fast: config.fast,
    voice: config.voice,
  })) {
    report(
      `${role} model "${id}" is reachable`,
      reachable.has(id),
      reachable.has(id) ? undefined : "not listed for this account",
    );
  }

  /* 2. One real completion, tiny, with every privacy control on. */
  for (const [role, model] of Object.entries({ text: config.text, fast: config.fast })) {
    if (!reachable.has(model)) {
      report(`${role} completion`, false, "skipped — model not reachable");
      continue;
    }
    try {
      const response = await fetch(RESPONSES_URL, {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          instructions: "Reply with exactly the word: ready",
          input: "ready?",
          store: false,
          safety_identifier: "obs_smoketest",
          max_output_tokens: 32,
          reasoning: { effort: role === "fast" ? "low" : config.effort },
        }),
        signal: AbortSignal.timeout(60_000),
      });

      if (!response.ok) {
        /*
         * The status and the error *code* only.
         *
         * An upstream message can quote the request back, and while this
         * particular request carries nothing sensitive, a script that prints
         * whatever the vendor said is a habit that travels to ones that do.
         */
        let code = "";
        try {
          const body = await response.json();
          code = body?.error?.code ?? body?.error?.type ?? "";
        } catch {
          /* no body worth naming */
        }
        report(
          `${role} completion`,
          false,
          `HTTP ${response.status}${code === "" ? "" : ` (${code})`}`,
        );
        continue;
      }

      const body = await response.json();
      const used = body?.usage?.output_tokens ?? "?";
      // Token counts, never the text. The text is the model's output and this
      // script has no business echoing it to a terminal or a CI log.
      report(`${role} completion`, true, `${used} output tokens, store=false`);
    } catch {
      report(`${role} completion`, false, "the request timed out or could not be completed");
    }
  }

  /* 3. Realtime: can a client secret be minted at all? */
  if (!reachable.has(config.voice)) {
    report("realtime client secret", false, "skipped — voice model not reachable");
  } else {
    try {
      const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({
          expires_after: { anchor: "created_at", seconds: 10 },
          session: { type: "realtime", model: config.voice },
        }),
        signal: AbortSignal.timeout(60_000),
      });
      report(
        "realtime client secret",
        response.ok,
        response.ok ? "minted and discarded" : `HTTP ${response.status}`,
      );
    } catch {
      report("realtime client secret", false, "the request could not be completed");
    }
  }

  console.log(
    failures === 0
      ? "\nAll checks passed.\n"
      : `\n${failures} check${failures === 1 ? "" : "s"} failed. Nothing above contains a secret.\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

await main();
