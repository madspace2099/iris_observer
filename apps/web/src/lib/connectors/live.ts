import "server-only";

import { CONTROL_PLANE_ACCOUNT } from "@/lib/sources/control-plane";

import { catalogueDbAsync } from "./deps";
import { connectorService, platformHttp, type ConnectorService } from "./service";

/**
 * The service as a deployment runs it: the resolved catalogue port, the
 * platform's fetch, the process environment and the wall clock. Null when this
 * process has no database, which every caller turns into a sentence.
 */
export async function liveConnectorService(): Promise<ConnectorService | null> {
  const db = await catalogueDbAsync();
  if (db === null) return null;
  return connectorService({
    db,
    http: platformHttp(),
    env: process.env,
    now: () => new Date(),
    account: CONTROL_PLANE_ACCOUNT,
  });
}
