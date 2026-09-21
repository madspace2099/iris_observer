/**
 * THE FEATURES SURFACE, IN PARTS.
 *
 * Everything here is specific to one screen — Project > Features — and nothing
 * here is a second design system. The shared layer is
 * `@/components/product`; these are the compositions of it that carry the
 * decisions this particular subject forces, and each one exists for a reason
 * the page would otherwise have to remember:
 *
 *   vocabulary     which zeros are readings and which are the shape of the
 *                  arithmetic, decided once for every cell on the screen.
 *   order          the cuts and the ordering, both of which live in the URL.
 *   Reading        a measured figure at register weight, and the four words a
 *                  cell may say when there is no figure.
 *   FeatureRegister  reached is not presented, laid out so the two cannot be
 *                  collapsed by accident.
 *   RunningOrder   where each feature falls in a presentation, with the
 *                  never-opened ones kept out of the front of the run.
 *   Pairings       co-occurrence, at the strength co-occurrence supports.
 *   Environment    the one feature that changes the building rather than the
 *                  screen, counted in changes and stated as such.
 *   Limits         what the instrument cannot see, written down where a reader
 *                  who has just read the register will look for it.
 *
 * All of them are Server Components. Nothing on this screen needs a browser: a
 * cut is a link, an ordering is a link, and the register is a table.
 */

export {
  kindLabel,
  stayOf,
  stayDisplay,
  shareDisplay,
  liftDisplay,
  glanceIsMeasured,
  returnIsMeasured,
  STAY_UNAVAILABLE_REASONS,
  type StayAbsence,
} from "./vocabulary";
export {
  FEATURE_CUTS,
  REGISTER_ORDERS,
  applyCut,
  cutFrom,
  directionFrom,
  orderFrom,
  orderSections,
  type FeatureCut,
  type OrderDirection,
  type RegisterOrder,
} from "./order";
export { Absent, Count, KeyCount, Rate, Stay } from "./Reading";
export { FeatureRegister, type RegisterSort } from "./FeatureRegister";
export { RunningOrder } from "./RunningOrder";
export { Pairings } from "./Pairings";
export { Environment } from "./Environment";
export { Limits } from "./Limits";
