import { describe, expect, it } from "vitest";

import { DEFAULT_LANGUAGE, NotPermittedError, type Viewer } from "@observer/readmodels";

import { SyntheticObserverRepository } from "../src/repository";
import { VIEWERS } from "../src/world";

/**
 * PROJECT DIAGNOSTICS COUNT AGAINST THEIR OWN DENOMINATORS, AND ABSENT STAYS ABSENT.
 *
 * MADSPACE reads one row per client project (ADR-0047). Each window's meetings
 * are the meetings the project's own screens count for that window; a project
 * without a CRM has no deal count rather than a count of nought; and nobody but
 * MADSPACE can read any of it.
 */

const repo = new SyntheticObserverRepository();
const query = (viewer: Viewer, tenantSlug: string, projectSlug: string) => ({
  viewer,
  tenantSlug,
  projectSlug,
  period: "quarter_to_date" as const,
  language: DEFAULT_LANGUAGE,
});
const madspace = VIEWERS.madspace as Viewer;

describe("project diagnostics", () => {
  it("names both windows and counts the meetings the project's own slice counts", async () => {
    const view = await repo.getProjectDiagnostics(query(madspace, "shark", "shark-residence"));
    expect(view.windows.map((w) => w.period.preset)).toEqual(["last_28_days", "quarter_to_date"]);

    for (const window of view.windows) {
      const slice = await repo.getSessionSlice({
        ...query(madspace, "shark", "shark-residence"),
        period: window.period.preset,
      });
      expect(window.meetings).toBe(slice.sessions.length);
      expect(window.outcomeRecorded).toBeLessThanOrEqual(window.meetings);
      expect(window.webiris).toBeLessThanOrEqual(window.meetings);
      expect(window.rosterPresenting).not.toBeNull();
      /* Every synthetic presenter is on the roster. */
      expect(window.offRoster).toBe(0);
      expect(window.presenters).toBe((window.rosterPresenting ?? 0) + (window.offRoster ?? 0));
      expect(window.rosterPresenting ?? 0).toBeLessThanOrEqual(view.roster ?? 0);
      expect(window.unitsOpened).toBeLessThanOrEqual(view.catalogueUnits ?? 0);
    }
    /* No window holds more meetings than were recorded to date. */
    expect(view.windows.every((w) => w.meetings <= view.recorded)).toBe(true);
    expect(view.data).toBe("demonstration");
    expect(view.roster).toBeGreaterThan(0);
    expect(view.crm.connected).toBe(true);
    expect(view.crm.deals).toBeGreaterThan(0);
  });

  it("states a missing CRM as absent, never as nought deals", async () => {
    const view = await repo.getProjectDiagnostics(query(madspace, "alpha", "riverside"));
    expect(view.crm.connected).toBe(false);
    expect(view.crm.deals).toBeNull();
  });

  it("flags a feed last seen more than a day before the project's today", async () => {
    const views = await Promise.all([
      repo.getProjectDiagnostics(query(madspace, "alpha", "northgate")),
      repo.getProjectDiagnostics(query(madspace, "shark", "shark-residence")),
    ]);
    for (const view of views) {
      for (const source of view.sources) {
        if (source.ageHours === null) expect(source.stale).toBe(false);
        else expect(source.stale).toBe(source.ageHours >= 24);
      }
    }
    /* Northgate's catalogue was last seen three days before the synthetic today. */
    expect(views[0]?.sources.find((s) => s.kind === "catalogue")?.stale).toBe(true);
  });

  it("is refused to everybody but MADSPACE", async () => {
    await expect(
      repo.getProjectDiagnostics(
        query(VIEWERS.developerShark as Viewer, "shark", "shark-residence"),
      ),
    ).rejects.toBeInstanceOf(NotPermittedError);
  });
});
