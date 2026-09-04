/**
 * SALES FLOW — the four pieces this surface owns.
 *
 * Everything else on the screen is composed from `@/components/product`, the
 * shared primitive layer, and from the hand-built charts in `@/showroom`. These
 * four exist only where the Sales Flow surface carries a rule that no other
 * screen has to hold:
 *
 *   FlowLadder      only a stage a system of record states may look verified.
 *   WindowFigures   a summary answering to its own window has to say so.
 *   OutcomeFigures  an outcome missing from the mix is an EMPTY, not a gap.
 *   AgentOutcomes   a ring per presenter is a roster, never a ranking.
 *
 * None of them formats a number, computes a rate or joins two read models. Two
 * quantities are derived across the four files and both are drawing rather than
 * measurement — a bar's width, and the count that left between two named stages
 * — and each is argued where it is written.
 */

export { FlowLadder, type LadderStage } from "./FlowLadder";
export { WindowFigures } from "./WindowFigures";
export { OutcomeFigure, OutcomeTally, sliceOf } from "./OutcomeFigures";
export { AgentOutcomes } from "./AgentOutcomes";
