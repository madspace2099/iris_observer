import { describe, expect, it } from "vitest";
import type { MeetingFilters } from "@observer/readmodels";

import {
  parseMeetingFilters,
  withMeetingFilters,
  type MeetingSearch,
} from "../src/components/meetings/filters";

/**
 * The meeting register a reader narrowed survives opening a meeting — the
 * source half of P2-16's first clause for the meeting route.
 *
 * `e2e/meeting-filter-navigation.spec.ts` proves the browser half: the row,
 * the crumb and the button a reader actually clicks. This proves the round
 * trip those three links rely on: every axis written into an address by
 * `withMeetingFilters` is read back by `parseMeetingFilters`, through the
 * replay's address and back into the register's. Every axis is set off its
 * default, because an axis left null travels as nothing and proves nothing.
 */

const FILLED: MeetingFilters = {
  agentId: "agt_lucia",
  channel: "webiris",
  outcome: "follow_up_needed",
};

function searchOf(href: string): MeetingSearch & { period?: string } {
  return Object.fromEntries(new URL(href, "https://observer.invalid").searchParams);
}

describe("the meeting register survives the round trip through a replay", () => {
  it("carries every axis into the replay and back, named one at a time", () => {
    /* The row's link: the replay's own route, already carrying the period. */
    const opened = withMeetingFilters(
      "/alpha/northgate/meetings/mtg_ng0132?period=last_28_days",
      FILLED,
    );
    const onTheReplay = parseMeetingFilters(searchOf(opened));
    /* The replay's way back, built from what its address carried. */
    const back = parseMeetingFilters(
      searchOf(withMeetingFilters("/alpha/northgate/meetings", onTheReplay)),
    );

    expect(back.agentId, "the agent").toBe(FILLED.agentId);
    expect(back.channel, "the channel").toBe(FILLED.channel);
    expect(back.outcome, "the recorded outcome").toBe(FILLED.outcome);
    expect(searchOf(opened).period, "the period the row already carried").toBe("last_28_days");
  });

  it("and a register nobody narrowed writes nothing", () => {
    /* Guards the guard: an address that always grew parameters would pass above. */
    expect(
      withMeetingFilters("/alpha/northgate/meetings", {
        agentId: null,
        channel: null,
        outcome: null,
      }),
    ).toBe("/alpha/northgate/meetings");
  });
});
