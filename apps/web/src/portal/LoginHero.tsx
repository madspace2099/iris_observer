import type { ReactNode } from "react";

/**
 * THE LEFT-HAND PANEL OF THE SIGN-IN SCREEN, AS A REPLACEABLE SLOT.
 *
 * The photograph is the MADSPACE founders portrait the Client Portal signs in
 * with — `assets/madspace-founders-1100.jpg` in the reference archive, copied
 * byte-for-byte to `public/portal/`. It is the authoritative asset, and it is
 * also temporary: an Observer-specific image replaces it later. Everything
 * about that replacement is meant to be one value:
 *
 *   <LoginHero image="url('/portal/observer-hero.jpg')" focus="center 38%" />
 *
 * and nothing else changes. That is why the pieces are kept apart:
 *
 *   - the IMAGE is a CSS custom property on the panel, so the layout never
 *     refers to a file name;
 *   - the SCRIM is its own absolutely positioned element, not a gradient baked
 *     into the image, so a new photograph arrives without its darkening;
 *   - the LOGO and the COPY are ordinary children above both, so they do not
 *     move when the picture does;
 *   - the CAPTION is a list this component is given, so an image of something
 *     other than two people is captioned by changing the caller, not this file;
 *   - the panel is sized by the grid it sits in, never by the image, so an
 *     asset of any dimension crops rather than reflows.
 *
 * ## A correction
 *
 * An earlier note in this file said the reference's photograph could not be
 * recovered, on the evidence that the saved HTML export addresses its images
 * through `blob:` URLs. The export does — and the archive also carries the
 * originals in `assets/`, which that reasoning never looked at. The image and
 * the logo below are those files, unmodified.
 */
export function LoginHero({
  image = FOUNDERS,
  focus = "center top",
  logo = "/portal/madspace-logo-white-900.png",
  logoAlt = "MADSPACE",
  line,
  captionLabel,
  captions = [],
  children,
}: {
  /** A CSS image value. Replace this one string to change the photograph. */
  image?: string;
  /** Which part of the image survives the crop. */
  focus?: string;
  /** The mark on the photograph. A path, or null for a hero that carries none. */
  logo?: string | null;
  logoAlt?: string;
  line: string;
  /** The small uppercase line above the captions, e.g. "Meet our founders". */
  captionLabel?: string;
  /** Who or what the photograph shows. Empty for an image that needs no names. */
  captions?: readonly { readonly name: string; readonly role: string }[];
  children?: ReactNode;
}) {
  return (
    <div
      className="mp-hero"
      style={{ "--hero-image": image, "--hero-focus": focus } as React.CSSProperties}
    >
      <div className="mp-hero-scrim" aria-hidden="true" />

      {logo === null ? (
        <span />
      ) : (
        /*
         * An <img>, not a background: the mark is content, it has a name, and a
         * reader who cannot see the panel should still be told whose product
         * this is. Next's Image component is deliberately not used — this is a
         * fixed-height mark on a page that must render before anything else.
         */
        <img className="mp-hero-logo" src={logo} alt={logoAlt} width={900} height={89} />
      )}

      <div className="mp-hero-body">
        <p className="mp-hero-line">{line}</p>

        {captions.length > 0 && (
          <>
            {captionLabel !== undefined && <p className="mp-hero-caption">{captionLabel}</p>}
            <ul className="mp-hero-people">
              {captions.map((person) => (
                <li key={person.name}>
                  <span className="mp-hero-person-name">{person.name}</span>
                  <span className="mp-hero-person-role">{person.role}</span>
                </li>
              ))}
            </ul>
          </>
        )}

        {children}
      </div>
    </div>
  );
}

/** The reference photograph, served from `public/portal/`. */
const FOUNDERS = "url('/portal/madspace-founders-1100.jpg')";
