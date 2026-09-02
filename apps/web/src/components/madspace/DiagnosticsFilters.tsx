"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { dynamicRoute } from "@/lib/href";

/**
 * The Diagnostics narrowing control.
 *
 * ## It is a real filter, and the URL is the proof
 *
 * Every change writes the query string and the server re-reads the estate
 * through it. Nothing is filtered in the browser, so what an operator sees is
 * what the control plane returned for those parameters — and the address bar
 * is the whole state, which means a narrowed view is a link. Finding the one
 * wrong row and being unable to send anybody to it is how an operations screen
 * fails a support conversation.
 *
 * ## Why it is still a `<form method="get">`
 *
 * The selects navigate on change through the router, which is the fast path and
 * the one that will be used. The surrounding form is a plain GET to this same
 * route with the same field names, so the control degrades to a full page
 * navigation rather than to nothing — and the submit button that drives it is
 * inside `<noscript>`, where it costs a reader with JavaScript nothing at all.
 *
 * ## Why the options come from the server
 *
 * The lists are the values the estate actually holds, computed beside the rows
 * they describe. A control that offers seven verdicts over an estate with two
 * is five choices that lead to an empty screen — and an empty screen with a
 * filter on it looks exactly like a healthy estate.
 */

export interface FilterOption {
  readonly value: string;
  readonly label: string;
}

export interface DiagnosticsFiltersProps {
  readonly projects: readonly FilterOption[];
  readonly environments: readonly FilterOption[];
  readonly healths: readonly FilterOption[];
  readonly project: string | null;
  readonly environment: string | null;
  readonly health: string | null;
  /** The route the form posts to and the router navigates within. */
  readonly action: string;
}

/** The address for a filter with one field changed. Empty fields are dropped. */
function hrefFor(props: DiagnosticsFiltersProps, key: string, value: string): string {
  const params = new URLSearchParams();
  const current: readonly (readonly [string, string | null])[] = [
    ["project", props.project],
    ["environment", props.environment],
    ["health", props.health],
  ];
  for (const [name, held] of current) {
    const next = name === key ? value : (held ?? "");
    if (next.length > 0) params.set(name, next);
  }
  const query = params.toString();
  return query.length === 0 ? props.action : `${props.action}?${query}`;
}

export function DiagnosticsFilters(props: DiagnosticsFiltersProps) {
  const router = useRouter();
  const narrowed = props.project !== null || props.environment !== null || props.health !== null;

  /*
   * `replace` rather than `push`. Changing a filter three times should not put
   * three entries in the history an operator has to press Back through to
   * leave the screen; the previous narrowing is not a place they were.
   */
  const go = (key: string, value: string) => {
    router.replace(dynamicRoute(hrefFor(props, key, value)), { scroll: false });
  };

  return (
    <form className="mad-filters" method="get" action={props.action}>
      <Field
        name="project"
        label="Project"
        value={props.project}
        anyLabel="Every project"
        options={props.projects}
        onPick={go}
      />
      <Field
        name="environment"
        label="Environment"
        value={props.environment}
        anyLabel="Every environment"
        options={props.environments}
        onPick={go}
      />
      <Field
        name="health"
        label="Health"
        value={props.health}
        anyLabel="Every verdict"
        options={props.healths}
        onPick={go}
      />

      <div className="mad-filters-tail">
        {narrowed ? (
          <Link className="mad-filters-clear" href={dynamicRoute(props.action)}>
            Clear the filter
          </Link>
        ) : (
          <span className="mad-filters-state">Showing the whole estate</span>
        )}
        <noscript>
          <button className="mad-filters-apply" type="submit">
            Apply
          </button>
        </noscript>
      </div>
    </form>
  );
}

function Field({
  name,
  label,
  value,
  anyLabel,
  options,
  onPick,
}: {
  name: string;
  label: string;
  value: string | null;
  /*
   * The unnarrowed choice says what it does — "Every project", not "All". It
   * carries the empty string, so an environment genuinely named `all` stays
   * selectable and the query key simply disappears when nothing is chosen.
   */
  anyLabel: string;
  options: readonly FilterOption[];
  onPick: (key: string, value: string) => void;
}) {
  const id = `mad-filter-${name}`;
  return (
    <div className="mad-filter">
      <label className="mad-filter-label" htmlFor={id}>
        {label}
      </label>
      <select
        className="mad-filter-select"
        id={id}
        name={name}
        value={value ?? ""}
        disabled={options.length === 0}
        onChange={(event) => {
          onPick(name, event.target.value);
        }}
      >
        <option value="">{anyLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
