/**
 * A minimal, deterministic ZIP writer.
 *
 * Every archive in this series before the current one was built with
 * PowerShell's `Compress-Archive`, which stores Windows path separators in the
 * entry names. APPNOTE 4.4.17.1 requires forward slashes, and `unzip` says so:
 * "appears to use backslashes as path separators". Most tools cope; some turn
 * the whole nested path into one flat filename, which is why `patches/` looked
 * wrong to a reviewer on a non-Windows machine.
 *
 * ## Determinism, and the bug that made the last claim false
 *
 * The previous writer built the DOS timestamp from `getHours()` and friends —
 * LOCAL-TIME accessors. The same commit therefore produced different archive
 * bytes under UTC, Europe/Budapest and America/New_York, while the file it was
 * written into claimed the output was reproducible. It reads UTC now, so the
 * bytes depend on the commit and nothing else. `pnpm release:package --verify`
 * proves it by building under three zones and comparing.
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { deflateRawSync, crc32 } from "node:zlib";

/** Every file under `dir`, sorted, so entry order never depends on the OS. */
export function walk(dir: string): readonly string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir).sort()) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else out.push(path);
  }
  return out;
}

/**
 * Write `dir` to `out` as a ZIP, timestamped from `when` in UTC.
 *
 * Returns the entry names actually stored, in order.
 */
export function writeZip(dir: string, out: string, when: Date): readonly string[] {
  /* UTC accessors. A local-time reading here is what broke reproducibility. */
  const dosTime =
    ((when.getUTCHours() << 11) | (when.getUTCMinutes() << 5) | (when.getUTCSeconds() >> 1)) &
    0xffff;
  const dosDate =
    (((when.getUTCFullYear() - 1980) << 9) | ((when.getUTCMonth() + 1) << 5) | when.getUTCDate()) &
    0xffff;

  const local: Buffer[] = [];
  const central: Buffer[] = [];
  const names: string[] = [];
  let offset = 0;

  for (const path of walk(dir)) {
    const name = relative(dir, path).split(sep).join("/"); /* forward slashes, always */
    const nameBuf = Buffer.from(name, "utf8");
    const raw = readFileSync(path);
    const deflated = deflateRawSync(raw, { level: 9 });
    /* Store rather than deflate when deflating would make it bigger. */
    const useDeflate = deflated.length < raw.length;
    const body = useDeflate ? deflated : raw;
    const method = useDeflate ? 8 : 0;
    const sum = crc32(raw);

    const lfh = Buffer.alloc(30);
    lfh.writeUInt32LE(0x04034b50, 0);
    lfh.writeUInt16LE(20, 4);
    lfh.writeUInt16LE(0, 6);
    lfh.writeUInt16LE(method, 8);
    lfh.writeUInt16LE(dosTime, 10);
    lfh.writeUInt16LE(dosDate, 12);
    lfh.writeUInt32LE(sum, 14);
    lfh.writeUInt32LE(body.length, 18);
    lfh.writeUInt32LE(raw.length, 22);
    lfh.writeUInt16LE(nameBuf.length, 26);
    lfh.writeUInt16LE(0, 28);
    local.push(lfh, nameBuf, body);

    const cdh = Buffer.alloc(46);
    cdh.writeUInt32LE(0x02014b50, 0);
    cdh.writeUInt16LE(0x031e, 4); /* made by UNIX, spec 3.0 */
    cdh.writeUInt16LE(20, 6);
    cdh.writeUInt16LE(0, 8);
    cdh.writeUInt16LE(method, 10);
    cdh.writeUInt16LE(dosTime, 12);
    cdh.writeUInt16LE(dosDate, 14);
    cdh.writeUInt32LE(sum, 16);
    cdh.writeUInt32LE(body.length, 20);
    cdh.writeUInt32LE(raw.length, 24);
    cdh.writeUInt16LE(nameBuf.length, 28);
    cdh.writeUInt16LE(0, 30);
    cdh.writeUInt16LE(0, 32);
    cdh.writeUInt16LE(0, 34);
    cdh.writeUInt16LE(0, 36);
    cdh.writeUInt32LE((0o100644 * 65536) >>> 0, 38); /* regular file, rw-r--r-- */
    cdh.writeUInt32LE(offset, 42);
    central.push(cdh, nameBuf);

    names.push(name);
    offset += lfh.length + nameBuf.length + body.length;
  }

  const cd = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(names.length, 8);
  eocd.writeUInt16LE(names.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  writeFileSync(out, Buffer.concat([...local, cd, eocd]));
  return names;
}
