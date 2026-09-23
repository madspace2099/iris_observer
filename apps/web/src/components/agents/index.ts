/**
 * THE SALES AGENT SURFACES' OWN COMPOSITIONS.
 *
 * Three pieces, and every one of them exists for a reason that could not be
 * solved in `components/product` — the shared layer is deliberately general and
 * these are decisions about how a TEAM may be shown, which is a rule this
 * product holds more tightly than any other on its surfaces.
 *
 *   StageFunnel     the stylesheet's own funnel, fed `MetricValue`s so an
 *                   unmeasurable stage renders its absence rather than a zero.
 *   MeetingRegister one agent's meetings, with no buyer's name in it today —
 *                   P1-08b and `docs/22-visitor-name-display.md` hold the
 *                   reopened name and its open visibility question.
 *   ShareFigure     a raw share from a read model, guarded by the sample floor
 *   Missing         from the metric registry, and the absence treatment for the
 *   isDash          em dash the agent read models use for "no value".
 *   agentAnswer     the sentence one agent's screen and printed summary lead
 *                   with, so the two cannot say different things about them.
 *
 * Nothing here computes a metric, joins two read models, or orders people by an
 * outcome. `ShareFigure` formats, which every other component in the product is
 * forbidden to do, and the docblock on it says exactly which read-model gap
 * forces that and what would remove it.
 */

export { StageFunnel } from "./StageFunnel";
export { MeetingRegister } from "./MeetingRegister";
export { ShareFigure, Missing, isDash } from "./Rates";
export { agentAnswer } from "./answer";
