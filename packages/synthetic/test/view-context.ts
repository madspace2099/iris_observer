import { ProjectIdSchema, TenantIdSchema } from "@observer/contracts";
import { DEFAULT_ATTRIBUTION_POLICY } from "@observer/metrics";
import type {
  AttributionContext,
  Language,
  Period,
  ProjectSummary,
  TenantSummary,
  ViewContext,
  Viewer,
} from "@observer/readmodels";

/**
 * AN HONEST VIEW CONTEXT FOR A TEST, WITHOUT A CAST.
 *
 * Twenty suites built their context as a partial literal and forced it with
 * `as unknown as ViewContext`, leaving the language, the viewer, the dates and
 * the ids undefined — inputs no request can produce. A view builder then read
 * `undefined` where the type promised a value, and the language helpers
 * swallowed it with `?? DEFAULT_LANGUAGE` so those suites would not fail
 * (LANG1, 2026-09-30). This returns a real `ViewContext`: every required field
 * set, ids through their own schemas, and a test's own values as overrides.
 *
 * The defaults are a project that does not exist — no catalogue, no deals, no
 * scenario — so a test that did not name a project still reads nothing from
 * the synthetic world.
 */
export interface ViewContextOverrides {
  readonly viewer?: Viewer;
  readonly tenant?: Partial<Omit<TenantSummary, "id">> & { readonly id?: string };
  readonly project?: Partial<Omit<ProjectSummary, "id" | "tenantId">> & { readonly id?: string };
  readonly period?: Partial<Period>;
  readonly generatedAt?: string;
  readonly language?: Language;
  readonly sessionsDelivered?: boolean;
  readonly ownDataOnly?: boolean;
  readonly attribution?: Partial<AttributionContext>;
}

const TENANT_ID = TenantIdSchema.parse("tnt_testtenant");

const VIEWER: Viewer = {
  userId: "usr_test",
  displayName: "Test viewer",
  role: "developer",
  tenantIds: [TENANT_ID],
  projectIds: [],
  agentId: null,
  organisationName: "Test organisation",
};

const PERIOD: Period = {
  preset: "quarter_to_date",
  label: "the period",
  from: "1970-01-01T00:00:00.000Z",
  to: "9999-01-01T00:00:00.000Z",
  baselineLabel: "before",
  baselineFrom: "1969-01-01T00:00:00.000Z",
  baselineTo: "1970-01-01T00:00:00.000Z",
  baselineClipped: false,
};

export function viewContext(overrides: ViewContextOverrides = {}): ViewContext {
  const { id: projectId, ...project } = overrides.project ?? {};
  const { id: tenantId, ...tenant } = overrides.tenant ?? {};
  const tenantIdentity = TenantIdSchema.parse(tenantId ?? "tnt_testtenant");
  return {
    viewer: overrides.viewer ?? VIEWER,
    tenant: { id: tenantIdentity, slug: "test-tenant", name: "Test tenant", ...tenant },
    project: {
      id: ProjectIdSchema.parse(projectId ?? "prj_testproject"),
      tenantId: tenantIdentity,
      slug: "test-project",
      name: "Test project",
      currency: "EUR",
      locale: "en-GB",
      timeZone: "Europe/Bratislava",
      connectedSources: [],
      sources: [],
      ...project,
    },
    period: { ...PERIOD, ...overrides.period },
    generatedAt: overrides.generatedAt ?? "2026-08-24T09:00:00.000+02:00",
    language: overrides.language ?? "en",
    sessionsDelivered: overrides.sessionsDelivered ?? false,
    ownDataOnly: overrides.ownDataOnly ?? false,
    attribution: {
      version: DEFAULT_ATTRIBUTION_POLICY.version,
      effectiveFrom: DEFAULT_ATTRIBUTION_POLICY.effectiveFrom,
      comparisonRefusal: null,
      ...overrides.attribution,
    },
  };
}
