import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ProjectIdSchema, TenantIdSchema } from "@observer/contracts";
import type { HttpRequest, HttpResponse } from "../src/http";
import {
  lomnioFetchSnapshot,
  parseLomnioWebhook,
  verifyLomnioSignature,
  type LomnioConfig,
} from "../src/lomnio";

const CONFIG: LomnioConfig = {
  statusMap: { rezervace: "reserved" },
  currency: "CZK",
  baseUrl: "https://lomnio.example/api",
};
const SCOPE = {
  tenantId: TenantIdSchema.parse("tnt_aabbccdd11"),
  projectId: ProjectIdSchema.parse("prj_istertower1"),
};
const NOW = () => new Date("2026-09-07T10:00:00Z");

function unit(id: number, code: string, status: string, over: Record<string, unknown> = {}) {
  return {
    id,
    code,
    external_id: null,
    status: { code: status, label: status, color: "#000", is_system: true, labels: {} },
    type: "flat",
    layout_type: "3+kk",
    room_count: 3,
    orientation: ["S", "E"],
    pricing: { price_with_vat: 6050000, price_without_vat: 5000000 },
    areas: { area: 71.4, area_floor: 71.4, area_gross: 78, area_building: null, area_land: null },
    building: { id: 1, name: "Brenner A" },
    floor: { id: 5, name: "4", number: 4 },
    available_from: "2026-09-01",
    updated_at: "2026-07-14T09:30:00+00:00",
    ...over,
  };
}

function page(data: unknown[], current: number, last: number): HttpResponse {
  return {
    status: 200,
    headers: {},
    text: JSON.stringify({
      data,
      links: {
        next: current < last ? `https://lomnio.example/api/v1/units?page=${current + 1}` : null,
      },
      meta: { current_page: current, last_page: last, per_page: 500, total: data.length },
    }),
  };
}

describe("lomnioFetchSnapshot", () => {
  it("walks every page with the bearer token and maps the unit shape", async () => {
    const seen: HttpRequest[] = [];
    const outcome = await lomnioFetchSnapshot({ token: "tok_123" }, CONFIG, SCOPE, {
      now: NOW,
      http: async (request) => {
        seen.push(request);
        const pageNo = Number(new URL(request.url).searchParams.get("page"));
        return pageNo === 1
          ? page([unit(1, "A.101", "available"), unit(2, "A.102", "rezervace")], 1, 2)
          : page(
              [unit(3, "A.201", "svým způsobem", { room_count: null, layout_type: "atyp" })],
              2,
              2,
            );
      },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(seen.map((r) => new URL(r.url).searchParams.get("page"))).toEqual(["1", "2"]);
    expect(seen[0]?.headers["authorization"]).toBe("Bearer tok_123");
    expect(seen[0]?.method).toBe("GET");

    const [a101, a102, a201] = outcome.snapshot.units;
    expect(a101).toMatchObject({
      code: "A.101",
      externalId: "1",
      building: "Brenner A",
      floor: 4,
      rooms: 3,
      layout: "3+kk",
      kitchen: "kitchenette",
      orientation: ["S", "E"],
      status: "available",
      statusRaw: "available",
      updatedAt: "2026-07-14T09:30:00+00:00",
      availableFrom: null,
    });
    expect(a101?.price).toEqual({ withVat: 6050000, withoutVat: 5000000, currency: "CZK" });
    expect(a101?.areas).toEqual({ interiorSqm: 71.4, exteriorSqm: null, grossSqm: 78 });
    expect(a102?.status).toBe("reserved");
    expect(a201).toMatchObject({
      rooms: null,
      layout: "atyp",
      status: "unknown",
      statusRaw: "svým způsobem",
    });
    expect(outcome.snapshot.connector).toBe("lomnio");
  });

  it("stops at the first refusal and never invents a page", async () => {
    const outcome = await lomnioFetchSnapshot({ token: "bad" }, CONFIG, SCOPE, {
      now: NOW,
      http: async () => ({ status: 401, headers: {}, text: '{"message":"Unauthenticated."}' }),
    });
    expect(outcome).toMatchObject({ ok: false, reason: "unauthorised" });
  });

  it("calls a body without a data array malformed", async () => {
    const outcome = await lomnioFetchSnapshot({ token: "tok" }, CONFIG, SCOPE, {
      now: NOW,
      http: async () => ({ status: 200, headers: {}, text: '{"units":[]}' }),
    });
    expect(outcome).toMatchObject({ ok: false, reason: "malformed" });
  });
});

describe("webhooks", () => {
  const secret = "whsec_example";
  const body = JSON.stringify({
    event: "unit.updated",
    occurred_at: "2026-07-14T09:30:00+00:00",
    project: { id: 12, slug: "brenner" },
    unit_id: 3456,
    external_id: "A.101",
    changed_fields: ["status", "price_without_vat"],
    deleted: false,
    visible: true,
    unit: unit(3456, "A.101", "rezervace"),
  });
  const sign = (text: string, key: string) =>
    `sha256=${createHmac("sha256", key).update(text, "utf8").digest("hex")}`;

  it("accepts the project's own signature and nothing else", () => {
    expect(verifyLomnioSignature(body, sign(body, secret), secret)).toBe(true);
    expect(verifyLomnioSignature(body, sign(body, "other"), secret)).toBe(false);
    expect(verifyLomnioSignature(body + " ", sign(body, secret), secret)).toBe(false);
    expect(verifyLomnioSignature(body, "sha1=abc", secret)).toBe(false);
    expect(verifyLomnioSignature(body, null, secret)).toBe(false);
  });

  it("maps a unit event to the canonical unit and reads withdrawal from either flag", () => {
    const hook = parseLomnioWebhook(body, CONFIG);
    expect(hook).toMatchObject({
      event: "unit.updated",
      occurredAt: "2026-07-14T09:30:00+00:00",
      code: "A.101",
      withdrawn: false,
    });
    expect(hook?.unit?.status).toBe("reserved");

    const gone = parseLomnioWebhook(
      JSON.stringify({ event: "unit.deleted", external_id: "A.101", deleted: true, unit: null }),
      CONFIG,
    );
    expect(gone).toMatchObject({
      event: "unit.deleted",
      code: "A.101",
      withdrawn: true,
      unit: null,
    });

    const hidden = parseLomnioWebhook(
      JSON.stringify({ event: "unit.updated", visible: false, unit: unit(1, "B.1", "available") }),
      CONFIG,
    );
    expect(hidden?.withdrawn).toBe(true);
  });

  it("refuses an event it does not know and a body it cannot read", () => {
    expect(parseLomnioWebhook(JSON.stringify({ event: "unit.exploded" }), CONFIG)).toBeNull();
    expect(parseLomnioWebhook("{", CONFIG)).toBeNull();
  });
});
