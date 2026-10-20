import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ProbeResult } from "../src/lib/credentials/service";

/**
 * THE COMPANY KEY, ASKED FOR AFTER SIGN-IN (ADR-0043).
 *
 * Only a company's admin, only while the company has no key, only where the
 * store is open, and never after Skip. The field is uncontrolled and the key
 * never comes back in a redirect. The session, the probe and the dialog's
 * portal are stood in for: one request per test, no network, and the panel's
 * contents rendered in place so the markup can be read.
 */

const KEY = "sk-observer-test-welcome-0000";
const TO = "/shark/shark-residence/ask";

const state = vi.hoisted(() => ({
  accountId: "acct_clara",
  probe: { ok: true } as ProbeResult,
}));

class Redirected extends Error {
  constructor(readonly to: string) {
    super(`redirect ${to}`);
  }
}

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Redirected(to);
  },
  useRouter: () => ({ replace: () => undefined, prefetch: () => undefined }),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));

vi.mock("../src/lib/session", async () => {
  const accounts = await import("../src/lib/accounts");
  const account = () => {
    const found = accounts.accountById(state.accountId);
    if (found === null) throw new Error(`no account ${state.accountId}`);
    return found;
  };
  return {
    requireAccount: async () => account(),
    requireViewer: async () => accounts.viewerForAccount(account()),
  };
});

vi.mock("../src/lib/credentials/probe", () => ({
  probeFor: () => async () => state.probe,
}));

/* The portal mounts only in a browser; here the panel renders in place. */
vi.mock("../src/components/product/Dialog", () => ({
  Dialog: ({ children }: { children: unknown }) => children,
}));

const { default: Welcome } = await import("../src/app/welcome/page");
const { saveCompanyKey } = await import("../src/app/welcome/actions");
const { companyKeyState, resetCompanyKeys, setCompanyKey } =
  await import("../src/lib/credentials/company-keys");
const { accountById } = await import("../src/lib/accounts");
const { describeFailure } = await import("../src/lib/credentials/failure");
const { DEPLOYMENT_MARKERS } = await import("../src/lib/deployment-markers");

const saved = { ...process.env };

beforeEach(() => {
  state.accountId = "acct_clara";
  state.probe = { ok: true };
  for (const marker of DEPLOYMENT_MARKERS) delete process.env[marker];
  delete process.env["OBSERVER_ENVIRONMENT"];
  Object.assign(process.env, { OBSERVER_DEMO_ACCOUNTS: "1", OBSERVER_DEMO_COMPANY_KEYS: "1" });
  resetCompanyKeys();
});

afterEach(() => {
  process.env = { ...saved };
  resetCompanyKeys();
});

async function welcome(search: Record<string, string> = {}): Promise<string> {
  return renderToStaticMarkup(
    await Welcome({ searchParams: Promise.resolve({ to: TO, ...search }) }),
  );
}

function clara() {
  const found = accountById("acct_clara");
  if (found === null) throw new Error("no Clara");
  return found;
}

describe("who is asked for the key", () => {
  it("asks the admin of a company with no key, over a welcome that holds still", async () => {
    const html = await welcome();
    expect(html).toContain("Connect Ask IRIS to OpenAI");
    expect(html).toContain("Shark Developments");
    expect(html).toContain('data-hold="true"');
  });

  it("asks nobody else, and nobody after Skip or once the key is there", async () => {
    expect(await welcome({ key: "skip" })).not.toContain("Connect Ask IRIS");

    state.accountId = "acct_nora";
    expect(await welcome()).not.toContain("Connect Ask IRIS");

    state.accountId = "acct_clara";
    await setCompanyKey(clara(), KEY, async () => ({ ok: true }));
    const html = await welcome();
    expect(html).not.toContain("Connect Ask IRIS");
    expect(html).not.toContain("data-hold");
  });

  it("asks nobody where the store is closed", async () => {
    delete process.env["OBSERVER_DEMO_COMPANY_KEYS"];
    expect(await welcome()).not.toContain("Connect Ask IRIS");
    process.env["OBSERVER_DEMO_COMPANY_KEYS"] = "1";
    process.env["VERCEL"] = "1";
    expect(await welcome()).not.toContain("Connect Ask IRIS");
  });
});

describe("the dialog", () => {
  it("is an uncontrolled password field, with a Skip that goes where the welcome would", async () => {
    const html = await welcome();
    const field = /<input[^>]*name="apiKey"[^>]*>/.exec(html)?.[0] ?? "";
    expect(field).toContain('type="password"');
    expect(field).toContain('autoComplete="off"');
    expect(field).toContain("required");
    expect(field).toContain("data-autofocus");
    expect(field).not.toContain("value=");
    expect(html).toMatch(new RegExp(`<a[^>]*href="${TO}"[^>]*>Skip for now</a>`));
    expect(html).toContain("Save key");
  });

  it("says why the last attempt failed, in the failure vocabulary", async () => {
    expect(await welcome({ key: "rejected" })).toContain(describeFailure("rejected").title);
    expect(await welcome({ key: "<b>made up</b>" })).not.toContain("made up");
  });

  it("holds no key in React and reaches no model", () => {
    const source = readFileSync(
      resolve(import.meta.dirname, "../src/components/welcome/CompanyKeyDialog.tsx"),
      "utf8",
    );
    expect(source).not.toContain("useState");
    expect(source).not.toContain("/api/ask");
    expect(source).not.toMatch(/credentials\/(service|store|envelope|probe|company-keys)/);
  });
});

describe("saving it", () => {
  async function save(apiKey: string, to = TO): Promise<string> {
    const form = new FormData();
    form.set("apiKey", apiKey);
    form.set("to", to);
    try {
      await saveCompanyKey(form);
    } catch (error) {
      if (error instanceof Redirected) return error.to;
      throw error;
    }
    throw new Error("the action did not redirect");
  }

  it("keeps the admin's key and hands on to the destination", async () => {
    expect(await save(KEY)).toBe(TO);
    expect(companyKeyState(clara())?.key?.setBy).toBe("Clara Weiss");
  });

  it("keeps nothing a member sends, or a key the provider refuses, and never echoes it", async () => {
    state.accountId = "acct_nora";
    const forbidden = await save(KEY);
    expect(forbidden).toBe(`/welcome?to=${encodeURIComponent(TO)}&key=forbidden`);

    state.accountId = "acct_clara";
    state.probe = { ok: false, status: 401, code: "invalid_api_key" };
    const refused = await save(KEY);
    expect(refused).toBe(`/welcome?to=${encodeURIComponent(TO)}&key=rejected`);

    expect(companyKeyState(clara())?.key).toBeNull();
    for (const to of [forbidden, refused]) expect(to).not.toContain(KEY);
  });

  it("goes nowhere the browser chose that this account may not open", async () => {
    const to = await save(KEY, "https://example.invalid/steal");
    expect(to.startsWith("/")).toBe(true);
    expect(to).not.toContain("example.invalid");
  });
});
