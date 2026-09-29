/**
 * THE SECTIONS A READER TOOK OUT OF A PRINTED REPORT.
 *
 * The export dialog's checkboxes were a specification the page never read:
 * a reader could untick a section and the page printed it anyway. The ids the
 * reader took out now travel as `?omit=`, comma-separated, and the page leaves
 * those sections out — and says so on its cover, because a report that quietly
 * drops a section is the same lie as a zero standing in for a value nobody
 * measured. A blank section cannot be taken out: it is printed blank, with its
 * reason, whatever the address says.
 */
export function omittedFrom(value: string | readonly string[] | undefined): ReadonlySet<string> {
  if (typeof value !== "string") return new Set();
  return new Set(
    value
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id.length > 0),
  );
}

/**
 * The sections a page prints: every blank one, with its reason, and every
 * writable one the reader kept.
 */
export function printedSections<S extends { readonly id: string; readonly availability: string }>(
  sections: readonly S[],
  omitted: ReadonlySet<string>,
): readonly S[] {
  return sections.filter(
    (section) => section.availability === "unavailable" || !omitted.has(section.id),
  );
}

/** `href` leaving out `ids`; none leaves the address as it was. */
export function withOmitted(href: string, ids: readonly string[]): string {
  const [path, query] = href.split("?");
  const params = new URLSearchParams(query ?? "");
  if (ids.length === 0) params.delete("omit");
  else params.set("omit", ids.join(","));
  const search = params.toString();
  return search.length === 0 ? (path ?? href) : `${path}?${search}`;
}
