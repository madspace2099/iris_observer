import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { SalesWindow, SalesWindowSource } from "@observer/readmodels";

import { localControlPlaneEnabled, observerLocalDirectory } from "@/lib/sources/local-db";

import { parseSalesWindow } from "./access";

/**
 * WHERE A SALES WINDOW SET IN OBSERVER IS KEPT (ADR-0055).
 *
 * The same port and adapter as the portraits (ADR-0054): one JSON file per
 * project beside the local control plane's database
 * (`OBSERVER_LOCAL_STATE_DIR/plans/<sha256(projectId)>.json`), written to a
 * temporary name and renamed, so a window is whole or absent, and `rm -rf` of
 * that directory resets it with everything else. Where there is no local
 * plane (a hosted deployment) there is no store: the project's configured
 * window stands and a save is refused in words. A hosted store, a table behind
 * RLS by tenant, is a later milestone.
 */
export interface SalesWindowStore {
  read(projectId: string): Promise<SalesWindow | null>;
  write(projectId: string, window: SalesWindow): Promise<void>;
}

export function salesWindowPath(root: string, projectId: string): string {
  return join(root, `${createHash("sha256").update(projectId, "utf8").digest("hex")}.json`);
}

const missing = (error: unknown) => (error as { code?: string }).code === "ENOENT";

export function fileSalesWindowStore(root: string): SalesWindowStore {
  return {
    async read(projectId) {
      let text: string;
      try {
        text = await readFile(salesWindowPath(root, projectId), "utf8");
      } catch (error) {
        if (missing(error)) return null;
        throw error;
      }
      /* A file the form would refuse is no window at all: the configuration stands. */
      try {
        const stored = JSON.parse(text) as { startsOn?: unknown; sellOutBy?: unknown };
        const window = parseSalesWindow(stored.startsOn, stored.sellOutBy);
        return typeof window === "string" ? null : window;
      } catch {
        return null;
      }
    },
    async write(projectId, window) {
      const path = salesWindowPath(root, projectId);
      await mkdir(dirname(path), { recursive: true });
      const partial = `${path}.${randomBytes(6).toString("hex")}.part`;
      await writeFile(partial, JSON.stringify(window));
      await rename(partial, path);
    },
  };
}

/** This server's store, or null where there is no local plane to keep one on. */
export function salesWindowStore(): SalesWindowStore | null {
  if (!localControlPlaneEnabled()) return null;
  return fileSalesWindowStore(join(observerLocalDirectory(), "plans"));
}

/** The repository's seam: what was set here, or nothing. */
export const liveSalesWindowSource: SalesWindowSource = {
  async windowFor(projectId) {
    return (await salesWindowStore()?.read(projectId)) ?? null;
  },
};

/** What every save on a deployment without a store is told. */
export const NO_PLAN_STORE =
  "Sales dates set here are kept only on a local demonstration server for now. On this deployment the project's configured dates stand, and nothing was saved.";
