import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { parseOverride } from "@/lib/ai/admission";
import { ASK_MODEL_COOKIE, askModelCookie, demoGrant, demoModelNamed } from "@/lib/ai/model-choice";

/**
 * THE MODEL A DEMONSTRATION KEY ANSWERS WITH IS CHOSEN IN SETTINGS (2026-10-23).
 *
 * The owner added the company's key and wanted to choose among OpenAI's
 * models; a picker in the Ask composer was then judged noise beside every
 * question. The choice is made once, on the AI settings page, and kept as a
 * cookie the Ask page and the stream route both read, so what the composer's
 * notice names is what the key is spent on.
 */

const jar = vi.hoisted(() => ({
  set: [] as [string, string][],
  deleted: [] as string[],
  redirected: [] as string[],
  spendable: true,
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => undefined,
    set: (name: string, value: string) => void jar.set.push([name, value]),
    delete: (name: string) => void jar.deleted.push(name),
  }),
  headers: async () => new Headers({ host: "localhost:3400" }),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    jar.redirected.push(to);
    throw new Error("NEXT_REDIRECT");
  },
}));
vi.mock("@/lib/session", () => ({
  requireAccount: async () => ({ accountId: "acct_clara" }),
}));
vi.mock("@/lib/env", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  demoKeysSpendable: () => jar.spendable,
}));

const { chooseDemoModel } = await import("../src/app/settings/ai/actions");

const DEMO = { apiKey: "sk-observer-test-choice-0000", model: "gpt-5.6-terra" };

describe("the grant a demonstration key answers with", () => {
  it("is the key's own model until the reader picks one", () => {
    expect(demoGrant(DEMO, null)).toEqual({
      model: "gpt-5.6-terra",
      apiKey: DEMO.apiKey,
      wireModel: "gpt-5.6-terra",
    });
  });

  it("is the picked catalogue model, on the same key", () => {
    expect(demoGrant(DEMO, "gpt-5.6-sol")).toEqual({
      model: "gpt-5.6-sol",
      apiKey: DEMO.apiKey,
      wireModel: "gpt-5.6-sol",
    });
  });

  it("names what it would spend, and nothing where no key answers", () => {
    expect(demoModelNamed(null, "gpt-5.6-sol")).toBeNull();
    expect(demoModelNamed("gpt-5.6-terra", null)).toBe("gpt-5.6-terra");
    expect(demoModelNamed("gpt-5.6-terra", "gpt-5.6-luna")).toBe("gpt-5.6-luna");
  });

  it("takes only a catalogue id from the cookie", () => {
    for (const value of [undefined, "", "gpt-4o", "GPT-5.6-SOL", "gpt-5.6-sol ", "<b>"]) {
      expect(parseOverride(value), String(value)).toBeNull();
    }
    expect(parseOverride("gpt-5.6-luna")).toBe("gpt-5.6-luna");
  });
});

describe("the stream route spends the choice only on a demonstration key", () => {
  it("reads the cookie inside the demonstration branch, through demoGrant", () => {
    const route = readFileSync(
      resolve(import.meta.dirname, "../src/app/api/ask/stream/route.ts"),
      "utf8",
    );
    expect(route).toMatch(
      /demo !== null\s*\?\s*demoGrant\(demo, parseOverride\(askModelCookie\(request\)\)\)/,
    );
  });

  it("finds the cookie by its own name among the request's others", () => {
    const asking = (cookie: string | null) =>
      askModelCookie(
        new Request("http://localhost:3400/api/ask/stream", {
          headers: cookie === null ? {} : { cookie },
        }),
      );
    expect(asking(`observer_session=abc; ${ASK_MODEL_COOKIE}=gpt-5.6-sol; other=1`)).toBe(
      "gpt-5.6-sol",
    );
    expect(asking(`${ASK_MODEL_COOKIE}=gpt-5.6-luna`)).toBe("gpt-5.6-luna");
    expect(asking(`x_${ASK_MODEL_COOKIE}=gpt-5.6-sol`)).toBeUndefined();
    expect(asking(null)).toBeUndefined();
  });
});

describe("where the model is chosen", () => {
  const source = (path: string) => readFileSync(resolve(import.meta.dirname, path), "utf8");

  it("is not the Ask composer", () => {
    const screen = source("../src/components/ask-iris/AskScreen.tsx");
    expect(screen).not.toContain("ask-model-wrap");
    expect(screen).not.toContain('aria-label="Model"');
  });

  it("is the AI settings page, which posts the choice to chooseDemoModel", () => {
    const page = source("../src/app/settings/ai/page.tsx");
    expect(page).toContain("<DemoModelPanel");
    /* Only where the key would be spent, as the composer once named a model only there. */
    expect(page).toMatch(/demoOwnModel === null \|\| !spendable \? null : \(\s*<DemoModelPanel/);
    expect(page).toMatch(/<form action=\{chooseDemoModel\}/);
    expect(page).toMatch(/name="model"/);
  });
});

describe("the settings action that keeps the choice", () => {
  const submit = async (model: string | null) => {
    const form = new FormData();
    if (model !== null) form.set("model", model);
    await chooseDemoModel(form).catch((error: unknown) => {
      if (!(error instanceof Error) || error.message !== "NEXT_REDIRECT") throw error;
    });
  };

  beforeEach(() => {
    jar.set.length = 0;
    jar.deleted.length = 0;
    jar.redirected.length = 0;
    jar.spendable = true;
  });

  it("keeps nothing where no demonstration key would be spent", async () => {
    jar.spendable = false;
    await submit("gpt-5.6-sol");
    await submit("");
    expect(jar.set).toEqual([]);
    expect(jar.deleted).toEqual([]);
    expect(jar.redirected).toEqual(["/settings/ai", "/settings/ai"]);
  });

  it("keeps a catalogue id in the cookie, and says so", async () => {
    await submit("gpt-5.6-sol");
    expect(jar.set).toEqual([[ASK_MODEL_COOKIE, "gpt-5.6-sol"]]);
    expect(jar.redirected).toEqual(["/settings/ai?done=demo_model"]);
  });

  it("writes nothing for anything else", async () => {
    for (const value of ["gpt-4o", "GPT-5.6-SOL", "<b>", null]) await submit(value);
    expect(jar.set).toEqual([]);
    expect(jar.deleted).toEqual([]);
    expect(jar.redirected.every((to) => to === "/settings/ai")).toBe(true);
  });

  it("clears the choice for the key's own model", async () => {
    await submit("");
    expect(jar.deleted).toEqual([ASK_MODEL_COOKIE]);
  });
});
