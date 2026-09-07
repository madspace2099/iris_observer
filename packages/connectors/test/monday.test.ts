import { describe, expect, it } from "vitest";
import { ProjectIdSchema, TenantIdSchema } from "@observer/contracts";
import type { HttpRequest, HttpResponse } from "../src/http";
import { mondayFetchSnapshot, type MondayConfig } from "../src/monday";

const CONFIG: MondayConfig = {
  boardId: "123456",
  columns: {
    code: "name",
    building: "text_1",
    rooms: "numbers_1",
    priceWithVat: "numbers_2",
    status: "status",
  },
  statusMap: { Foglalt: "reserved", Szabad: "available" },
  currency: "HUF",
  baseUrl: "https://monday.example/v2",
};
const SCOPE = {
  tenantId: TenantIdSchema.parse("tnt_aabbccdd11"),
  projectId: ProjectIdSchema.parse("prj_istertower1"),
};
const NOW = () => new Date("2026-09-07T10:00:00Z");

function item(id: string, name: string, cells: Record<string, string | null>) {
  return {
    id,
    name,
    column_values: Object.entries(cells).map(([cid, text]) => ({ id: cid, text })),
  };
}

function reply(items: unknown[], cursor: string | null): HttpResponse {
  return {
    status: 200,
    headers: {},
    text: JSON.stringify({ data: { boards: [{ items_page: { cursor, items } }] } }),
  };
}

describe("mondayFetchSnapshot", () => {
  it("walks the board by cursor and maps the named columns", async () => {
    const seen: HttpRequest[] = [];
    const outcome = await mondayFetchSnapshot({ token: "tok" }, CONFIG, SCOPE, {
      now: NOW,
      http: async (request) => {
        seen.push(request);
        const variables = (
          JSON.parse(request.body ?? "{}") as { variables: { cursor: string | null } }
        ).variables;
        return variables.cursor === null
          ? reply(
              [
                item("901", "A-101", {
                  text_1: "A",
                  numbers_1: "2",
                  numbers_2: "45 000 000",
                  status: "Szabad",
                }),
                item("902", "A-102", {
                  text_1: "A",
                  numbers_1: "3+kk",
                  numbers_2: null,
                  status: "Foglalt",
                }),
              ],
              "cursor-2",
            )
          : reply(
              [
                item("903", "B-201", {
                  text_1: "B",
                  numbers_1: "4",
                  numbers_2: "80000000",
                  status: "Eladva",
                }),
              ],
              null,
            );
      },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(seen).toHaveLength(2);
    expect(seen[0]?.headers["authorization"]).toBe("tok");
    const first = JSON.parse(seen[0]?.body ?? "{}") as { variables: { board: string[] } };
    expect(first.variables.board).toEqual(["123456"]);

    const units = outcome.snapshot.units;
    expect(units.map((u) => [u.code, u.externalId])).toEqual([
      ["A-101", "901"],
      ["A-102", "902"],
      ["B-201", "903"],
    ]);
    expect(units[0]).toMatchObject({
      building: "A",
      rooms: 2,
      status: "available",
      statusRaw: "Szabad",
    });
    expect(units[0]?.price).toEqual({ withVat: 45000000, withoutVat: null, currency: "HUF" });
    expect(units[1]).toMatchObject({
      rooms: 3,
      layout: "3+kk",
      kitchen: "kitchenette",
      status: "reserved",
    });
    expect(units[2]).toMatchObject({ rooms: 4, status: "unknown", statusRaw: "Eladva" });
  });

  it("reads a GraphQL authentication error as unauthorised and any other as misconfigured", async () => {
    const denied = await mondayFetchSnapshot({ token: "bad" }, CONFIG, SCOPE, {
      now: NOW,
      http: async () => ({
        status: 200,
        headers: {},
        text: JSON.stringify({ errors: [{ message: "Not Authenticated" }] }),
      }),
    });
    expect(denied).toMatchObject({ ok: false, reason: "unauthorised" });

    const wrongBoard = await mondayFetchSnapshot({ token: "tok" }, CONFIG, SCOPE, {
      now: NOW,
      http: async () => ({
        status: 200,
        headers: {},
        text: JSON.stringify({ errors: [{ message: "Board not found" }] }),
      }),
    });
    expect(wrongBoard).toMatchObject({ ok: false, reason: "misconfigured" });

    const noBoard = await mondayFetchSnapshot({ token: "tok" }, CONFIG, SCOPE, {
      now: NOW,
      http: async () => ({
        status: 200,
        headers: {},
        text: JSON.stringify({ data: { boards: [] } }),
      }),
    });
    expect(noBoard).toMatchObject({ ok: false, reason: "misconfigured" });
  });

  it("honours an HTTP refusal before reading any body", async () => {
    const outcome = await mondayFetchSnapshot({ token: "tok" }, CONFIG, SCOPE, {
      now: NOW,
      http: async () => ({ status: 429, headers: { "retry-after": "60" }, text: "" }),
    });
    expect(outcome).toMatchObject({ ok: false, reason: "rate_limited", retryAfterSeconds: 60 });
  });
});
