import {
  MEETING_OUTCOMES,
  SESSION_CHANNELS,
  type MeetingOutcome,
  type SessionChannel,
} from "@observer/contracts";
import type { MeetingFilterOptions, MeetingFilters } from "@observer/readmodels";

import type { FilterField, FilterOption } from "@/components/product";

/**
 * THE REGISTER'S FILTERS, READ FROM THE URL AND WRITTEN BACK INTO CONTROLS.
 *
 * The whole filter state of the meeting register lives in the query string and
 * nowhere else. Three reasons, and only the first is about taste:
 *
 * 1. A filtered register is a thing an agency manager sends to somebody. "Every
 *    WEB IRIS meeting Martin gave last quarter" is a URL or it is a screenshot,
 *    and a screenshot cannot be re-read next month.
 * 2. This application stores nothing in the browser. A test scans
 *    `apps/web/src` for `localStorage`, `sessionStorage` and `indexedDB` and
 *    expects zero hits, so a filter either lives in the address bar or it does
 *    not survive a refresh.
 * 3. The controls are a `<form method="get">` with no script behind them, which
 *    means the URL is not a mirror of the state — it IS the state, produced by
 *    the browser's own submit.
 *
 * ## Three axes, and the fourth one the reader will look for
 *
 * `MeetingFilters` is agent, channel and outcome. A DATE filter is deliberately
 * not among them: the period is the shell's, set once in the context band for
 * every surface in the product, and a register carrying its own date range
 * beside a page that already has one is how two panels come to measure
 * different spans. The date axis a reader wants is therefore the period
 * switcher, and it is one control above this one rather than a fourth select
 * inside it.
 *
 * That is a narrowing rather than a shrug, and it is reported: the read model
 * offers no from/to on `MeetingFilters`, so a register cannot be cut to "the
 * week of the launch" without the period happening to be that week.
 */

/** The query-string names. Short, lower case, and stable — they get shared. */
export const AGENT_PARAM = "agent";
export const CHANNEL_PARAM = "channel";
export const OUTCOME_PARAM = "outcome";

/** The value a select carries when nothing is chosen. Empty, not "all". */
const ANY = "";

export interface MeetingSearch {
  readonly [AGENT_PARAM]?: string;
  readonly [CHANNEL_PARAM]?: string;
  readonly [OUTCOME_PARAM]?: string;
}

/**
 * The URL, resolved into the filters the read model accepts.
 *
 * Unrecognised values fall back to null rather than throwing, for the reason
 * `presetFrom` gives about periods: a stale link in somebody's notes should
 * show them the unfiltered register, not an error page. A channel or an outcome
 * that is not in the contract's own vocabulary cannot reach the repository,
 * which keeps a hand-edited query string from producing a filter nothing in the
 * product can name.
 *
 * `agentId` is the exception and passes through unchecked. The set of valid
 * agent identifiers is not a constant — it is whoever presents on this project
 * — and it arrives on the view's `options` AFTER the call that needs the
 * filter. An identifier that matches nobody simply matches no meeting, and the
 * read model's own `emptyState` sentence is what the reader is shown.
 */
export function parseMeetingFilters(search: MeetingSearch): MeetingFilters {
  const channel = search[CHANNEL_PARAM];
  const outcome = search[OUTCOME_PARAM];
  const agent = search[AGENT_PARAM];

  return {
    agentId: agent === undefined || agent === ANY ? null : agent,
    channel: (SESSION_CHANNELS as readonly string[]).includes(channel ?? "")
      ? (channel as SessionChannel)
      : null,
    outcome: (MEETING_OUTCOMES as readonly string[]).includes(outcome ?? "")
      ? (outcome as MeetingOutcome)
      : null,
  };
}

/**
 * An address with the register's filters written into it — the inverse of
 * `parseMeetingFilters`, and the one place they are written.
 *
 * Carried on the row that opens a meeting and on the replay's two ways back,
 * so the register a reader narrowed is the register they come back to. Until
 * P2-16 the row carried the period alone and both ways back returned to the
 * whole period. A null axis is omitted, as the GET form omits an empty select;
 * the period is `withPeriod`'s business, not this function's.
 */
export function withMeetingFilters(href: string, filters: MeetingFilters): string {
  const [path, query] = href.split("?");
  const params = new URLSearchParams(query ?? "");
  const axes: readonly (readonly [string, string | null])[] = [
    [AGENT_PARAM, filters.agentId],
    [CHANNEL_PARAM, filters.channel],
    [OUTCOME_PARAM, filters.outcome],
  ];
  for (const [name, value] of axes) {
    if (value === null) params.delete(name);
    else params.set(name, value);
  }
  const search = params.toString();
  return search === "" ? (path ?? href) : `${path}?${search}`;
}

/**
 * One select's options, with the applied value guaranteed to be among them.
 *
 * `MeetingFilterOptions` counts over the PERIOD rather than over the current
 * result, which is what lets a reader see that switching to another agent would
 * give them 42 meetings without switching to find out. It also drops any option
 * whose count is zero — sensible for a control, and a trap for the one case
 * this function exists to handle: a filter that is applied and whose value is
 * not in the list.
 *
 * That happens whenever a shared link names an agent who gave no meetings in
 * the period the reader landed on. Without the fallback the select would show
 * "Any" while the register stayed filtered, and the reader would be looking at
 * an empty list under a control claiming to be clear. The applied value is
 * therefore re-added, labelled with what the URL actually said, so the control
 * and the register cannot disagree.
 */
function optionsWith(
  options: readonly { readonly id: string; readonly label: string; readonly count: number }[],
  applied: string | null,
  anyLabel: string,
): readonly FilterOption[] {
  const listed: FilterOption[] = options.map((option) => ({
    value: option.id,
    label: `${option.label} (${option.count})`,
  }));

  if (applied !== null && !options.some((option) => option.id === applied)) {
    listed.push({ value: applied, label: `${applied} (0)` });
  }

  return [{ value: ANY, label: anyLabel }, ...listed];
}

/**
 * The three controls, in the order a reader narrows.
 *
 * Who presented, then where the presentation ran, then how it ended — widest
 * cut first. The counts are printed in the option labels rather than beside the
 * control, so choosing between two agents does not require submitting twice.
 */
export function meetingFilterFields(
  options: MeetingFilterOptions,
  applied: MeetingFilters,
): readonly FilterField[] {
  return [
    {
      kind: "select",
      name: AGENT_PARAM,
      label: "Agent",
      value: applied.agentId ?? ANY,
      options: optionsWith(options.agents, applied.agentId, "Any agent"),
    },
    {
      kind: "select",
      name: CHANNEL_PARAM,
      label: "Channel",
      value: applied.channel ?? ANY,
      options: optionsWith(options.channels, applied.channel, "Any channel"),
    },
    {
      kind: "select",
      name: OUTCOME_PARAM,
      label: "Recorded outcome",
      value: applied.outcome ?? ANY,
      options: optionsWith(options.outcomes, applied.outcome, "Any outcome"),
    },
  ];
}
