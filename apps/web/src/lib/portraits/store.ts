import "server-only";

import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

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
 * An id that can be a file name: letters, digits, `_` and `-`, no dot and no
 * separator, so no id can climb out of its directory. Read-model ids
 * (`tnt_sharkdev001`, `agt_sharklena01`) and control-plane uuids both pass.
 */
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;

export function portraitPath(root: string, key: PortraitKey): string {
  if (!SAFE_ID.test(key.tenantId) || !SAFE_ID.test(key.agentId)) {
    throw new Error("portrait: an id that cannot be a file name");
  }
  return join(root, key.tenantId, key.agentId);
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
      await mkdir(join(root, key.tenantId), { recursive: true });
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
