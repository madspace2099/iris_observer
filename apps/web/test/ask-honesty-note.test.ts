import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SyntheticObserverRepository, VIEWERS } from "@observer/synthetic";
import type { Viewer } from "@observer/readmodels";
import { AskConversationPanel, AskFrame } from "@/components/ask-iris/AskScreen";
import { AskLiveAnswer } from "@/components/ask-iris/AskLiveAnswer";

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
 * THE COMPOSER'S TWO LINES (ADR-0040, ADR-0043).
 *
 * The Gate 1 notice names the model wherever one words an answer, live
 * openings included; the key note says a company has no key yet, and is not a
 * Gate 1 notice, so it never carries the marker.
 */
const renderFrame = (modelNotice: string | null, keyNote: string | null) =>
  renderToStaticMarkup(
    createElement(AskFrame, {
      root: "/shark/shark-residence",
      periodParam: "",
      projectSlug: "shark-residence",
      projectLabel: "Shark Residence",
      question: "",
      historyOpen: false,
      composerLabel: "Read models",
      models: [],
      scope: { kind: "current" },
      otherProjects: [],
      modelNotice,
      keyNote,
      children: null,
    }),
  );

describe("the composer's notices", () => {
  const NOTE = "Clara Weiss has not added an OpenAI key for Shark Developments yet";

  it("says a company has no key outside the AI notice", () => {
    const html = renderFrame(null, `${NOTE}; answers come from the read models.`);
    expect(html).toContain(`<p class="ask-hint">${NOTE}`);
    expect(html).not.toContain("data-ai-notice");
    expect(renderFrame(null, null)).not.toContain(NOTE);
  });

  it("does not call the live openings the read models' words where a model words them", () => {
    const html = renderFrame(
      "Typed questions and the first 4 openings are worded by gpt-5-mini.",
      null,
    );
    expect(html).toContain("data-ai-notice");
    expect(html).not.toContain("prepared openings are the read models");
    expect(html).toContain("The other openings are answered in the read models");
  });
});
