import type { ReactNode } from "react";
import type { PeriodPreset } from "@observer/readmodels";

export interface FilterOption {
  readonly value: string;
  readonly label: string;
}

/**
 * One control. Two kinds, and no third.
 *
 * A date range, a multi-select and a slider are all things this deliberately
 * cannot express. The period is the shell's, set once for the whole screen; a
 * multi-select cannot be a native control and would need script; and a slider
 * over a measured quantity invites a reader to filter to a range that contains
 * four records and then read a rate off it.
 */
export type FilterField =
  | {
      readonly kind: "select";
      readonly name: string;
      readonly label: string;
      /** The current value, read from the URL by the screen. */
      readonly value: string;
      readonly options: readonly FilterOption[];
    }
  | {
      readonly kind: "search";
      readonly name: string;
      readonly label: string;
      readonly value: string;
      readonly placeholder?: string;
    };

/**
 * THE FILTER BAR — a `<form method="get">` and nothing else.
 *
 * ## Why a form, and why GET
 *
 * Three properties fall out of that one decision and none of them is available
 * to a bar built from click handlers.
 *
 * **It works with no JavaScript at all.** Native `<select>` and `<input>`
 * inside a GET form need not a single line of script to filter a
 * server-rendered surface, and they are reachable by keyboard and correct on a
 * phone before anybody writes any.
 *
 * **Every filtered view is linkable.** The submitted state IS the query string,
 * so a reader who filtered to the available two-bedroom units can send that
 * exact screen to a colleague. Client state cannot be sent to anybody.
 *
 * **There is nowhere to keep it that would be wrong.** This application stores
 * nothing in the browser — a test scans `apps/web/src` for `localStorage`,
 * `sessionStorage` and `indexedDB` and expects zero hits — so a filter either
 * lives in the URL or it does not survive a refresh.
 *
 * ## Why the period is a hidden input and not merely a link
 *
 * A GET submit REPLACES the whole query string with the form's own fields.
 * Everything the reader had chosen that is not a field in this form — the
 * period above all — is gone the moment they press Apply. `withPeriod` cannot
 * help here, because there is no href to rewrite. So the period is carried as a
 * hidden field, unconditionally, including when it is the default value: a
 * redundant `?period=quarter_to_date` costs a reader nothing, and a period that
 * silently resets on every filter is the defect ADR-0033 and `withPeriod` exist
 * to prevent.
 *
 * `carry` is the same mechanism for everything else the screen holds in the URL
 * — a selected unit, an open cut, a chosen KPI window. A screen that forgets to
 * pass one loses it on submit, which is why the prop is named for what it does
 * rather than for what it contains.
 *
 * ## Why there is a submit button
 *
 * A text field submits on Enter; a `<select>` does not, and a bar whose selects
 * only apply when the reader happens to be in the text field is a bar that
 * appears broken. The button is real — it submits the form — so it is not one
 * of the controls-that-do-nothing the doctrine forbids.
 */
export function FilterBar({
  action,
  fields,
  period,
  resultCount,
  carry = {},
  label = "Filters",
  submitLabel = "Apply",
}: {
  /** Where the form submits. The screen's own path, without a query string. */
  readonly action: string;
  readonly fields: readonly FilterField[];
  readonly period: PeriodPreset;
  /**
   * How many records the current filter leaves, in the screen's own words —
   * "18 of 48 units". Required: a filter with no count leaves the reader unable
   * to tell an empty result from a filter that did not apply.
   */
  readonly resultCount: ReactNode;
  /** Other query parameters that must survive the submit. See above. */
  readonly carry?: Readonly<Record<string, string>>;
  readonly label?: string;
  readonly submitLabel?: string;
}) {
  return (
    <form className="ox-filters" method="get" action={action} aria-label={label}>
      {/*
       * `defaultValue` rather than `value`, for the same reason as the fields
       * below and one more: `readOnly` is not a permitted attribute on a hidden
       * input, so the usual way of silencing React's controlled-field warning
       * would produce invalid markup.
       */}
      <input type="hidden" name="period" defaultValue={period} />
      {Object.entries(carry).map(([name, value]) => (
        <input key={name} type="hidden" name={name} defaultValue={value} />
      ))}

      {fields.map((field) => {
        const id = `filter-${field.name}`;
        return (
          <div className="ox-field" key={field.name}>
            <label className="ox-field-label" htmlFor={id}>
              {field.label}
            </label>
            {field.kind === "select" ? (
              /*
               * `defaultValue`, not `value`. These are uncontrolled fields on
               * purpose — the browser owns them between renders and the server
               * owns them across submits — and a `value` with no `onChange`
               * would make React warn about a field it cannot change and would
               * freeze the control anywhere this bar is used inside a client
               * component.
               */
              <select className="ox-select" id={id} name={field.name} defaultValue={field.value}>
                {field.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className="ox-input"
                id={id}
                name={field.name}
                type="search"
                defaultValue={field.value}
                {...(field.placeholder === undefined ? {} : { placeholder: field.placeholder })}
              />
            )}
          </div>
        );
      })}

      <button className="ox-btn" type="submit">
        {submitLabel}
      </button>

      {/*
       * Last, because `.ox-filters-count` claims the remaining width with
       * `margin-inline-start: auto`. A `<span>` rather than a `<p>`: the sheet
       * does not reset paragraph margins here, and a 1em block margin inside a
       * baseline-aligned flex row would push the count out of line with the
       * fields it counts.
       */}
      <span className="ox-filters-count">{resultCount}</span>
    </form>
  );
}
