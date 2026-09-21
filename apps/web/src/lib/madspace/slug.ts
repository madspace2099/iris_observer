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
