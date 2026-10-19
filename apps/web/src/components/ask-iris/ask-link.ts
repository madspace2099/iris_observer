/**
 * One place builds a link on Ask IRIS, so one place carries the period.
 *
 * `path` defaults to `/ask` — every existing call site asks a question or
 * opens history on this same route — and takes an explicit sibling path for
 * the three surfaces Ask IRIS names rather than navigates within itself:
 * Briefing (`/showroom`), Attention (`/attention`) and the full history route
 * (`/ask/history`). One function still carries the period for all of them.
 *
 * Its own module so the live answer, a client component, can build the same
 * links without bundling the whole screen.
 */
export function askLink(
  root: string,
  periodParam: string,
  params: Readonly<Record<string, string | readonly string[]>> = {},
  path = "/ask",
): string {
  const here = `${root}${path}`;
  const search = new URLSearchParams();
  if (periodParam !== "") search.set("period", periodParam);
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const one of value) search.append(key, one);
    } else {
      search.set(key, value as string);
    }
  }
  const query = search.toString();
  return query === "" ? here : `${here}?${query}`;
}
