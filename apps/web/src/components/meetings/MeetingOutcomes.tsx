import type { MeetingReplay, PeriodPreset } from "@observer/readmodels";

import { Sources, Unavailable } from "@/components/product";

/**
 * HOW THE MEETING ENDED — two facts, side by side, that may never become one.
 *
 * This block exists to keep a distinction that every sales dashboard eventually
 * loses, and losing it is the single most expensive thing this product could
 * do.
 *
 *   WHAT THE AGENT RECORDED  is a tap on the showroom's outcome widget in the
 *   last minute of the presentation. It is a real, useful, observed fact: it
 *   labels the meeting so that meetings can be set beside one another, and it
 *   is the only thing that separates "still open" from "decided against"
 *   (`MEETING_OUTCOMES`). It is not a transaction. An agent selecting
 *   "Purchase" has selected Purchase.
 *
 *   WHAT THE SYSTEM OF RECORD VERIFIES  is a deal stage, owned by the CRM, and
 *   it is the only thing that may be styled as verified. ADR-0021 states the
 *   rule from the other side: a deal stage is authoritative, an intent signal is
 *   a signal, and neither may be dressed as the other.
 *
 * A single "Outcome: Purchase" line collapses those, and once collapsed the
 * developer's forecast is built on what agents typed. So the two are rendered
 * as two blocks, each carrying its own provenance, and the second one is
 * present and stated even when — especially when — there is nothing in it.
 *
 * ## The second block is honestly empty, and stays on screen
 *
 * `MeetingReplay` carries `outcome` and `outcomeLabel` and no verified stage at
 * all. There is therefore nothing to draw, and two ways to handle that: omit
 * the block, or state the absence. Omitting it would leave the agent-recorded
 * outcome standing alone as though it were the answer, which is exactly the
 * collapse this file exists to prevent. So the absence is stated — once, for
 * the region, with the reason — and the missing field is reported as a gap in
 * the read model rather than filled by joining this screen to another one
 * (ADR-0012).
 *
 * There is no action beside it. A reader looking at a meeting cannot connect a
 * CRM from here, and a control that offered to would be a control that does
 * nothing.
 *
 * ## Why the provenance says CRM outcome on the agent's own tap
 *
 * `INSIGHT_SOURCE_LABELS` calls `CRM_OUTCOME_CONTEXT` "CRM outcome", and that
 * is the source the replay read model itself attaches to its outcome step. This
 * component repeats the read model's classification rather than substituting a
 * better-sounding one: the source axis says what KIND of fact this is —
 * outcome context, as opposed to something IRIS watched happen — and the words
 * beneath the chip say who entered it and what it does not mean. Two axes,
 * neither doing the other's work.
 */
export function MeetingOutcomes({
  replay,
  period,
  crmConnected,
}: {
  readonly replay: MeetingReplay;
  readonly period: PeriodPreset;
  /**
   * Whether this project has a CRM wired up at all.
   *
   * It changes the sentence and not the shape: with no CRM there is no system
   * of record to have verified anything, and with one there is a system of
   * record Observer does not yet read a per-meeting stage from. Those are
   * different absences and a reader deciding whether to go and look in the CRM
   * needs to know which one they have.
   */
  readonly crmConnected: boolean;
}) {
  return (
    /*
     * STACKED, NOT SIDE BY SIDE, AND ON THE SYSTEM'S OWN FINDINGS PLANE.
     *
     * Two columns was the first shape tried and it was wrong twice over. It
     * reads as two cards, which `docs/12-visual-autopsy.md` rejected outright;
     * and a bare `<section>` in a grid cell has no vertical rhythm in this
     * sheet at all — every paragraph class here resets its own margin, so the
     * lines would have touched.
     *
     * `.ox-findings` is one plane holding statements divided by hairlines, and
     * each of these IS a finding in the sheet's own sense: a stated thing, its
     * consequence, and what it rests on. Stacking them also puts them in
     * reading order, which is the order that matters — what the agent recorded,
     * and then what has confirmed it.
     */
    <div className="ox-findings">
      <article className="ox-finding">
        <p className="ox-subhead">What the agent recorded</p>

        {/*
         * The word at full size, and no chip beside it.
         *
         * A chip earns its place in the register, where forty outcomes are
         * scanned down a column and a shape reaches the reader before the word
         * does. Here there is exactly one outcome and nothing to scan against,
         * so the same state drawn twice — once large and once as a coloured
         * pill saying the same word — would be decoration.
         */}
        <p className="ox-finding-statement">{replay.outcomeLabel}</p>

        <p className="ox-finding-so-what">
          Selected on the showroom&rsquo;s outcome widget in the last minute of the presentation. It
          labels this meeting so that it can be set beside others, and it is what separates a
          meeting still in play from one the buyer decided against. A recorded outcome of
          Reservation or Purchase is what the agent entered — it is not a reservation and not a
          sale.
        </p>

        <div className="ox-finding-foot">
          <Sources sources={["CRM_OUTCOME_CONTEXT"]} />
        </div>
      </article>

      <article className="ox-finding">
        <p className="ox-subhead">What the system of record verifies</p>

        <Unavailable
          what="A verified outcome for this meeting"
          why={
            crmConnected
              ? "Observer does not yet read a deal stage against a single meeting, so nothing here has been confirmed outside the showroom"
              : "no CRM is connected to this project, so no meeting on it has an outcome outside the showroom"
          }
          action={null}
          period={period}
        />

        <p className="ox-finding-caveat">
          A deal stage held in the system of record is authoritative; what an agent recorded in the
          room is a signal. The two are kept apart on this screen so that neither is read as the
          other, and this half stays visible while it is empty for the same reason.
        </p>
      </article>
    </div>
  );
}
