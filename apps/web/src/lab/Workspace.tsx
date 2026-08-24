"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AskAnswer,
  AskSession,
  ProjectPulse,
  PulseSegment,
  PulseUnit,
} from "@observer/readmodels";
import type { ExecutiveOverview } from "@observer/readmodels";

/**
 * The laboratory workspace.
 *
 * One client component holding the selection state that both concepts share,
 * so the difference between them is composition and emphasis rather than two
 * separate implementations. Whichever is chosen, this is the interaction model
 * that gets promoted.
 *
 * The rule the design system sets and this enforces: **a selection changes the
 * narrative, the evidence, the figures, the actions and the Ask context.** A
 * Pulse that drives nothing has failed.
 */

type Variant = "narrative" | "spatial";

interface Props {
  readonly variant: Variant;
  readonly overview: ExecutiveOverview;
  readonly pulse: ProjectPulse;
  readonly ask: AskSession;
}

const PERIODS = [
  { id: "last_28_days", label: "28d" },
  { id: "quarter_to_date", label: "QTD" },
  { id: "last_quarter", label: "Q−1" },
  { id: "year_to_date", label: "YTD" },
] as const;

/* --- icons: monoline, semantic, from the IRIS Local Components set --------- */

function Icon({ name }: { name: "building" | "compass" | "spark" | "calendar" }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (name === "building") {
    return (
      <svg {...common}>
        <path d="M4 21V6l7-3v18M11 21h9V10l-9-3M7 9h1M7 13h1M7 17h1M15 12h1M15 16h1" />
      </svg>
    );
  }
  if (name === "compass") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8.5" />
        <path d="m15 9-2.2 4.8L8 16l2.2-4.8Z" />
      </svg>
    );
  }
  if (name === "calendar") {
    return (
      <svg {...common}>
        <rect x="3.5" y="5.5" width="17" height="15" rx="2" />
        <path d="M3.5 10h17M8 3.5v4M16 3.5v4" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9Z" />
      <path d="M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7Z" />
    </svg>
  );
}

/* --- helpers --------------------------------------------------------------- */

/*
 * Cell width tracks floor area, so a row reads as a stacking plan rather than
 * as a bar chart.
 *
 * Expressed as flex-grow rather than as pixels, so the building fills whatever
 * field it is given. A fixed-pixel plan drew a 400px model into a 1300px field
 * and left the spatial concept looking like an afterthought in its own layout.
 */
/**
 * Attention, as luminance.
 *
 * A square-root ramp, not a linear one. Attention is normalised against the
 * busiest unit, and in a real building most units sit in the bottom third of
 * that range — so a linear ramp collapses two thirds of the plan into three
 * indistinguishable shades and the signature stops signifying anything.
 *
 * The legend's gradient is drawn on the same curve, so the key and the map
 * agree: this changes how the number is *drawn*, never what it is. The raw
 * figure is on every cell's tooltip and in the detail panel.
 */
function luminanceFor(attention: number): string {
  return Math.sqrt(Math.max(0, Math.min(1, attention))).toFixed(3);
}

function growFor(unit: PulseUnit): number {
  return Math.round(26 + (unit.areaSqm - 55) * 0.9);
}

function tone(direction: "up" | "down", better: "up" | "down" | "neither") {
  if (better === "neither") return "flat";
  return direction === better ? "good" : "bad";
}

/* --- the Pulse -------------------------------------------------------------- */

function Pulse({
  pulse,
  size,
  selectedUnitId,
  matchedUnitIds,
  onSelectUnit,
}: {
  pulse: ProjectPulse;
  size: "compact" | "large";
  selectedUnitId: string | null;
  matchedUnitIds: ReadonlySet<string> | null;
  onSelectUnit: (unit: PulseUnit | null) => void;
}) {
  return (
    <div
      className="iris-pulse"
      data-size={size}
      data-dimmed={matchedUnitIds !== null || selectedUnitId !== null}
      role="group"
      aria-label={`${pulse.buildingLabel}: ${pulse.totals.units} units across ${pulse.floors.length} floors`}
    >
      {pulse.floors.map((floor) => (
        <div className="iris-pulse-floor" key={floor.floor}>
          <span className="iris-pulse-floor-label">{floor.label}</span>
          <div className="iris-pulse-row">
            {floor.units.map((unit) => (
              <button
                key={unit.unitId}
                className="iris-cell"
                type="button"
                style={
                  {
                    "--a": luminanceFor(unit.attention),
                    flex: `${growFor(unit)} 1 0`,
                    height: size === "large" ? undefined : "1.25rem",
                  } as React.CSSProperties
                }
                data-status={unit.status}
                data-change={unit.change ?? undefined}
                data-match={matchedUnitIds?.has(unit.unitId) ? "true" : undefined}
                aria-pressed={selectedUnitId === unit.unitId}
                onClick={() => onSelectUnit(selectedUnitId === unit.unitId ? null : unit)}
                title={`${unit.code} · ${unit.rooms} rooms · ${unit.areaSqm} m² · ${unit.orientation} · ${unit.status} · ${unit.meaningfulViews} meaningful views`}
              >
                <span className="iris-sr">
                  {unit.code}, {unit.status}, {unit.meaningfulViews} meaningful views
                </span>
              </button>
            ))}
          </div>
          <span className="iris-pulse-floor-meta">{floor.available} free</span>
        </div>
      ))}
    </div>
  );
}

function Legend({ pulse }: { pulse: ProjectPulse }) {
  return (
    <div className="iris-legend">
      <span>
        <i className="iris-ramp" /> attention · 0–{pulse.peakViews} views
      </span>
      <span>
        <i className="iris-swatch" style={{ background: "#0e1319" }} /> available
      </span>
      <span>
        <i className="iris-swatch" style={{ borderStyle: "dashed" }} /> reserved
      </span>
      <span>
        <i
          className="iris-swatch"
          style={{
            background:
              "repeating-linear-gradient(135deg,rgb(255 255 255/8%),rgb(255 255 255/8%) 2px,transparent 2px,transparent 5px)",
          }}
        />{" "}
        sold
      </span>
      <span>
        <i className="iris-swatch" style={{ borderTop: "2px solid #e8b339" }} /> changed this period
      </span>
    </div>
  );
}

/* --- Ask Observer ----------------------------------------------------------- */

function AskRail({
  ask,
  selectionLabel,
  onAnswer,
}: {
  ask: AskSession;
  selectionLabel: string | null;
  onAnswer: (answer: AskAnswer) => void;
}) {
  const [value, setValue] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const typing = document.activeElement?.tagName === "INPUT";
      if (
        (event.key === "k" && (event.metaKey || event.ctrlKey)) ||
        (event.key === "/" && !typing)
      ) {
        event.preventDefault();
        input.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const submit = useCallback(() => {
    const query = value.trim().toLowerCase();
    // Deterministic matching stands in for the model. The interface is the
    // one a model will later call; the figures never come from it.
    const hit =
      ask.answers.find((a) => a.question.toLowerCase() === query) ??
      ask.answers.find((a) =>
        query.length > 3 ? a.question.toLowerCase().includes(query) : false,
      ) ??
      ask.answers.find((a) =>
        query.split(/\s+/).some((w) => w.length > 4 && a.question.toLowerCase().includes(w)),
      );
    if (hit !== undefined) {
      onAnswer(hit);
      setValue("");
    }
  }, [ask.answers, onAnswer, value]);

  return (
    <div className="iris-rail">
      <span className="iris-rail-context">
        <Icon name="building" />
        <b>{ask.context.projectLabel}</b>
        <span>·</span>
        <b>{ask.context.periodLabel}</b>
        {selectionLabel === null ? null : (
          <>
            <span>·</span>
            <b style={{ color: "var(--accent)" }}>{selectionLabel}</b>
          </>
        )}
      </span>
      <span className="iris-rail-divider" />
      <label className="iris-ask">
        <Icon name="spark" />
        <span className="iris-sr">Ask Observer</span>
        <input
          ref={input}
          value={value}
          placeholder="Ask Observer…"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
        />
        <kbd>⌘K</kbd>
      </label>
      {ask.suggestions.slice(0, 1).map((s) => (
        <button
          key={s}
          className="iris-action"
          type="button"
          onClick={() => {
            const hit = ask.answers.find((a) => a.question === s);
            if (hit !== undefined) onAnswer(hit);
          }}
        >
          Why did demand fall?
        </button>
      ))}
    </div>
  );
}

function AnswerSheet({
  answer,
  ask,
  onClose,
  onAnswer,
}: {
  answer: AskAnswer;
  ask: AskSession;
  onClose: () => void;
  onAnswer: (a: AskAnswer) => void;
}) {
  return (
    <aside className="iris-sheet" role="dialog" aria-label="Ask Observer">
      <div className="iris-sheet-head">
        <p className="iris-kicker">Ask Observer</p>
        <button className="iris-sheet-close" type="button" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      <div className="iris-stack" style={{ marginTop: "1rem" }}>
        <p className="iris-meta">{answer.question}</p>
        <p className="iris-section" style={{ fontSize: "1.125rem", lineHeight: "1.6rem" }}>
          {answer.answer}
        </p>

        <dl className="iris-figures" style={{ gap: "1.5rem" }}>
          {answer.figures.map((f) => (
            <div key={f.label}>
              <dt>{f.label}</dt>
              <dd style={{ fontSize: "1.25rem", lineHeight: "1.5rem" }}>{f.value}</dd>
              {f.note === null ? null : <span className="iris-code">{f.note}</span>}
            </div>
          ))}
        </dl>

        {answer.evidence === null ? null : (
          <a className="iris-evidence" href={answer.evidence.href}>
            <i />
            {answer.evidence.observationCount} records · {answer.evidence.tier.replace(/_/g, " ")}
          </a>
        )}

        {answer.caveat === null ? null : (
          <p className="iris-meta" style={{ color: "var(--watch)" }}>
            {answer.caveat}
          </p>
        )}

        {answer.actionHref === null ? null : (
          <div className="iris-actions">
            <a className="iris-action" data-primary="true" href={answer.actionHref}>
              {answer.actionLabel}
            </a>
          </div>
        )}

        <hr className="iris-rule" />
        <p className="iris-kicker">Follow up</p>
        <div className="iris-suggestions">
          {answer.followUps.map((q) => (
            <button
              key={q}
              className="iris-suggestion"
              type="button"
              onClick={() => {
                const hit = ask.answers.find((a) => a.question === q);
                if (hit !== undefined) onAnswer(hit);
              }}
            >
              {q}
            </button>
          ))}
          {ask.answers
            .filter((a) => a.question !== answer.question)
            .slice(0, 3)
            .map((a) => (
              <button
                key={a.question}
                className="iris-suggestion"
                type="button"
                onClick={() => onAnswer(a)}
              >
                {a.question}
              </button>
            ))}
        </div>
      </div>
    </aside>
  );
}

/* --- the workspace ---------------------------------------------------------- */

export function Workspace({ variant, overview, pulse, ask }: Props) {
  const [unit, setUnit] = useState<PulseUnit | null>(null);
  const [segment, setSegment] = useState<PulseSegment | null>(null);
  const [period, setPeriod] = useState<string>("quarter_to_date");
  const [answer, setAnswer] = useState<AskAnswer | null>(null);

  const matched = useMemo(() => (segment === null ? null : new Set(segment.unitIds)), [segment]);

  const selectionLabel = unit?.code ?? segment?.label ?? null;

  /**
   * The narrative follows the selection.
   *
   * Every sentence below is assembled from figures already in the read models —
   * nothing is written for the picture.
   */
  const headline = useMemo(() => {
    if (unit !== null) {
      const status =
        unit.status === "available"
          ? "still available"
          : unit.status === "reserved"
            ? "reserved"
            : "sold";
      return {
        kicker: `${unit.code} · floor ${unit.floor} · ${unit.orientation}`,
        text: `${unit.code} is ${status} at ${unit.priceDisplay}, and ${unit.uniqueContacts} people have looked at it properly.`,
        lede: `${unit.rooms} rooms, ${unit.areaSqm} m², ${unit.meaningfulViews} meaningful views this period. Interest is ${unit.trend}.`,
      };
    }
    if (segment !== null) {
      const over = segment.attentionIndex >= 1;
      const conv = segment.conversionRatio;
      return {
        kicker: `${segment.label} · ${segment.unitIds.length} units`,
        text: `${segment.label} units draw ${segment.attentionIndex}× their share of attention${
          conv === null ? "." : ` and convert at ${conv}× the project average.`
        }`,
        lede:
          over && conv !== null && conv < 1
            ? `The interest is real; the price probably is not. ${segment.available} of them are still available.`
            : `${segment.available} of them are still available.`,
      };
    }
    return {
      kicker: `${overview.context.tenant.name} · ${overview.context.project.name} · ${overview.context.period.label}`,
      text: overview.verdict.headline,
      lede: overview.verdict.supporting,
    };
  }, [overview, segment, unit]);

  const completeness = Math.round((overview.dataHealth.completeness.raw ?? 0) * 20);

  const scrubber = (
    <div>
      <p className="iris-kicker" style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
        <Icon name="calendar" /> Period
      </p>
      <div className="iris-scrubber" role="group" aria-label="Period">
        {PERIODS.map((p) => (
          <button
            key={p.id}
            type="button"
            className="iris-tick"
            aria-pressed={period === p.id}
            onClick={() => setPeriod(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );

  const segmentChips = (
    <div className="iris-chips">
      {pulse.segments.map((s) => (
        <button
          key={s.id}
          type="button"
          className="iris-chip"
          aria-pressed={segment?.id === s.id}
          onClick={() => {
            setSegment(segment?.id === s.id ? null : s);
            setUnit(null);
          }}
        >
          {s.label} <b>{s.attentionIndex}×</b>
        </button>
      ))}
    </div>
  );

  const activeMode =
    selectionLabel === null ? null : (
      <span className="iris-mode">
        {unit === null ? "Segment" : "Unit"}: {selectionLabel}
        <button
          type="button"
          aria-label="Clear selection"
          onClick={() => {
            setUnit(null);
            setSegment(null);
          }}
        >
          ×
        </button>
      </span>
    );

  /*
   * The delta lives inside the <dd>, not beside it. A <dl> whose groups carry a
   * third element is not a definition list, and axe is right to say so.
   */
  const figures = (
    <dl className="iris-figures">
      {overview.headline.slice(0, 4).map((m) => (
        <div key={m.metricId}>
          <dt>{m.label}</dt>
          <dd>
            <b>{m.display ?? "—"}</b>
            {m.comparison === null ? (
              <span className="iris-code">{m.qualifier ?? m.message ?? ""}</span>
            ) : (
              <span
                className="iris-delta"
                data-tone={tone(
                  m.comparison.direction === "flat" ? "up" : m.comparison.direction,
                  m.comparison.better,
                )}
              >
                {m.comparison.deltaDisplay}
                {/* The qualifier gets its own line: run inline, a delta and a
                    sample note read as one garbled number. */}
                <span className="iris-code">{m.qualifier}</span>
              </span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );

  const claims = (
    <div className="iris-stack">
      {overview.briefing.statements.map((s, index) => (
        <div
          className="iris-claim"
          key={s.text}
          data-tier={s.tier}
          data-weight={index === 0 ? "lead" : undefined}
        >
          <div>
            <p className="iris-body">{s.text}</p>
            {s.evidence === null ? null : (
              <a className="iris-evidence" href={s.evidence.href} style={{ marginTop: ".5rem" }}>
                <i />
                {s.evidence.observationCount} records · {s.tier.replace(/_/g, " ")}
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );

  const actions = (
    <div className="iris-actions">
      {overview.actions.map((a) => (
        <a key={a.id} className="iris-action" data-primary={a.emphasis === "primary"} href={a.href}>
          {a.label}
        </a>
      ))}
    </div>
  );

  const readout =
    unit === null ? (
      <div className="iris-readout">
        <p className="iris-kicker">Inventory</p>
        <dl>
          <dt>Available</dt>
          <dd>
            {pulse.totals.available} of {pulse.totals.units}
          </dd>
          <dt>Reserved</dt>
          <dd>{pulse.totals.reserved}</dd>
          <dt>Sold</dt>
          <dd>
            {pulse.totals.sold} · {pulse.totals.soldInPeriod} this period
          </dd>
          <dt>Peak interest</dt>
          <dd>{pulse.peakViews} meaningful views</dd>
        </dl>
      </div>
    ) : (
      <div className="iris-readout">
        <p className="iris-kicker">
          <span className="iris-code" style={{ fontSize: ".75rem" }}>
            {unit.code}
          </span>
        </p>
        <dl>
          <dt>Type</dt>
          <dd>
            {unit.rooms} rooms · {unit.areaSqm} m²
          </dd>
          <dt>Aspect</dt>
          <dd>
            {unit.orientation} · floor {unit.floor}
          </dd>
          <dt>Price</dt>
          <dd>{unit.priceDisplay}</dd>
          <dt>Status</dt>
          <dd>{unit.status}</dd>
          <dt>Interest</dt>
          <dd>
            {unit.uniqueContacts} people · {unit.meaningfulViews} views · {unit.trend}
          </dd>
          <dt>Intent</dt>
          <dd>{unit.intent === null ? "not applicable" : unit.intent.replace(/_/g, " ")}</dd>
        </dl>
      </div>
    );

  const health = (
    <div className="iris-complete" data-low={(overview.dataHealth.completeness.raw ?? 0) < 0.8}>
      <span className="iris-kicker">Completeness</span>
      <span className="iris-complete-track" aria-hidden="true">
        {Array.from({ length: 20 }, (_, i) => (
          <i key={i} data-on={i < completeness} />
        ))}
      </span>
      <span className="iris-code">{overview.dataHealth.completeness.display}</span>
    </div>
  );

  return (
    // The open sheet is flagged on the shell so the command rail can step
    // aside; see .iris[data-sheet="open"] .iris-rail.
    <div className="iris" data-sheet={answer === null ? undefined : "open"}>
      <header className="iris-top">
        <div className="iris-brand">
          <b>IRIS</b>
          <span>Observer</span>
          <span className="iris-code" style={{ marginLeft: ".75rem" }}>
            lab · {variant}
          </span>
        </div>
        <nav className="iris-nav" style={{ border: 0, padding: 0 }} aria-label="Sections">
          <a href="#" aria-current="page">
            Overview
          </a>
          <a href="#">Sales Flow</a>
          <a href="#">Project</a>
          <a href="#">People</a>
        </nav>
        <div className="iris-ambient">
          <Icon name="compass" />
          <span className="iris-code">
            {pulse.totals.units} units · {pulse.floors.length} floors
          </span>
          {health}
        </div>
      </header>

      <main
        className="iris-stage"
        style={{
          gridTemplateColumns:
            variant === "narrative"
              ? "minmax(0, 1.35fr) minmax(23rem, 0.85fr)"
              : "minmax(0, 1.7fr) minmax(21rem, 0.75fr)",
        }}
      >
        {variant === "narrative" ? (
          <>
            <section className="iris-plane iris-stack">
              <p className="iris-kicker">{headline.kicker}</p>
              <h1 className="iris-verdict">{headline.text}</h1>
              <p className="iris-lede">{headline.lede}</p>
              {activeMode}
              <hr className="iris-rule" />
              {figures}
              <hr className="iris-rule" />
              {claims}
              {actions}
            </section>

            <section className="iris-plane iris-plane--raised iris-stack">
              {scrubber}
              <hr className="iris-rule" />
              <div>
                <p
                  className="iris-kicker"
                  style={{ display: "flex", gap: ".5rem", alignItems: "center" }}
                >
                  <Icon name="building" /> {pulse.buildingLabel}
                </p>
                <div style={{ marginTop: ".75rem" }}>
                  <Pulse
                    pulse={pulse}
                    size="compact"
                    selectedUnitId={unit?.unitId ?? null}
                    matchedUnitIds={matched}
                    onSelectUnit={(u) => {
                      setUnit(u);
                      setSegment(null);
                    }}
                  />
                </div>
              </div>
              <Legend pulse={pulse} />
              <hr className="iris-rule" />
              {segmentChips}
              <hr className="iris-rule" />
              {readout}
            </section>
          </>
        ) : (
          <>
            {/* The spatial variant's plane is a flex column so the building can
                claim whatever height the stage gives it. */}
            <section className="iris-plane iris-stack iris-plane--fill">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-end",
                  gap: "1.5rem",
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <p className="iris-kicker">{overview.context.project.name} · stacking plan</p>
                  <p className="iris-section" style={{ marginTop: ".35rem" }}>
                    {pulse.totals.available} available · {pulse.totals.reserved} reserved ·{" "}
                    {pulse.totals.sold} sold
                  </p>
                </div>
                <div style={{ minWidth: "16rem" }}>{scrubber}</div>
              </div>

              {segmentChips}

              <Pulse
                pulse={pulse}
                size="large"
                selectedUnitId={unit?.unitId ?? null}
                matchedUnitIds={matched}
                onSelectUnit={(u) => {
                  setUnit(u);
                  setSegment(null);
                }}
              />

              <Legend pulse={pulse} />
            </section>

            <section className="iris-plane iris-plane--raised iris-stack">
              <p className="iris-kicker">{headline.kicker}</p>
              <h1 className="iris-verdict" style={{ fontSize: "1.625rem", lineHeight: "2.125rem" }}>
                {headline.text}
              </h1>
              <p className="iris-lede" style={{ fontSize: ".9375rem", lineHeight: "1.4rem" }}>
                {headline.lede}
              </p>
              {activeMode}
              <hr className="iris-rule" />
              {readout}
              <hr className="iris-rule" />
              <div
                className="iris-claim"
                data-tier={overview.briefing.statements[0]?.tier}
                data-weight="lead"
              >
                <div>
                  <p className="iris-body">{overview.briefing.statements[0]?.text}</p>
                  {overview.briefing.statements[0]?.evidence == null ? null : (
                    <a
                      className="iris-evidence"
                      href={overview.briefing.statements[0].evidence.href}
                      style={{ marginTop: ".5rem" }}
                    >
                      <i />
                      {overview.briefing.statements[0].evidence.observationCount} records
                    </a>
                  )}
                </div>
              </div>
              {actions}
            </section>
          </>
        )}
      </main>

      <AskRail ask={ask} selectionLabel={selectionLabel} onAnswer={setAnswer} />

      {answer === null ? null : (
        <AnswerSheet
          answer={answer}
          ask={ask}
          onClose={() => setAnswer(null)}
          onAnswer={setAnswer}
        />
      )}
    </div>
  );
}
