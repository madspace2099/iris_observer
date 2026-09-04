import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { NotFoundError, type AskThread } from "@observer/readmodels";

import { requireSurface } from "@/lib/authz";
import { dynamicRoute } from "@/lib/href";
import { presetFrom, withPeriod } from "@/lib/period";
import { repository } from "@/lib/repository";
import { requireViewer } from "@/lib/session";
import { Evidence, Failure, PageHead, Synthetic } from "@/components/product";
import { AnswerSheet } from "@/components/ask/AnswerSheet";

export const metadata: Metadata = { title: "Answer" };

/**
 * ONE CONVERSATION, AT ITS OWN URL.
 *
 * An answer is evidence: measured facts, the period they cover, the sources
 * behind them and what they do not show. Evidence that can only be reached by
 * asking again is evidence nobody can put in front of a colleague, so each
 * conversation keeps an address and every turn inside it keeps everything it
 * rested on.
 *
 * ## WHY THIS IS A THREAD AND NOT A CHAT
 *
 * `reference-parity.test.ts` holds the answer sheet as the accepted anatomy and
 * bans a chat timeline in the showroom console until multi-turn work is
 * authorised. This is not that surface and not that mechanism. `AskThread` is a
 * read model with a fixed list of `AskTurn`s, each carrying a complete
 * `AskAnswer` — the same shape a single answer has, unchanged, because a second
 * answer type for stored threads would be the same contract twice and the two
 * would disagree the first time one of them gained a field.
 *
 * The consequence on screen is that this reads as a record rather than as a
 * conversation: the questions are set in the quiet rail treatment, the answers
 * are the subject, there are no bubbles, no avatars and no sides. A reader
 * scanning it should be able to find one figure and check it, which is what a
 * transcript makes hard and a register makes easy.
 *
 * ## THE SEAM RUNS THROUGH EVERY TURN
 *
 * ADR-0034 divides the two grounds by content: what we conclude on graphite,
 * what was measured on paper. A turn is both, so each one straddles the seam —
 * the sentence, its provenance and the next questions stay dark; the figures
 * the sentence rests on sit on a paper plate inside it. Over four turns that
 * produces a column of alternating grounds, and the alternation is the
 * information: every light band is something the showroom recorded.
 *
 * ## NOT FOUND IS NOT AN ERROR, AND NEITHER IS AN ERROR
 *
 * The repository raises `NotFoundError` for an address with nothing behind it
 * and something else entirely when a read fails. They are different situations
 * and they get different answers: a missing conversation is a 404, and a failed
 * read is stated on the page as a failure to load — never as a conversation
 * with nothing in it. `notFound()` throws a control-flow signal that a
 * `catch` would swallow, so it is called outside the `try` rather than inside
 * it.
 *
 * ## NOBODY HELD THIS CONVERSATION
 *
 * `AskThreadOrigin` has one member, `demonstration`, so there is no value a
 * component could compare against to present one of these as somebody's own
 * past question. The read model's own `demonstrationNotice` is rendered at the
 * top, in its words. The FIGURES inside are not a demonstration: each is
 * computed from this project's session slice at read time.
 */
export default async function AskThreadPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string; projectSlug: string; threadId: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const viewer = await requireViewer();
  const { tenantSlug, projectSlug, threadId } = await params;
  const root = `/${tenantSlug}/${projectSlug}`;
  /*
   * The surface key is the last path segment, brackets and all — the same
   * shape `/[tenantSlug]/[projectSlug]/ask/[threadId]` is declared under. It
   * collides with no other declared segment.
   */
  requireSurface(viewer, "[threadId]", root);

  const period = presetFrom((await searchParams).period);
  const { project } = await repository.resolveProject(viewer, tenantSlug, projectSlug);

  const askPath = `${root}/ask`;
  const historyPath = `${root}/ask/history`;

  let thread: AskThread | null = null;
  let unreadable = false;
  try {
    thread = await repository.getAskThread({ viewer, tenantSlug, projectSlug, period }, threadId);
  } catch (error) {
    if (error instanceof NotFoundError) thread = null;
    else unreadable = true;
  }

  if (unreadable) {
    return (
      <div className="ox-page">
        <PageHead
          kicker={`${project.name} · Ask IRIS`}
          title="Answer"
          crumbs={[
            { label: "Ask IRIS", href: askPath },
            { label: "Earlier questions", href: historyPath },
            { label: "This conversation" },
          ]}
          period={period}
        />
        <div className="ox-body">
          <div className="ox-plane">
            <Failure
              what="This conversation"
              retry={{ label: "Back to earlier questions", href: historyPath }}
              period={period}
            />
          </div>
        </div>
      </div>
    );
  }

  // Outside the `try`: `notFound()` throws a signal a `catch` would swallow.
  if (thread === null) notFound();

  const { summary, turns } = thread;
  const last = turns.length - 1;

  return (
    <div className="ox-page">
      <PageHead
        kicker={`${project.name} · Ask IRIS`}
        title={summary.title}
        crumbs={[
          { label: "Ask IRIS", href: askPath },
          { label: "Earlier questions", href: historyPath },
          { label: "This conversation" },
        ]}
        answer={
          <>
            Answered against {summary.projectLabel} over {summary.periodLabel.toLowerCase()}
            {summary.selectionLabel === null ? null : <>, narrowed to {summary.selectionLabel}</>},
            in {turns.length} {turns.length === 1 ? "turn" : "turns"}. Every figure below is a
            reading from that period.
          </>
        }
        lede={thread.demonstrationNotice}
        aside={
          <>
            <Synthetic />
            <span className="ox-n">Asked {summary.askedAtDisplay}</span>
            <Link
              className="ox-btn"
              data-weight="primary"
              href={dynamicRoute(withPeriod(askPath, period))}
            >
              Ask a new question
            </Link>
            <Link
              className="ox-btn"
              data-weight="quiet"
              href={dynamicRoute(withPeriod(historyPath, period))}
            >
              Earlier questions
            </Link>
          </>
        }
        period={period}
      />

      <div className="ox-body">
        <div className="ox-plane">
          <div className="ox-thread">
            {turns.map((turn, index) => (
              <AnswerSheet
                key={turn.id}
                answer={turn.answer}
                period={period}
                periodLabel={summary.periodLabel}
                askAction={askPath}
                selection={summary.selectionLabel}
                /*
                 * Null, and it has to be. Deciding whether a next question has
                 * a prepared answer would mean reading `getAskSession` as well
                 * as this thread — a second read model on one surface, which is
                 * the join ADR-0012 forbids a component to make. So every next
                 * question is offered as a question, and Ask IRIS answers it or
                 * says plainly that it has no prepared answer for it. Either
                 * way the reader lands somewhere real.
                 */
                answerable={null}
                when={turn.askedAtDisplay}
                showFollowUps={index === last}
              />
            ))}
          </div>
        </div>

        <div className="ox-plane">
          <div className="ox-section-head">
            <h2 className="ox-section-title">What this conversation rests on</h2>
            <Evidence evidence={thread.evidence} period={period} />
          </div>
          <p className="ox-section-note">
            The turns above were composed from {summary.projectLabel}&rsquo;s own records over{" "}
            {summary.periodLabel.toLowerCase()} — no part of any answer here was written by a model.
            Each turn keeps its own evidence reference as well, so a single figure can be checked
            without accepting the conversation around it.
          </p>
        </div>
      </div>
    </div>
  );
}
