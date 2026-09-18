"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { ContextSwitcher } from "@/components/ContextSwitcher";
import { PERIOD_LABELS, presetFrom } from "@/lib/period";
/**
 * The period, controlled by the URL rather than by a constant.
 *
 * The shell rendered `value="quarter_to_date"` unconditionally, so opening
 * `?period=last_28_days` produced a headline that said "last 28 days" beside a
 * selector that said "Quarter to date" — the control and the evidence
 * disagreeing about what the reader was looking at.
 *
 * Three things follow from putting the URL in charge:
 *
 *  - the selector always shows the period the data was computed for;
 *  - changing it stays on the current surface instead of returning to the
 *    briefing, so a period chosen on Unit Attention is applied to Unit
 *    Attention;
 *  - back and forward restore both the control and the data, because there is
 *    only one place the state lives.
 *
 * An unrecognised value falls back to the default *and rewrites the URL*, so
 * the address bar never claims a period the page is not showing.
 */
export function PeriodSwitcher() {
  const pathname = usePathname();
  const params = useSearchParams();

  const active = presetFrom(params.get("period") ?? undefined);

  /*
   * Every preset as a real link to this same surface.
   *
   * It used to navigate on a select's change event; the rows are hrefs now, so
   * a period can be opened in a second tab and set beside the first, which is
   * the comparison a reader was making by hand anyway.
   */
  const options = PERIOD_LABELS.map(([value, label]) => {
    const next = new URLSearchParams(params.toString());
    next.set("period", value);
    return { value, label, href: `${pathname}?${next.toString()}` };
  });

  return (
    <ContextSwitcher
      label="Period"
      caption="Every figure on this page is measured over the period you choose here."
      value={active}
      options={options}
    />
  );
}
