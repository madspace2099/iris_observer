import "server-only";

import { CONTROL_PLANE_ACCOUNT } from "@/lib/sources/control-plane";

import { catalogueDbAsync, dealsDbAsync, sessionsDbAsync } from "./deps";
import { connectorService, platformHttp, type ConnectorService } from "./service";
import { sessionSourceService, type SessionSourceService } from "./session-source-service";

/**
 * The service as a deployment runs it: the resolved catalogue and deals
 * ports, the platform's fetch, the process environment and the wall clock.
 * Null when this process has no database, which every caller turns into a
 * sentence.
 */
export async function liveConnectorService(): Promise<ConnectorService | null> {
  const db = await catalogueDbAsync();
  if (db === null) return null;
  const deals = await dealsDbAsync();
  return connectorService({
    db,
    ...(deals === null ? {} : { deals }),
    http: platformHttp(),
    env: process.env,
    now: () => new Date(),
    account: CONTROL_PLANE_ACCOUNT,
  });
}

/** The mirror of `liveConnectorService`, for a project's showroom-telemetry source. */
export async function liveSessionSourceService(): Promise<SessionSourceService | null> {
  const db = await catalogueDbAsync();
  if (db === null) return null;
  const sessions = await sessionsDbAsync();
  return sessionSourceService({
    db,
    ...(sessions === null ? {} : { sessions }),
    http: platformHttp(),
    env: process.env,
    now: () => new Date(),
    account: CONTROL_PLANE_ACCOUNT,
  });
}
