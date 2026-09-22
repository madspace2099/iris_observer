/**
 * THE TWO UNIT SURFACES, AND WHAT THEY DO NOT SHARE WITH ANYBODY.
 *
 * `@/components/product` holds the shared layer every customer screen composes
 * from — the figure, the table, the finding, the absences. These four files
 * hold what is true of UNITS and of nothing else in the product: how a register
 * is narrowed and ordered, how a flat's availability is two different answers
 * to two different questions, how a single apartment's funnel refuses to look
 * verified when it is not, and how the register surfaces the one state it
 * exists to surface.
 *
 * Nothing here is a generalisation of a shared primitive and nothing here
 * duplicates one. Where the shared layer has a component, these call it; where
 * the design system has a class, these compose it. The rule that kept this
 * folder small is the same one that kept the primitive layer small: a file
 * exists because it carries a RULE, not because it wraps a class name.
 *
 *   register       the query string is the register's whole state.
 *   UnitRegister   twelve columns of measurement, on the paper ground.
 *   UnitStatus     availability, and the one place that still restates it.
 *   UnitFunnel     only a verified stage may look verified.
 *   DemandAttention  high interest and low conversion, from both ends.
 */

export { UnitRegister } from "./UnitRegister";
export { UnitFunnel } from "./UnitFunnel";
export { StatusChip, VerifiedOutcome } from "./UnitStatus";
export { DemandAttention } from "./DemandAttention";
export {
  REGISTER_PAGE,
  REGISTER_SCOPES,
  SCOPE_OPTIONS,
  STATUS_OPTIONS,
  UNIT_SORT_KEYS,
  filterRows,
  readRegisterQuery,
  registerHref,
  sortRows,
  sortStateFor,
  type RegisterQuery,
  type RegisterScope,
  type RegisterSearch,
  type SortDirection,
  type UnitSortKey,
} from "./register";
