import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SyntheticObserverRepository, VIEWERS } from "@observer/synthetic";
import type { Viewer } from "@observer/readmodels";
import { AskConversationPanel } from "@/components/ask-iris/AskScreen";

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
