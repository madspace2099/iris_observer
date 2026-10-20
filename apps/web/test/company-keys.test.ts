import { beforeEach, describe, expect, it } from "vitest";

import { accountById, type Account } from "../src/lib/accounts";
import {
  companyKeyState,
  companyKeysEnabled,
  companyModelAccess,
  companyModelName,
  removeCompanyKey,
  resetCompanyKeys,
  setCompanyKey,
} from "../src/lib/credentials/company-keys";
import type { ConnectionProbe } from "../src/lib/credentials/service";
import { DEPLOYMENT_MARKERS } from "../src/lib/deployment-markers";
import { loopbackHost } from "../src/lib/env";

/**
 * A COMPANY'S KEY, ON A LOCAL DEMONSTRATION AND NOWHERE ELSE (ADR-0043).
 *
 * The admin sets it, every member asks with it, no other company sees it, and
 * nothing that renders ever carries it. The key below is an obviously fake
 * constant and every probe is a stub: no request leaves the process.
 */

process.env["OBSERVER_DEMO_ACCOUNTS"] = "1";

const KEY = "sk-observer-test-company-0000";

const ON: Readonly<Record<string, string>> = Object.freeze({
  OBSERVER_DEMO_ACCOUNTS: "1",
  OBSERVER_DEMO_COMPANY_KEYS: "1",
});

const accepted: ConnectionProbe = async () => ({ ok: true });
const rejected: ConnectionProbe = async () => ({ ok: false, status: 401, code: "invalid_api_key" });
const noModel: ConnectionProbe = async () => ({ ok: false, status: 404, code: "model_not_found" });

function account(id: string): Account {
  const found = accountById(id);
  if (found === null) throw new Error(`no account ${id}`);
  return found;
}

const TOMAS = account("acct_tomas"); // Meridian Sales, admin
const MONIKA = account("acct_monika"); // Meridian Sales, member
const PETRA = account("acct_petra"); // Alpha Estates, admin
const CLARA = account("acct_clara"); // Shark Developments, admin
const NORA = account("acct_nora"); // Shark Developments, member

beforeEach(() => resetCompanyKeys());

describe("the store opens only on a local demonstration with its flag", () => {
  it("is open with the flag, the directory, and no deployment marker", () => {
    expect(companyKeysEnabled(ON)).toBe(true);
  });

  it("is closed without the flag", () => {
    expect(companyKeysEnabled({ ...ON, OBSERVER_DEMO_COMPANY_KEYS: undefined })).toBe(false);
    expect(companyKeysEnabled({ ...ON, OBSERVER_DEMO_COMPANY_KEYS: "true" })).toBe(false);
  });

  it("is closed without the demonstration directory", () => {
    expect(companyKeysEnabled({ ...ON, OBSERVER_DEMO_ACCOUNTS: undefined })).toBe(false);
  });

  it("is closed on staging or production without the harness", () => {
    expect(companyKeysEnabled({ ...ON, OBSERVER_ENVIRONMENT: "production" })).toBe(false);
  });

  it.each(DEPLOYMENT_MARKERS)("is closed wherever %s is present", async (marker) => {
    const source = { ...ON, [marker]: "1" };
    expect(companyKeysEnabled(source)).toBe(false);
    expect(await setCompanyKey(CLARA, KEY, accepted, source)).toEqual({
      ok: false,
      failure: "storage_unavailable",
    });
    expect(companyKeyState(CLARA, source)).toBeNull();
  });

  it("refuses to set or spend a key while closed", async () => {
    const closed = { OBSERVER_DEMO_ACCOUNTS: "1" };
    expect(await setCompanyKey(CLARA, KEY, accepted, closed)).toEqual({
      ok: false,
      failure: "storage_unavailable",
    });
    await setCompanyKey(CLARA, KEY, accepted, ON);
    expect(companyModelAccess(NORA.accountId, closed)).toBeNull();
  });
});

describe("the request must be addressed to this machine", () => {
  it("accepts the loopback names on any port", () => {
    for (const host of ["localhost", "localhost:3400", "127.0.0.1:3400", "[::1]", "[::1]:3400"]) {
      expect(loopbackHost(host), host).toBe(true);
    }
  });

  it("refuses any other host, and a missing one", () => {
    for (const host of [
      null,
      "",
      "observer.example",
      "localhost.example:3400",
      "10.0.0.5:3400",
      "127.0.0.2",
    ]) {
      expect(loopbackHost(host), String(host)).toBe(false);
    }
  });
});

describe("who may set it, and who asks with it", () => {
  it("lets the admin set it and every member ask with it", async () => {
    expect(await setCompanyKey(CLARA, `  ${KEY}  `, accepted, ON)).toEqual({ ok: true });
    expect(companyModelAccess(NORA.accountId, ON)?.apiKey).toBe(KEY);
    expect(companyModelAccess(CLARA.accountId, ON)?.apiKey).toBe(KEY);
    expect(companyModelName(NORA.accountId, ON)).not.toBeNull();
  });

  it("forbids a member to set or remove it", async () => {
    expect(await setCompanyKey(MONIKA, KEY, accepted, ON)).toEqual({
      ok: false,
      failure: "forbidden",
    });
    expect(companyModelAccess(TOMAS.accountId, ON)).toBeNull();

    await setCompanyKey(TOMAS, KEY, accepted, ON);
    expect(removeCompanyKey(MONIKA, ON)).toBe(false);
    expect(companyModelAccess(MONIKA.accountId, ON)).not.toBeNull();
    expect(removeCompanyKey(TOMAS, ON)).toBe(true);
    expect(companyModelAccess(MONIKA.accountId, ON)).toBeNull();
  });

  it("gives another company nothing", async () => {
    await setCompanyKey(TOMAS, KEY, accepted, ON);
    expect(companyModelAccess(PETRA.accountId, ON)).toBeNull();
    expect(companyKeyState(PETRA, ON)?.key).toBeNull();
    expect(companyModelAccess(CLARA.accountId, ON)).toBeNull();
  });

  it("stores nothing when the provider refuses the key, or the key is too short", async () => {
    expect(await setCompanyKey(CLARA, KEY, rejected, ON)).toEqual({
      ok: false,
      failure: "rejected",
    });
    expect(await setCompanyKey(CLARA, "sk-short", accepted, ON)).toEqual({
      ok: false,
      failure: "rejected",
    });
    expect(companyKeyState(CLARA, ON)?.key).toBeNull();
    expect(companyModelAccess(NORA.accountId, ON)).toBeNull();
  });

  it("keeps a key that authenticates but cannot reach the model", async () => {
    expect(await setCompanyKey(CLARA, KEY, noModel, ON)).toEqual({ ok: true });
  });
});

describe("what a screen may know", () => {
  it("says who set it and its last four, and never carries the key", async () => {
    await setCompanyKey(CLARA, KEY, accepted, ON);
    const state = companyKeyState(NORA, ON);
    expect(state).toMatchObject({
      company: "Shark Developments",
      role: "member",
      adminName: "Clara Weiss",
      key: { lastFour: KEY.slice(-4), setBy: "Clara Weiss" },
    });
    expect(JSON.stringify(state)).not.toContain(KEY);
  });
});
