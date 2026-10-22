import type { CSSProperties } from "react";

import { initialsOf } from "@/components/product/Person";

import "./portrait.css";

/**
 * AN AGENT'S FACE, OR THEIR INITIALS (ADR-0054).
 *
 * Round, ringed in the agent's seat colour — the hue that person wears on every
 * chart of the page (`seatSeries`) — so a face in a list ties to its line in a
 * chart without a legend. Without a portrait the same disc carries the
 * initials, never a generated picture (`components/product/Person.tsx`). No
 * portrait is ever seeded: the demonstration's people are fictional, and a
 * photograph of somebody who does not exist is the fabrication the doctrine
 * forbids (`docs/14-design-system.md`).
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
  /** The agent's seat colour as a CSS value; absent, a neutral ring. */
  readonly tone?: string | undefined;
  readonly size: "row" | "card" | "head" | "editor";
  readonly alt: string;
}) {
  const style = (tone === undefined ? {} : { "--ag-seat": tone }) as CSSProperties;
  if (src !== null) {
    return <img className="ag-portrait" data-size={size} style={style} src={src} alt={alt} />;
  }
  return (
    <span
      className="ag-portrait ag-portrait-initials"
      data-size={size}
      style={style}
      {...(alt === "" ? { "aria-hidden": true } : { role: "img", "aria-label": alt })}
    >
      {initialsOf(name)}
    </span>
  );
}
