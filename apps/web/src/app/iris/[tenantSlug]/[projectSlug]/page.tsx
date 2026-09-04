import { permanentRedirect } from "next/navigation";

import { dynamicRoute } from "@/lib/href";

/**
 * THE FLAGSHIP HAS LANDED, SO THIS ROUTE HANDS ITS READERS ON.
 *
 * This URL existed for one reason, recorded in ADR-0033 and in this file's
 * previous docblock: `docs/12-visual-autopsy.md` §5 sets the order for visual
 * work — audit, direction, isolated flagship prototype, visual review, user
 * selection, rollout — and this was the flagship. It rendered the approved
 * shell whole, at a real URL, against the real read model, and it disturbed
 * nothing, so the twelve existing surfaces kept working while the design was
 * judged.
 *
 * The design was accepted and the rollout has happened. Ask IRIS is now a
 * product surface at `/{tenant}/{project}/ask`, inside the application shell,
 * carrying the project switcher and the period switcher that the isolated
 * prototype could not answer for. Two URLs rendering the same screen is how a
 * reader ends up bookmarking the one that stops being maintained.
 *
 * ## Why a redirect rather than a deletion
 *
 * The route is real: it was reviewed at this address, it is in somebody's
 * notes, and `apps/web/test/reference-parity.test.ts` asserts the application
 * still serves every route it has declared. A redirect serves it. Deleting it
 * would turn every link written during the review into a 404, which is a worse
 * answer than an extra hop.
 *
 * `permanentRedirect` rather than `redirect`, because this is not a temporary
 * detour: the prototype is finished and the destination is where the surface
 * lives now.
 *
 * ## No viewer check here, deliberately
 *
 * The destination performs the whole of it — `requireViewer`, `requireSurface`,
 * and a project resolution where forbidden and missing render identically.
 * Repeating any of that here would mean two places could disagree about who may
 * see a project, and a redirect that refuses before it forwards would also leak
 * the one thing the identical rendering exists to hide: whether the project is
 * there at all.
 */
export default async function IrisFlagshipMoved({
  params,
}: {
  params: Promise<{ tenantSlug: string; projectSlug: string }>;
}) {
  const { tenantSlug, projectSlug } = await params;
  permanentRedirect(dynamicRoute(`/${tenantSlug}/${projectSlug}/ask`));
}
