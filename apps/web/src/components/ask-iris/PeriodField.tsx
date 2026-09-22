"use client";

import { useSearchParams } from "next/navigation";
import { presetFrom } from "@/lib/period";

/**
 * THE PERIOD, CARRIED BY THE DOCK'S FORM.
 *
 * The dock is rendered by the project layout, and a layout does not receive
 * `searchParams` — by design, not by oversight, as the layout's own docblock
 * says: a layout is not re-rendered when only the query changes, so a period
 * read there would go stale under the switcher. The layout therefore passed
 * `""`, and the dock's form carried no period at all, while its docblock said
 * the period travelled with the question. The shell meets the same constraint
 * the same way — it reads the URL itself, through `useSearchParams`, in a
 * client component — and this is that solution at the size of one field.
 *
 * Nothing is rendered for the default period: `withPeriod` omits it from every
 * link and the Ask page omits it from its own form, so the address of an
 * answer read in the default span stays the short one.
 */
export function PeriodField() {
  const params = useSearchParams();
  const period = presetFrom(params.get("period") ?? undefined);
  return period === "quarter_to_date" ? null : <input type="hidden" name="period" value={period} />;
}
