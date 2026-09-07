import { describe, expect, it } from "vitest";
import { columnIndex, readWorkbookRows, unzipEntries } from "../src/xlsx";
import { workbook, zip } from "./support/workbook";

/**
 * The workbook reader, against the format rather than against a library.
 *
 * What must hold: every way a text cell can be stored reads back as the
 * same text; numbers and booleans read as what a person sees; a sparse row
 * keeps its column positions; and anything that is not a workbook this
 * reader accepts is null, never an empty sheet.
 */

const ROWS = [
  ["Deal ID", "Status ID", "Lifecycle ID", "Main Unit ID"],
  ["1001", "1", "17", "A-101"],
  ["1002", "3", null, "B-202"],
  [2003, true, "x", ""],
];

describe("readWorkbookRows", () => {
  it.each(["shared", "inline", "mixed"] as const)("reads %s text cells", (mode) => {
    expect(readWorkbookRows(workbook(ROWS, mode))).toEqual([
      ["Deal ID", "Status ID", "Lifecycle ID", "Main Unit ID"],
      ["1001", "1", "17", "A-101"],
      ["1002", "3", "", "B-202"],
      ["2003", "TRUE", "x", ""],
    ]);
  });

  it("reads a stored archive as well as a deflated one", () => {
    expect(readWorkbookRows(workbook(ROWS, "shared", "store"))?.[1]).toEqual([
      "1001",
      "1",
      "17",
      "A-101",
    ]);
  });

  it("keeps a sparse row's columns in place", () => {
    const rows = readWorkbookRows(
      workbook([
        ["a", null, null, "d"],
        [null, "b"],
      ]),
    );
    expect(rows).toEqual([
      ["a", "", "", "d"],
      ["", "b"],
    ]);
  });

  it("is null for bytes that are not a workbook", () => {
    expect(readWorkbookRows(Buffer.from("PK is not enough"))).toBeNull();
    expect(readWorkbookRows(Buffer.from("<export/>"))).toBeNull();
    expect(readWorkbookRows(new Uint8Array(0))).toBeNull();
    /* A ZIP with no workbook inside. */
    expect(readWorkbookRows(zip([["readme.txt", "hello"]]))).toBeNull();
  });

  it("refuses an entry compressed with a method it does not know", () => {
    const archive = zip([["xl/workbook.xml", "<workbook/>"]]);
    /* Rewrite the local and central method fields to 12 (bzip2). */
    archive.writeUInt16LE(12, 8);
    const central = archive.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    archive.writeUInt16LE(12, central + 10);
    expect(unzipEntries(archive)).toBeNull();
  });
});

describe("columnIndex", () => {
  it("turns a cell reference into a zero-based column", () => {
    expect(columnIndex("A1")).toBe(0);
    expect(columnIndex("Z9")).toBe(25);
    expect(columnIndex("AA12")).toBe(26);
    expect(columnIndex("ab3")).toBe(27);
    expect(columnIndex("12")).toBeNull();
  });
});
