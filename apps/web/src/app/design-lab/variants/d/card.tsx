import type { ReactNode } from "react";

import type { DFacts } from "../../lab-data";
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

          <section className="dld-rank" aria-label={facts.rankingTitle}>
            <p className="dld-rank-title">{facts.rankingTitle}</p>
            {facts.ranking.length === 0 ? null : (
              <ol>
                {facts.ranking.map((row) => (
                  <li key={row.id}>
                    <span>{row.label}</span>
                    <b>{row.value}</b>
                  </li>
                ))}
              </ol>
            )}
            {facts.rankingNote === null ? null : (
              <p className="dld-rank-note">{facts.rankingNote}</p>
            )}
          </section>
        </div>
      </div>
    </article>
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
