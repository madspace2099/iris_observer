import { describe, expect, it } from "vitest";

import { omittedFrom, printedSections, withOmitted } from "@/components/report/omit";
import {
  LANGUAGE_NAMES,
  WRITTEN_IN,
  frameLanguage,
  languageFrom,
  withLanguage,
  writtenLanguage,
} from "@/lib/language";

/**
 * WHAT A PRINTED REPORT IS ASKED FOR, ON ITS ADDRESS.
 *
 * The export dialog composes a document — the sections kept and the language
 * chosen — and the report page is that document only if both travel on the
 * address. Every expected address is written out here.
 */

describe("the language on a report's address", () => {
  it("reads the three languages the product writes, and nothing else", () => {
    expect(languageFrom("sk")).toBe("sk");
    expect(languageFrom("hu")).toBe("hu");
    expect(languageFrom("en")).toBe("en");
    expect(languageFrom("de")).toBe("en");
    expect(languageFrom("SK")).toBe("en");
    expect(languageFrom("")).toBe("en");
    expect(languageFrom(undefined)).toBe("en");
    expect(languageFrom(["sk", "hu"])).toBe("en");
  });

  it("sets the language beside what the address already carries, and leaves English as it was", () => {
    expect(withLanguage("/alpha/northgate/report", "sk")).toBe("/alpha/northgate/report?lang=sk");
    expect(withLanguage("/alpha/northgate/report?period=year_to_date", "hu")).toBe(
      "/alpha/northgate/report?period=year_to_date&lang=hu",
    );
    expect(withLanguage("/alpha/northgate/report?agent=agt_akhilesh", "en")).toBe(
      "/alpha/northgate/report?agent=agt_akhilesh",
    );
    expect(withLanguage("/alpha/northgate/report?lang=sk", "en")).toBe("/alpha/northgate/report");
  });

  it("names each language in itself", () => {
    expect(LANGUAGE_NAMES).toEqual({ en: "English", sk: "Slovenčina", hu: "Magyar" });
  });

  it("gives a scope only a language it is written in whole", () => {
    expect(WRITTEN_IN).toEqual({
      project: ["en", "sk", "hu"],
      meeting: ["en", "sk", "hu"],
      agent: ["en", "sk", "hu"],
    });
    expect(writtenLanguage("project", "sk")).toBe("sk");
    expect(writtenLanguage("meeting", "hu")).toBe("hu");
    expect(writtenLanguage("agent", "sk")).toBe("sk");
    /* A language the product does not write reaches the gate as the default, and stays it. */
    expect(writtenLanguage("agent", languageFrom("de"))).toBe("en");
  });

  it("gives the frame the report's language on a report page, and English everywhere else", () => {
    const query = (search: string) => new URLSearchParams(search);
    expect(frameLanguage("/alpha/northgate/report", query("lang=sk"))).toBe("sk");
    expect(frameLanguage("/alpha/northgate/report", query("agent=agt_akhilesh&lang=hu"))).toBe(
      "hu",
    );
    expect(frameLanguage("/alpha/northgate/report", query(""))).toBe("en");
    /* `lang` means nothing off a report page: the screens are English. */
    expect(frameLanguage("/alpha/northgate/flow", query("lang=sk"))).toBe("en");
  });
});

describe("the sections a reader took out", () => {
  it("reads a comma-separated list, and nothing from nothing", () => {
    expect([...omittedFrom("unit-demand,sales-agents")]).toEqual(["unit-demand", "sales-agents"]);
    expect([...omittedFrom(" unit-demand , ,outcomes ")]).toEqual(["unit-demand", "outcomes"]);
    expect([...omittedFrom(undefined)]).toEqual([]);
    expect([...omittedFrom(["a", "b"])]).toEqual([]);
  });

  it("carries them on the address, and none leaves it as it was", () => {
    expect(withOmitted("/alpha/northgate/report?lang=sk", ["unit-demand", "outcomes"])).toBe(
      "/alpha/northgate/report?lang=sk&omit=unit-demand%2Coutcomes",
    );
    expect(withOmitted("/alpha/northgate/report?omit=outcomes", [])).toBe(
      "/alpha/northgate/report",
    );
  });

  it("prints every blank section whatever was asked, and every writable one kept", () => {
    const sections = [
      { id: "period-summary", availability: "ready" },
      { id: "channel-split", availability: "unavailable" },
      { id: "sales-agents", availability: "partial" },
    ] as const;
    const printed = printedSections(sections, new Set(["channel-split", "sales-agents"]));
    expect(printed.map((section) => section.id)).toEqual(["period-summary", "channel-split"]);
  });
});
