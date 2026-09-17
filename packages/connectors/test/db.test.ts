import { describe, expect, it } from "vitest";
import {
  CATALOGUE_FACADES,
  CatalogueFacadeError,
  postgrestCatalogueDb,
  sqlCatalogueDb,
} from "../src/db";

/**
 * The PostgREST adapter's request shapes, with no network: each method is one
 * POST to `/rest/v1/rpc/<façade>` with the SQL parameter names spelled out,
 * and a failure carries a façade name and a status and never a body.
 */

interface Seen {
  readonly url: string;
  readonly init: RequestInit;
}

function fakeFetch(
  answer: unknown,
  status = 200,
): { seen: Seen[]; fetch: (url: string, init: RequestInit) => Promise<Response> } {
  const seen: Seen[] = [];
  return {
    seen,
    fetch: async (url, init) => {
      seen.push({ url, init });
      return new Response(status === 204 ? null : JSON.stringify(answer), {
        status,
        headers: { "content-type": "application/json" },
      });
    },
  };
}

/**
 * A PostgREST that holds `all` and never answers more than `cap` rows, whatever
 * `limit` asks for — which is what its `max-rows` does, silently.
 */
function pagedFetch(
  all: readonly unknown[],
  cap: number,
): { seen: string[]; fetch: (url: string, init: RequestInit) => Promise<Response> } {
  const seen: string[] = [];
  return {
    seen,
    fetch: async (url) => {
      seen.push(url);
      const query = new URL(url).searchParams;
      const offset = Number(query.get("offset") ?? "0");
      const limit = Math.min(Number(query.get("limit") ?? String(cap)), cap);
      return new Response(JSON.stringify(all.slice(offset, offset + limit)), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  };
}

const PROJECT = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

describe("postgrestCatalogueDb", () => {
  it("posts the façade's own parameter names and both key headers", async () => {
    const f = fakeFetch(true);
    const db = postgrestCatalogueDb({
      url: "https://abc.supabase.co/",
      key: "sb_secret",
      fetch: f.fetch,
    });
    expect(await db.connectorConfigSet("acct", PROJECT, "lomnio", { currency: "CZK" }, true)).toBe(
      true,
    );

    const [request] = f.seen;
    expect(request?.url).toBe("https://abc.supabase.co/rest/v1/rpc/observer_connector_config_set");
    const headers = request?.init.headers as Record<string, string>;
    expect(headers["apikey"]).toBe("sb_secret");
    expect(headers["Authorization"]).toBe("Bearer sb_secret");
    expect(JSON.parse(String(request?.init.body))).toEqual({
      p_account: "acct",
      p_project: PROJECT,
      p_connector: "lomnio",
      p_config: { currency: "CZK" },
      p_enabled: true,
    });
  });

  it("reads a table façade as rows and a scalar façade as a value", async () => {
    const rows = pagedFetch(
      [{ code: "A-1", unit: { code: "A-1" }, fetched_at: "2026-09-07T10:00:00.000Z" }],
      1000,
    );
    const current = await postgrestCatalogueDb({
      url: "https://x.supabase.co",
      key: "k",
      fetch: rows.fetch,
    }).catalogueCurrent("acct", PROJECT, "realpad");
    expect(current.map((r) => r.code)).toEqual(["A-1"]);

    const id = fakeFetch(42);
    const recorded = await postgrestCatalogueDb({
      url: "https://x.supabase.co",
      key: "k",
      fetch: id.fetch,
    }).catalogueSyncRecord("acct", PROJECT, "realpad", {
      outcome: "ok",
      fetched: 3,
      added: 3,
      changed: 0,
      withdrawn: 0,
      unknownStatuses: [],
      retryAfterSeconds: null,
      detail: "",
    });
    expect(recorded).toBe(42);
    expect(JSON.parse(String(id.seen[0]?.init.body))).toMatchObject({
      p_outcome: "ok",
      p_fetched: 3,
      p_unknown: [],
    });
  });

  /*
   * THE PROJECT WITH MORE THAN A THOUSAND UNITS. PostgREST cuts at `max-rows` and
   * says nothing; read in one request, 2300 units came back as the thousand that
   * sorted first and every figure over the catalogue was computed on those.
   */
  for (const cap of [1000, 300]) {
    it(`reads every unit when the server cuts each answer at ${String(cap)}`, async () => {
      const units = Array.from({ length: 2300 }, (_, i) => ({
        code: `U-${String(i).padStart(4, "0")}`,
        unit: {},
        fetched_at: "2026-09-07T10:00:00.000Z",
      }));
      const server = pagedFetch(units, cap);
      const current = await postgrestCatalogueDb({
        url: "https://x.supabase.co",
        key: "k",
        fetch: server.fetch,
      }).catalogueCurrent("acct", PROJECT, "realpad");

      expect(current.map((r) => r.code)).toEqual(units.map((u) => u.code));
      /* Ordered explicitly, asked for a page, offset by what ARRIVED, and ended by an empty page. */
      expect(server.seen[0]).toBe(
        "https://x.supabase.co/rest/v1/rpc/observer_catalogue_current?order=code&limit=1000&offset=0",
      );
      expect(server.seen[1]).toContain(`offset=${String(cap)}`);
      expect(server.seen).toHaveLength(Math.ceil(2300 / cap) + 1);
    });
  }

  it("names the façade and the status on refusal, and nothing from the body", async () => {
    const f = fakeFetch({ message: "secret material here: sb_secret" }, 401);
    const db = postgrestCatalogueDb({
      url: "https://x.supabase.co",
      key: "sb_secret",
      fetch: f.fetch,
    });
    await expect(db.connectorCredentialRead("acct", PROJECT, "realpad")).rejects.toSatisfy(
      (error: unknown) => {
        expect(error).toBeInstanceOf(CatalogueFacadeError);
        const e = error as CatalogueFacadeError;
        expect(e.facade).toBe("observer_connector_credential_read");
        expect(e.status).toBe(401);
        expect(e.message).not.toContain("secret material");
        return true;
      },
    );
  });

  it("answers null from an empty apply, which is what a foreign project produces", async () => {
    const f = fakeFetch([]);
    const db = postgrestCatalogueDb({ url: "https://x.supabase.co", key: "k", fetch: f.fetch });
    expect(
      await db.catalogueApply("acct", PROJECT, "csv", "2026-09-07T10:00:00.000+00:00", [], []),
    ).toBeNull();
  });
});

describe("sqlCatalogueDb", () => {
  it("issues one statement per façade, with the parameters positional and the jsonb casts in the text", async () => {
    const statements: { sql: string; params: readonly unknown[] }[] = [];
    const db = sqlCatalogueDb(async (sql, params) => {
      statements.push({ sql, params });
      return { rows: [{ value: true }] };
    });
    await db.connectorConfigSet("acct", PROJECT, "csv", { a: 1 }, false);
    expect(statements[0]?.sql).toBe(
      "select public.observer_connector_config_set($1, $2, $3, $4::jsonb, $5) as value",
    );
    expect(statements[0]?.params).toEqual(["acct", PROJECT, "csv", '{"a":1}', false]);
  });

  it("names every façade the migration declares, once", () => {
    expect([...CATALOGUE_FACADES].sort()).toEqual([...new Set(CATALOGUE_FACADES)].sort());
    expect(CATALOGUE_FACADES).toHaveLength(9);
  });
});
