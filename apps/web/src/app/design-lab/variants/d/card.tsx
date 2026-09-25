import type { ReactNode } from "react";

import type { DFacts, DRankRow } from "../../lab-data";
import { DrawIn, type DrawKind } from "./draw-in";

/**
 * ONE CARD, FOUR PARTS, IN THIS ORDER.
 *
 * The kit's Large card, which is the one that carries all four: a title, the
 * drawing, a pair of figures and a ranking of three rows. At a wide card the
 * same four parts take the kit's XL arrangement instead — the figures and the
 * ranking share a band under the drawing — but the order a screen reader meets
 * them in does not change, and neither does anything they say.
 *
 * Where a drawing has one thing to say, the card leads with it: one sentence
 * under the title, composed with the figures, describing and never explaining.
 *
 * Under every drawing, its definition; beside it, hidden from the eye, what a
 * screen reader is told instead of the drawing. Both are required, as they are
 * on `ChartFrame`, and for its reason: an optional definition is an absent one.
 *
 * Nothing on the card is computed here. The figures and the rows are
 * `DFacts`, composed in `lab-data.ts`; this file only lays them out.
 *
 * A delta keeps the product's own tone, and the tone is a verdict colour, so it
 * is drawn in `--verdict-*` and never given the kit's glow: the brief keeps glow
 * off the verdict colours, and a glowing "good" would claim more than a delta is.
 */
export function DCard({
  id,
  group,
  title,
  reads,
  facts,
  kind,
  wide = false,
  children,
}: {
  readonly id: string;
  readonly group: string;
  readonly title: string;
  readonly reads: string;
  readonly facts: DFacts;
  readonly kind: DrawKind;
  readonly wide?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <article className="dld-card" id={id} data-wide={wide ? "true" : undefined}>
      {/* The card is the size container; a container cannot restyle itself, so the grid is one level in. */}
      <div className="dld-card-inner">
        <header className="dld-card-head">
          <p className="dld-card-kicker">{group}</p>
          <h3 className="dld-card-title">{title}</h3>
          {facts.lead === undefined ? null : <p className="dld-card-lead">{facts.lead}</p>}
          <p className="dld-card-reads">{reads}</p>
        </header>

        <div className="dld-plot">
          <DrawIn kind={kind}>{children}</DrawIn>
          <p className="dld-card-note">{facts.note}</p>
          <p className="dld-sr">{facts.summary}</p>
        </div>

        <div className="dld-facts">
          <dl className="dld-figures">
            {facts.figures.map((figure) => (
              <div key={figure.label}>
                <dt>{figure.label}</dt>
                <dd className="dld-figure-value">
                  {figure.value}
                  {figure.delta === null ? null : (
                    <span className="dld-delta" data-tone={figure.tone ?? "flat"}>
                      {figure.delta}
                    </span>
                  )}
                </dd>
                {figure.of === null ? null : <dd className="dld-figure-of">{figure.of}</dd>}
              </div>
            ))}
          </dl>

          <Ranking title={facts.rankingTitle} rows={facts.ranking} note={facts.rankingNote} />
          {facts.alsoRanking === undefined ? null : (
            <Ranking
              title={facts.alsoRanking.title}
              rows={facts.alsoRanking.rows}
              note={facts.alsoRanking.note}
            />
          )}
        </div>
      </div>
    </article>
  );
}

function Ranking({
  title,
  rows,
  note,
}: {
  readonly title: string;
  readonly rows: readonly DRankRow[];
  readonly note: string | null;
}) {
  return (
    <section className="dld-rank" aria-label={title}>
      <p className="dld-rank-title">{title}</p>
      {rows.length === 0 ? null : (
        <ol>
          {rows.map((row) => (
            <li key={row.id}>
              <span>{row.label}</span>
              <b>{row.value}</b>
            </li>
          ))}
        </ol>
      )}
      {note === null ? null : <p className="dld-rank-note">{note}</p>}
    </section>
  );
}

/** Both geometries of a new form; the card's own width decides which is shown. */
export function Sized({ xl, l }: { readonly xl: ReactNode; readonly l: ReactNode }) {
  return (
    <>
      <div className="dld-size" data-size="xl">
        {xl}
      </div>
      <div className="dld-size" data-size="l">
        {l}
      </div>
    </>
  );
}
