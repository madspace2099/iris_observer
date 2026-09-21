import { inflateRawSync } from "node:zlib";
import { XMLParser } from "fast-xml-parser";

/**
 * A WORKBOOK, READ AS ROWS OF TEXT.
 *
 * REALPAD's Data Takeout delivers deals only as an Excel file (ADR-0036), so
 * one adapter has to open one. This is the narrowest reader that does: the
 * ZIP container (stored and deflated entries, no ZIP64, no encryption), the
 * workbook's first sheet, its shared strings, and every cell as the text a
 * person would see in the cell — the SpreadsheetML that Office Open XML
 * (ECMA-376) fixes, nothing REALPAD-specific.
 *
 * It answers with rows of strings or with null. A workbook it cannot read is
 * a refusal upstream, never an empty snapshot that would withdraw every deal.
 * No value is interpreted here: a number stays the digits the file carries,
 * a date cell stays its serial, and what a column means is the adapter's
 * business, under the ids a person configured.
 */

/* --- the ZIP container ---------------------------------------------------- */

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_CENTRAL = 0x06054b50;
const END_OF_CENTRAL_64 = 0x06064b50;

/** The entries of a ZIP archive by name, or null when it is not one this reader accepts. */
export function unzipEntries(bytes: Uint8Array): Map<string, Uint8Array> | null {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  /* The end-of-central-directory record sits in the last 64 KiB; search backwards. */
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i -= 1) {
    if (buf.readUInt32LE(i) === END_OF_CENTRAL) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const entries = buf.readUInt16LE(eocd + 10);
  const directoryOffset = buf.readUInt32LE(eocd + 16);
  if (entries === 0xffff || directoryOffset === 0xffffffff) return null; /* ZIP64: refused */
  if (eocd >= 20 && buf.readUInt32LE(eocd - 20) === END_OF_CENTRAL_64) return null;

  const out = new Map<string, Uint8Array>();
  let at = directoryOffset;
  for (let n = 0; n < entries; n += 1) {
    if (at + 46 > buf.length || buf.readUInt32LE(at) !== CENTRAL_HEADER) return null;
    const flags = buf.readUInt16LE(at + 8);
    const method = buf.readUInt16LE(at + 10);
    const compressedSize = buf.readUInt32LE(at + 20);
    const nameLength = buf.readUInt16LE(at + 28);
    const extraLength = buf.readUInt16LE(at + 30);
    const commentLength = buf.readUInt16LE(at + 32);
    const localOffset = buf.readUInt32LE(at + 42);
    const name = buf.subarray(at + 46, at + 46 + nameLength).toString("utf8");
    at += 46 + nameLength + extraLength + commentLength;

    if ((flags & 0x1) !== 0) return null; /* encrypted: refused */
    if (localOffset + 30 > buf.length || buf.readUInt32LE(localOffset) !== LOCAL_HEADER) {
      return null;
    }
    const localNameLength = buf.readUInt16LE(localOffset + 26);
    const localExtraLength = buf.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const end = start + compressedSize;
    if (end > buf.length) return null;
    const body = buf.subarray(start, end);
    if (method === 0) out.set(name, body);
    else if (method === 8) {
      try {
        out.set(name, inflateRawSync(body));
      } catch {
        return null;
      }
    } else return null;
  }
  return out;
}

/* --- SpreadsheetML ---------------------------------------------------------- */

const ARRAY_TAGS = new Set(["sheet", "Relationship", "si", "row", "c", "r", "t"]);

function parser(): XMLParser {
  return new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: false,
    /* Tags only: a cell's `r` attribute must not become an array because a rich-text `<r>` run does. */
    isArray: (name, _path, _leaf, isAttribute) => !isAttribute && ARRAY_TAGS.has(name),
  });
}

interface TextNode {
  readonly "#text"?: string;
}
type TextLike = string | TextNode | undefined;

/** The text of a `<t>` element, whether the parser gave a string or a node. */
function textOf(node: TextLike): string {
  if (node === undefined) return "";
  return typeof node === "string" ? node : (node["#text"] ?? "");
}

interface RichRun {
  readonly t?: readonly TextLike[];
}
interface SharedItem {
  readonly t?: readonly TextLike[];
  readonly r?: readonly RichRun[];
}

/** The shared-string table: plain items and rich-text runs joined in order. */
function sharedStrings(xml: string | null): readonly string[] {
  if (xml === null) return [];
  const doc = parser().parse(xml) as { sst?: { si?: readonly SharedItem[] } };
  return (doc.sst?.si ?? []).map((si) => {
    const plain = (si.t ?? []).map(textOf).join("");
    const rich = (si.r ?? []).map((run) => (run.t ?? []).map(textOf).join("")).join("");
    return plain + rich;
  });
}

interface Cell {
  readonly r?: string;
  readonly t?: string;
  readonly v?: TextLike;
  readonly is?: { readonly t?: readonly TextLike[] };
}
interface Row {
  readonly c?: readonly Cell[];
}

/** `B` → 1, `AA` → 26: the column of a cell reference, zero-based. */
export function columnIndex(reference: string): number | null {
  const letters = /^([A-Z]+)\d*$/.exec(reference.toUpperCase())?.[1];
  if (letters === undefined) return null;
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function cellText(cell: Cell, shared: readonly string[]): string {
  switch (cell.t) {
    case "s": {
      const index = Number(textOf(cell.v));
      return Number.isInteger(index) ? (shared[index] ?? "") : "";
    }
    case "inlineStr":
      return (cell.is?.t ?? []).map(textOf).join("");
    case "b":
      return textOf(cell.v) === "1" ? "TRUE" : "FALSE";
    default:
      return textOf(cell.v);
  }
}

/** The first worksheet's path inside the archive, through the workbook's relationships. */
function firstSheetPath(entries: Map<string, Uint8Array>): string | null {
  const workbook = read(entries, "xl/workbook.xml");
  const rels = read(entries, "xl/_rels/workbook.xml.rels");
  if (workbook === null) return null;
  const wb = parser().parse(workbook) as {
    workbook?: { sheets?: { sheet?: readonly { "r:id"?: string }[] } };
  };
  const relId = wb.workbook?.sheets?.sheet?.[0]?.["r:id"];
  if (relId !== undefined && rels !== null) {
    const doc = parser().parse(rels) as {
      Relationships?: { Relationship?: readonly { Id?: string; Target?: string }[] };
    };
    const target = doc.Relationships?.Relationship?.find((r) => r.Id === relId)?.Target;
    if (target !== undefined) {
      return target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
    }
  }
  return entries.has("xl/worksheets/sheet1.xml") ? "xl/worksheets/sheet1.xml" : null;
}

function read(entries: Map<string, Uint8Array>, name: string): string | null {
  const bytes = entries.get(name);
  return bytes === undefined ? null : Buffer.from(bytes).toString("utf8");
}

/**
 * Every row of the first worksheet as text cells, in sheet order, gaps
 * filled with empty strings so a column index means the same thing on
 * every row. Null when the bytes are not a workbook this reader accepts.
 */
export function readWorkbookRows(bytes: Uint8Array): string[][] | null {
  const entries = unzipEntries(bytes);
  if (entries === null) return null;
  const sheetPath = firstSheetPath(entries);
  if (sheetPath === null) return null;
  const sheetXml = read(entries, sheetPath);
  if (sheetXml === null) return null;
  const shared = sharedStrings(read(entries, "xl/sharedStrings.xml"));

  let doc: { worksheet?: { sheetData?: { row?: readonly Row[] } | string } };
  try {
    doc = parser().parse(sheetXml) as typeof doc;
  } catch {
    return null;
  }
  const sheetData = doc.worksheet?.sheetData;
  if (sheetData === undefined) return null;
  if (typeof sheetData === "string") return [];

  const rows: string[][] = [];
  for (const row of sheetData.row ?? []) {
    const cells: string[] = [];
    let next = 0;
    for (const cell of row.c ?? []) {
      const at = cell.r === undefined ? next : (columnIndex(cell.r) ?? next);
      while (cells.length < at) cells.push("");
      cells[at] = cellText(cell, shared);
      next = at + 1;
    }
    rows.push(cells);
  }
  return rows;
}
