#!/usr/bin/env node
/**
 * THE LOCAL DEMONSTRATION SERVER, FOR A SCREEN RECORDING.
 *
 * Starts the production build of @observer/web (`pnpm build` first) with the
 * same synthetic-harness environment the browser suite starts it with
 * (playwright.config.ts, HARNESS_ENV): the synthetic account directory, so the
 * visible sign-in has accounts to check; the harness pepper, so Ask answers;
 * and roomier Ask limits, so a recording session is not throttled. Unlike the
 * browser suite, it also opens the company key store (ADR-0043): a company's
 * admin is asked for the company's OpenAI key after signing in, the key stays
 * in this process's memory, and every member asks with it.
 *
 * Nothing here is a secret and nothing here can reach a deployment: the
 * harness pepper is refused wherever OBSERVER_SYNTHETIC_HARNESS is absent, and
 * every value below is a local default that an explicit environment overrides.
 * An owner's own OpenAI key for the recording is pasted into that dialog, or
 * goes in apps/web/.env.local (ADR-0040); never here. Either is spent only on
 * a request to localhost.
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
  OBSERVER_DEMO_COMPANY_KEYS: "1",
  /*
   * The local control plane under `next start` (ADR-0044), so /madspace can
   * onboard a client. Its state lives in .observer-local/demo, never in the
   * directory the browser suite's lab server opens. The two peppers are
   * demo-only constants for a loopback demo, in the subject pepper's style:
   * not secrets, refused by describePepper wherever the harness flag is absent.
   */
  OBSERVER_DEMO_LOCAL_PLANE: "1",
  OBSERVER_LOCAL_CONTROL_PLANE: "1",
  OBSERVER_LOCAL_STATE_DIR: ".observer-local/demo",
  OBSERVER_ACTIVATION_CODE_PEPPER: "b".repeat(64),
  OBSERVER_SOURCE_TOKEN_PEPPER: "c".repeat(64),
  /*
   * Trust what the operating system trusts. An antivirus that inspects HTTPS
   * (Avast's Web Shield on the recording laptop) re-signs api.openai.com with a
   * root it installs in the Windows store; Node's own bundle does not have it,
   * so the key check failed with UNABLE_TO_VERIFY_LEAF_SIGNATURE and the admin
   * read "OpenAI could not be reached" (2026-10-23). Verification stays on.
   */
  NODE_USE_SYSTEM_CA: "1",
};

const env = { ...process.env };
for (const [name, value] of Object.entries(DEMO_ENV)) env[name] ??= value;

/*
 * Loopback only. `next start` binds every interface by default, and this server
 * holds a writable control plane whose peppers are public constants and whose
 * sign-in is a scenario selector: nobody else on the network may reach it.
 */
const child = spawn(`pnpm --filter @observer/web start --port ${PORT} --hostname 127.0.0.1`, {
  env,
  stdio: "inherit",
  shell: true,
});
child.on("exit", (code) => process.exit(code ?? 0));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
