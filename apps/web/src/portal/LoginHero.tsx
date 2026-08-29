import type { ReactNode } from "react";

/**
 * THE LEFT-HAND PANEL OF THE SIGN-IN SCREEN, AS A REPLACEABLE SLOT.
 *
 * The photograph here is provisional and will be replaced with an Observer
 * image. Everything about that replacement is meant to be one value:
 *
 *   <LoginHero image="url('/hero/observer.jpg')" focus="center 38%" />
 *
 * and nothing else changes. That is why the pieces are kept apart:
 *
 *   - the IMAGE is a CSS custom property on the panel, so the layout never
 *     refers to a file name;
 *   - the SCRIM is its own absolutely positioned element, not a gradient baked
 *     into the image, so a new photograph arrives without its darkening;
 *   - the LOGO and the COPY are ordinary children above both, so they do not
 *     move when the picture does;
 *   - the panel is sized by the grid it sits in, never by the image, so an
 *     asset of any dimension crops rather than reflows.
 *
 * ## Why there is no photograph in the repository yet
 *
 * The Client Portal reference ships a founders photograph and names the two
 * people in it. That is the portal's content, not Observer's, and carrying it
 * over would put another product's marketing into this one. The saved HTML
 * export references its images through `blob:` URLs, which hold nothing: no
 * original bytes were recovered from it and none are claimed.
 *
 * So the default is a neutral gradient that occupies the exact geometry the
 * photograph will. It is provisional, and it is meant to look provisional.
 */
export function LoginHero({
  image = PLACEHOLDER,
  focus = "center top",
  eyebrow,
  line,
  note,
  children,
}: {
  /** A CSS image value. Replace this one string to change the photograph. */
  image?: string;
  /** Which part of the image survives the crop. */
  focus?: string;
  eyebrow?: string;
  line: string;
  note?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className="mp-hero"
      style={{ "--hero-image": image, "--hero-focus": focus } as React.CSSProperties}
    >
      <div className="mp-hero-scrim" aria-hidden="true" />

      {eyebrow === undefined ? (
        <span />
      ) : (
        <span
          className="mp-hero-logo"
          style={{
            fontSize: "var(--text-caption)",
            fontWeight: 600,
            letterSpacing: "0.34em",
            color: "var(--ink-on-dark)",
            height: "auto",
          }}
        >
          {eyebrow}
        </span>
      )}

      <div className="mp-hero-body">
        <p className="mp-hero-line">{line}</p>
        {note !== undefined && <p className="mp-hero-note">{note}</p>}
        {children}
      </div>
    </div>
  );
}

/**
 * The provisional image.
 *
 * A quiet diagonal in the product's own near-black, so the panel reads as a
 * deliberate surface rather than a failed image request. No file, no network,
 * no dependency on anything that could be missing.
 */
const PLACEHOLDER = "linear-gradient(148deg, #1a1a19 0%, #0f0f0e 46%, #131312 72%, #0b0b0a 100%)";
