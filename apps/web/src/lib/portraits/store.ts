import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { localControlPlaneEnabled, observerLocalDirectory } from "@/lib/sources/local-db";

/**
 * WHERE A FACE IS KEPT (ADR-0054): APART FROM EVERYTHING BEHAVIOURAL.
 *
 * A portrait is personal data. It never enters an event payload or a read
 * model (CLAUDE.md non-negotiable 4); it is kept here, by tenant and agent id,
 * and read back only through the authenticated route that serves it.
 *
 * The port has one adapter today: files beside the local control plane's
 * database (`OBSERVER_LOCAL_STATE_DIR`, `.observer-local/demo` on the demo), so
 * `rm -rf` of that directory resets portraits with everything else. A hosted
 * deployment has no local plane and therefore no store: uploading is refused
 * in words and every surface draws initials. Supabase Storage behind RLS is the
 * hosted adapter, a later milestone; nothing of it is built here.
 */
export interface PortraitKey {
  readonly tenantId: string;
  readonly agentId: string;
}

export interface PortraitStore {
  read(key: PortraitKey): Promise<Uint8Array | null>;
  /** Changes whenever the portrait does, for the image's address; null when there is none. */
  version(key: PortraitKey): Promise<string | null>;
  write(key: PortraitKey, bytes: Uint8Array): Promise<void>;
  /** Deletes the file. False when there was nothing to delete. */
  remove(key: PortraitKey): Promise<boolean>;
}

/**
 * A file name for an id: the SHA-256 of its UTF-8 bytes, in lowercase hex.
 *
 * The showroom names an agent with any string of 1–128 characters (the UE5
 * contract's `agent_id`): braces, dots, `@`, spaces, any script. Hashed, every
 * one of them is a name, none can climb out of its directory, and two ids that
 * differ only in case stay two files on a case-insensitive disk (NTFS, the
 * demo machine's).
 */
const fileName = (id: string) => createHash("sha256").update(id, "utf8").digest("hex");

export function portraitPath(root: string, key: PortraitKey): string {
  return join(root, fileName(key.tenantId), fileName(key.agentId));
}

const missing = (error: unknown) => (error as { code?: string }).code === "ENOENT";

/** The file adapter: one file per tenant and agent, written whole or not at all. */
export function filePortraitStore(root: string): PortraitStore {
  return {
    async read(key) {
      try {
        return new Uint8Array(await readFile(portraitPath(root, key)));
      } catch (error) {
        if (missing(error)) return null;
        throw error;
      }
    },
    async version(key) {
      try {
        return Math.trunc((await stat(portraitPath(root, key))).mtimeMs).toString(36);
      } catch (error) {
        if (missing(error)) return null;
        throw error;
      }
    },
    async write(key, bytes) {
      const path = portraitPath(root, key);
      await mkdir(dirname(path), { recursive: true });
      const partial = `${path}.${randomBytes(6).toString("hex")}.part`;
      await writeFile(partial, bytes);
      await rename(partial, path);
    },
    async remove(key) {
      const path = portraitPath(root, key);
      try {
        await stat(path);
      } catch (error) {
        if (missing(error)) return false;
        throw error;
      }
      await rm(path, { force: true });
      return true;
    },
  };
}

/** This server's store, or null where there is no local plane to keep one on. */
export function portraitStore(): PortraitStore | null {
  if (!localControlPlaneEnabled()) return null;
  return filePortraitStore(join(observerLocalDirectory(), "portraits"));
}

/** What every refusal on a deployment without a store says. */
export const NO_PORTRAIT_STORE =
  "Portraits are kept only on a local demonstration server for now. On this deployment every agent shows their initials.";
