import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VIEWERS } from "@observer/synthetic";

import type * as AdmissionModule from "../src/lib/ai/admission";
import type * as GateModule from "../src/lib/ai/gate";
import type * as ProviderModule from "../src/lib/ai/provider";
import type { ModelGrant, ModelResolution } from "../src/lib/ai/provider";
import { DEPLOYMENT_MARKERS } from "../src/lib/deployment-markers";
import { RECOMMENDED_DEFAULT, modelEntry } from "../src/lib/models/catalogue";

/**
 * THE DEMONSTRATION KEY IS HONOURED ON A LOCAL DEMONSTRATION AND NOWHERE ELSE
 * (ADR-0040).
 *
 * Three conditions, each asserted on its own, and the route's half: with the
 * key honoured the stream asks no account's admission or budget and hands the
 * agent the key; without it the account's admission decides, as it always has.
 * The key below is an obviously fake constant; no request leaves the process,
 * because the model resolver is replaced by one that records what it was given.
 */

const KEY = "sk-observer-test-demo-0000000000";

const LOCAL: Readonly<Record<string, string>> = Object.freeze({
  OBSERVER_DEMO_ACCOUNTS: "1",
  OBSERVER_DEMO_OPENAI_KEY: KEY,
});

const seen = vi.hoisted(() => ({ grants: [] as unknown[] }));

vi.mock("../src/lib/ai/provider", async (importOriginal) => {
  const actual = await importOriginal<typeof ProviderModule>();
  return {
    ...actual,
    resolveModel: (grant: ModelGrant): ModelResolution => {
      seen.grants.push(grant);
      return {
        ok: false,
        configurationFault: false,
        status: {
          provider: "evidence-only",
          model: "none",
          live: false,
          reason: null,
          setupRequired: false,
          blocked: null,
        },
      };
    },
  };
});

vi.mock("../src/lib/ai/gate", async (importOriginal) => {
  const actual = await importOriginal<typeof GateModule>();
  return { ...actual, gate: vi.fn() };
});

vi.mock("../src/lib/ai/admission", async (importOriginal) => {
  const actual = await importOriginal<typeof AdmissionModule>();
  return {
    ...actual,
    admitModelRequest: vi.fn(async () => ({
      ok: false as const,
      refusal: {
        kind: "no_connection" as const,
        model: RECOMMENDED_DEFAULT,
        provider: "openai" as const,
      },
    })),
  };
});

const { demoModelAccess, demoModelName, environment, resetEnvironmentCache } =
  await import("../src/lib/env");
const { gate } = await import("../src/lib/ai/gate");
const { admitModelRequest } = await import("../src/lib/ai/admission");
const { POST } = await import("../src/app/api/ask/stream/route");
const { accountById } = await import("../src/lib/accounts");
const { resetCompanyKeys, setCompanyKey } = await import("../src/lib/credentials/company-keys");

const COMPANY_KEY = "sk-observer-test-company-1111111";

describe("the demonstration key's three conditions", () => {
  it("is honoured with the directory on, in development, on no platform", () => {
    expect(demoModelAccess(LOCAL)).toEqual({
      apiKey: KEY,
      model: modelEntry(RECOMMENDED_DEFAULT).apiIdentifier,
    });
    expect(demoModelAccess({ ...LOCAL, OBSERVER_ENVIRONMENT: "development" })).not.toBeNull();
  });

  it("is ignored without the demonstration directory", () => {
    expect(demoModelAccess({ ...LOCAL, OBSERVER_DEMO_ACCOUNTS: undefined })).toBeNull();
    expect(demoModelAccess({ ...LOCAL, OBSERVER_DEMO_ACCOUNTS: "true" })).toBeNull();
  });

  it("is ignored on staging or production unless the synthetic harness is on", () => {
    for (const environment of ["staging", "production"]) {
      expect(demoModelAccess({ ...LOCAL, OBSERVER_ENVIRONMENT: environment })).toBeNull();
      expect(
        demoModelAccess({
          ...LOCAL,
          OBSERVER_ENVIRONMENT: environment,
          OBSERVER_SYNTHETIC_HARNESS: "1",
        }),
      ).not.toBeNull();
    }
  });

  it.each(DEPLOYMENT_MARKERS)(
    "is ignored wherever %s is present, whatever else is set",
    (marker) => {
      expect(demoModelAccess({ ...LOCAL, [marker]: "1" })).toBeNull();
      expect(
        demoModelAccess({
          ...LOCAL,
          OBSERVER_ENVIRONMENT: "development",
          OBSERVER_SYNTHETIC_HARNESS: "1",
          [marker]: "1",
        }),
      ).toBeNull();
    },
  );

  it("is no key when empty or blank", () => {
    expect(demoModelAccess({ ...LOCAL, OBSERVER_DEMO_OPENAI_KEY: "" })).toBeNull();
    expect(demoModelAccess({ ...LOCAL, OBSERVER_DEMO_OPENAI_KEY: "   " })).toBeNull();
    expect(demoModelAccess({ OBSERVER_DEMO_ACCOUNTS: "1" })).toBeNull();
  });

  it("uses the model it is given, and the catalogue's default for one that is not a model name", () => {
    expect(demoModelName({ ...LOCAL, OBSERVER_DEMO_OPENAI_MODEL: "gpt-5-mini" })).toBe(
      "gpt-5-mini",
    );
    expect(demoModelName({ ...LOCAL, OBSERVER_DEMO_OPENAI_MODEL: "<model here>" })).toBe(
      modelEntry(RECOMMENDED_DEFAULT).apiIdentifier,
    );
    expect(demoModelName({ ...LOCAL, OBSERVER_DEMO_ACCOUNTS: "0" })).toBeNull();
  });
});

describe("the boot report names the key and never prints it", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
    resetEnvironmentCache();
  });

  it("says it is in use, and with which model", () => {
    Object.assign(process.env, LOCAL);
    resetEnvironmentCache();
    const report = environment().problems.join("\n");
    expect(report).toContain("OBSERVER_DEMO_OPENAI_KEY is in use");
    expect(report).not.toContain(KEY);
  });

  it("says why a key that is set is ignored", () => {
    Object.assign(process.env, LOCAL, { VERCEL: "1" });
    resetEnvironmentCache();
    const report = environment().problems.join("\n");
    expect(report).toContain("OBSERVER_DEMO_OPENAI_KEY is set and ignored");
    expect(report).not.toContain(KEY);
  });
});

describe("the stream route", () => {
  const saved = { ...process.env };

  function admitted(): GateModule.Admitted {
    return {
      ok: true,
      question: "Where do presentations lose buyers?",
      subject: "0123456789abcdef",
      clientHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      requestId: "3f5b9c21-8a4d-4e77-9c11-0d2e4a6b8c31",
      accountId: "acct_test_developer",
      modelOverride: null,
      context: {
        viewer: VIEWERS.developer,
        tenantSlug: "alpha",
        projectSlug: "northgate",
        projectLabel: "Northgate",
        periodLabel: "Quarter to date",
        period: "quarter_to_date",
        roster: [],
        unitCode: null,
        meetingId: null,
        safetyIdentifier: "obs_test",
        depth: "standard",
      },
    };
  }

  /*
   * `Host` is set on the request, as a browser sets it: the route reads it
   * from there and from nothing the body carries.
   */
  async function ask(host = "localhost:3400"): Promise<string> {
    const response = await POST(
      new Request("http://observer.test/api/ask/stream", {
        method: "POST",
        headers: { "content-type": "application/json", host },
        body: "{}",
      }),
    );
    return response.text();
  }

  beforeEach(() => {
    seen.grants.length = 0;
    vi.mocked(admitModelRequest).mockClear();
    vi.mocked(gate).mockResolvedValue(admitted());
    for (const marker of DEPLOYMENT_MARKERS) delete process.env[marker];
    delete process.env["OBSERVER_ENVIRONMENT"];
  });

  afterEach(() => {
    process.env = { ...saved };
    resetCompanyKeys();
  });

  it("hands the agent the demonstration key and asks no account's budget", async () => {
    Object.assign(process.env, LOCAL, { OBSERVER_DEMO_OPENAI_MODEL: "gpt-5-mini" });
    const body = await ask();
    expect(body).toContain("event: final");
    expect(admitModelRequest).not.toHaveBeenCalled();
    expect(seen.grants).toEqual([
      { model: RECOMMENDED_DEFAULT, apiKey: KEY, wireModel: "gpt-5-mini" },
    ]);
    expect(body).not.toContain(KEY);
  });

  it("asks the account's admission when no demonstration key is honoured", async () => {
    Object.assign(process.env, LOCAL, { VERCEL: "1" });
    await ask();
    expect(admitModelRequest).toHaveBeenCalledTimes(1);
    expect(seen.grants).toEqual([{ blocked: "no_connection" }]);
  });

  /* ADR-0043: the positive local signal, on top of ADR-0040's markers. */
  it("spends no demonstration key on a request addressed to a name", async () => {
    Object.assign(process.env, LOCAL);
    for (const host of ["observer.example", "observer.example:3400", "10.0.0.5:3400"]) {
      seen.grants.length = 0;
      vi.mocked(admitModelRequest).mockClear();
      await ask(host);
      expect(admitModelRequest, host).toHaveBeenCalledTimes(1);
      expect(seen.grants, host).toEqual([{ blocked: "no_connection" }]);
    }
  });

  it("answers a member with the company's key, before the owner's, and asks no budget", async () => {
    Object.assign(process.env, LOCAL, { OBSERVER_DEMO_COMPANY_KEYS: "1" });
    const clara = accountById("acct_clara");
    if (clara === null) throw new Error("no Clara");
    expect(await setCompanyKey(clara, COMPANY_KEY, async () => ({ ok: true }))).toEqual({
      ok: true,
    });
    vi.mocked(gate).mockResolvedValue({ ...admitted(), accountId: "acct_nora" });

    const body = await ask("127.0.0.1:3400");
    expect(admitModelRequest).not.toHaveBeenCalled();
    expect(seen.grants).toEqual([
      {
        model: RECOMMENDED_DEFAULT,
        apiKey: COMPANY_KEY,
        wireModel: modelEntry(RECOMMENDED_DEFAULT).apiIdentifier,
      },
    ]);
    expect(body).not.toContain(COMPANY_KEY);
    expect(body).not.toContain(KEY);
  });

  it("spends no company key on a request addressed to a name", async () => {
    Object.assign(process.env, { OBSERVER_DEMO_ACCOUNTS: "1", OBSERVER_DEMO_COMPANY_KEYS: "1" });
    const clara = accountById("acct_clara");
    if (clara === null) throw new Error("no Clara");
    await setCompanyKey(clara, COMPANY_KEY, async () => ({ ok: true }));
    vi.mocked(gate).mockResolvedValue({ ...admitted(), accountId: "acct_nora" });

    for (const host of ["observer.example:3400", "10.0.0.5:3400"]) {
      seen.grants.length = 0;
      vi.mocked(admitModelRequest).mockClear();
      const body = await ask(host);
      expect(admitModelRequest, host).toHaveBeenCalledTimes(1);
      expect(seen.grants, host).toEqual([{ blocked: "no_connection" }]);
      expect(body, host).not.toContain(COMPANY_KEY);
    }
  });

  it("gives another company's member the owner's key, never this company's", async () => {
    Object.assign(process.env, LOCAL, { OBSERVER_DEMO_COMPANY_KEYS: "1" });
    const clara = accountById("acct_clara");
    if (clara === null) throw new Error("no Clara");
    await setCompanyKey(clara, COMPANY_KEY, async () => ({ ok: true }));
    vi.mocked(gate).mockResolvedValue({ ...admitted(), accountId: "acct_monika" });

    await ask();
    expect(seen.grants).toEqual([
      {
        model: RECOMMENDED_DEFAULT,
        apiKey: KEY,
        wireModel: modelEntry(RECOMMENDED_DEFAULT).apiIdentifier,
      },
    ]);
  });
});
