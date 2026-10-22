/**
 * A FACE, CHECKED AT THE DOOR (ADR-0054).
 *
 * The one place an uploaded portrait's bytes are judged. Three formats are
 * accepted, PNG, JPEG and WebP, and each is recognised by its own first bytes:
 * the browser's declared type and the file's name are the uploader's claims and
 * are never read. Anything else, SVG included (a picture that can carry a
 * script), is refused in a sentence the reader can act on.
 *
 * A phone photograph carries where it was taken (EXIF GPS), the device, often a
 * thumbnail of the uncropped original. A portrait needs none of it, so the
 * metadata is cut out before the bytes are kept. No image library resolves from
 * `apps/web` (sharp is not installed), so this does not re-encode: it walks each
 * format's own container and keeps only what draws the picture.
 *
 *   JPEG  APP1–APP15 (EXIF, XMP, ICC, maker notes) and COM go, wherever they
 *         stand, between progressive scans too; the walk steps through each
 *         scan's coded data and ends at the first EOI, so a second image, a
 *         motion-photo video or a vendor trailer after it is not kept.
 *         APP0 (JFIF), the tables and the scans stay.
 *   PNG   An allowlist: the critical chunks, the colour and size chunks and
 *         APNG's three. Every other chunk (tEXt, eXIf, the older exIf, C2PA's
 *         caBX, tIME, any private one) and everything after IEND goes.
 *   WebP  An allowlist: VP8, VP8L, VP8X, ALPH, ANIM, ANMF and ICCP. EXIF, XMP,
 *         C2PA and any other chunk go; VP8X's two metadata flags are cleared
 *         and the RIFF size rewritten.
 *
 * A file whose container does not walk cleanly is refused rather than kept as
 * it came: a structure this cannot read is one whose metadata it cannot vouch
 * for. Pure functions, no `server-only`: the tests build their fixtures here.
 */

export const PORTRAIT_MAX_BYTES = 2 * 1024 * 1024;

export type PortraitType = "image/png" | "image/jpeg" | "image/webp";

export type Admission =
  | { readonly ok: true; readonly type: PortraitType; readonly bytes: Uint8Array }
  | { readonly ok: false; readonly reason: string };

export const TOO_LARGE = "A portrait can be at most 2 MB. Choose a smaller image.";
const NOT_AN_IMAGE = "Only a PNG, JPEG or WebP image can be a portrait.";
const NAMES: Readonly<Record<PortraitType, string>> = {
  "image/png": "PNG",
  "image/jpeg": "JPEG",
  "image/webp": "WebP",
};

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

function ascii(b: Uint8Array, at: number, length: number): string {
  return String.fromCharCode(...b.subarray(at, at + length));
}

function view(b: Uint8Array): DataView {
  return new DataView(b.buffer, b.byteOffset, b.byteLength);
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** The format a file's first bytes name, or null. Never the declared type. */
export function sniffPortrait(b: Uint8Array): PortraitType | null {
  if (b.length >= 8 && PNG_SIGNATURE.every((v, i) => b[i] === v)) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") {
    return "image/webp";
  }
  return null;
}

/* --- JPEG ------------------------------------------------------------------ */

const isRestart = (marker: number) => marker >= 0xd0 && marker <= 0xd7;

function stripJpeg(b: Uint8Array): Uint8Array | null {
  const kept: Uint8Array[] = [b.subarray(0, 2)];
  let scanned = false;
  let i = 2;
  while (i + 1 < b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1] ?? 0;
    if (marker === 0xff) {
      i += 1; // a fill byte before a marker
      continue;
    }
    // The end of the image: nothing after it is kept (a second image, a video, a trailer).
    if (marker === 0xd9) return scanned ? concat([...kept, b.subarray(i, i + 2)]) : null;
    if (marker === 0xd8) return null;
    if (marker === 0x01 || isRestart(marker)) {
      kept.push(b.subarray(i, i + 2));
      i += 2;
      continue;
    }
    if (i + 4 > b.length) return null;
    const length = view(b).getUint16(i + 2);
    if (length < 2 || i + 2 + length > b.length) return null;
    const metadata = (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe;
    if (!metadata) kept.push(b.subarray(i, i + 2 + length));
    i += 2 + length;
    if (marker === 0xda) {
      // A scan's coded data runs to the next marker; FF00 is a stuffed FF, FFD0–FFD7 a restart.
      const start = i;
      while (i + 1 < b.length) {
        const next = b[i + 1] ?? 0;
        if (b[i] === 0xff && next !== 0x00 && !isRestart(next)) break;
        i += 1;
      }
      kept.push(b.subarray(start, i));
      scanned = true;
    }
  }
  return null;
}

/* --- PNG ------------------------------------------------------------------- */

/** What draws a PNG: the critical chunks, colour and size, and APNG's frames. Nothing else is kept. */
const PNG_PICTURE = new Set([
  "IHDR",
  "PLTE",
  "IDAT",
  "IEND",
  "tRNS",
  "gAMA",
  "cHRM",
  "sRGB",
  "iCCP",
  "sBIT",
  "pHYs",
  "bKGD",
  "acTL",
  "fcTL",
  "fdAT",
]);

function stripPng(b: Uint8Array): Uint8Array | null {
  const kept: Uint8Array[] = [b.subarray(0, 8)];
  let i = 8;
  while (i + 12 <= b.length) {
    const length = view(b).getUint32(i);
    const type = ascii(b, i + 4, 4);
    const end = i + 12 + length;
    if (end > b.length) return null;
    if (i === 8 && type !== "IHDR") return null;
    if (PNG_PICTURE.has(type)) kept.push(b.subarray(i, end));
    if (type === "IEND") return concat(kept);
    i = end;
  }
  return null;
}

/* --- WebP ------------------------------------------------------------------ */

/**
 * What draws a WebP. Nothing else is kept.
 *
 * ponytail: an ANMF frame is kept whole, so a chunk an encoder put inside a
 * frame (the container allows unknown ones there; no common encoder writes
 * metadata there) is kept with it. Walk the frame's own chunks if one ever does.
 */
const WEBP_KEPT = new Set(["VP8 ", "VP8L", "VP8X", "ALPH", "ANIM", "ANMF", "ICCP"]);
const WEBP_PICTURE = new Set(["VP8 ", "VP8L", "ANMF"]);
/** VP8X's flag byte: bit 3 says EXIF follows, bit 2 says XMP does. */
const VP8X_METADATA_FLAGS = 0x08 | 0x04;

function stripWebp(b: Uint8Array): Uint8Array | null {
  const end = 8 + view(b).getUint32(4, true);
  if (end > b.length || end < 12) return null;
  const kept: Uint8Array[] = [];
  let picture = false;
  let i = 12;
  while (i + 8 <= end) {
    const fourcc = ascii(b, i, 4);
    const size = view(b).getUint32(i + 4, true);
    if (i + 8 + size > end) return null;
    const next = Math.min(end, i + 8 + size + (size & 1));
    if (WEBP_KEPT.has(fourcc)) {
      const chunk = b.slice(i, next);
      if (fourcc === "VP8X" && size >= 1) chunk[8] = (chunk[8] ?? 0) & ~VP8X_METADATA_FLAGS;
      picture ||= WEBP_PICTURE.has(fourcc);
      kept.push(chunk);
    }
    i = next;
  }
  if (!picture || i !== end) return null;
  const body = concat(kept);
  const out = new Uint8Array(12 + body.length);
  out.set(b.subarray(0, 4), 0); // "RIFF"
  view(out).setUint32(4, 4 + body.length, true);
  out.set(b.subarray(8, 12), 8); // "WEBP"
  out.set(body, 12);
  return out;
}

const STRIP: Readonly<Record<PortraitType, (b: Uint8Array) => Uint8Array | null>> = {
  "image/png": stripPng,
  "image/jpeg": stripJpeg,
  "image/webp": stripWebp,
};

/**
 * Whether these bytes may become a portrait, and the bytes to keep if so.
 *
 * Size first, so an oversized file is refused before its structure is walked;
 * then the format by its first bytes; then the metadata cut out. Every refusal
 * is a sentence for the person who chose the file.
 */
export function admitPortrait(bytes: Uint8Array): Admission {
  if (bytes.length === 0) return { ok: false, reason: "The file is empty." };
  if (bytes.length > PORTRAIT_MAX_BYTES) return { ok: false, reason: TOO_LARGE };
  const type = sniffPortrait(bytes);
  if (type === null) return { ok: false, reason: NOT_AN_IMAGE };
  const stripped = STRIP[type](bytes);
  if (stripped === null) {
    return {
      ok: false,
      reason: `The file begins like a ${NAMES[type]} image but is not a whole one, so it cannot be checked. Export it again and choose the new file.`,
    };
  }
  return { ok: true, type, bytes: stripped };
}
