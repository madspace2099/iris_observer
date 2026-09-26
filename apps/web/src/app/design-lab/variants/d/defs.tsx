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
 */
export function DDefs() {
  return (
    <svg className="dld-defs" width="0" height="0" aria-hidden="true" focusable="false">
      <defs>
        {/* The kit's "Caribbean green": the lead series' stroke. */}
        <linearGradient id="dld-line" x1="0" y1="0" x2="1" y2="0.08">
          <stop offset="0" stopColor="#01f1e3" />
          <stop offset="1" stopColor="#5cf101" />
        </linearGradient>

        {/* The bubble chart's field: the kit's violet glow, fading to nothing at its rim. */}
        <radialGradient id="dld-bubble-glow">
          <stop offset="0" stopColor="#611ed7" />
          <stop offset="1" stopColor="#2a0e5b" stopOpacity="0" />
        </radialGradient>

        {/* Its outer orbit: the kit's slate, strongest at the top, gone at the bottom. */}
        <linearGradient id="dld-bubble-orbit" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#252545" stopOpacity="0.57" />
          <stop offset="1" stopColor="#252545" stopOpacity="0" />
        </linearGradient>

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
