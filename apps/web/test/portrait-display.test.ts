import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }) }));

const { AgentName, AgentPortrait } = await import("../src/components/agents/Portrait");
const { PortraitEditor } = await import("../src/components/agents/PortraitEditor");
const { OutcomeRows } = await import("../src/showroom/charts2");
const { DnaLane } = await import("../src/showroom/parts");

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
      owner: "Shark Developments",
      available: true,
      unavailable: HOSTED,
      maxBytes: 2 * 1024 * 1024,
      ...props,
    }),
  );

describe("the portrait", () => {
  it("draws initials, silent beside a printed name, and no part of its text", () => {
    const html = renderToStaticMarkup(
      createElement(AgentPortrait, { name: "Zsófia Bárány", src: null, size: "row", alt: "" }),
    );
    expect(html).toContain('data-initials="ZB"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain(">ZB<");
  });

  it("puts the face before the name, which is printed once", () => {
    const html = renderToStaticMarkup(
      createElement(AgentName, { name: "Lena Fischer", src: "/p/lena?v=1" }),
    );
    expect(html).toMatch(/<span class="ag-named" data-size="inline"><img[^>]+alt=""/);
    expect(html.match(/Lena Fischer/g)).toHaveLength(1);
  });

  it("stands before a presenter's row in Sales Flow's lists, and never before the team's", () => {
    const figure = { meetingsDisplay: "n", display: "d", belowMinimum: false };
    const face = createElement(AgentPortrait, {
      name: "Lena Fischer",
      src: "/p/lena?v=1",
      size: "row",
      alt: "",
    });
    const rows = renderToStaticMarkup(
      createElement(OutcomeRows, {
        label: "rows",
        lead: { label: "Team", total: 2, parts: { purchase: 2 }, figure },
        rows: [
          { agentId: "agt_lena", label: "Lena Fischer", total: 1, parts: { purchase: 1 }, figure },
          { agentId: "agt_iva", label: "Iva Horváth", total: 1, parts: { purchase: 1 }, figure },
        ],
        keys: [{ id: "purchase", label: "Purchase" }],
        keyCounts: { purchase: 2 },
        marks: { agt_lena: face },
      }),
    );
    expect(rows.match(/class="iris-orow-who" data-marked=""><img/g)).toHaveLength(1);
    expect(rows.match(/class="iris-orow-who">/g)).toHaveLength(2);
    const lane = renderToStaticMarkup(
      createElement(DnaLane, {
        lane: {
          id: "agt_lena",
          label: "Lena Fischer",
          meetingCount: 1,
          steps: [],
          coverage: 1,
          medianDurationSeconds: null,
          outcomeMix: [],
        },
        mark: face,
      }),
    );
    expect(lane).toMatch(
      /<div class="iris-dna-name" data-marked=""><img[^>]+><b>Lena Fischer<\/b>/,
    );
  });

  it("is a plain circle: no ring, no stroke, and no face in print", () => {
    const css = readFileSync(
      fileURLToPath(new URL("../src/components/agents/portrait.css", import.meta.url)),
      "utf8",
    );
    const disc = /\.ag-portrait \{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(disc).toContain("border-radius: 50%");
    expect(disc).toContain("border: 0;");
    expect(css).not.toMatch(
      /\.ag-portrait[^{]*\{[^}]*(outline|box-shadow|border-width|border:\s*[1-9])/,
    );
    expect(css).toMatch(/@media print \{\s*\.ag-portrait \{\s*display: none/);
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

  it("offers the agent her own replace and remove, in words true whoever put it there", () => {
    const html = editor({ mode: "self", src: "/x?v=1" });
    expect(html).toContain(">Your portrait<");
    expect(html).toContain(">Replace<");
    expect(html).toContain(">Remove<");
    expect(html).toContain(
      "You can replace it or remove it; so can the admin of Shark Developments.",
    );
  });

  it("is the same control on her own page with none: who adds it, no button, the status kept", () => {
    const html = editor({ mode: "self", src: null });
    expect(html).toContain(">Your portrait<");
    expect(html).toContain("The admin of Shark Developments adds your portrait.");
    expect(html).not.toContain("<button");
    expect(html).toContain('role="status"');
    expect(html).toMatch(/<h2[^>]+tabindex="-1"/);
  });

  it("is a sentence and no button where the server keeps no portraits", () => {
    const html = editor({ available: false });
    expect(html).toContain(HOSTED);
    expect(html).not.toContain("<button");
    expect(html).not.toContain('type="file"');
  });
});
