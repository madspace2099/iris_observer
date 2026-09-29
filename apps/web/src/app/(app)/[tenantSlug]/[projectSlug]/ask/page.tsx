import { Suspense } from "react";
import type { Metadata } from "next";

import { requireSurface } from "@/lib/authz";
import { presetFrom } from "@/lib/period";
import { repository } from "@/lib/repository";
import { currentAccount, requireViewer } from "@/lib/session";
import { connectedProviders } from "@/lib/ai/admission";
import { modelsForProviders } from "@/lib/models/catalogue";
import { findAnswer } from "@/components/ask/questions";
import {
  AskConversationPanel,
  AskFrame,
  AskHistoryPanel,
  AskOpeningList,
  AskThinkingPanel,
  parseAskScope,
  type AskScope,
  type AskScopeProject,
} from "@/components/ask-iris/AskScreen";
import {
  NotFoundError,
  NotPermittedError,
  type PeriodPreset,
  type Viewer,
  DEFAULT_LANGUAGE,
} from "@observer/readmodels";

export const metadata: Metadata = { title: "Ask IRIS" };

/**
 * ASK IRIS — the landing surface (ADR-0033), in the design the user delivered.
 *
 * The user built this screen in Claude Design, exported it as HTML and named
 * the export the visual source of truth for this route. The composition,
 * spacing, type scale, radii, borders and states below are transcribed from it;
 * `packages/ui/src/ask-iris.css` carries the measurements and
 * `apps/web/src/components/ask-iris/` carries the structure. ADR-0035 records
 * what was translated and what was deliberately not copied.
 *
 * ## THE ANSWER PATH IS DETERMINISTIC, AND THE SCREEN SAYS SO IN WORDS
 *
 * This is the most important thing about the surface and it is a decision
 * rather than a limitation.
 *
 * `repository.getAskSession` returns a real `AskSession`: for each question it
 * prepares, an `AskAnswer` whose prose, figures, evidence reference, caveat and
 * next questions were all composed by the read models from this project's own
 * facts. The same question over the same period returns the same figures, on
 * every machine, forever. **No model is called.** ADR-0030 makes a model
 * connection something an account brings and ADR-0033 records that no account
 * on this deployment holds one; `docs/PROJECT-STATE.md` records that the
 * configured key is refused with `401 invalid_api_key`. A prompt that looked
 * ready to be answered by a model would be this surface telling its first lie,
 * and its entire value is that it does not.
 *
 * The design draws a model picker, so the screen has one — and what it names is
 * what actually composed the answer. `useObserver` and `/api/ask/stream` exist
 * and are deliberately not wired here: they are the model path, they belong to
 * the intelligence milestone, and a surface that quietly used them would be
 * answering with something it cannot show the evidence for.
 *
 * ## WHY THE READ IS SUSPENDED RATHER THAN AWAITED
 *
 * The design has a thinking state, and a thinking state is only honest if it is
 * on screen for exactly as long as the work takes. Everything resolvable from
 * the URL and the project record is resolved here so the composer can render at
 * once; the session read hangs underneath it inside a `<Suspense>`, so
 * `AskThinkingPanel` is the fallback and it is visible for precisely the length
 * of the read. Awaiting the session up here would leave nothing to suspend on,
 * and the only way to show the design's thinking row would then be to fake one.
 */

/** The one place a search parameter becomes a value. */
function first(
  search: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const value = search[key];
  return Array.isArray(value) ? value[0] : value;
}

/** Every value a repeatable search parameter carries — Compare's `with`. */
function every(
  search: Record<string, string | string[] | undefined>,
  key: string,
): readonly string[] {
  const value = search[key];
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

export default async function AskPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string; projectSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await requireViewer();
  const { tenantSlug, projectSlug } = await params;
  const search = await searchParams;

  const root = `/${tenantSlug}/${projectSlug}`;
  // Declared in SURFACES, enforced here — a hidden link is not access control.
  requireSurface(viewer, "ask", root);

  const period = presetFrom(first(search, "period"));
  /*
   * The default period is omitted from every link this screen builds, so the
   * address of an answer read in the default span is the short one. `withPeriod`
   * makes the same choice for the navigation; the two agree deliberately.
   */
  const periodParam = period === "quarter_to_date" ? "" : period;

  const question = (first(search, "q") ?? "").trim();
  const historyOpen = first(search, "history") === "1";
  /*
   * `?demo=thinking` renders the composing state without a slow read behind it.
   * It exists because a state that is on screen for 40ms cannot be photographed
   * for a review, and a review that never sees a state is a review that cannot
   * reject it. It renders nothing a real read would not render.
   */
  const demo = first(search, "demo");

  /*
   * A refused or unknown project renders NOTHING here, on purpose.
   *
   * The layout has already resolved the same project and, when it refuses,
   * renders its own "not available" panel without this page inside it. Layouts
   * and pages render in parallel, so this page used to throw the same refusal a
   * second time — never seen by the reader, but logged by the server as an
   * unhandled error on every refused address, which is this route in
   * particular: `requireSurface` sends every refused reader here.
   */
  let tenant;
  let project;
  try {
    ({ tenant, project } = await repository.resolveProject(viewer, tenantSlug, projectSlug));
  } catch (error) {
    if (error instanceof NotPermittedError || error instanceof NotFoundError) return null;
    throw error;
  }

  /*
   * What actually composed the answer, named honestly.
   *
   * The design's picker says "Observer AI 4.8". Nothing of the sort ran: these
   * sentences were assembled by the read models. Naming a model that did not
   * write them would be the one lie this screen exists to avoid, so the control
   * keeps the design's shape and states what is true inside it.
   */
  const account = await currentAccount();
  const connected = account === null ? [] : await connectedProviders(account.accountId);
  const models = modelsForProviders(connected).map((entry) => entry.label);

  const scope = parseAskScope(first(search, "scope"), every(search, "with"));
  const otherProjects = await otherProjectsFor(viewer, tenant.id, project.id);

  return (
    <AskFrame
      root={root}
      periodParam={periodParam}
      projectSlug={project.slug}
      projectLabel={project.name}
      question={question}
      historyOpen={historyOpen}
      composerLabel="Read models"
      models={models}
      scope={scope}
      otherProjects={otherProjects}
    >
      {demo === "thinking" ? (
        <AskThinkingPanel
          question={question === "" ? "What were the main insights from this month?" : question}
          projectLabel={project.name}
          periodLabel=""
          viewerName={viewer.displayName}
        />
      ) : historyOpen ? (
        <Suspense fallback={<HistorySkeleton />}>
          <History
            viewer={viewer}
            tenantSlug={tenantSlug}
            projectSlug={projectSlug}
            period={period}
          />
        </Suspense>
      ) : question === "" ? (
        <Suspense fallback={<OpeningSkeleton />}>
          <Openings
            viewer={viewer}
            tenantSlug={tenantSlug}
            projectSlug={projectSlug}
            period={period}
            root={root}
            periodParam={periodParam}
          />
        </Suspense>
      ) : (
        <Suspense
          fallback={
            <AskThinkingPanel
              question={question}
              projectLabel={project.name}
              periodLabel=""
              viewerName={viewer.displayName}
            />
          }
        >
          <Answer
            viewer={viewer}
            tenantSlug={tenantSlug}
            projectSlug={projectSlug}
            period={period}
            question={question}
            viewerName={viewer.displayName}
            root={root}
            periodParam={periodParam}
            scope={scope}
            otherProjects={otherProjects}
          />
        </Suspense>
      )}
    </AskFrame>
  );
}

/* --- the suspended halves ------------------------------------------------- */

interface Read {
  readonly viewer: Viewer;
  readonly tenantSlug: string;
  readonly projectSlug: string;
  readonly period: PeriodPreset;
}

async function Openings({
  viewer,
  tenantSlug,
  projectSlug,
  period,
  root,
  periodParam,
}: Read & { readonly root: string; readonly periodParam: string }) {
  const session = await repository.getAskSession(
    { viewer, tenantSlug, projectSlug, period, language: DEFAULT_LANGUAGE },
    null,
  );
  return <AskOpeningList suggestions={session.suggestions} root={root} periodParam={periodParam} />;
}

async function Answer({
  viewer,
  tenantSlug,
  projectSlug,
  period,
  question,
  viewerName,
  root,
  periodParam,
  scope,
  otherProjects,
}: Read & {
  readonly question: string;
  readonly viewerName: string;
  readonly root: string;
  readonly periodParam: string;
  readonly scope: AskScope;
  readonly otherProjects: readonly AskScopeProject[];
}) {
  const session = await repository.getAskSession(
    { viewer, tenantSlug, projectSlug, period, language: DEFAULT_LANGUAGE },
    null,
  );

  /*
   * `findAnswer` is skipped entirely outside `current` scope — not called and
   * discarded, never called at all. `getAskSession` composes every answer
   * from ONE project's read models; asking it a question under "all
   * projects" or "compare" would be asking it something it was never built to
   * answer, and matching against `session.answers` anyway would either miss
   * or, worse, return a real single-project figure under a question that
   * asked for more than one project. `AskConversationPanel` states why,
   * instead.
   *
   * Matched exactly after normalisation, never fuzzily, when it does run. A
   * wrong guess here would put a real, correctly computed figure under a
   * question it does not answer — the one failure this product cannot
   * recover from — so anything unmatched is told so, with the list of
   * questions that do have an answer.
   */
  const answer = scope.kind === "current" ? (findAnswer(session.answers, question) ?? null) : null;

  return (
    <AskConversationPanel
      question={question}
      answer={answer}
      session={session}
      viewerName={viewerName}
      composerLabel="Read models"
      root={root}
      periodParam={periodParam}
      projectSlug={projectSlug}
      scope={scope}
      otherProjects={otherProjects}
    />
  );
}

/**
 * Every other project Compare could offer — the same developer's portfolio,
 * this project excluded.
 *
 * Scoped to ONE tenant deliberately, not every project this account holds.
 * `layout.tsx`'s own developer switcher already draws the line for the same
 * reason: an agency manager sells for two competing developers, and "two
 * developers are two businesses" — comparing across that boundary is not a
 * narrower version of the same feature, it is a different, riskier one this
 * pass does not attempt.
 */
async function otherProjectsFor(
  viewer: Viewer,
  tenantId: Parameters<typeof repository.listProjects>[1],
  excludeProjectId: string,
): Promise<readonly AskScopeProject[]> {
  const projects = await repository.listProjects(viewer, tenantId);
  return projects
    .filter((p) => p.id !== excludeProjectId)
    .map((p) => ({ slug: p.slug, name: p.name }));
}

async function History({ viewer, tenantSlug, projectSlug, period }: Read) {
  const history = await repository.getAskHistory({
    viewer,
    tenantSlug,
    projectSlug,
    period,
    language: DEFAULT_LANGUAGE,
  });
  return <AskHistoryPanel history={history} />;
}

/* --- what stands in while a panel is read -------------------------------- */

function OpeningSkeleton() {
  return (
    <ul className="ask-openings" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((row) => (
        <li key={row}>
          <span className="ask-opening" data-loading="true" />
        </li>
      ))}
    </ul>
  );
}

function HistorySkeleton() {
  return (
    <div className="ask-panel" data-kind="history" aria-busy="true">
      <p className="ask-panel-title">HISTORY</p>
      <div className="ask-scroll">
        <p className="ask-group">Reading earlier questions…</p>
      </div>
    </div>
  );
}
