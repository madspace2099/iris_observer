/**
 * A PASTED KEY, CLEANED OF WHAT A COPY CARRIES ALONG.
 *
 * `trim()` takes the ends only. A key copied from a web page, a PDF or a chat
 * can carry a zero-width space, a non-breaking space or a line break inside
 * it; sent as a header, such a character makes the request fail before it
 * leaves the machine, and the reader was told OpenAI "could not be reached"
 * (2026-10-23). Every whitespace and invisible formatting character (Unicode's
 * `Cf`: soft hyphen, zero-width space and joiners, direction marks, BOM) goes.
 * What is left must be printable ASCII, as every provider key is; anything
 * else is not a key and is refused as one, rather than sent.
 */
const INVISIBLE = /[\s\p{Cf}]/gu;
const PRINTABLE_ASCII = /^[\x21-\x7E]+$/;

export function cleanKey(raw: string): string | null {
  const cleaned = raw.replace(INVISIBLE, "");
  return PRINTABLE_ASCII.test(cleaned) ? cleaned : null;
}
