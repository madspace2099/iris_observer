import type { Metadata } from "next";
import Link from "next/link";
import type { PeriodPreset } from "@observer/readmodels";
import { repository } from "@/lib/repository";
import { requireViewer } from "@/lib/session";
import { requireSurface } from "@/lib/authz";
import { presetFrom, withPeriod } from "@/lib/period";
import { dynamicRoute } from "@/lib/href";
import { Measure } from "@/showroom/Measure";
import { ObserverConsole } from "@/showroom/observer/ObserverConsole";
import { greetingFor } from "@/showroom/observer/suggestions";

export const metadata: Metadata = { title: "Briefing" };

/**
 * The briefing.
 *
 * Observer opens the product: its presence, what it found, and the way to ask
 * it something — all above the fold and all at the weight of the figures rather
 * than beneath them. A prompt in a footer teaches the reader that asking is a
 * secondary activity, and the argument of this product is that it is the
 * primary one.
 *
 * Beneath it, the same three figures and three doors as before. They are the
 * evidence for the sentence Observer just said, so they follow it rather than
 * competing with it.
 */
const SIGNAL_LABEL = {
  good: "On course",
  attention: "Needs a look",
  poor: "Going the wrong way",
} as const;

export default async function BriefingPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string; projectSlug: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const viewer = await requireViewer();
  const { tenantSlug, projectSlug } = await params;
  // Declared in SURFACES, enforced here — a hidden link is not access control.
  requireSurface(viewer, "showroom", `/${tenantSlug}/${projectSlug}`);
  const { period } = await searchParams;

  const home = await repository.getHome({
    viewer,
    tenantSlug,
    projectSlug,
    period: presetFrom(period) as PeriodPreset,
  });

  /*
   * The greeting is resolved here, not in the browser.
   *
   * A greeting derived from the clock during hydration is two different renders
   * of the same page, which React reports as an error and the reader sees as a
   * flicker.
   */
  const greeting = greetingFor(new Date().getHours(), viewer.displayName);

  /*
   * Observer speaks, but never writes the figures.
   *
   * The verdict and the alert are the read models' sentences, unchanged.
   * Observer supplies only the frame around them — what it looked at, and
   * whether it found something. It never claims to feel anything about what it
   * found, and where there is nothing worth acting on it says that instead of
   * manufacturing urgency.
   */
  const reviewed = `I reviewed ${home.meetingCount} showroom ${
    home.meetingCount === 1 ? "presentation" : "presentations"
  } ${home.context.period.label.toLowerCase()}.`;
  const briefing =
    home.alert === null ? `${reviewed} ${home.verdict}` : `${reviewed} ${home.alert.text}`;

  return (
    <div className="iris-one obs-page">
      <ObserverConsole
        context={{
          tenantSlug,
          projectSlug,
          projectLabel: home.context.project.name,
          role: viewer.role,
          period: presetFrom(period),
          unitCode: null,
          meetingId: null,
          agentId: null,
          agentName: null,
          segment: null,
        }}
        greeting={greeting}
        briefing={briefing}
        hasObservation={home.alert !== null}
      />

      <section className="obs-basis">
        <div className="obs-basis-head">
          <p className="iris-kicker">Behind that</p>
          <div className="iris-signal" data-signal={home.signal}>
            <span className="iris-signal-mark" aria-hidden="true" />
            <span className="iris-signal-label">{SIGNAL_LABEL[home.signal]}</span>
          </div>
        </div>

        <p className="obs-basis-because">{home.because}</p>

        <dl className="iris-home-figures">
          {home.figures.map((f) => (
            <div key={f.id}>
              <dt>
                {f.measurementId === null ? (
                  f.label
                ) : (
                  <Measure id={f.measurementId} label={f.label} />
                )}
              </dt>
              <dd>
                <b>{f.value}</b>
                <span
                  className="iris-code"
                  data-tone={
                    f.better === "neither" || f.direction === "flat"
                      ? undefined
                      : f.direction === f.better
                        ? "good"
                        : "bad"
                  }
                >
                  {f.against}
                </span>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/*
       * Where to go next.
       *
       * Each carries the single most useful thing behind it, already computed,
       * so choosing is an informed decision rather than a guess at a label.
       */}
      <nav className="iris-doors" aria-label="Views">
        {home.doors.map((door) => (
          // The doors carry the period too: a briefing read for the last 28
          // days must open a view of the last 28 days.
          <Link key={door.id} className="iris-door" href={dynamicRoute(withPeriod(door.href, presetFrom(period)))}>
            <span className="iris-door-label">{door.label}</span>
            <span className="iris-door-question">{door.question}</span>
            <span className="iris-door-headline">{door.headline}</span>
            <span className="iris-door-go" aria-hidden="true">
              →
            </span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
