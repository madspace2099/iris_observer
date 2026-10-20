/**
 * A URL-safe short name, built from a name somebody typed.
 *
 * NFKD then stripping the combining marks, so a Hungarian or Slovak name
 * survives: "Óbuda Rakpart" becomes `obuda-rakpart` rather than `-buda-rakpart`.
 * A name with no Latin letters or digits at all yields nothing, and this returns
 * null rather than a placeholder: a slug of `project-1` that nobody chose is
 * invented data.
 *
 * Pure and shared, because the server derives a project's first slug with it and
 * the forms offer the same value before anything is saved. Two copies would be
 * two answers to what an address looks like.
 */
export function slugFrom(name: string, max = 120): string | null {
  const slug = name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, max)
    .replace(/^-+|-+$/g, "");
  return slug.length === 0 ? null : slug;
}

/**
 * The shapes the projects table holds a locale and a time zone to: its CHECK
 * constraints `projects_locale_shape` and `projects_time_zone_shape`, copied
 * here because the package that owns them is frozen.
 *
 * Intl accepts more than these: `en-US-u-hc-h23` and `+01:00` both format. A
 * value Intl accepts and the table refuses raises inside `setProjectSettings`,
 * after the project row exists, so the forms test both before the first write.
 */
export function localeFits(value: string): boolean {
  return /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(value);
}

export function timeZoneFits(value: string): boolean {
  return /^[A-Za-z0-9_+/-]{1,64}$/.test(value);
}
