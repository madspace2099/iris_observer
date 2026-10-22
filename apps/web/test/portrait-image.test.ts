import { describe, expect, it } from "vitest";

import {
  PORTRAIT_MAX_BYTES,
  TOO_LARGE,
  admitPortrait,
  sniffPortrait,
} from "../src/lib/portraits/image";

/**
 * THE PORTRAIT'S TRUST BOUNDARY (ADR-0054): the format by its first bytes, at
 * most 2 MB, and no metadata kept. Every fixture is built here, byte by byte,
 * so what each one carries — and where the location would hide — is on the page.
 */

const enc = (text: string) => new TextEncoder().encode(text);
const bytes = (...parts: (Uint8Array | number[])[]) => {
  const flat = parts.flatMap((p) => [...p]);
  return new Uint8Array(flat);
};
const has = (haystack: Uint8Array, needle: string) =>
  Buffer.from(haystack).includes(Buffer.from(needle, "latin1"));

const u32be = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const u32le = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];

/* --- PNG: signature, IHDR, text and EXIF chunks, IDAT, IEND, trailing junk --- */

const pngChunk = (type: string, data: Uint8Array) =>
  bytes(u32be(data.length), enc(type), data, [0, 0, 0, 0]);
const PNG = bytes(
  [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  pngChunk("IHDR", new Uint8Array(13)),
  pngChunk("tEXt", enc("Comment\0taken at home")),
  pngChunk("eXIf", enc("MM\0*GPSLatitude 48.1486")),
  pngChunk("iTXt", enc("XML:com.adobe.xmp\0\0\0\0\0<x:xmpmeta/>")),
  pngChunk("IDAT", enc("pixels")),
  pngChunk("IEND", new Uint8Array(0)),
  enc("trailing GPSLongitude 17.1077"),
);

/* --- JPEG: SOI, APP0 JFIF, APP1 EXIF, APP2 ICC, COM, DQT, SOS ... EOI --- */

const segment = (marker: number, data: Uint8Array) =>
  bytes([0xff, marker, ((data.length + 2) >> 8) & 255, (data.length + 2) & 255], data);
const JPEG = bytes(
  [0xff, 0xd8],
  segment(0xe0, enc("JFIF\0\x01\x01\0\0\x01\0\x01\0\0")),
  segment(0xe1, enc("Exif\0\0GPSLatitude 48.1486")),
  segment(0xe2, enc("ICC_PROFILE\0device")),
  segment(0xfe, enc("shot on a phone")),
  segment(0xdb, new Uint8Array(65)),
  segment(0xda, new Uint8Array(10)),
  enc("scan"),
  [0xff, 0xd9],
);

/* --- WebP: RIFF, VP8X with the EXIF and XMP flags, VP8L, EXIF, XMP --- */

const riffChunk = (fourcc: string, data: Uint8Array) =>
  bytes(enc(fourcc), u32le(data.length), data, data.length % 2 === 1 ? [0] : []);
const webp = (...chunks: Uint8Array[]) => {
  const body = bytes(enc("WEBP"), ...chunks);
  return bytes(enc("RIFF"), u32le(body.length), body);
};
const VP8X = bytes([0x2c, 0, 0, 0], [0, 0, 0], [0, 0, 0]); // ICC | EXIF | XMP
const WEBP = webp(
  riffChunk("VP8X", VP8X),
  riffChunk("VP8L", enc("pixels!")),
  riffChunk("EXIF", enc("MM\0*GPSLatitude 48.1486")),
  riffChunk("XMP ", enc("<x:xmpmeta/>")),
);

describe("the format is read from the first bytes", () => {
  it("knows PNG, JPEG and WebP", () => {
    expect(sniffPortrait(PNG)).toBe("image/png");
    expect(sniffPortrait(JPEG)).toBe("image/jpeg");
    expect(sniffPortrait(WEBP)).toBe("image/webp");
  });

  it("refuses everything else, whatever it would be called", () => {
    for (const other of [
      enc("GIF89a\x01\0\x01\0"),
      enc('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
      enc("<!doctype html><title>portrait.png</title>"),
      enc("%PDF-1.7"),
      bytes(enc("RIFF"), u32le(4), enc("WAVE")),
    ]) {
      const admitted = admitPortrait(other);
      expect(admitted.ok).toBe(false);
      if (!admitted.ok)
        expect(admitted.reason).toBe("Only a PNG, JPEG or WebP image can be a portrait.");
    }
  });

  it("refuses an empty file in words", () => {
    expect(admitPortrait(new Uint8Array(0))).toEqual({ ok: false, reason: "The file is empty." });
  });
});

describe("at most 2 MB", () => {
  it("refuses one byte over, before the structure is read", () => {
    const over = new Uint8Array(PORTRAIT_MAX_BYTES + 1);
    over.set(JPEG.subarray(0, 3));
    expect(admitPortrait(over)).toEqual({ ok: false, reason: TOO_LARGE });
  });

  it("reads exactly 2 MB, and judges it on what it is", () => {
    const padded = new Uint8Array(PORTRAIT_MAX_BYTES);
    padded.set(PNG);
    // A whole PNG, then zeros after IEND: kept, the zeros dropped.
    const admitted = admitPortrait(padded);
    expect(admitted.ok).toBe(true);
    if (admitted.ok) expect(admitted.bytes.length).toBeLessThan(PNG.length);
  });
});

describe("the metadata is cut out", () => {
  it("PNG: text and EXIF chunks and whatever follows IEND go; the picture stays", () => {
    const admitted = admitPortrait(PNG);
    expect(admitted.ok).toBe(true);
    if (!admitted.ok) return;
    const kept = admitted.bytes;
    for (const gone of ["tEXt", "eXIf", "iTXt", "GPS", "taken at home", "xmpmeta"]) {
      expect(has(kept, gone), gone).toBe(false);
    }
    for (const stays of ["IHDR", "IDAT", "IEND", "pixels"])
      expect(has(kept, stays), stays).toBe(true);
    expect(sniffPortrait(kept)).toBe("image/png");
  });

  it("JPEG: APP1–APP15 and COM go; APP0, the tables and the scan stay", () => {
    const admitted = admitPortrait(JPEG);
    expect(admitted.ok).toBe(true);
    if (!admitted.ok) return;
    const kept = admitted.bytes;
    for (const gone of ["Exif", "GPS", "ICC_PROFILE", "shot on a phone"]) {
      expect(has(kept, gone), gone).toBe(false);
    }
    expect(has(kept, "JFIF")).toBe(true);
    expect(has(kept, "scan")).toBe(true);
    expect([...kept.subarray(-2)]).toEqual([0xff, 0xd9]);
    expect(kept.length).toBe(JPEG.length - (2 + 2 + 25) - (2 + 2 + 18) - (2 + 2 + 15));
  });

  it("JPEG: nothing after the first EOI is kept — a second image's EXIF, a motion photo", () => {
    const appended = bytes(
      JPEG,
      [0xff, 0xd8],
      segment(0xe1, enc("Exif\0\0GPSLatitude 48.1486")),
      segment(0xda, new Uint8Array(10)),
      enc("second"),
      [0xff, 0xd9],
      enc("MotionPhoto_Data ftyp ©xyz+48.1486+017.1077/"),
    );
    const admitted = admitPortrait(appended);
    expect(admitted.ok).toBe(true);
    if (!admitted.ok) return;
    for (const gone of ["GPS", "second", "MotionPhoto", "xyz"]) {
      expect(has(admitted.bytes, gone), gone).toBe(false);
    }
    // Exactly what the same JPEG without the appendix keeps.
    const plain = admitPortrait(JPEG);
    expect(plain.ok && Buffer.from(admitted.bytes).equals(Buffer.from(plain.bytes))).toBe(true);
  });

  it("JPEG: APPn and COM between progressive scans go; the coded data stays, stuffing and restarts too", () => {
    const coded = bytes(enc("scan1"), [0xff, 0x00], enc("x"), [0xff, 0xd3], enc("y"));
    const progressive = bytes(
      [0xff, 0xd8],
      segment(0xdb, new Uint8Array(65)),
      segment(0xda, new Uint8Array(10)),
      coded,
      segment(0xe1, enc("http://ns.adobe.com/xap/1.0/\0GPSLatitude 48.1486")),
      segment(0xfe, enc("between the scans")),
      [0xff, 0xff], // a fill byte before the next marker
      segment(0xda, new Uint8Array(10)),
      enc("scan2"),
      [0xff, 0xd9],
    );
    const admitted = admitPortrait(progressive);
    expect(admitted.ok).toBe(true);
    if (!admitted.ok) return;
    const kept = admitted.bytes;
    for (const gone of ["GPS", "adobe", "between the scans"])
      expect(has(kept, gone), gone).toBe(false);
    expect(Buffer.from(kept).includes(Buffer.from(coded))).toBe(true);
    expect(has(kept, "scan2")).toBe(true);
    expect([...kept.subarray(-2)]).toEqual([0xff, 0xd9]);
  });

  it("JPEG: a scan that never ends is not a whole image", () => {
    const open = bytes([0xff, 0xd8], segment(0xda, new Uint8Array(10)), enc("scan"));
    expect(admitPortrait(open).ok).toBe(false);
  });

  it("PNG and WebP keep only what draws the picture: the older exIf, C2PA, tIME go", () => {
    const png = admitPortrait(
      bytes(
        [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
        pngChunk("IHDR", new Uint8Array(13)),
        pngChunk("exIf", enc("MM\0*GPSLatitude 48.1486")),
        pngChunk("caBX", enc("c2pa stds.exif GPSLatitude")),
        pngChunk("tIME", new Uint8Array(7)),
        pngChunk("pHYs", new Uint8Array(9)),
        pngChunk("IDAT", enc("pixels")),
        pngChunk("IEND", new Uint8Array(0)),
      ),
    );
    expect(png.ok).toBe(true);
    if (png.ok) {
      for (const gone of ["exIf", "caBX", "c2pa", "GPS", "tIME"])
        expect(has(png.bytes, gone), gone).toBe(false);
      for (const stays of ["IHDR", "pHYs", "IDAT", "IEND"])
        expect(has(png.bytes, stays), stays).toBe(true);
    }

    const webpAdmitted = admitPortrait(
      webp(
        riffChunk("VP8X", VP8X),
        riffChunk("VP8L", enc("pixels!")),
        riffChunk("C2PA", enc("c2pa stds.exif GPSLatitude")),
        riffChunk("priv", enc("GPS")),
      ),
    );
    expect(webpAdmitted.ok).toBe(true);
    if (webpAdmitted.ok) {
      for (const gone of ["C2PA", "c2pa", "priv", "GPS"])
        expect(has(webpAdmitted.bytes, gone), gone).toBe(false);
      expect(has(webpAdmitted.bytes, "VP8L")).toBe(true);
    }
  });

  it("WebP: EXIF and XMP chunks go, VP8X stops announcing them, RIFF says the new size", () => {
    const admitted = admitPortrait(WEBP);
    expect(admitted.ok).toBe(true);
    if (!admitted.ok) return;
    const kept = admitted.bytes;
    for (const gone of ["EXIF", "XMP ", "GPS", "xmpmeta"])
      expect(has(kept, gone), gone).toBe(false);
    expect(has(kept, "VP8L")).toBe(true);
    const view = new DataView(kept.buffer, kept.byteOffset, kept.byteLength);
    expect(view.getUint32(4, true)).toBe(kept.length - 8);
    // VP8X's flags: ICC (0x20) kept, EXIF (0x08) and XMP (0x04) cleared.
    expect(kept[20]).toBe(0x20);
  });

  it("refuses a file that starts like an image and does not walk", () => {
    const truncated = PNG.subarray(0, 40);
    const notWhole = admitPortrait(truncated);
    expect(notWhole.ok).toBe(false);
    if (!notWhole.ok)
      expect(notWhole.reason).toMatch(/begins like a PNG image but is not a whole one/);

    expect(admitPortrait(bytes([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff])).ok).toBe(false);
    expect(admitPortrait(webp(riffChunk("EXIF", enc("GPS")))).ok, "a WebP with no picture").toBe(
      false,
    );
  });
});
