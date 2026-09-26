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
 * ## The bubble chart's spheres
 *
 * One per outcome, as the kit's own export draws it: a deep base, a highlight
 * up and to the right, and a filter of an optional glow beneath and two inner
 * shadows — the colour's own light pooling low, and a white rim at the top.
 * Every number is the export's, for the radius the export drew; the chart
 * places a sphere with `<use>` and scales it to its bubble, so the whole
 * sphere, shadows and all, keeps the look it was drawn with at any size.
 */
const HARD_ALPHA = "0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0";

interface SphereSpec {
  readonly outcome: string;
  /** The radius the kit's export drew this sphere at; its filter's numbers are for this size. */
  readonly radius: number;
  readonly base: string;
  readonly shine: { readonly from: string; readonly to: string };
  /** The glow beneath, where the sphere has one. */
  readonly glow: { readonly dy: number; readonly blur: number; readonly colour: string } | null;
  /** The colour's own light, pooling low inside the sphere. */
  readonly pool: {
    readonly dx: number;
    readonly dy: number;
    readonly blur: number;
    readonly colour: string;
  };
  /** The white rim of light along the top. */
  readonly rim: { readonly dy: number; readonly blur: number };
}

/* The kit's four spheres, number for number from its export (nodes 657:18806, 18810, 18807, 18809). */
const SPHERES: readonly SphereSpec[] = [
  {
    outcome: "reservation",
    radius: 33.978,
    base: "#005D92",
    shine: { from: "#A3E832", to: "#000210" },
    glow: {
      dy: 1.95546,
      blur: 19.5546,
      colour: "0 0 0 0 0 0 0 0 0 0.970833 0 0 0 0 0.388333 0 0 0 0.41 0",
    },
    pool: {
      dx: 4.88866,
      dy: 7.82185,
      blur: 4.88866,
      colour: "0 0 0 0 0.157917 0 0 0 0 1 0 0 0 0 0.0208333 0 0 0 0.46 0",
    },
    rim: { dy: 0.977731, blur: 2.44433 },
  },
  {
    outcome: "interested",
    radius: 26.948,
    base: "#1A53C1",
    shine: { from: "#32BCE8", to: "#878895" },
    glow: {
      dy: 1.35316,
      blur: 13.5316,
      colour: "0 0 0 0 0.211017 0 0 0 0 0.506986 0 0 0 0 0.854427 0 0 0 1 0",
    },
    pool: {
      dx: 3.3829,
      dy: 5.41263,
      blur: 3.3829,
      colour: "0 0 0 0 0.626704 0 0 0 0 0.966097 0 0 0 0 0.98776 0 0 0 0.63 0",
    },
    rim: { dy: 0.676579, blur: 1.69145 },
  },
  {
    outcome: "follow_up_needed",
    radius: 61.5426,
    base: "#030092",
    shine: { from: "#3244E8", to: "#000210" },
    glow: null,
    pool: {
      dx: 5.4158,
      dy: 10.8316,
      blur: 27.079,
      colour: "0 0 0 0 0.86 0 0 0 0 0 0 0 0 0 1 0 0 0 1 0",
    },
    rim: { dy: 1.08316, blur: 2.7079 },
  },
  {
    outcome: "not_interested",
    radius: 38.6646,
    base: "#940000",
    shine: { from: "#E83232", to: "#878895" },
    glow: {
      dy: 1.95546,
      blur: 19.5546,
      colour: "0 0 0 0 0.970833 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0",
    },
    pool: {
      dx: 4.88866,
      dy: 7.82185,
      blur: 4.88866,
      colour: "0 0 0 0 1 0 0 0 0 0.0208333 0 0 0 0 0.0208333 0 0 0 0.95 0",
    },
    rim: { dy: 0.977731, blur: 2.44433 },
  },
];

/** The radius each sphere was drawn at, by outcome: the chart scales from it to its bubble. */
export const D_SPHERE_RADIUS: Readonly<Record<string, number>> = Object.fromEntries(
  SPHERES.map((s) => [s.outcome, s.radius]),
);

function Sphere({ outcome, radius, base, shine, glow, pool, rim }: SphereSpec) {
  const id = `dld-sphere-${outcome}`;
  return (
    <>
      {/* The highlight: the export's gradient, as fractions of the sphere's own box. */}
      <radialGradient id={`${id}-shine`} cx="0.704" cy="0.312" r="1.0281">
        <stop offset="0" stopColor={shine.from} />
        <stop offset="1" stopColor={shine.to} stopOpacity="0" />
      </radialGradient>
      <filter
        id={`${id}-fx`}
        x="-1.5"
        y="-1.5"
        width="4"
        height="4"
        colorInterpolationFilters="sRGB"
      >
        <feFlood floodOpacity="0" result="BackgroundImageFix" />
        {glow === null ? (
          <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
        ) : (
          <>
            <feColorMatrix in="SourceAlpha" type="matrix" values={HARD_ALPHA} result="hardAlpha" />
            <feOffset dy={glow.dy} />
            <feGaussianBlur stdDeviation={glow.blur} />
            <feColorMatrix type="matrix" values={glow.colour} />
            <feBlend mode="normal" in2="BackgroundImageFix" result="glow" />
            <feBlend mode="normal" in="SourceGraphic" in2="glow" result="shape" />
          </>
        )}
        <feColorMatrix in="SourceAlpha" type="matrix" values={HARD_ALPHA} result="hardAlpha" />
        <feOffset dx={pool.dx} dy={pool.dy} />
        <feGaussianBlur stdDeviation={pool.blur} />
        <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1" />
        <feColorMatrix type="matrix" values={pool.colour} />
        <feBlend mode="normal" in2="shape" result="pooled" />
        <feColorMatrix in="SourceAlpha" type="matrix" values={HARD_ALPHA} result="hardAlpha" />
        <feOffset dy={rim.dy} />
        <feGaussianBlur stdDeviation={rim.blur} />
        <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1" />
        <feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.58 0" />
        <feBlend mode="normal" in2="pooled" />
      </filter>
      <g id={id} filter={`url(#${id}-fx)`}>
        <circle r={radius} fill={base} />
        <circle r={radius} fill={`url(#${id}-shine)`} />
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

        {SPHERES.map((sphere) => (
          <Sphere key={sphere.outcome} {...sphere} />
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
