import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }) }));

const { AgentPortrait } = await import("../src/components/agents/Portrait");
const { PortraitEditor } = await import("../src/components/agents/PortraitEditor");

/**
 * WHAT A PORTRAIT AND ITS CONTROL SAY (ADR-0054): initials where there is no
 * picture, a silent mark beside a printed name, and a control only where a
 * press could work.
 */

const HOSTED = "Portraits are kept only on a local demonstration server for now.";
const editor = (props: Partial<Parameters<typeof PortraitEditor>[0]>) =>
  renderToStaticMarkup(
    createElement(PortraitEditor, {
      endpoint: "/api/observer/portraits/shark/shark-residence/agt_sharklena01",
      name: "Lena Fischer",
      src: null,
      mode: "company_admin",
      available: true,
      unavailable: HOSTED,
      maxBytes: 2 * 1024 * 1024,
      ...props,
    }),
  );

describe("the portrait", () => {
  it("draws initials, silent beside a printed name", () => {
    const html = renderToStaticMarkup(
      createElement(AgentPortrait, { name: "Zsófia Bárány", src: null, size: "row", alt: "" }),
    );
    expect(html).toContain(">ZB<");
    expect(html).toContain('aria-hidden="true"');
  });

  it("names the initials where they stand alone, and the picture by its alt", () => {
    const initials = renderToStaticMarkup(
      createElement(AgentPortrait, {
        name: "Iva Horváth",
        src: null,
        size: "card",
        alt: "Iva Horváth",
      }),
    );
    expect(initials).toContain('role="img"');
    expect(initials).toContain('aria-label="Iva Horváth"');
    const picture = renderToStaticMarkup(
      createElement(AgentPortrait, {
        name: "Iva Horváth",
        src: "/api/observer/portraits/shark/shark-residence/agt_sharkiva01?v=1",
        tone: "var(--d-series-5)",
        size: "head",
        alt: "",
      }),
    );
    expect(picture).toMatch(/<img[^>]+alt=""/);
    expect(picture).toContain("--ag-seat:var(--d-series-5)");
  });
});

describe("the control", () => {
  it("offers the company admin the first image, and says what is kept", () => {
    const html = editor({});
    expect(html).toContain(">Portrait<");
    expect(html).toContain(">Choose image<");
    expect(html).toContain("Location and camera details are removed before it is kept.");
    expect(html).not.toContain(">Remove<");
    expect(html).toContain('accept="image/png,image/jpeg,image/webp"');
  });

  it("offers the agent her own replace and remove", () => {
    const html = editor({ mode: "self", src: "/x?v=1" });
    expect(html).toContain(">Your portrait<");
    expect(html).toContain(">Replace<");
    expect(html).toContain(">Remove<");
  });

  it("is a sentence and no button where the server keeps no portraits", () => {
    const html = editor({ available: false });
    expect(html).toContain(HOSTED);
    expect(html).not.toContain("<button");
    expect(html).not.toContain('type="file"');
  });
});
