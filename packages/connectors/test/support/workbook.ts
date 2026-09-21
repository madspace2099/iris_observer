import { crc32, deflateRawSync } from "node:zlib";

/**
 * A WORKBOOK FOR THE TESTS, BUILT BY HAND.
 *
 * Just enough Office Open XML to be a real `.xlsx`: the content types, the
 * package relationships, a workbook with one sheet, its relationships, a
 * shared-string table and the sheet itself. Written here rather than with a
 * spreadsheet library so the fixture is text in the test and the reader is
 * proven against the format, not against another library's idea of it.
 *
 * `mode` picks how text cells are stored — through the shared-string table,
 * as inline strings, or a mix with one rich-text run — because REALPAD's
 * writer is not ours and a reader that copes with one form only is a reader
 * waiting to fail on the other.
 */

export type CellMode = "shared" | "inline" | "mixed";

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function columnName(index: number): string {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/** A cell value: text, or a number the sheet stores as a numeric cell. */
export type CellValue = string | number | boolean | null;

export function sheetXml(
  rows: readonly (readonly CellValue[])[],
  mode: CellMode,
): {
  readonly sheet: string;
  readonly shared: string;
} {
  const strings: string[] = [];
  const share = (text: string): number => {
    const at = strings.indexOf(text);
    if (at >= 0) return at;
    strings.push(text);
    return strings.length - 1;
  };
  const rowsXml = rows
    .map((row, r) => {
      const cells = row
        .map((value, c) => {
          if (value === null) return "";
          const ref = `${columnName(c)}${String(r + 1)}`;
          if (typeof value === "number") return `<c r="${ref}"><v>${String(value)}</v></c>`;
          if (typeof value === "boolean")
            return `<c r="${ref}" t="b"><v>${value ? "1" : "0"}</v></c>`;
          const inline = mode === "inline" || (mode === "mixed" && c % 2 === 1);
          if (inline) return `<c r="${ref}" t="inlineStr"><is><t>${escape(value)}</t></is></c>`;
          return `<c r="${ref}" t="s"><v>${String(share(value))}</v></c>`;
        })
        .join("");
      return `<row r="${String(r + 1)}">${cells}</row>`;
    })
    .join("");
  const items = strings
    .map((s, i) =>
      mode === "mixed" && i === 0
        ? `<si><r><t>${escape(s.slice(0, 1))}</t></r><r><t>${escape(s.slice(1))}</t></r></si>`
        : `<si><t xml:space="preserve">${escape(s)}</t></si>`,
    )
    .join("");
  return {
    sheet: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowsXml}</sheetData></worksheet>`,
    shared: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${String(strings.length)}" uniqueCount="${String(strings.length)}">${items}</sst>`,
  };
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>`;
const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
const WORKBOOK = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Deals" sheetId="1" r:id="rId1"/></sheets></workbook>`;
const WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>`;

/** A ZIP of the given entries, deflated or stored, with the central directory a reader needs. */
export function zip(
  entries: readonly (readonly [string, string])[],
  method: "deflate" | "store" = "deflate",
): Buffer {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of entries) {
    const nameBuf = Buffer.from(name, "utf8");
    const raw = Buffer.from(text, "utf8");
    const body = method === "deflate" ? deflateRawSync(raw) : raw;
    const sum = crc32(raw);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0, 6);
    lh.writeUInt16LE(method === "deflate" ? 8 : 0, 8);
    lh.writeUInt16LE(0, 10);
    lh.writeUInt16LE(0x21, 12);
    lh.writeUInt32LE(sum, 14);
    lh.writeUInt32LE(body.length, 18);
    lh.writeUInt32LE(raw.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    lh.writeUInt16LE(0, 28);
    local.push(lh, nameBuf, body);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0, 8);
    ch.writeUInt16LE(method === "deflate" ? 8 : 0, 10);
    ch.writeUInt16LE(0, 12);
    ch.writeUInt16LE(0x21, 14);
    ch.writeUInt32LE(sum, 16);
    ch.writeUInt32LE(body.length, 20);
    ch.writeUInt32LE(raw.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt16LE(0, 30);
    ch.writeUInt16LE(0, 32);
    ch.writeUInt16LE(0, 34);
    ch.writeUInt16LE(0, 36);
    ch.writeUInt32LE(0, 38);
    ch.writeUInt32LE(offset, 42);
    central.push(ch, nameBuf);
    offset += lh.length + nameBuf.length + body.length;
  }
  const directory = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(directory.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...local, directory, eocd]);
}

/** A complete `.xlsx` holding one sheet of the given rows. */
export function workbook(
  rows: readonly (readonly CellValue[])[],
  mode: CellMode = "shared",
  method: "deflate" | "store" = "deflate",
): Buffer {
  const { sheet, shared } = sheetXml(rows, mode);
  return zip(
    [
      ["[Content_Types].xml", CONTENT_TYPES],
      ["_rels/.rels", ROOT_RELS],
      ["xl/workbook.xml", WORKBOOK],
      ["xl/_rels/workbook.xml.rels", WORKBOOK_RELS],
      ["xl/sharedStrings.xml", shared],
      ["xl/worksheets/sheet1.xml", sheet],
    ],
    method,
  );
}
