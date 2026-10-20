import { NotFoundError, NotPermittedError } from "@observer/readmodels";

import { csvFilename, toCsv } from "@/components/report/csv";
import { reportFigures } from "@/components/report/figures";
import { omittedFrom } from "@/components/report/omit";
import { requireSurface } from "@/lib/authz";
import { reportLanguage } from "@/lib/language";
import { presetFrom } from "@/lib/period";
import { repository } from "@/lib/repository";
import { requireViewer } from "@/lib/session";

/**
 * THE REPORT'S FIGURES AS A CSV DOWNLOAD (ADR-0045).
 *
 * The export dialog's "Figures as CSV". It takes the report page's own
 * address — `?meeting=` or `?agent=`, `period`, `lang`, `omit` — and answers
 * every refusal the page answers, in the same order:
 *
 *   - no session: `requireViewer` sends the reader to sign in;
 *   - a project the viewer does not hold, or that does not exist: refused
 *     identically, with the project layout's own sentence, because telling
 *     the two apart is itself a disclosure. A route handler is not wrapped by
 *     the layout, so the check the layout makes is made here;
 *   - a role the report surface, the meeting surface or the agent surface
 *     does not admit: `requireSurface`, the same call with the same key the
 *     page makes, so the redirect is the page's;
 *   - a meeting or an agent this project does not have in the period, or a
 *     grant the repository refuses: not found, as the page's `notFound()`.
 *
 * It then writes the rows `figures.ts` flattens from the read models the page
 * reads. Nothing here computes a figure.
 */

export const dynamic = "force-dynamic";

/** The project layout's refusal, word for word. */
const PROJECT_REFUSAL = "This project is not available to your account.";
const REPORT_REFUSAL = "This report is not available.";

function refused(message: string): Response {
  return new Response(message, {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" },
  });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ tenantSlug: string; projectSlug: string }> },
): Promise<Response> {
  const viewer = await requireViewer();
  const { tenantSlug, projectSlug } = await context.params;
  const root = `/${tenantSlug}/${projectSlug}`;

  try {
    await repository.resolveProject(viewer, tenantSlug, projectSlug);
  } catch (error) {
    if (error instanceof NotPermittedError || error instanceof NotFoundError) {
      return refused(PROJECT_REFUSAL);
    }
    throw error;
  }

  const search = new URL(request.url).searchParams;
  const given = (name: string): string | null => {
    const value = search.get(name);
    return value !== null && value.length > 0 ? value : null;
  };
  const meetingId = given("meeting");
  const agentId = given("agent");

  requireSurface(viewer, "report", root);
  if (meetingId !== null) requireSurface(viewer, "[meetingId]", root);
  else if (agentId !== null) requireSurface(viewer, "[agentId]", root);

  const period = presetFrom(given("period") ?? undefined);
  const language = reportLanguage({ meeting: meetingId, agent: agentId, lang: given("lang") });

  let figures;
  try {
    figures = await reportFigures(
      repository,
      { viewer, tenantSlug, projectSlug, period, language },
      meetingId !== null ? { meetingId } : agentId !== null ? { agentId } : null,
      omittedFrom(given("omit") ?? undefined),
    );
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof NotPermittedError) {
      return refused(REPORT_REFUSAL);
    }
    throw error;
  }

  const filename = csvFilename([projectSlug, figures.subject, period, language]);
  return new Response(toCsv(language, figures.period, figures.report.scope.label, figures.rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
