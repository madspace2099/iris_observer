import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AskFrame, type AskModelChoice } from "@/components/ask-iris/AskScreen";
import { parseOverride } from "@/lib/ai/admission";
import { ASK_MODEL_COOKIE, askModelCookie, demoGrant, demoModelNamed } from "@/lib/ai/model-choice";
import { chooseAskModel } from "@/lib/ai/model-choice-actions";
import { CATALOGUE } from "@/lib/models/catalogue";

const jar = vi.hoisted(() => ({
  signedIn: true,
  set: [] as [string, string][],
  deleted: [] as string[],
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => undefined,
    set: (name: string, value: string) => void jar.set.push([name, value]),
    delete: (name: string) => void jar.deleted.push(name),
  }),
}));
vi.mock("@/lib/session", () => ({
  currentAccount: async () => (jar.signedIn ? { accountId: "acct_clara" } : null),
}));

/**
 * THE READER PICKS THE MODEL A DEMONSTRATION KEY ANSWERS WITH (2026-10-23).
 *
 * The owner added the company's key and found the picker named one model with
 * "nothing else to choose". Where a demonstration key answers, the catalogue's
 * models are buttons; the choice is a cookie the page and the stream route
 * both read, so what the composer names is what the key is spent on.
 */

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

const frame = (modelChoice: AskModelChoice | null) =>
  renderToStaticMarkup(
    createElement(AskFrame, {
      root: "/shark/shark-residence",
      periodParam: "",
      projectSlug: "shark-residence",
      projectLabel: "Shark Residence",
      question: "",
      historyOpen: false,
      composerLabel: modelChoice === null ? "Read models" : "gpt-5.6-sol",
      models: [],
      scope: { kind: "current" },
      otherProjects: [],
      modelNotice: modelChoice === null ? null : "Typed questions are worded by gpt-5.6-sol.",
      keyNote: null,
      modelChoice,
      children: null,
    }),
  );

describe("the picker", () => {
  const choice: AskModelChoice = {
    options: CATALOGUE.map(({ id, label }) => ({ id, label })),
    current: "gpt-5.6-sol",
  };

  it("draws every catalogue model as a button, with the current one pressed", () => {
    const html = frame(choice);
    const buttons = html.match(/<button[^>]*ask-model-choice[^>]*>/g) ?? [];
    expect(buttons).toHaveLength(CATALOGUE.length);
    for (const entry of CATALOGUE) expect(html).toContain(`value="${entry.id}"`);
    /*
     * Plain submitters of a form of their own: a function `formAction` on the
     * button made React drop `name`, so no choice ever reached the action.
     */
    for (const tag of buttons) {
      expect(tag).toContain('name="model"');
      expect(tag).toContain('form="ask-model-form"');
      expect(tag).not.toMatch(/formaction/i);
    }
    expect(html).toMatch(/<form[^>]*id="ask-model-form"/);
    expect(buttons.filter((tag) => tag.includes('aria-pressed="true"'))).toHaveLength(1);
    expect(buttons.find((tag) => tag.includes('aria-pressed="true"'))).toContain(
      'value="gpt-5.6-sol"',
    );
    expect(html).not.toContain("nothing else to");
  });

  it("stays inert, and says so, where no demonstration key answers", () => {
    const html = frame(null);
    expect(html).not.toContain("ask-model-choice");
    expect(html).not.toContain("ask-model-form");
    expect(html).toContain("nothing else to");
  });
});

describe("the action that keeps the choice", () => {
  const submit = (model: string | null) => {
    const form = new FormData();
    if (model !== null) form.set("model", model);
    return chooseAskModel(form);
  };

  beforeEach(() => {
    jar.signedIn = true;
    jar.set.length = 0;
    jar.deleted.length = 0;
  });

  it("keeps a catalogue id in the cookie the page and the stream route read", async () => {
    await submit("gpt-5.6-sol");
    expect(jar.set).toEqual([[ASK_MODEL_COOKIE, "gpt-5.6-sol"]]);
  });

  it("writes nothing for anything else, or for nobody signed in", async () => {
    for (const value of ["gpt-4o", "GPT-5.6-SOL", "<b>", null]) await submit(value);
    jar.signedIn = false;
    await submit("gpt-5.6-luna");
    expect(jar.set).toEqual([]);
    expect(jar.deleted).toEqual([]);
  });

  it("clears the choice for the key's own model", async () => {
    await submit("");
    expect(jar.deleted).toEqual([ASK_MODEL_COOKIE]);
  });
});
