import type { ReactNode } from "react";

/**
 * Primitives.
 *
 * Deliberately few. A design system that ships forty components before it has
 * four screens is guessing; these are the shapes the two M2 slices actually
 * need, and the next screen adds what it needs.
 *
 * All are server components — nothing here holds state.
 */

export function Card({
  children,
  padded = true,
  className = "",
  as: Tag = "div",
}: {
  children: ReactNode;
  padded?: boolean;
  className?: string;
  as?: "div" | "section" | "article" | "li";
}) {
  return (
    <Tag className={`obs-card${padded ? " obs-card-pad" : ""}${className ? ` ${className}` : ""}`}>
      {children}
    </Tag>
  );
}

export function Kicker({ children }: { children: ReactNode }) {
  return <p className="obs-kicker">{children}</p>;
}

export function SectionHead({ title, aside }: { title: string; aside?: ReactNode }) {
  return (
    <div className="obs-section-head">
      <h2>{title}</h2>
      {aside === undefined ? null : <div className="obs-dim">{aside}</div>}
    </div>
  );
}

export function Badge({
  children,
  state,
  tone,
}: {
  children: ReactNode;
  state?: "good" | "watch" | "weak" | "unknown";
  tone?: "accent";
}) {
  return (
    <span className="obs-badge" data-state={state} data-tone={tone}>
      {children}
    </span>
  );
}

/**
 * A message shown in place of a figure.
 *
 * Empty, insufficient, unavailable and error are four different situations and
 * a reader must be able to tell them apart. Rendering any of them as "0" or as
 * a blank is how a dashboard tells a quiet lie.
 */
export function StateMessage({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <div className="obs-state" role="status">
      <strong>{title}</strong>
      {detail === undefined ? null : <span>{detail}</span>}
      {action}
    </div>
  );
}

export function Skeleton({ height = "1rem", width = "100%" }: { height?: string; width?: string }) {
  return <div className="obs-skeleton" style={{ height, width }} aria-hidden="true" />;
}

/** A loading placeholder that keeps the page's shape while data arrives. */
export function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <Card>
      <Skeleton height="0.75rem" width="40%" />
      <div style={{ height: "var(--space-4)" }} />
      {Array.from({ length: lines }, (_, index) => (
        <div key={index} style={{ marginBottom: "var(--space-2)" }}>
          <Skeleton height="0.875rem" width={index === lines - 1 ? "60%" : "100%"} />
        </div>
      ))}
      <span className="obs-sr">Loading</span>
    </Card>
  );
}

export function ActionLink({
  href,
  children,
  emphasis = "secondary",
}: {
  href: string;
  children: ReactNode;
  emphasis?: "primary" | "secondary";
}) {
  return (
    <a className="obs-action" data-emphasis={emphasis} href={href}>
      {children}
    </a>
  );
}
