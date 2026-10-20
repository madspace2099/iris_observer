import { Suspense } from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";

import { requireSurface } from "@/lib/authz";
import { presetFrom } from "@/lib/period";
import { repository } from "@/lib/repository";
import { currentAccount, requireViewer } from "@/lib/session";
import { connectedProviders } from "@/lib/ai/admission";
import { companyKeyState, companyModelName } from "@/lib/credentials/company-keys";
import { demoModelName, environment, loopbackHost } from "@/lib/env";
import { modelsForProviders } from "@/lib/models/catalogue";
import { findAnswer } from "@/components/ask/questions";
import {
  AskConversationPanel,
  AskFrame,
  AskHistoryPanel,
  AskOpeningList,
  AskThinkingPanel,
  findAmbiguousComparison,
  parseAskScope,
  type AskScope,
  type AskScopeProject,
} from "@/components/ask-iris/AskScreen";
import { AskLiveAnswer } from "@/components/ask-iris/AskLiveAnswer";
import { LIVE_QUESTIONS, composerNotices } from "@/components/ask-iris/live-questions";
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
 * ## TWO ANSWER PATHS, AND THE SCREEN SAYS WHICH ONE ANSWERED
 *
 * `repository.getAskSession` returns a real `AskSession`: for each question it
 * prepares, an `AskAnswer` whose prose, figures, evidence reference, caveat and
 * next questions were all composed by the read models from this project's own
 * facts. A computed opening, asked as written, is answered from it at once and
 * deterministically — no model is called for it, and the note above it says so.
 *
 * Every other question in the current scope — a predefined live question, a
 * question typed into the composer or the dock — goes to `/api/ask/stream`
 * through `AskLiveAnswer` (the owner's decision for the recorded demonstration,
 * ADR-0040). That route runs the same gate as before and the same read-only
 * analysis tools; a language model words the result only where one is
 * connected, and the answer names the model only when it actually wrote the
 * words. With none connected, the answer is the read models' own prose and
 * says "Read models", which is what the deterministic path has always said.
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

  /*
   * WHETHER A LANGUAGE MODEL MAY WORD A QUESTION, SAID BEFORE IT IS ASKED.
   *
   * Gate 1 puts the notice at the prompt box, in view before the first
   * question. `composerNotices` names a demonstration key's model only where
   * the stream route would spend it, and says in one line when a company's key
   * is missing or cannot be spent here (ADR-0043).
   */
  const {
    model: demoModel,
    modelNotice,
    keyNote,
  } = composerNotices({
    aiEnabled: environment().ai.enabled,
    local: loopbackHost((await headers()).get("host")),
    companyModel: account === null ? null : companyModelName(account.accountId),
    demoModel: demoModelName(),
    connected: connected.length > 0,
    company: account === null ? null : companyKeyState(account),
  });

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
      composerLabel={demoModel ?? "Read models"}
      models={models}
      scope={scope}
      otherProjects={otherProjects}
      modelNotice={modelNotice}
      keyNote={keyNote}
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
            modelConnected={connected.length > 0}
            modelNotice={modelNotice}
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
  return (
    <AskOpeningList
      suggestions={session.suggestions}
      root={root}
      periodParam={periodParam}
      liveQuestions={LIVE_QUESTIONS}
    />
  );
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
  modelConnected,
  modelNotice,
}: Read & {
  readonly question: string;
  readonly viewerName: string;
  readonly root: string;
  readonly periodParam: string;
  readonly scope: AskScope;
  readonly otherProjects: readonly AskScopeProject[];
  readonly modelConnected: boolean;
  readonly modelNotice: string | null;
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

  /*
   * NO PREPARED ANSWER, IN THE CURRENT SCOPE: THE ANALYSIS PIPELINE ANSWERS.
   *
   * Not a guess at a prepared answer — the tools run against this project and
   * the answer carries its own figures, evidence and limits. A question that
   * names another project, or a scope with no read model behind it, still gets
   * the panel below, which says so rather than answering a narrower question.
   */
  if (
    answer === null &&
    scope.kind === "current" &&
    findAmbiguousComparison(question, scope, projectSlug, otherProjects) === null
  ) {
    return (
      <AskLiveAnswer
        key={question}
        question={question}
        context={{
          role: viewer.role,
          tenantSlug,
          projectSlug,
          projectLabel: session.context.projectLabel,
          period,
          unitCode: null,
          meetingId: null,
          agentId: null,
          agentName: null,
          segment: null,
        }}
        root={root}
        periodParam={periodParam}
        viewerName={viewerName}
        periodLabel={session.context.periodLabel}
        modelNotice={modelNotice}
        nextQuestions={LIVE_QUESTIONS}
      />
    );
  }

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
      modelConnected={modelConnected}
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
