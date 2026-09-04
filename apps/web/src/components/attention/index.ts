/**
 * THE ATTENTION SURFACE'S OWN TWO PIECES.
 *
 * Both exist because `AttentionView` is richer than the shapes the shared
 * product layer renders, and neither belongs in that layer: they are specific
 * to one screen and would be an abstraction over one call site if they were
 * promoted.
 *
 *   StateList       an `AttentionState` is an `AlertItem` plus its subjects,
 *                   its two provenance axes, its sample and — the rule this
 *                   screen is most likely to break — whether it carries enough
 *                   observations to be ranked at all.
 *   ChecksRegister  every question asked of the period, including the ones that
 *                   came back clean and the ones that could not be asked. This
 *                   is what lets a quiet screen be told apart from an unmeasured
 *                   one.
 *
 * The empty case belongs to neither. A screen with nothing raised renders the
 * product layer's `AttentionList` with an empty array, so that "nothing needs
 * attention" is drawn as the result the design system reserves for it and is
 * drawn identically wherever it appears.
 */

export { StateList } from "./StateList";
export { ChecksRegister } from "./ChecksRegister";
