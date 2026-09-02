"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ChangeEvent } from "react";
import { dynamicRoute } from "@/lib/href";
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
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const raw = params.get("period");
  const active = presetFrom(raw ?? undefined);

  function hrefFor(preset: string): string {
    const next = new URLSearchParams(params.toString());
    next.set("period", preset);
    return `${pathname}?${next.toString()}`;
  }

  function onChange(event: ChangeEvent<HTMLSelectElement>) {
    router.push(dynamicRoute(hrefFor(event.target.value)));
  }

  return (
    <div className="obs-context">
      {/*
       * Named once, and exactly.
       *
       * A wrapping `<label>` folds its own text *and* the option list into the
       * control's accessible name, which produced "PeriodQuarter to dateLast
       * 28 days…". `aria-label` alone gives it the name a reader — and an
       * assistive technology — actually hears.
       */}
      <select
        className="obs-action"
        value={active}
        onChange={onChange}
        aria-label="Period"
        style={{ appearance: "none", paddingRight: "var(--space-5)" }}
      >
        {PERIOD_LABELS.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
}
