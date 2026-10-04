import type { DeliveredDeals, SaleCycleInput } from "@observer/readmodels";
import type { ShowroomSession } from "@observer/contracts";

/**
 * EVERY SALE, AS THE SHARED CALCULATOR READS IT (R05-4, R07-4, Máté 2026-10-02).
 *
 * The cycle runs from a unit's first recorded showroom opening, anywhere in the
 * project's visible history, to the date the CRM says the deal entered the
 * Sold stage. This only gathers the two ends; `sale-cycle.ts` decides which
 * sales have a duration and which are excluded, and why.
 *
 * `within` limits the sales by their Sold date. A sale the CRM gives no date
 * has no place in a window, so it appears only when no window is asked for.
 */
/** The earliest moment the visible history covers; Infinity when it holds none. */
export const historyStart = (history: readonly ShowroomSession[]): number =>
  history.reduce((min, s) => Math.min(min, Date.parse(s.startedAt)), Infinity);

/**
 * P2-06's meeting count (R07-4): the meetings that opened the unit by its Sold
 * date, the bound the calculator and the assisted-sales rule use. One session
 * is one meeting. Null with no date.
 */
export function countMeetingsBeforeSale(
  history: readonly ShowroomSession[],
  unitCode: string,
  soldAt: string | null,
): number | null {
  const sold = soldAt === null ? NaN : Date.parse(soldAt);
  if (!Number.isFinite(sold)) return null;
  return history.filter(
    (s) => Date.parse(s.startedAt) <= sold && s.units.some((u) => u.unitCode === unitCode),
  ).length;
}

export function showroomSaleCycleInputs(
  deals: DeliveredDeals,
  history: readonly ShowroomSession[],
  within: { readonly from: number; readonly to: number } | null = null,
): readonly SaleCycleInput[] {
  const edge = historyStart(history);
  const firstOpened = new Map<string, number>();
  for (const session of history) {
    const at = Date.parse(session.startedAt);
    for (const unit of session.units) {
      const seen = firstOpened.get(unit.unitCode);
      if (seen === undefined || at < seen) firstOpened.set(unit.unitCode, at);
    }
  }
  return deals.deals
    .filter((deal) => deal.stage === "purchase" && deal.unitCode !== null)
    .filter((deal) => {
      if (within === null) return true;
      const sold = deal.stageEnteredAt === null ? NaN : Date.parse(deal.stageEnteredAt);
      return sold >= within.from && sold < within.to;
    })
    .map((deal) => {
      const unitCode = deal.unitCode ?? "";
      const first = firstOpened.get(unitCode);
      return {
        unitCode,
        firstOpenedAt: first === undefined ? null : new Date(first).toISOString(),
        openingClock: "showroom_observed",
        soldAt: deal.stageEnteredAt,
        soldClock: "crm_stated",
        openingAtDataEdge: first !== undefined && first === edge,
      } satisfies SaleCycleInput;
    });
}
