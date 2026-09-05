/**
 * The Ask IRIS icon set, transcribed from the delivered design.
 *
 * Every path below is copied out of `IRIS Observer.dc.html` rather than
 * redrawn, because the design is the visual source of truth and an icon
 * substituted "because it looks the same" is the first place a rebuild starts
 * drifting. The stroke widths are the export's too — they vary between 1.6 and
 * 1.8 per icon, deliberately, so that shapes with more strokes do not read
 * heavier than shapes with fewer.
 *
 * ## Why these are inline SVG rather than files
 *
 * The export ships its own logos as PNG — 184KB for a wordmark drawn 21px tall
 * — and its icons as inline vectors. The wordmark already exists in this
 * repository as a 1.2KB SVG and is used instead; the icons are kept inline
 * because they are one path each, they inherit `currentColor` so a hover state
 * costs nothing, and a sprite of fourteen 200-byte shapes would be a second
 * request to save nothing.
 *
 * They are all `aria-hidden`. Every control that carries one also carries its
 * own accessible name, so an icon announcing itself would make every button say
 * its label twice.
 */

interface GlyphProps {
  readonly size?: number;
}

function Stroke({
  size = 18,
  width = 1.7,
  children,
}: {
  readonly size?: number;
  readonly width?: number;
  readonly children: React.ReactNode;
}) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flex: "none" }}
    >
      {children}
    </svg>
  );
}

/* --- the composer controls ------------------------------------------------ */

export function ChevronDown({ size = 16 }: GlyphProps) {
  return (
    <Stroke size={size} width={1.9}>
      <path d="m6 9 6 6 6-6" />
    </Stroke>
  );
}

export function ChevronRight({ size = 18 }: GlyphProps) {
  return (
    <Stroke size={size} width={1.8}>
      <path d="m9 18 6-6-6-6" />
    </Stroke>
  );
}

export function Microphone({ size = 19 }: GlyphProps) {
  return (
    <Stroke size={size}>
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <path d="M12 19v3" />
    </Stroke>
  );
}

export function Clock({ size = 19 }: GlyphProps) {
  return (
    <Stroke size={size}>
      <path d="M3 3v5h5" />
      <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
      <path d="M12 7v5l4 2" />
    </Stroke>
  );
}

export function Send({ size = 18 }: GlyphProps) {
  return (
    <Stroke size={size} width={1.75}>
      <path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" />
      <path d="m21.854 2.147-10.94 10.939" />
    </Stroke>
  );
}

/** The mark on Ask IRIS, and the one on every answer IRIS writes. */
export function Sparkle({ size = 17 }: GlyphProps) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      style={{ flex: "none" }}
    >
      <path d="M12 2.6l2.05 5.5 5.5 2.05-5.5 2.05L12 17.7l-2.05-5.5L4.45 10.15l5.5-2.05z" />
      <path d="M18.6 15.4l.85 2.25 2.25.85-2.25.85-.85 2.25-.85-2.25-2.25-.85 2.25-.85z" />
    </svg>
  );
}

/* --- the openings, one shape each ---------------------------------------- */

export function TrendUp({ size = 18 }: GlyphProps) {
  return (
    <Stroke size={size} width={1.65}>
      <path d="M16 7h6v6" />
      <path d="m22 7-8.5 8.5-5-5L2 17" />
    </Stroke>
  );
}

export function Building({ size = 18 }: GlyphProps) {
  return (
    <Stroke size={size} width={1.6}>
      <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
      <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
      <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
      <path d="M10 6h4" />
      <path d="M10 10h4" />
      <path d="M10 14h4" />
      <path d="M10 18h4" />
    </Stroke>
  );
}

export function Compare({ size = 18 }: GlyphProps) {
  return (
    <Stroke size={size} width={1.65}>
      <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
      <path d="M22 12A10 10 0 0 0 12 2v10z" />
    </Stroke>
  );
}

export function People({ size = 18 }: GlyphProps) {
  return (
    <Stroke size={size} width={1.6}>
      <path d="M18 21a8 8 0 0 0-16 0" />
      <circle cx="10" cy="8" r="5" />
      <path d="M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3" />
    </Stroke>
  );
}

export function Target({ size = 18 }: GlyphProps) {
  return (
    <Stroke size={size} width={1.6}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="2.4" />
      <path d="M12 3v3" />
      <path d="M12 18v3" />
      <path d="M3 12h3" />
      <path d="M18 12h3" />
    </Stroke>
  );
}

/**
 * The five openings, in the design's order, each with the design's shape.
 *
 * Indexed rather than matched on the question text: the questions come from the
 * read model and are allowed to change with the project and the period, and a
 * lookup keyed on a sentence would silently fall back to a default the first
 * time one of them was reworded.
 */
export const OPENING_GLYPHS = [TrendUp, Building, Compare, People, Target] as const;

/* --- the history rows ----------------------------------------------------- */

export function Thread({ size = 18 }: GlyphProps) {
  return (
    <Stroke size={size} width={1.6}>
      <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
    </Stroke>
  );
}

export function Pencil({ size = 16 }: GlyphProps) {
  return (
    <Stroke size={size}>
      <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
    </Stroke>
  );
}

export function Dots({ size = 17 }: GlyphProps) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      style={{ flex: "none" }}
    >
      <circle cx="5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="19" cy="12" r="1.6" />
    </svg>
  );
}

export function Share({ size = 17 }: GlyphProps) {
  return (
    <Stroke size={size}>
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <path d="m16 6-4-4-4 4" />
      <path d="M12 2v13" />
    </Stroke>
  );
}

export function Pin({ size = 17 }: GlyphProps) {
  return (
    <Stroke size={size}>
      <path d="M12 17v5" />
      <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
    </Stroke>
  );
}

export function Trash({ size = 17 }: GlyphProps) {
  return (
    <Stroke size={size}>
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </Stroke>
  );
}

/** The mark beside the sentence that says who composed an answer. */
export function Info({ size = 15 }: GlyphProps) {
  return (
    <Stroke size={size} width={1.8}>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M12 11v5" />
      <path d="M12 7.6h.01" />
    </Stroke>
  );
}

/**
 * A plain cross, for the scope sheet's own close control.
 *
 * Not transcribed from the export — the reference has no dismissible sheet to
 * draw one for, and never needed to: it has no multi-project Compare. Drawn
 * with the same `Stroke` helper and a stroke width in the export's own 1.6–1.8
 * range, so it reads as one family with the rest rather than as a shape from
 * somewhere else.
 */
export function Close({ size = 16 }: GlyphProps) {
  return (
    <Stroke size={size} width={1.8}>
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </Stroke>
  );
}
