import type { CSSProperties, ReactNode } from "react";

import { initialsOf } from "@/components/product/Person";

import "./portrait.css";

/** Where the disc stands: a pill, a line of text, a list row, a card, a page's heading, the editor. */
export type PortraitSize = "chip" | "inline" | "row" | "card" | "head" | "editor";

/**
 * AN AGENT'S FACE, OR THEIR INITIALS (ADR-0054).
 *
 * A plain circle and nothing round it: the photograph cropped to the disc, or,
 * without one, the initials on a quiet fill (the owner, 2026-10-23: "a
 * minimalist circle, without a colour stroke"). The seat colour — the hue that
 * person wears on the page's charts (`seatSeries`) — may tint that fill, never
 * draw a ring. No portrait is ever seeded: the demonstration's people are
 * fictional, and a photograph of somebody who does not exist is the
 * fabrication the doctrine forbids (`docs/14-design-system.md`).
 *
 * The initials are drawn by the stylesheet from `data-initials`, so they are no
 * part of the text beside them: a row reads "Lena Fischer", not "LFLena
 * Fischer", to a copy, a search and a test alike.
 *
 * `alt` is the name where the portrait stands alone and empty where the name
 * is printed beside it, as it is in every list and heading: a reader should not
 * hear a person announced twice. The initials follow the same rule.
 */
export function AgentPortrait({
  name,
  src,
  tone,
  size,
  alt,
}: {
  readonly name: string;
  /** From `portraitSources`; null draws the initials. */
  readonly src: string | null;
  /** The agent's seat colour as a CSS value; it tints the initials' fill, absent a neutral one. */
  readonly tone?: string | undefined;
  readonly size: PortraitSize;
  readonly alt: string;
}) {
  const style = (tone === undefined ? {} : { "--ag-seat": tone }) as CSSProperties;
  if (src !== null) {
    return (
      <img
        className="ag-portrait"
        data-size={size}
        style={style}
        src={src}
        alt={alt}
        decoding="async"
      />
    );
  }
  return (
    <span
      className="ag-portrait ag-portrait-initials"
      data-size={size}
      data-initials={initialsOf(name)}
      style={style}
      {...(alt === "" ? { "aria-hidden": true } : { role: "img", "aria-label": alt })}
    />
  );
}

/**
 * A presenter's name with their face before it, wherever a page names one.
 *
 * `children` is the name as the place prints it — a link, or the words around
 * it ("Presented by Lena Fischer.") — and defaults to the name alone. The face
 * is silent beside it. `src` is the page's own `portraitSources` entry, so one
 * address per agent serves every row that names them.
 */
export function AgentName({
  name,
  src,
  tone,
  size = "inline",
  children,
}: {
  readonly name: string;
  readonly src: string | null;
  readonly tone?: string | undefined;
  readonly size?: PortraitSize;
  readonly children?: ReactNode;
}) {
  return (
    <span className="ag-named" data-size={size}>
      <AgentPortrait name={name} src={src} tone={tone} size={size} alt="" />
      <span className="ag-named-text">{children ?? name}</span>
    </span>
  );
}
