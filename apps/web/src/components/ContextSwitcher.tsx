"use client";

import { useRouter } from "next/navigation";
import type { ChangeEvent } from "react";
import { dynamicRoute } from "@/lib/href";

/**
 * Project and period selection.
 *
 * A native select rather than a bespoke menu: keyboard accessible and
 * screen-reader correct with no work, and the shell is not where to spend
 * novelty. Changing either navigates — the context lives in the URL, so a
 * screen can be linked to and shared exactly as it was read.
 *
 * Each option carries its own href. A server component cannot hand a client
 * component a function to build one, and pushing the URL construction into the
 * server keeps route shapes in a single place besides.
 */
export interface SwitchOption {
  readonly value: string;
  readonly label: string;
  readonly href: string;
}

export function ContextSwitcher({
  label,
  value,
  options,
}: {
  label: string;
  value: string;
  options: readonly SwitchOption[];
}) {
  const router = useRouter();

  function onChange(event: ChangeEvent<HTMLSelectElement>) {
    const chosen = options.find((option) => option.value === event.target.value);
    if (chosen === undefined) return;
    router.push(dynamicRoute(chosen.href));
  }

  return (
    <label className="obs-context">
      <span className="obs-sr">{label}</span>
      <select
        className="obs-action"
        value={value}
        onChange={onChange}
        aria-label={label}
        style={{ appearance: "none", paddingRight: "var(--space-5)" }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
