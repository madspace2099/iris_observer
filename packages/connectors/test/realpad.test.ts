import { describe, expect, it } from "vitest";
import { ProjectIdSchema, TenantIdSchema } from "@observer/contracts";
import type { HttpRequest, HttpResponse } from "../src/http";
import {
  realpadCatalogue,
  realpadFetchSnapshot,
  realpadListProjects,
  type RealpadConfig,
} from "../src/realpad";

/*
 * The export as REALPAD's own documentation shows it (2026-09-07), plus two
 * flats that exercise the attributes the example leaves out: a disposition,
 * an orientation with mixed compass codes, outdoor areas, and a status the
 * documentation does not define.
 */
const EXPORT = `<export creation-time="2026-02-19T07:14:17+0100" developer-id="3230279">
  <project id="3356887" name="C PROJECT Riverside" gps="6789099" hypo-assistant="false" public="false" hidden="false" demo="false" available-second-market-unit-count="0">
    <locale iso="cs_CZ" name="Čeština"/>
    <locale iso="en_US" name="English"/>
    <building id="3356894" name="Gent" arrow-direction="0">
      <floor id="3356895" floorNo="1" arrow-direction="0">
        <flat id="3356898">
          <flat-attribute key="flat_internal_id" value="G001"/>
          <flat-attribute key="flat_area" value="80"/>
          <flat-attribute key="flat_price" value="142886.48"/>
          <flat-attribute key="flat_price_without_vat" value="118088"/>
          <flat-attribute key="flat_status" value="3"/>
          <flat-attribute key="flat_type" value="17"/>
        </flat>
        <flat id="3356899">
          <flat-attribute key="flat_internal_id" value="G002"/>
          <flat-attribute key="flat_disposition" value="2+kk"/>
          <flat-attribute key="flat_orientation" value="SV, J"/>
          <flat-attribute key="flat_area" value="54.2"/>
          <flat-attribute key="flat_area_balcony" value="6.1"/>
          <flat-attribute key="flat_area_living" value="61.5"/>
          <flat-attribute key="flat_price" value="6050000"/>
          <flat-attribute key="flat_price_without_vat" value="5000000"/>
          <flat-attribute key="flat_status" value="0"/>
          <flat-attribute key="flat_type" value="1"/>
        </flat>
      </floor>
      <floor id="3356896" floorNo="2" arrow-direction="0">
        <flat id="3356900">
          <flat-attribute key="flat_internal_id" value="G101"/>
          <flat-attribute key="flat_disposition" value="atyp"/>
          <flat-attribute key="flat_status" value="7"/>
        </flat>
      </floor>
    </building>
    <gallery id="3356893" creation-time="2023-02-07T01:00:00+0100" modification-time="2023-02-07T01:00:00+0100" type="3">
      <name locale="cs_CZ" text="Fotografie okolí"/>
    </gallery>
    <project-attribute key="show_prices_vat" value="true"/>
    <second-market/>
  </project>
</export>`;

const CONFIG: RealpadConfig = {
  developerId: 3230279,
  projectId: 3356887,
  screenId: 2,
  includeHidden: false,
  currency: "CZK",
  baseUrl: "https://cms.example/ws/v10",
};

const CREDENTIAL = { login: "project-acme-pricelist", password: "s3cret" };
const SCOPE = {
  tenantId: TenantIdSchema.parse("tnt_aabbccdd11"),
  projectId: ProjectIdSchema.parse("prj_istertower1"),
};
const NOW = () => new Date("2026-09-07T10:00:00Z");

function respond(status: number, text: string, headers: Record<string, string> = {}): HttpResponse {
  return { status, headers, text };
}

describe("realpadCatalogue", () => {
  it("reads every flat under every building and floor, in document order", () => {
    const units = realpadCatalogue(EXPORT, "CZK")!;
    expect(units.map((u) => u.code)).toEqual(["G001", "G002", "G101"]);
  });

  it("maps the documented attributes and carries the raw ones beside them", () => {
    const [g001, g002, g101] = realpadCatalogue(EXPORT, "CZK")!;
    expect(g001).toMatchObject({
      externalId: "3356898",
      building: "Gent",
      floor: 1,
      rooms: null,
      layout: null,
      unitType: "17",
      status: "sold",
      statusRaw: "3",
      orientation: [],
    });
    expect(g001?.price).toEqual({ withVat: 142886.48, withoutVat: 118088, currency: "CZK" });
    expect(g001?.areas).toEqual({ interiorSqm: 80, exteriorSqm: null, grossSqm: null });

    expect(g002).toMatchObject({
      rooms: 2,
      kitchen: "kitchenette",
      layout: "2+kk",
      orientation: ["SV", "J"],
      status: "available",
      statusRaw: "0",
    });
    expect(g002?.areas).toEqual({ interiorSqm: 54.2, exteriorSqm: 6.1, grossSqm: 61.5 });

    expect(g101).toMatchObject({
      floor: 2,
      rooms: null,
      layout: "atyp",
      status: "unknown",
      statusRaw: "7",
    });
    expect(g101?.price.withVat).toBeNull();
  });

  it("refuses something that is not a project export", () => {
    expect(realpadCatalogue("<html>login</html>", null)).toBeNull();
    expect(realpadCatalogue("<<not xml", null)).toBeNull();
  });
});

describe("realpadFetchSnapshot", () => {
  it("posts a form-encoded body to get-project and returns the snapshot", async () => {
    const seen: HttpRequest[] = [];
    const outcome = await realpadFetchSnapshot(CREDENTIAL, CONFIG, SCOPE, {
      now: NOW,
      http: async (request) => {
        seen.push(request);
        return respond(200, EXPORT);
      },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.snapshot).toMatchObject({
      tenantId: SCOPE.tenantId,
      projectId: SCOPE.projectId,
      connector: "realpad",
      fetchedAt: "2026-09-07T10:00:00.000+00:00",
    });
    expect(outcome.snapshot.units).toHaveLength(3);

    const request = seen[0]!;
    expect(request.url).toBe("https://cms.example/ws/v10/get-project");
    expect(request.method).toBe("POST");
    expect(request.headers["content-type"]).toBe("application/x-www-form-urlencoded");
    const body = new URLSearchParams(request.body);
    expect(body.get("login")).toBe("project-acme-pricelist");
    expect(body.get("developerid")).toBe("3230279");
    expect(body.get("projectid")).toBe("3356887");
    expect(body.get("screenid")).toBe("2");
    expect(body.has("includehidden")).toBe(false);
  });

  it("sends includehidden only by presence, as REALPAD reads it", async () => {
    let body = "";
    await realpadFetchSnapshot({ ...CREDENTIAL }, { ...CONFIG, includeHidden: true }, SCOPE, {
      now: NOW,
      http: async (request) => {
        body = request.body ?? "";
        return respond(200, EXPORT);
      },
    });
    expect(new URLSearchParams(body).has("includehidden")).toBe(true);
  });

  it("turns a 401 into an unauthorised refusal that says nothing about the body", async () => {
    const outcome = await realpadFetchSnapshot(CREDENTIAL, CONFIG, SCOPE, {
      now: NOW,
      http: async () => respond(401, "Invalid credentials for project-acme-pricelist"),
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe("unauthorised");
    expect(outcome.detail).not.toContain("project-acme");
  });

  it("carries Retry-After through a rate limit", async () => {
    const outcome = await realpadFetchSnapshot(CREDENTIAL, CONFIG, SCOPE, {
      now: NOW,
      http: async () => respond(429, "slow down", { "retry-after": "300" }),
    });
    expect(outcome).toMatchObject({ ok: false, reason: "rate_limited", retryAfterSeconds: 300 });
  });

  it("calls a deprecated API version unavailable and an unreadable body malformed", async () => {
    const gone = await realpadFetchSnapshot(CREDENTIAL, CONFIG, SCOPE, {
      now: NOW,
      http: async () => respond(418, "deprecated"),
    });
    expect(gone).toMatchObject({ ok: false, reason: "unavailable" });

    const junk = await realpadFetchSnapshot(CREDENTIAL, CONFIG, SCOPE, {
      now: NOW,
      http: async () => respond(200, "<html>maintenance</html>"),
    });
    expect(junk).toMatchObject({ ok: false, reason: "malformed" });
  });
});

describe("realpadListProjects", () => {
  it("lists what the credential can see", async () => {
    const outcome = await realpadListProjects(
      CREDENTIAL,
      {
        now: NOW,
        http: async () =>
          respond(
            200,
            `<export developer-id="1"><project id="10" name="Alpha"/><project id="11" name="Beta"/></export>`,
          ),
      },
      "https://cms.example/ws/v10",
    );
    expect(outcome).toEqual({
      ok: true,
      projects: [
        { id: "10", name: "Alpha" },
        { id: "11", name: "Beta" },
      ],
    });
  });
});
