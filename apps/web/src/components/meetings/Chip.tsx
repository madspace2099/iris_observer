import type { ReactNode } from "react";

import type { ChipTone } from "./vocabulary";

/**
 * A state, drawn as a mark and its word.
 *
 * Three elements and no logic, which is exactly why it lives here rather than
 * in the shared primitive layer: `components/product/index.ts` argues that
 * layer is a set of components carrying RULES, not fifty wrappers over class
 * names, and `.ox-chip` is a class name. It is a file rather than a repeated
 * fragment only because the register and the meeting itself both draw an
 * outcome, and an outcome that is a settled square on one screen and a waiting
 * ring on the other would be two products.
 *
 * The word is a required child and there is no prop that would suppress it.
 * `observer-product.css` §9 gives the six tones six SHAPES for the reader who
 * cannot separate the hues and for the greyscale print that loses both — but a
 * shape is a second channel, never the only one, and a state never reaches this
 * product as a colour alone.
 */
export function Chip({
  tone,
  children,
  title = null,
}: {
  readonly tone: ChipTone;
  readonly children: ReactNode;
  /** The longer sentence behind the word, where the read model supplies one. */
  readonly title?: string | null;
}) {
  return (
    <span className="ox-chip" data-tone={tone} {...(title === null ? {} : { title })}>
      <span className="ox-chip-mark" aria-hidden="true" />
      {children}
    </span>
  );
}
