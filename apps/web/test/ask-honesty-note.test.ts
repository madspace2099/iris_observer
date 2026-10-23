import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SyntheticObserverRepository, VIEWERS } from "@observer/synthetic";
import type { Viewer } from "@observer/readmodels";
import { AskConversationPanel, AskFrame } from "@/components/ask-iris/AskScreen";
import { AskLiveAnswer } from "@/components/ask-iris/AskLiveAnswer";
import { mayModelAnswer } from "@/components/ask-iris/live-questions";

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
 * A TYPED QUESTION GOES THROUGH THE ANALYSIS PIPELINE (ADR-0040).
 *
 * Rendered before the request, with no outcome yet: a note shows only where no
 * model is connected. Where a model may word the answer there is no note, and
 * the author line says Observer, never a model that has not written anything.
 */
const renderLive = (modelMayAnswer: boolean) =>
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
      modelMayAnswer,
      nextQuestions: [],
    }),
  );

describe("the note above a live answer", () => {
  it("carries the AI notice marker before anything is answered", () => {
    expect(renderLive(false)).toContain("data-ai-notice");
    expect(renderLive(true)).toContain("data-ai-notice");
  });

  it("says no language model is connected when none can answer", () => {
    expect(renderLive(false)).toContain("No language model is connected here");
  });

  it("says nothing above the answer where a model may word it (the owner's review, 2026-10-23)", () => {
    const html = renderLive(true);
    expect(html).not.toContain("No language model is connected here");
    expect(html).not.toContain("worded by");
    expect(html).not.toContain('class="ask-note"');
  });

  it("names the read models, not a model, until an outcome says otherwise", () => {
    const html = renderLive(true);
    expect(html).not.toMatch(/class="ask-msg-who"[^>]*>gpt-/);
    expect(html).toMatch(/class="ask-msg-who"[^>]*>Observer</);
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
 * THE COMPOSER (the owner's review, 2026-10-23).
 *
 * No model control, no key note and no model sentence under the prompt. The
 * model is chosen in Settings, and a model-written answer names its model as
 * its author; docs/11-preproduction-gates.md records the change under Gate 1.
 */
const renderFrame = () =>
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
      children: null,
    }),
  );

describe("the composer", () => {
  it("carries no model sentence and no model control", () => {
    const html = renderFrame();
    expect(html).not.toContain("worded by");
    expect(html).not.toContain("ask-model-wrap");
  });
});

/*
 * WHETHER A MODEL MAY ANSWER HERE (ADR-0040, ADR-0043).
 *
 * A demonstration key counts only where the stream route would spend it: AI on
 * and a loopback request. An account's own connection counts with AI on.
 */
describe("mayModelAnswer", () => {
  const base = { aiEnabled: true, local: true, demoKey: false, connected: false };

  it("is true for a demonstration key on a loopback request with AI on", () => {
    expect(mayModelAnswer({ ...base, demoKey: true })).toBe(true);
  });

  it("is false with AI off, even with a key and a connection", () => {
    expect(mayModelAnswer({ ...base, aiEnabled: false, demoKey: true, connected: true })).toBe(
      false,
    );
  });

  it("is false for a demonstration key on a request addressed to a name", () => {
    expect(mayModelAnswer({ ...base, local: false, demoKey: true })).toBe(false);
  });

  it("is false with nothing, and true with the account's own connection", () => {
    expect(mayModelAnswer(base)).toBe(false);
    expect(mayModelAnswer({ ...base, local: false, connected: true })).toBe(true);
  });
});
