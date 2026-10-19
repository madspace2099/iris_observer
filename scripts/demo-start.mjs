#!/usr/bin/env node
/**
 * THE LOCAL DEMONSTRATION SERVER, FOR A SCREEN RECORDING.
 *
 * Starts the production build of @observer/web (`pnpm build` first) with the
 * same synthetic-harness environment the browser suite starts it with
 * (playwright.config.ts, HARNESS_ENV): the synthetic account directory, so the
 * visible sign-in has accounts to check; the harness pepper, so Ask answers;
 * and roomier Ask limits, so a recording session is not throttled.
 *
 * Nothing here is a secret and nothing here can reach a deployment: the
 * harness pepper is refused wherever OBSERVER_SYNTHETIC_HARNESS is absent, and
 * every value below is a local default that an explicit environment overrides.
 * An owner's own OpenAI key for the recording goes in apps/web/.env.local
 * (ADR-0040), never here.
 *
 *   pnpm build && node scripts/demo-start.mjs        # http://localhost:3400
 */
import { spawn } from "node:child_process";

const PORT = process.env.DEMO_PORT ?? "3400";

const DEMO_ENV = {
  OBSERVER_DEMO_ACCOUNTS: "1",
  OBSERVER_SYNTHETIC_HARNESS: "1",
  OBSERVER_SUBJECT_PEPPER: "a".repeat(64),
  OBSERVER_ASK_PER_MINUTE: "60",
  OBSERVER_ASK_PER_VIEWER_PER_DAY: "2000",
  OBSERVER_ASK_PER_INSTANCE_PER_DAY: "20000",
};

const env = { ...process.env };
for (const [name, value] of Object.entries(DEMO_ENV)) env[name] ??= value;

const child = spawn(`pnpm --filter @observer/web start --port ${PORT}`, {
  env,
  stdio: "inherit",
  shell: true,
});
child.on("exit", (code) => process.exit(code ?? 0));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
