/**
 * THE PAINT SERVERS THE STYLESHEET NAMES, DECLARED ONCE.
 *
 * `design-lab-d.css` paints the product's existing charts without touching
 * their markup, and three of the kit's treatments cannot be written as a CSS
 * colour: a gradient along a stroke, the dot-matrix area, and the glow that
 * follows a mark's own shape rather than its box. SVG can reference a paint
 * server anywhere in the document, so they live here, in one hidden SVG at the
 * top of the gallery, and every rule reaches them with `url(#…)`.
 *
 * ## The glow
 *
 * The kit's glow is six stacked drop shadows in the mark's own colour, each
 * wider and further down than the last. `SourceGraphic` blurred is the mark's
 * own colour with no flood to set, so one filter serves every series. Three
 * layers stand for the six; beyond three the difference is not visible at
 * these sizes. The region is in user space, because a horizontal line has a
 * bounding box of no height, and a filter sized to that box draws nothing.
 *
 * ## The bubble lens's spheres
 *
 * The kit's sphere, as its export draws its Reservation sphere: a deep base, a
 * highlight up and to the right, a glow beneath and two inner shadows — the
 * colour's own light pooling low, and a white rim at the top. The lens paints
 * it in each agent's colour, and in grey for the key to its sizes. The filter's
 * numbers are the export's, for the radius the export drew; the lens places a
 * sphere with `<use>` and scales it to its bubble, so the whole sphere,
 * shadows and all, keeps its look at any size.
 */

/*
 * THE SPHERE, TINTED: ONE PER AGENT COLOUR, AND ONE GREY.
 *
 * The colour says who presented a meeting, so the sphere is the agent's. It is
 * the kit's recipe with the colour swapped: its Reservation sphere's own
 * proportions (node 657:18806) — the glow beneath, the colour's light
 * pooling low, the white rim at the top — scaled to the radius drawn here, the
 * base the colour darkened and the highlight the colour lightened. The grey
 * one keys a size that belongs to no agent.
 */
export const D_TINT_RADIUS = 32;
/** The radius the kit's export drew its Reservation sphere at; the filter's numbers below are for it. */
const KIT_RADIUS = 33.978;
const TINT_SCALE = D_TINT_RADIUS / KIT_RADIUS;
const TINTS: readonly { readonly id: string; readonly colour: string }[] = [
  ...[1, 2, 3, 4, 5, 6].map((i) => ({ id: `agent-${i}`, colour: `var(--d-series-${i})` })),
  { id: "neutral", colour: "#a4a4b4" },
];

function TintSphere({ id, colour }: { readonly id: string; readonly colour: string }) {
  const key = `dld-sphere-${id}`;
  const k = TINT_SCALE;
  return (
    <>
      <radialGradient id={`${key}-shine`} cx="0.704" cy="0.312" r="1.0281">
        <stop offset="0" style={{ stopColor: `color-mix(in oklab, ${colour} 62%, white)` }} />
        <stop
          offset="1"
          style={{ stopColor: `color-mix(in oklab, ${colour} 35%, black)`, stopOpacity: 0 }}
        />
      </radialGradient>
      <filter
        id={`${key}-fx`}
        x="-1.5"
        y="-1.5"
        width="4"
        height="4"
        colorInterpolationFilters="sRGB"
      >
        <feOffset in="SourceAlpha" dy={1.955 * k} />
        <feGaussianBlur stdDeviation={19.55 * k} result="spread" />
        <feFlood style={{ floodColor: colour, floodOpacity: 0.42 }} />
        <feComposite in2="spread" operator="in" result="glow" />
        <feMerge result="shape">
          <feMergeNode in="glow" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
        <feOffset in="SourceAlpha" dx={4.889 * k} dy={7.822 * k} />
        <feGaussianBlur stdDeviation={4.889 * k} />
        <feComposite in2="SourceAlpha" operator="arithmetic" k2="-1" k3="1" result="poolEdge" />
        <feFlood
          style={{ floodColor: `color-mix(in oklab, ${colour} 70%, white)`, floodOpacity: 0.5 }}
        />
        <feComposite in2="poolEdge" operator="in" result="pool" />
        <feMerge result="pooled">
          <feMergeNode in="shape" />
          <feMergeNode in="pool" />
        </feMerge>
        <feOffset in="SourceAlpha" dy={0.978 * k} />
        <feGaussianBlur stdDeviation={2.444 * k} />
        <feComposite in2="SourceAlpha" operator="arithmetic" k2="-1" k3="1" result="rimEdge" />
        <feFlood floodColor="#ffffff" floodOpacity="0.58" />
        <feComposite in2="rimEdge" operator="in" result="rim" />
        <feMerge>
          <feMergeNode in="pooled" />
          <feMergeNode in="rim" />
        </feMerge>
      </filter>
      <g id={key} filter={`url(#${key}-fx)`}>
        <circle r={D_TINT_RADIUS} style={{ fill: `color-mix(in oklab, ${colour} 55%, black)` }} />
        <circle r={D_TINT_RADIUS} fill={`url(#${key}-shine)`} />
      </g>
    </>
  );
}

export function DDefs() {
  return (
    <svg className="dld-defs" width="0" height="0" aria-hidden="true" focusable="false">
      <defs>
        {/* The kit's "Caribbean green": the lead series' stroke. */}
        <linearGradient id="dld-line" x1="0" y1="0" x2="1" y2="0.08">
          <stop offset="0" stopColor="#01f1e3" />
          <stop offset="1" stopColor="#5cf101" />
        </linearGradient>

        {TINTS.map((tint) => (
          <TintSphere key={tint.id} {...tint} />
        ))}

        {/* The area chart's dot matrix: a 1px dot on a 5px pitch. */}
        <pattern id="dld-dots" width="5" height="5" patternUnits="userSpaceOnUse">
          <rect width="1.2" height="1.2" fill="#15ffab" />
        </pattern>

        <filter
          id="dld-glow"
          filterUnits="userSpaceOnUse"
          x="-400"
          y="-400"
          width="1600"
          height="1600"
          colorInterpolationFilters="sRGB"
        >
          <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="near" />
          <feOffset in="near" dy="1.5" result="nearDown" />
          <feGaussianBlur in="SourceGraphic" stdDeviation="9" result="mid" />
          <feOffset in="mid" dy="7" result="midDown" />
          <feComponentTransfer in="midDown" result="midSoft">
            <feFuncA type="linear" slope="0.6" />
          </feComponentTransfer>
          <feGaussianBlur in="SourceGraphic" stdDeviation="22" result="far" />
          <feOffset in="far" dy="16" result="farDown" />
          <feComponentTransfer in="farDown" result="farSoft">
            <feFuncA type="linear" slope="0.4" />
          </feComponentTransfer>
          <feMerge>
            <feMergeNode in="farSoft" />
            <feMergeNode in="midSoft" />
            <feMergeNode in="nearDown" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* The parallel lines' own shadow: black, 2 down, 85%, as the kit sets every polyline. */}
        <filter
          id="dld-lift"
          filterUnits="userSpaceOnUse"
          x="-400"
          y="-400"
          width="1600"
          height="1600"
          colorInterpolationFilters="sRGB"
        >
          <feDropShadow dx="0" dy="2" stdDeviation="1" floodColor="#000000" floodOpacity="0.85" />
        </filter>
      </defs>
    </svg>
  );
}
