import type { ViewContext } from "./context";
import type { AssistVerdict, DealConnector } from "./deal-source";

/**
 * IRIS-LED SALES (ADR-0049): which of a period's sales the showroom showed first.
 *
 * The owner's words, and a rule about ORDER. A sale is IRIS-led when the flat
 * was opened in an IRIS presentation before the date the CRM states for its
 * reservation or purchase, or before its availability changed to reserved or
 * sold. It says how many times, how long before and by whom. It never says the
 * showing produced the sale: the CRM's buyer is not linked to the visitor in
 * the room (ADR-0011), so the tier is `observed_sequence` (ADR-0010).
 *
 * Every word here is the read model's; the page prints it.
 */

/** One meeting that opened the flat before its status changed. */
export interface IrisLedShowing {
  readonly meetingId: string;
  readonly dateDisplay: string;
  readonly agentId: string;
  readonly agentName: string;
  /** Into the view's `agents`: the colour the timeline draws this presenter in. */
  readonly agentIndex: number;
  /** Ready to print: "12 days before", "9 hours before". */
  readonly beforeDisplay: string;
  /** Whether the meeting started inside the reader's period, or before it. */
  readonly inPeriod: boolean;
  readonly meetingHref: string;
  /** Where on the timeline, 0 at its left edge to 1 at the status change. */
  readonly position: number;
  /** The whole sentence, for a tooltip and an accessible name. */
  readonly label: string;
}

export interface IrisLedAgent {
  readonly id: string;
  readonly name: string;
  /** Null where the agent has no page in this period: they presented here only before it. */
  readonly href: string | null;
  readonly index: number;
}

export interface IrisLedSale {
  readonly id: string;
  readonly unitCode: string;
  readonly unitHref: string | null;
  /** A deal the CRM states, or a flat whose availability the catalogue saw change. */
  readonly source: "crm_deal" | "catalogue_availability";
  /** "Reservation", "Purchase", "Marked reserved", "Marked sold". */
  readonly changeLabel: string;
  readonly changeDisplay: string;
  /** ADR-0039 §5: the CRM's own instant, or the sync that first saw the change. */
  readonly dateBasis: "crm_stated" | "first_observed";
  /** Whose date it is, in words: "the CRM's date", "first seen by a sync". */
  readonly dateWhose: string;
  /** Every meeting that opened the flat before the change, oldest first. */
  readonly showings: readonly IrisLedShowing[];
  /** "3 · 2 in the period, 1 before it". */
  readonly showingsDisplay: string;
  /**
   * Meetings that opened the flat between the sync before a sync-dated change
   * and the sync that saw it: they may have come after the change, so they are
   * counted nowhere and the statement says so. Zero for a date the CRM states.
   */
  readonly unorderedShowings: number;
  readonly firstShownDisplay: string | null;
  readonly lastShownDisplay: string | null;
  /** Whole days from the last showing to the change; null when never shown. */
  readonly daysFromLastShowing: number | null;
  /** "4 days", "9 hours", "not shown". */
  readonly gapDisplay: string;
  /** Where the last showing sits on the timeline; null when never shown. */
  readonly lastPosition: number | null;
  readonly agents: readonly IrisLedAgent[];
  /** The ADR-0039 verdict, kept as one column. */
  readonly verdict: AssistVerdict;
  /** "Shown within 72 hours", "Shown earlier", "Not shown". */
  readonly verdictLabel: string;
  readonly statement: string;
}

/** A headline figure, its denominator beside it. */
export interface IrisLedFigure {
  readonly id: "led" | "window" | "showings" | "gap";
  readonly label: string;
  readonly value: string;
  readonly of: string;
}

/** Where the sales were read from, for the page's foot and for the CRM settings. */
export interface IrisLedSource {
  readonly connector: DealConnector | null;
  /** "the demonstration CRM", "REALPAD", "the catalogue from Monday". */
  readonly name: string;
  readonly readAtDisplay: string | null;
  /** What it reads, each a phrase: "deal stages and the date it states for each". */
  readonly reads: readonly string[];
  /** The whole sentence: where, when, what, and that showings are the project's whole history. */
  readonly note: string;
}

export interface IrisLedSalesView {
  readonly context: ViewContext;
  /** Null when no CRM and no delivered catalogue is connected: there is no sale to place. */
  readonly source: IrisLedSource | null;
  /** The sentence IRIS says, with its denominator. */
  readonly headline: string;
  /** The meetings the headline was read from: every showing counted before a sale. */
  readonly verdictMeetings: number;
  /** The rule, on screen. */
  readonly definition: string;
  /** Sequence, not cause; no buyer link; whose dates. Behind the info control. */
  readonly caveat: string;
  readonly figures: readonly IrisLedFigure[];
  /** Shown in IRIS before the change, newest change first. */
  readonly sales: readonly IrisLedSale[];
  /** What the table of `sales` lists, in a sentence. */
  readonly tableCaption: string;
  /** In the period and never shown before the change: listed, not dropped. */
  readonly neverShown: readonly IrisLedSale[];
  readonly neverShownNote: string;
  /** What could not be placed, and why. Null when everything could be. Printed beside the figures. */
  readonly unplacedNote: string | null;
  /**
   * Why Sales Flow's IRIS-assisted card, which links here, can count the same
   * 72-hour rule differently: it reads every dated deal, this page the
   * period's. Null where there is no card or nothing to count.
   */
  readonly frameNote: string | null;
  readonly agents: readonly IrisLedAgent[];
  readonly axis: {
    readonly ticks: readonly { readonly label: string; readonly position: number }[];
    /** Where the IRIS-assisted window begins, 0 to 1. */
    readonly windowStart: number;
    readonly caption: string;
  };
  readonly counts: {
    /** The denominator: sales in the period that name a flat and carry a date. */
    readonly sales: number;
    readonly shownBefore: number;
    readonly withinWindow: number;
    readonly shownEarlier: number;
    readonly notShown: number;
    readonly unplacedNoDate: number;
    readonly unplacedNoUnit: number;
    /** Flats the catalogue lists as reserved or sold with no date for the change. */
    readonly catalogueUndated: number;
    readonly minimumSales: number;
    readonly windowHours: number;
    readonly policyVersion: string;
  };
}
