import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PORTRAIT_CELLS } from "../../../test-support/access-matrix";
import { portraitRight } from "../src/lib/portraits/access";
import type * as StoreModule from "../src/lib/portraits/store";

/**
 * WHO MAY CHANGE A PORTRAIT, AND HOW IT IS SERVED (ADR-0054).
 *
 * Driven through the real route handler with the real accounts, the real
 * repository and a real file store in a temporary directory. Only the session
 * is stood in for (who is signed in), and whether this server has a store at
 * all — the hosted case.
 */

const state = vi.hoisted(() => ({
  accountId: "acct_clara" as string | null,
  dir: "",
  plane: true,
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, delete: () => undefined }),
  headers: async () => new Headers({ host: "localhost:3400" }),
}));
vi.mock("../src/lib/session", async () => {
  const accounts = await import("../src/lib/accounts");
  const account = () => (state.accountId === null ? null : accounts.accountById(state.accountId));
  return {
    SESSION_COOKIE: "observer_session",
    currentAccount: async () => account(),
    currentViewer: async () => {
      const found = account();
      return found === null ? null : accounts.viewerForAccount(found);
    },
  };
});
vi.mock("../src/lib/portraits/store", async (importOriginal) => {
  const actual = await importOriginal<typeof StoreModule>();
  return {
    ...actual,
    portraitStore: () => (state.plane ? actual.filePortraitStore(state.dir) : null),
  };
});

process.env["OBSERVER_DEMO_ACCOUNTS"] = "1";

const route =
  await import("../src/app/api/observer/portraits/[tenantSlug]/[projectSlug]/[agentId]/route");
const store = await vi.importActual<typeof StoreModule>("../src/lib/portraits/store");

/* A whole PNG carrying a location in an eXIf chunk. */
const chunk = (type: string, data: number[]) => [
  ...[0, 0, 0, data.length],
  ...Buffer.from(type, "latin1"),
  ...data,
  0,
  0,
  0,
  0,
];
const PNG = new Uint8Array([
  0x89,
  0x50,
  0x4e,
  0x47,
  0x0d,
  0x0a,
  0x1a,
  0x0a,
  ...chunk("IHDR", Array(13).fill(0)),
  ...chunk("eXIf", [...Buffer.from("GPSLatitude 48.1486", "latin1")]),
  ...chunk("IDAT", [1, 2, 3]),
  ...chunk("IEND", []),
]);
/* Another picture: the same header, other pixels. */
const PNG_OTHER = PNG.map((byte, i) => (i === PNG.length - 15 ? 9 : byte));

const SHARK = "tnt_sharkdev001";
const ORIGIN = "http://localhost:3400";

function call(
  method: "GET" | "PUT" | "DELETE",
  where: { tenantSlug: string; projectSlug: string; agentId: string },
  options: {
    body?: Uint8Array;
    origin?: string | null;
    length?: boolean;
    ifNoneMatch?: string;
  } = {},
): Promise<Response> {
  const headers = new Headers({ host: "localhost:3400" });
  const origin = options.origin === undefined ? ORIGIN : options.origin;
  if (origin !== null) headers.set("origin", origin);
  if (options.ifNoneMatch !== undefined) headers.set("if-none-match", options.ifNoneMatch);
  if (options.body !== undefined && options.length !== false) {
    headers.set("content-length", String(options.body.length));
  }
  const body =
    options.body === undefined
      ? null
      : options.length === false
        ? new ReadableStream({
            start(controller) {
              controller.enqueue(options.body);
              controller.close();
            },
          })
        : options.body;
  const request = new Request(
    `${ORIGIN}/api/observer/portraits/${where.tenantSlug}/${where.projectSlug}/${where.agentId}`,
    {
      method,
      headers,
      body,
      ...(options.length === false ? { duplex: "half" } : {}),
    } as RequestInit,
  );
  const handler = route[method];
  return handler(request, { params: Promise.resolve(where) });
}

const lena = { tenantSlug: "shark", projectSlug: "shark-residence", agentId: "agt_sharklena01" };
const fileOf = (tenantId: string, agentId: string) =>
  store.portraitPath(state.dir, { tenantId, agentId });

beforeEach(() => {
  state.dir = mkdtempSync(join(tmpdir(), "observer-portraits-"));
  state.plane = true;
  state.accountId = "acct_clara";
});
afterEach(() => {
  rmSync(state.dir, { recursive: true, force: true });
});

describe("the authorisation matrix", () => {
  it.each(PORTRAIT_CELLS.map((cell) => [`${cell.accountId} → ${cell.agentId}`, cell] as const))(
    "%s",
    async (_name, cell) => {
      const where = {
        tenantSlug: cell.tenantSlug,
        projectSlug: cell.projectSlug,
        agentId: cell.agentId,
      };
      const tenantId = cell.tenantSlug === "shark" ? SHARK : "tnt_demoalpha01";
      state.accountId = cell.accountId;

      // The first portrait, onto an empty store.
      const first = await call("PUT", where, { body: PNG });
      expect(first.status === 200, `${cell.note}: add the first`).toBe(cell.first);
      expect(existsSync(fileOf(tenantId, cell.agentId))).toBe(cell.first);

      // One already there: replace, then remove.
      await store.filePortraitStore(state.dir).write({ tenantId, agentId: cell.agentId }, PNG);
      const replace = await call("PUT", where, { body: PNG });
      expect(replace.status === 200, `${cell.note}: replace`).toBe(cell.right !== null);
      if (cell.right === null) expect([403, 404]).toContain(replace.status);
      const remove = await call("DELETE", where);
      expect(remove.status === 200, `${cell.note}: remove`).toBe(cell.right !== null);
      expect(existsSync(fileOf(tenantId, cell.agentId))).toBe(cell.right === null);
    },
  );

  it("refuses another tenant's agent as not found, never as forbidden", async () => {
    state.accountId = "acct_daniel";
    const elsewhere = {
      tenantSlug: "alpha",
      projectSlug: "ister-tower",
      agentId: "agt_martinkovac",
    };
    expect((await call("PUT", elsewhere, { body: PNG })).status).toBe(404);
    state.accountId = "acct_petra";
    expect((await call("GET", lena)).status).toBe(404);
  });

  it("knows only agents on the project's roster", async () => {
    const nobody = { ...lena, agentId: "agt_nobodyhere01" };
    expect((await call("PUT", nobody, { body: PNG })).status).toBe(404);
    expect((await call("DELETE", nobody)).status).toBe(404);
    expect(existsSync(fileOf(SHARK, "agt_nobodyhere01"))).toBe(false);
  });

  it("removes a portrait left behind by an agent who is on no roster now, and only that", async () => {
    const gone = { ...lena, agentId: "agt_leftlastyear" };
    await store.filePortraitStore(state.dir).write({ tenantId: SHARK, agentId: gone.agentId }, PNG);

    state.accountId = "acct_nora"; // a member: as if there were nothing there
    expect((await call("DELETE", gone)).status).toBe(404);
    expect(existsSync(fileOf(SHARK, gone.agentId))).toBe(true);

    state.accountId = "acct_clara";
    expect((await call("GET", gone)).status).toBe(404);
    expect((await call("PUT", gone, { body: PNG })).status).toBe(404);
    const removed = await call("DELETE", gone);
    expect(removed.status).toBe(200);
    expect(((await removed.json()) as { message: string }).message).toBe("Removed.");
    expect(existsSync(fileOf(SHARK, gone.agentId))).toBe(false);
  });

  it("gives the right on the tenant, so an agent the showroom names with no agency has an admin", () => {
    const clara = {
      role: "developer",
      agentId: null,
      companyName: "Shark Developments",
      companyRole: "admin",
    } as const;
    const tenant = { name: "Shark Developments" };
    // The UE5 roster carries an id and a name, never an organisation.
    expect(portraitRight(clara, tenant, "{9A2D7C44-1B3E-4F5A-8C6D-7E8F9A0B1C2D}", false)).toBe(
      "company_admin",
    );
    expect(
      portraitRight({ ...clara, companyName: "Shark Sales" }, tenant, "agt_x", false),
    ).toBeNull();
  });

  it("refuses a change not sent from this site's own page", async () => {
    expect((await call("PUT", lena, { body: PNG, origin: null })).status).toBe(403);
    expect((await call("PUT", lena, { body: PNG, origin: "http://localhost:3000" })).status).toBe(
      403,
    );
    expect((await call("DELETE", lena, { origin: "https://example.com" })).status).toBe(403);
    expect(existsSync(fileOf(SHARK, "agt_sharklena01"))).toBe(false);
  });

  it("answers a signed-out reader 401 on every method", async () => {
    state.accountId = null;
    for (const method of ["GET", "PUT", "DELETE"] as const) {
      expect((await call(method, lena, { body: method === "PUT" ? PNG : undefined })).status).toBe(
        401,
      );
    }
  });
});

describe("what is kept, and how it is served", () => {
  it("keeps the picture without its location, and serves it privately", async () => {
    expect((await call("PUT", lena, { body: PNG })).status).toBe(200);
    const kept = readFileSync(fileOf(SHARK, "agt_sharklena01"));
    expect(kept.includes(Buffer.from("GPS"))).toBe(false);
    expect(kept.includes(Buffer.from("IDAT"))).toBe(true);

    state.accountId = "acct_daniel"; // the agency's manager may see it, and not change it
    const served = await call("GET", lena);
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/png");
    // Kept by this browser alone, and never used without asking again (ADR-0054, 2026-10-23).
    expect(served.headers.get("cache-control")).toBe("private, no-cache");
    expect(served.headers.get("x-content-type-options")).toBe("nosniff");
    expect(Buffer.from(await served.arrayBuffer()).equals(kept)).toBe(true);
  });

  it("answers a copy still good with a bodiless 304, and only after the checks", async () => {
    expect((await call("PUT", lena, { body: PNG })).status).toBe(200);
    const tag = (await call("GET", lena)).headers.get("etag") ?? "";
    expect(tag).toMatch(/^"[A-Za-z0-9_-]+"$/);

    const again = await call("GET", lena, { ifNoneMatch: `W/${tag}` });
    expect(again.status).toBe(304);
    expect(again.headers.get("cache-control")).toBe("private, no-cache");
    expect(await again.text()).toBe("");

    // Replaced, the old copy is not good; signed out, there is no copy to confirm.
    expect((await call("PUT", lena, { body: PNG_OTHER })).status).toBe(200);
    expect((await call("GET", lena, { ifNoneMatch: tag })).status).toBe(200);
    state.accountId = null;
    expect((await call("GET", lena, { ifNoneMatch: tag })).status).toBe(401);
  });

  it("answers 404 where there is no portrait, and keeps no refusal", async () => {
    const refused = await call("GET", lena);
    expect(refused.status).toBe(404);
    expect(refused.headers.get("cache-control")).toBe("private, no-store");
  });

  it("refuses more than 2 MB, declared or streamed, and keeps nothing", async () => {
    const big = new Uint8Array(2 * 1024 * 1024 + 1);
    big.set(PNG);
    for (const length of [true, false]) {
      const response = await call("PUT", lena, { body: big, length });
      expect(response.status, `content-length ${length}`).toBe(413);
      expect(((await response.json()) as { message: string }).message).toBe(
        "A portrait can be at most 2 MB. Choose a smaller image.",
      );
    }
    expect(existsSync(fileOf(SHARK, "agt_sharklena01"))).toBe(false);
  });

  it("refuses what is not a PNG, JPEG or WebP, by its bytes", async () => {
    const svg = new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>");
    const response = await call("PUT", lena, { body: svg });
    expect(response.status).toBe(415);
    expect(existsSync(fileOf(SHARK, "agt_sharklena01"))).toBe(false);
  });

  it("removes the file itself", async () => {
    await call("PUT", lena, { body: PNG });
    expect(existsSync(fileOf(SHARK, "agt_sharklena01"))).toBe(true);
    const removed = await call("DELETE", lena);
    expect(((await removed.json()) as { message: string }).message).toBe(
      "Removed. Lena Fischer's initials show instead.",
    );
    expect(existsSync(fileOf(SHARK, "agt_sharklena01"))).toBe(false);
  });
});

describe("a deployment with no store", () => {
  it("refuses an upload in a plain sentence and serves nothing", async () => {
    state.plane = false;
    const refused = await call("PUT", lena, { body: PNG });
    expect(refused.status).toBe(503);
    expect(((await refused.json()) as { message: string }).message).toBe(store.NO_PORTRAIT_STORE);
    expect((await call("GET", lena)).status).toBe(404);
  });

  it("has a store only where the local control plane may open", () => {
    const env = process.env as Record<string, string | undefined>;
    const keys = ["OBSERVER_LOCAL_CONTROL_PLANE", "NODE_ENV", "OBSERVER_DEMO_LOCAL_PLANE"];
    const saved = keys.map((key) => [key, env[key]] as const);
    try {
      delete env["OBSERVER_LOCAL_CONTROL_PLANE"];
      expect(store.portraitStore()).toBeNull();

      env["OBSERVER_LOCAL_CONTROL_PLANE"] = "1";
      expect(store.portraitStore()).not.toBeNull();

      // A hosted build: production, no demonstration plane.
      env["NODE_ENV"] = "production";
      delete env["OBSERVER_DEMO_LOCAL_PLANE"];
      expect(store.portraitStore()).toBeNull();
    } finally {
      for (const [key, value] of saved) {
        if (value === undefined) delete env[key];
        else env[key] = value;
      }
    }
  });

  it("names every id the showroom may send, inside its directory, one file per id", async () => {
    const ids = [
      "agt_sharklena01",
      "{9A2D7C44-1B3E-4F5A-8C6D-7E8F9A0B1C2D}",
      "john.doe@shark-sales.example",
      "agent john",
      "€".repeat(128),
      "..",
      "../../etc/passwd",
      "agt\\x",
      "AGT_X",
      "agt_x",
    ];
    const paths = ids.map((agentId) => store.portraitPath("/root", { tenantId: SHARK, agentId }));
    for (const path of paths) {
      expect(relative("/root", path).startsWith(".."), path).toBe(false);
      expect(path).toMatch(/[0-9a-f]{64}[\\/][0-9a-f]{64}$/);
    }
    // Two ids that differ only in case are two files, on a disk that ignores case too.
    expect(new Set(paths.map((p) => p.toLowerCase())).size).toBe(ids.length);

    const files = store.filePortraitStore(state.dir);
    const brace = { tenantId: SHARK, agentId: ids[1] ?? "" };
    expect(await files.version(brace)).toBeNull();
    await files.write(brace, PNG);
    expect(Buffer.from((await files.read(brace)) ?? []).equals(Buffer.from(PNG))).toBe(true);
    expect(
      await files.read({ tenantId: SHARK, agentId: "{9a2d7c44-1b3e-4f5a-8c6d-7e8f9a0b1c2d}" }),
    ).toBeNull();
  });
});
