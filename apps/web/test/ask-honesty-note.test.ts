import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SyntheticObserverRepository, VIEWERS } from "@observer/synthetic";
import type { Viewer } from "@observer/readmodels";
import { AskConversationPanel, AskFrame } from "@/components/ask-iris/AskScreen";
import { AskLiveAnswer } from "@/components/ask-iris/AskLiveAnswer";
import { composerNotices } from "@/components/ask-iris/live-questions";

/**
 * THE NOTE ABOVE AN ANSWER SAYS WHAT IS TRUE OF THIS ACCOUNT (NIGHT2, P2-01).
 *
 * The answers are composed by the read models whether or not a model is
 * connected, so "No language model wrote any of this" is always true. "And none
 * is connected to this account" was printed on every account, including one
 * that had connected a model in Settings, where the page had already looked it
 * up. It is said now only where it is true.
 */

const session = await new SyntheticObserverRepository().getAskSession(
  {
    viewer: VIEWERS.developer as Viewer,
    tenantSlug: "alpha",
    projectSlug: "northgate",
    period: "quarter_to_date",
    language: "en",
  },
  null,
);

const render = (modelConnected: boolean) =>
  renderToStaticMarkup(
    createElement(AskConversationPanel, {
      question: "",
      answer: null,
      session,
      viewerName: "Petra",
      composerLabel: "Read models",
      root: "/alpha/northgate",
      periodParam: "",
      modelConnected,
    }),
  );

/*
 * A TYPED QUESTION GOES THROUGH THE ANALYSIS PIPELINE (ADR-0040), AND ITS NOTE
 * IS IN VIEW BEFORE THE ANSWER ARRIVES.
 *
 * Rendered before the request: no outcome yet, so the note says what MAY word
 * the answer, and never names a model that has not written anything.
 */
const renderLive = (modelNotice: string | null) =>
  renderToStaticMarkup(
    createElement(AskLiveAnswer, {
      question: "Where do presentations lose buyers?",
      context: {
        role: "developer",
        tenantSlug: "alpha",
        projectSlug: "northgate",
        projectLabel: "Northgate Residences",
        period: "quarter_to_date",
        unitCode: null,
        meetingId: null,
        agentId: null,
        agentName: null,
        segment: null,
      },
      root: "/alpha/northgate",
      periodParam: "",
      viewerName: "Petra",
      periodLabel: "Quarter to date",
      modelNotice,
      nextQuestions: [],
    }),
  );

describe("the note above a live answer", () => {
  it("carries the AI notice marker before anything is answered", () => {
    expect(renderLive(null)).toContain("data-ai-notice");
    expect(renderLive("Typed questions are worded by gpt-5-mini.")).toContain("data-ai-notice");
  });

  it("says no language model is connected when none can answer", () => {
    expect(renderLive(null)).toContain("No language model is connected here");
  });

  it("says a model may word it, by name, only where one can", () => {
    const html = renderLive("Typed questions are worded by gpt-5-mini, a language model.");
    expect(html).toContain("gpt-5-mini");
    expect(html).not.toContain("No language model is connected here");
  });

  it("names the read models, not a model, until an outcome says otherwise", () => {
    expect(renderLive("Typed questions are worded by gpt-5-mini.")).not.toMatch(
      /class="ask-msg-who">gpt-5-mini/,
    );
  });
});

describe("the honesty note above an answer", () => {
  it("says no model wrote it, on every account", () => {
    expect(render(false)).toContain("No language model wrote any of this");
    expect(render(true)).toContain("No language model wrote any of this");
  });

  it("says none is connected only where none is", () => {
    expect(render(false)).toContain("none is connected to this account");
    expect(render(true)).not.toContain("none is connected");
  });
});

/*
 * THE COMPOSER'S NOTICE (ADR-0040, ADR-0043).
 *
 * The Gate 1 notice names the model wherever one words an answer, live
 * openings included. The composer carries no model control and no key note:
 * both live in Settings since the owner's review of 2026-10-23.
 */
const renderFrame = (modelNotice: string | null) =>
  renderToStaticMarkup(
    createElement(AskFrame, {
      root: "/shark/shark-residence",
      periodParam: "",
      projectSlug: "shark-residence",
      projectLabel: "Shark Residence",
      question: "",
      historyOpen: false,
      scope: { kind: "current" },
      otherProjects: [],
      modelNotice,
      children: null,
    }),
  );

describe("the composer's notices", () => {
  it("carries no AI notice and no model control where no model answers", () => {
    const html = renderFrame(null);
    expect(html).not.toContain("data-ai-notice");
    expect(html).not.toContain("ask-model-wrap");
  });

  it("does not call the live openings the read models' words where a model words them", () => {
    const html = renderFrame("Typed questions and the first 4 openings are worded by gpt-5-mini.");
    expect(html).toContain("data-ai-notice");
    expect(html).not.toContain("prepared openings are the read models");
    /* Scoped to the openings a model words; the rest need no second line under the prompt. */
    expect(html).toContain("the first 4 openings are worded by gpt-5-mini");
  });
});

/*
 * WHICH MODEL THE COMPOSER NAMES (ADR-0040, ADR-0043).
 *
 * A demonstration key is named only where the stream route would spend it:
 * AI on and a loopback request.
 */
describe("composerNotices", () => {
  const base = {
    aiEnabled: true,
    local: true,
    companyModel: null,
    demoModel: null,
    connected: false,
  };

  it("names the company's model before the owner's, on a loopback request with AI on", () => {
    const notes = composerNotices({ ...base, companyModel: "gpt-5-mini", demoModel: "gpt-5" });
    expect(notes.modelNotice).toContain("worded by gpt-5-mini");
    expect(notes.modelNotice).toContain("first 4 openings");
    expect(composerNotices({ ...base, demoModel: "gpt-5" }).modelNotice).toContain(
      "worded by gpt-5,",
    );
  });

  it("names no model with AI off, and says nothing a model would word", () => {
    const notes = composerNotices({
      ...base,
      aiEnabled: false,
      companyModel: "gpt-5-mini",
      connected: true,
    });
    expect(notes.modelNotice).toBeNull();
  });

  it("names no demonstration model on a request addressed to a name", () => {
    const notes = composerNotices({
      ...base,
      local: false,
      companyModel: "gpt-5-mini",
      demoModel: "gpt-5",
    });
    expect(notes.modelNotice).toBeNull();
  });

  it("says nothing where no model answers, and names the account's own connection", () => {
    /* The key's state lives in Settings since the owner's review of 2026-10-23. */
    expect(composerNotices(base).modelNotice).toBeNull();
    expect(composerNotices({ ...base, connected: true }).modelNotice).toContain(
      "connected to this account",
    );
  });
});
