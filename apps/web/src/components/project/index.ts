/**
 * THE PROJECT OVERVIEW'S OWN PARTS.
 *
 * Everything here belongs to one screen. The shared layer is
 * `components/product/`: the figure, the provenance chips, the absences, the
 * table, the chart frame, the stacking plan. This is the composition above it —
 * the seven regions of the executive project surface, and the two shapes every
 * region on this screen is built from.
 *
 * The split is deliberate. A part that another surface would want — a figure
 * that renders five states, a table whose cells keep their column names —
 * belongs in the shared layer and this directory must not grow a second copy of
 * one. A part that only makes sense inside "what is happening in this project
 * right now" belongs here, where changing it cannot reach another screen.
 *
 *   Plane / Plate   the graphite region and the paper region, as siblings of
 *                   `.ox-body` so the seam's two numbers keep one left edge.
 *   Count / Ratio   readings from read models that return no `MetricValue`,
 *                   still carrying a denominator, a real zero and a floor.
 *   Building        the stacking plan and the stock position.
 *   Movement        what the period changed, unit by unit.
 *   DemandSignals   attention against supply, on every axis the Pulse cuts.
 *   SegmentDetail   what is interesting about one segment, not how much.
 *   StatedDemandRegister   what buyers asked for, including what is not built.
 *   SalesCoverage   the plan, the journey, and which feeds are reporting.
 */

export { Plane, Plate } from "./Section";
export { Count, Ratio, TrendMark, counted, shareText } from "./Reading";
export { Building } from "./Building";
export { Movement } from "./Movement";
export { DemandSignals } from "./DemandSignals";
export { SegmentDetail } from "./SegmentDetail";
export { StatedDemandRegister } from "./StatedDemandRegister";
export { SalesCoverage } from "./SalesCoverage";
