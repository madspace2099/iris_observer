import { ScreenRail, type Screen } from "@/components/screens/ScreenRail";

export { wheelTarget } from "@/components/screens/ScreenRail";
export type FlowScreen = Screen;

/**
 * WHERE YOU ARE ON SALES FLOW (the owner, 2026-10-22, ADR-0059).
 *
 * Sales Flow's screens and the rail beside them. The rail is the shared
 * `ScreenRail` (ADR-0061), which the Sales Agents pages use too; this keeps
 * Sales Flow's name for it, and `flow-screens.css` places it beside the
 * screens.
 */
export function FlowRail({ screens }: { readonly screens: readonly FlowScreen[] }) {
  return <ScreenRail screens={screens} label="Sales Flow screens" />;
}
