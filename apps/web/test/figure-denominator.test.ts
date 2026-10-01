import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { MetricValue } from "@observer/readmodels";
import { Figure } from "@/components/product/Metric";

/**
 * A FIGURE UNDER THE FLOOR KEEPS ITS DENOMINATOR.
 *
 * "No metric without a denominator" is the first page rule. A figure whose
 * sample falls short used to print its shortfall in place of its denominator,
 * so a median over nineteen timed meetings lost the nineteen. Both now stand.
 */
const value = (qualifier: string | null): MetricValue => ({
  metricId: "agent.duration",
  label: "Median presentation",
  state: "insufficient",
  display: "12m 42s",
  raw: 762,
  qualifier,
  sampleSize: 19,
  minimumSampleSize: 20,
  comparison: null,
  message: "Fewer than 20 meetings for this agent — shown as a raw figure, not as a verdict.",
  evidence: null,
  drillHref: null,
  policyVersion: null,
});

describe("a figure below its minimum sample", () => {
  it("prints its denominator beside the shortfall", () => {
    const html = renderToStaticMarkup(
      createElement(Figure, { value: value("19 timed meetings"), language: "en" }),
    );
    expect(html).toContain('<span class="ox-of">19 timed meetings</span>');
    expect(html).toContain('<span class="ox-shortfall">Fewer than 20 meetings for this agent');
    expect(html.indexOf("ox-of")).toBeLessThan(html.indexOf("ox-shortfall"));
  });

  it("prints the shortfall alone where the figure never had a denominator", () => {
    const html = renderToStaticMarkup(
      createElement(Figure, { value: value(null), language: "en" }),
    );
    expect(html).not.toContain("ox-of");
    expect(html).toContain("ox-shortfall");
  });
});
