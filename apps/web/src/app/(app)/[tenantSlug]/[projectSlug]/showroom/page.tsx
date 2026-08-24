import type { Metadata } from "next";
import Link from "next/link";
import type { PeriodPreset } from "@observer/readmodels";
import { repository } from "@/lib/repository";
import { requireViewer } from "@/lib/session";
import { presetFrom } from "@/lib/period";
import { dynamicRoute } from "@/lib/href";
import { Measure } from "@/showroom/Measure";
import { SourceChips } from "@/showroom/parts";

export const metadata: Metadata = { title: "Showroom" };

/**
 * The opening screen.
 *
 * Rebuilt after review, which found the previous one overloaded: a wall of prose
 * and figures where a verdict belonged.
 *
 * A developer with two minutes must be able to tell in ten seconds whether the
 * showroom meetings are going the right way, see the one thing worth acting on,
 * and then choose where to go. That is the whole page — a signal, a sentence,
 * three figures, and three doors. **Nothing analytical lives here.** Everything
 * that was on this screen moved behind the doors, where it has room to be
 * explained instead of stacked.
 */
const SIGNAL_LABEL = {
  good: "On course",
  attention: "Needs a look",
  poor: "Going the wrong way",
} as const;

export default async function ShowroomPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string; projectSlug: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const viewer = await requireViewer();
  const { tenantSlug, projectSlug } = await params;
  const { period } = await searchParams;

  const home = await repository.getHome({
    viewer,
    tenantSlug,
    projectSlug,
    period: presetFrom(period) as PeriodPreset,
  });

  return (
    <div className="iris-one">
      <section className="iris-home">
        <p className="iris-kicker">
          {home.context.tenant.name} · {home.context.project.name} · {home.context.period.label}
        </p>

        <div className="iris-signal" data-signal={home.signal}>
          <span className="iris-signal-mark" aria-hidden="true" />
          <span className="iris-signal-label">{SIGNAL_LABEL[home.signal]}</span>
        </div>

        <h1 className="iris-verdict">{home.verdict}</h1>
        <p className="iris-home-because">{home.because}</p>

        <dl className="iris-home-figures">
          {home.figures.map((f) => (
            <div key={f.id}>
              <dt>
                {f.measurementId === null ? f.label : <Measure id={f.measurementId} label={f.label} />}
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

        {home.alert === null ? null : (
          <Link className="iris-home-alert" href={dynamicRoute(home.alert.href)}>
            <span className="iris-code">Worth acting on</span>
            {home.alert.text}
          </Link>
        )}

        <SourceChips sources={home.sources} />
      </section>

      {/*
        * The three doors.
        *
        * Each carries the single most useful thing behind it, already computed —
        * so choosing is an informed decision rather than a guess at a label.
        */}
      <nav className="iris-doors" aria-label="Analytics views">
        {home.doors.map((door) => (
          <Link key={door.id} className="iris-door" href={dynamicRoute(door.href)}>
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
