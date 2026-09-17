import type { ConnectorKind, CrmDeal, DealStage } from "@observer/contracts";
import type { ProjectSummary } from "./context";

/**
 * Where a project's deals may come from when a CRM is connected.
 *
 * The same seam as `CatalogueSource`, asked before every view. A `null`
 * answer means no connector has delivered deals for this project, and the
 * ladder says the CRM is not connected rather than drawing rungs at zero.
 * Anything else is the CRM's current statement about its deals, in the
 * canonical stages the tenant's mapping produced (ADR-0021: the ladder is
 * the CRM's, authoritative; ADR-0036 decision 4: the words are mapped by a
 * person, never guessed).
 */
/**
 * Who delivered the deals. A connector, or the synthetic world standing in
 * for one on a demonstration project whose scenario declares a CRM — named
 * as such, so the ladder's note says "the demonstration CRM" and never a
 * vendor it did not read.
 */
export type DealConnector = ConnectorKind | "synthetic";

export interface DeliveredDeals {
  readonly connector: DealConnector;
  readonly deals: readonly CrmDeal[];
  /** When the connector last pulled them. */
  readonly fetchedAt: string;
}

export interface DealSource {
  dealsFor(project: ProjectSummary): Promise<DeliveredDeals | null>;
}

/**
 * One rung of the deal ladder, in the shape the Sales Flow surface draws.
 *
 * `count` is the deals whose current stage is this one or further along,
 * by the CRM's own word: a deal at Offer has been at least as far as
 * Meeting. That is survival read from a snapshot, not a history of moves,
 * and the note beside the ladder says so.
 */
export interface DealLadderStage {
  readonly id: DealStage;
  readonly label: string;
  readonly count: number;
  /** True: a system of record states this stage. Always true here; the CRM said it. */
  readonly verified: boolean;
  /** This rung against the first, already formatted. */
  readonly rate: string | null;
  readonly comparisonRate: string | null;
  /**
   * Time in stage: the median days the deals standing exactly on this rung
   * have been on it, from the stage date the CRM stated to the fetch. Null
   * where no deal on the rung carries a stage date, or none stands on it.
   */
  readonly medianDaysInStage: number | null;
  /** Ready to print: "34 days", or the words for why there is no figure. */
  readonly daysDisplay: string;
}

/**
 * One open deal, by how long it has stood where it is.
 *
 * The stalled list is the CRM's deals sorted by time stuck, drillable to the
 * unit each one is about (the meetings behind a deal are the CRM's to link,
 * and it does not). A won or lost deal is settled and never stalled; a deal
 * with no stage date cannot be placed and is counted beside the list.
 */
export interface StalledDeal {
  readonly externalId: string;
  readonly stage: DealStage;
  readonly stageLabel: string;
  readonly unitCode: string | null;
  readonly daysInStage: number;
  readonly daysDisplay: string;
  readonly enteredDisplay: string;
  readonly unitHref: string | null;
}

export type DealLadder =
  | {
      readonly source: "crm";
      readonly connector: DealConnector;
      readonly stages: readonly DealLadderStage[];
      /** Deals the CRM lists whose stage word is not mapped yet; not on any rung. */
      readonly unmapped: number;
      /** Deals the CRM marks lost; terminal, and not a rung. */
      readonly lost: number;
      readonly total: number;
      readonly fetchedAt: string;
      readonly note: string;
      /** Open deals by time stuck, longest first. Empty is a result: nothing is stuck. */
      readonly stalled: readonly StalledDeal[];
      /** Open deals with no stage date, which the list cannot place. */
      readonly undated: number;
      readonly stalledNote: string;
    }
  | {
      readonly source: "not_connected";
      readonly note: string;
    };

/* --- IRIS-assisted sales ----------------------------------------------------- */

/**
 * Whether a sale followed a showing, by a rule and never by a reading of motive.
 *
 *   - `shown_in_window`: a meeting that opened the unit started no more than the
 *     policy's window before the date the CRM states for the sale. This is an
 *     IRIS-assisted sale.
 *   - `shown_earlier`: one did, longer ago than the window. Not counted, and
 *     the lag is stated so the reader can judge the window against the project.
 *   - `not_shown`: no meeting opened the unit before that date.
 *
 * An observed sequence (ADR-0010, ADR-0039). The buyer of a deal is not linked
 * to the visitor in the room (ADR-0011), so nothing here says the buyer saw it.
 */
export const ASSIST_VERDICTS = ["shown_in_window", "shown_earlier", "not_shown"] as const;
export type AssistVerdict = (typeof ASSIST_VERDICTS)[number];

export interface AssistedSale {
  readonly externalId: string;
  readonly unitCode: string;
  readonly unitHref: string | null;
  readonly stage: DealStage;
  readonly stageLabel: string;
  readonly stageDateDisplay: string;
  readonly verdict: AssistVerdict;
  /** The verdict in a few words, for a list row: "IRIS-assisted sale", "Shown earlier", "Not shown in IRIS". */
  readonly verdictLabel: string;
  /** Hours from the start of the last meeting that opened the unit to the stage date. Null when none did. */
  readonly lagHours: number | null;
  /** Ready to print: "2 days before", "9 hours before", "not shown in IRIS". */
  readonly lagDisplay: string;
  /** The same lag for a narrow column: "2 days", "9 hours", "never". */
  readonly lagShort: string;
  /**
   * How much of the window was still left when the unit was shown, 0 to 1: a
   * showing an hour before the sale is near 1, one on the edge of the window is
   * 0, and so is any sale outside it. The length of the row's bar.
   */
  readonly windowShare: number;
  /** The last showing before the stage date, for the drill. */
  readonly meetingHref: string | null;
  /** The whole sentence about this sale. */
  readonly statement: string;
}

export type AssistedSales =
  | {
      readonly source: "crm";
      readonly windowHours: number;
      readonly policyVersion: string;
      /** The denominator: deals at reservation or purchase that name a unit and carry a stage date. */
      readonly datedSales: number;
      readonly assisted: number;
      readonly shownEarlier: number;
      readonly notShown: number;
      /** Sales the rule cannot place, for want of a stage date or a unit. Counted beside, never inside. */
      readonly unplaced: number;
      readonly minimumSales: number;
      /** Formatted. Null below the minimum, where a share would be a verdict on too little. */
      readonly shareDisplay: string | null;
      readonly headline: string;
      readonly note: string;
      /** Soonest after a showing first, never-shown last. At most twelve; the counts above cover all. */
      readonly sales: readonly AssistedSale[];
    }
  | {
      readonly source: "not_connected";
      readonly note: string;
    };
