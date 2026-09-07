import { describe, expect, it } from "vitest";
import type { CatalogueUnit, UnitChange } from "@observer/contracts";
import type {
  CatalogueChangeRow,
  CatalogueDb,
  ConnectorConfigRow,
  SealedCredentialRow,
  SyncRecordInput,
} from "@observer/connectors";

import { mapToLines, parseMapLines } from "@/lib/connectors/configs";
import { connectorService, scopeFor } from "@/lib/connectors/service";

/**
 * The connector service against a fake CRM and an in-memory port.
 *
 * What is asserted is the path a credential takes — sealed on save, opened on
 * sync, four characters on the screen — and that a refused fetch is recorded
 * as a category with nothing from the CRM's body in it.
 */

const KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const ENV = { OBSERVER_CREDENTIAL_KEY: KEY };
const ACCOUNT = "acct_madspace_demo";
const PROJECT = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

const EXPORT = `<export developer-id="1"><project id="10" name="P">
  <building id="1" name="A"><floor id="2" floorNo="1">
    <flat id="100"><flat-attribute key="flat_internal_id" value="A-101"/><flat-attribute key="flat_disposition" value="2+kk"/><flat-attribute key="flat_status" value="0"/><flat-attribute key="flat_price" value="6050000"/></flat>
    <flat id="101"><flat-attribute key="flat_internal_id" value="A-102"/><flat-attribute key="flat_disposition" value="3+1"/><flat-attribute key="flat_status" value="3"/></flat>
  </floor></building></project></export>`;

function memoryDb(): CatalogueDb & {
  readonly configs: Map<string, { config: Record<string, unknown>; enabled: boolean }>;
  readonly credentials: Map<string, SealedCredentialRow & { last_four: string }>;
  readonly units: Map<string, CatalogueUnit[]>;
  readonly changes: CatalogueChangeRow[];
  readonly syncs: SyncRecordInput[];
} {
  const configs = new Map<string, { config: Record<string, unknown>; enabled: boolean }>();
  const credentials = new Map<string, SealedCredentialRow & { last_four: string }>();
  const units = new Map<string, CatalogueUnit[]>();
  const changes: CatalogueChangeRow[] = [];
  const syncs: SyncRecordInput[] = [];
  const own = (account: string, project: string) => account === ACCOUNT && project === PROJECT;
  return {
    configs,
    credentials,
    units,
    changes,
    syncs,
    async connectorConfigSet(account, project, connector, config, enabled) {
      if (!own(account, project)) return false;
      configs.set(connector, { config, enabled });
      return true;
    },
    async connectorConfigs(account, project) {
      if (!own(account, project)) return [];
      const rows: ConnectorConfigRow[] = [];
      for (const [connector, c] of configs) {
        const k = credentials.get(connector);
        const last = syncs.at(-1) ?? null;
        rows.push({
          connector,
          config: c.config,
          enabled: c.enabled,
          has_credential: k !== undefined,
          credential_last_four: k?.last_four ?? null,
          updated_at: "2026-09-07T10:00:00.000Z",
          last_sync_at: last === null ? null : "2026-09-07T10:05:00.000Z",
          last_sync_outcome: last?.outcome ?? null,
          last_sync_fetched: last?.fetched ?? null,
          last_sync_detail: last?.detail ?? null,
        });
      }
      return rows;
    },
    async connectorCredentialSet(account, project, connector, sealed) {
      if (!own(account, project)) return false;
      const existing = credentials.get(connector);
      if (existing !== undefined && existing.revision >= sealed.revision) return false;
      credentials.set(connector, {
        key_version: sealed.keyVersion,
        nonce: sealed.nonce,
        ciphertext: sealed.ciphertext,
        auth_tag: sealed.authTag,
        revision: sealed.revision,
        last_four: sealed.lastFour,
      });
      return true;
    },
    async connectorCredentialRead(account, project, connector) {
      return own(account, project) ? (credentials.get(connector) ?? null) : null;
    },
    async connectorCredentialRemove(account, project, connector) {
      return own(account, project) && credentials.delete(connector);
    },
    async catalogueApply(
      account,
      project,
      connector,
      _fetchedAt,
      next,
      applied: readonly UnitChange[],
    ) {
      if (!own(account, project)) return null;
      units.set(connector, [...next]);
      for (const ch of applied) {
        changes.push({
          connector,
          code: ch.code,
          kind: ch.kind,
          changed_fields: ch.changedFields,
          before_unit: ch.before,
          after_unit: ch.after,
          fetched_at: "x",
          recorded_at: "x",
        });
      }
      return {
        added: applied.filter((c) => c.kind === "added").length,
        changed: applied.filter((c) => c.kind === "changed").length,
        withdrawn: applied.filter((c) => c.kind === "withdrawn").length,
      };
    },
    async catalogueCurrent(account, project, connector) {
      if (!own(account, project)) return [];
      return (units.get(connector) ?? []).map((u) => ({ code: u.code, unit: u, fetched_at: "x" }));
    },
    async catalogueChanges(account, project, limit) {
      return own(account, project) ? changes.slice(-limit).reverse() : [];
    },
    async catalogueSyncRecord(account, project, _connector, record) {
      if (!own(account, project)) return null;
      syncs.push(record);
      return syncs.length;
    },
  };
}

function service(
  db: CatalogueDb,
  answer: (url: string, body: string) => { status: number; text: string },
) {
  return connectorService({
    db,
    account: ACCOUNT,
    env: ENV,
    now: () => new Date("2026-09-07T10:00:00Z"),
    http: async (request) => {
      const a = answer(request.url, request.body ?? "");
      return { status: a.status, headers: {}, text: a.text };
    },
  });
}

describe("mapping lines", () => {
  it("round-trips a small table and skips what names nothing", () => {
    const lines = "foglalt=reserved\n\nno-equals\n=empty\nszabad = available \n";
    expect(parseMapLines(lines)).toEqual({ foglalt: "reserved", szabad: "available" });
    expect(mapToLines({ a: "b", c: 1 })).toBe("a=b");
  });
});

describe("scopeFor", () => {
  it("derives branded read-model identifiers deterministically", () => {
    const scope = scopeFor(ACCOUNT, PROJECT);
    expect(String(scope.tenantId)).toBe("tnt_acctmadspacedemo");
    expect(String(scope.projectId)).toBe("prj_7c9e6679742540de944be07fc1f90ae7");
    expect(scopeFor(ACCOUNT, PROJECT)).toEqual(scope);
  });
});

describe("connectorService", () => {
  it("seals the credential on save, shows four characters, and syncs with it", async () => {
    const db = memoryDb();
    const seen: string[] = [];
    const svc = service(db, (url, body) => {
      seen.push(body);
      return url.endsWith("/get-project")
        ? { status: 200, text: EXPORT }
        : { status: 404, text: "" };
    });

    const saved = await svc.save(
      PROJECT,
      "realpad",
      { developerId: 1, projectId: 10, screenId: 2, includeHidden: false, currency: "czk" },
      { login: "project-acme-pricelist", password: "s3cret-pass" },
      true,
    );
    expect(saved).toEqual({ ok: true });

    const stored = db.credentials.get("realpad")!;
    expect(stored.ciphertext).not.toContain("s3cret");
    expect(stored.last_four).toBe("list");

    const listed = await svc.list(PROJECT);
    const realpad = listed.find((c) => c.kind === "realpad")!;
    expect(realpad).toMatchObject({
      configured: true,
      enabled: true,
      hasCredential: true,
      credentialTail: "list",
    });
    expect(realpad.config).toEqual({
      developerId: 1,
      projectId: 10,
      screenId: 2,
      includeHidden: false,
      currency: "CZK",
      orientationMap: {},
    });

    const synced = await svc.sync(PROJECT, "realpad");
    expect(synced.ok).toBe(true);
    if (!synced.ok || !synced.outcome.ok) throw new Error("expected a report");
    expect(synced.outcome.fetched).toBe(2);
    expect(synced.outcome.changes.map((c) => c.kind)).toEqual(["added", "added"]);
    expect(db.units.get("realpad")?.map((u) => [u.code, u.rooms, u.status])).toEqual([
      ["A-101", 2, "available"],
      ["A-102", 3, "sold"],
    ]);
    expect(db.syncs.at(-1)).toMatchObject({ outcome: "ok", fetched: 2, added: 2 });

    // The opened credential reached the CRM, and only the CRM.
    expect(new URLSearchParams(seen[0]).get("password")).toBe("s3cret-pass");
  });

  it("records a refused fetch as a category, with nothing from the body", async () => {
    const db = memoryDb();
    const svc = service(db, () => ({ status: 401, text: "bad login project-acme-pricelist" }));
    await svc.save(
      PROJECT,
      "lomnio",
      { statusMap: {}, currency: null },
      { token: "tok_1234567890", signingSecret: null },
      true,
    );
    const synced = await svc.sync(PROJECT, "lomnio");
    if (!synced.ok) throw new Error(synced.problem);
    expect(synced.outcome).toMatchObject({ ok: false, reason: "unauthorised" });
    expect(db.syncs.at(-1)).toMatchObject({ outcome: "unauthorised", fetched: 0 });
    expect(db.syncs.at(-1)?.detail).not.toContain("project-acme");
  });

  it("refuses a config the connector does not know and a credential it cannot seal", async () => {
    const db = memoryDb();
    const svc = service(db, () => ({ status: 200, text: "" }));
    const bad = await svc.save(PROJECT, "realpad", { developerId: "x" }, null, true);
    expect(bad.ok).toBe(false);

    const noKey = connectorService({
      db,
      account: ACCOUNT,
      env: {},
      now: () => new Date(),
      http: async () => ({ status: 200, headers: {}, text: "" }),
    });
    const unsealed = await noKey.save(
      PROJECT,
      "monday",
      { boardId: "1", columns: { code: "name" }, statusMap: {}, currency: null },
      { token: "tok_1234567890" },
      true,
    );
    expect(unsealed.ok).toBe(false);
    if (unsealed.ok) return;
    expect(unsealed.problem).toContain("credential key");
    expect(db.credentials.size).toBe(0);
  });

  it("imports a spreadsheet through the same loop and lists the rows it could not read", async () => {
    const db = memoryDb();
    const svc = service(db, () => ({ status: 200, text: "" }));
    await svc.save(
      PROJECT,
      "csv",
      {
        columns: { code: "Kód", rooms: "Szobák", status: "Státusz" },
        statusMap: { szabad: "available" },
        currency: "HUF",
      },
      null,
      true,
    );
    const imported = await svc.importCsv(
      PROJECT,
      "Kód;Szobák;Státusz\nA-1;2+kk;szabad\n;3;szabad\n",
    );
    if (!imported.ok) throw new Error(imported.problem);
    expect(imported.rejected).toEqual([{ line: 3, reason: "no unit code" }]);
    if (!imported.outcome.ok) throw new Error("expected a report");
    expect(imported.outcome.fetched).toBe(1);
    expect(db.units.get("csv")?.[0]).toMatchObject({ code: "A-1", rooms: 2, status: "available" });
  });

  it("reports how much of a delivered catalogue the product can draw, and why not the rest", async () => {
    const db = memoryDb();
    const svc = service(db, () => ({ status: 200, text: "" }));
    await svc.save(
      PROJECT,
      "csv",
      {
        columns: {
          code: "Kód",
          rooms: "Szobák",
          floor: "Emelet",
          interiorSqm: "m2",
          priceWithVat: "Ár",
          orientation: "Tájolás",
          status: "Státusz",
        },
        statusMap: { szabad: "available" },
        currency: "HUF",
        orientationMap: { D: "S" },
      },
      null,
      true,
    );
    await svc.importCsv(
      PROJECT,
      "Kód;Szobák;Emelet;m2;Ár;Tájolás;Státusz\nA-1;2;1;50;1;D;szabad\nA-2;3;2;60;1;Ny;szabad\nP-1;;1;12;1;D;szabad\n",
    );
    /*
     * Every unit for sale is drawn; what the sheet left out is counted as a
     * gap the surfaces say in words, not as a reason to leave the unit off.
     */
    const placement = await svc.placement(PROJECT, "csv");
    expect(placement).toEqual({
      total: 3,
      placed: 3,
      reasons: [],
      gaps: [
        { reason: "orientation code not mapped (Ny)", count: 1 },
        { reason: "no room count", count: 1 },
      ],
    });
    expect((await svc.currentUnits(PROJECT, "csv")).map((u) => u.code)).toEqual([
      "A-1",
      "A-2",
      "P-1",
    ]);
  });

  it("verifies a Lomnio webhook only against a stored signing secret", async () => {
    const db = memoryDb();
    const svc = service(db, () => ({ status: 200, text: "" }));
    expect(await svc.verifyLomnioWebhook(PROJECT, "{}", "sha256=00")).toBe("no_secret");
    await svc.save(
      PROJECT,
      "lomnio",
      { statusMap: {}, currency: null },
      { token: "tok_1234567890", signingSecret: "whsec_example_secret" },
      true,
    );
    expect(await svc.verifyLomnioWebhook(PROJECT, "{}", "sha256=00")).toBe("rejected");
    const { createHmac } = await import("node:crypto");
    const good = `sha256=${createHmac("sha256", "whsec_example_secret").update("{}", "utf8").digest("hex")}`;
    expect(await svc.verifyLomnioWebhook(PROJECT, "{}", good)).toBe("ok");
  });
});
