/**
 * THE PAINT SERVERS THE STYLESHEET NAMES, DECLARED ONCE.
 *
 * `design-lab-d.css` paints the product's existing charts without touching
 * their markup, and several of the kit's treatments cannot be written as a CSS
 * colour: a gradient along a stroke, the dot-matrix area, the glow that follows
 * a mark's own shape rather than its box, the parallel lines' lift and the
 * bubble lens's spheres. SVG can reference a paint server anywhere in the
 * document, so they live in one hidden SVG at the top of the gallery, and
 * every rule reaches them with `url(#…)`. All of them are the product's too
 * since ADR-0041 and its amendment of 2026-10-20, so they are `ChartPaint` from
 * `@/showroom/forms`, the same the project shell draws.
 */

import { ChartPaint } from "@/showroom/forms";

export function DDefs() {
  return (
    <svg className="dld-defs" width="0" height="0" aria-hidden="true" focusable="false">
      <defs>
        <ChartPaint />
      </defs>
    </svg>
  );
}
