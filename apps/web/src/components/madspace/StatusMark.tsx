/**
 * Six states, six shapes. The rule the design system calls "never colour alone".
 *
 * ## Why a shape at all
 *
 * A colour alone does not survive greyscale printing, and roughly one man in
 * twelve cannot separate the green from the amber. So every state carries a
 * distinct outline as well as a colour and a spelled-out word, and the outline
 * is the part that always works.
 *
 * ## Why one function
 *
 * The system is explicit that the mark shape is produced by one function, so a
 * state cannot appear with the wrong shape in one place and the right one in
 * another. This is that function. Nothing else in the surface draws a status
 * mark, and a new state means a new entry here rather than a new SVG somewhere.
 *
 * ## The six, and what they mean HERE
 *
 * The client portal names its six for a project's delivery: on track, waiting
 * for client, waiting for MADSPACE, delayed, completed, customer care. The
 * operations surface answers a different question, so the shapes are kept and
 * the meanings are the ones this surface actually has. Keeping the shapes is
 * what makes the two products read as one system; borrowing the labels would
 * have made this screen claim things it does not know.
 *
 *   circle    holds        the state is true and current
 *   ring      awaiting     nothing is wrong, and we are waiting on the installation
 *   diamond   operator     a person decided this, and a person can undo it
 *   triangle  wrong        refusing, failing or overdue. Someone has work to do
 *   square    settled      terminal and accepted. Nothing further is expected
 *   bar       unreported   no measurement exists. NOT zero, and never drawn as zero
 */

export type MarkShape = "circle" | "ring" | "diamond" | "triangle" | "square" | "bar";

export type MarkTone = "good" | "await" | "operator" | "wrong" | "settled" | "none";

/**
 * The pairing, fixed.
 *
 * Tone and shape travel together because a caller free to pick both is a caller
 * free to draw a green triangle. A screen asks for a meaning; this decides what
 * it looks like.
 */
const MARK: Readonly<Record<MarkTone, MarkShape>> = {
  good: "circle",
  await: "ring",
  operator: "diamond",
  wrong: "triangle",
  settled: "square",
  none: "bar",
};

function Shape({ shape }: { shape: MarkShape }) {
  switch (shape) {
    case "circle":
      return <circle cx="6" cy="6" r="4" />;
    case "ring":
      return <circle cx="6" cy="6" r="3.6" fill="none" strokeWidth="1.6" />;
    case "diamond":
      return <path d="M6 1.6 10.4 6 6 10.4 1.6 6Z" />;
    case "triangle":
      return <path d="M6 1.8 10.6 10H1.4Z" />;
    case "square":
      return <rect x="2.2" y="2.2" width="7.6" height="7.6" rx="1" />;
    case "bar":
      return <rect x="1.6" y="5" width="8.8" height="2" rx="1" />;
  }
}

/**
 * The mark alone, for a row that already carries the word beside it.
 *
 * `aria-hidden`, always. The word is the accessible content; a screen reader
 * announcing "image, circle" beside the word "Connected" is noise, and a mark
 * that had to be described would mean the word was missing.
 */
export function StatusMark({ tone }: { readonly tone: MarkTone }) {
  return (
    <svg
      className="mad-mark"
      data-tone={tone}
      viewBox="0 0 12 12"
      aria-hidden="true"
      focusable="false"
    >
      <Shape shape={MARK[tone]} />
    </svg>
  );
}

/**
 * The mark and its word, which is how a state should nearly always appear.
 *
 * The word is not optional and there is no prop to remove it. That is the point
 * of the component: a state that reaches the screen as a coloured dot with no
 * word is the failure this whole rule exists to prevent.
 */
export function StatusChip({
  tone,
  children,
}: {
  readonly tone: MarkTone;
  readonly children: string;
}) {
  return (
    <span className="mad-chip" data-tone={tone}>
      <StatusMark tone={tone} />
      <span className="mad-chip-label">{children}</span>
    </span>
  );
}
