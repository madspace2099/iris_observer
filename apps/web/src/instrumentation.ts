/**
 * Server startup.
 *
 * Next calls `register` once per server process, which is the only place a
 * startup log actually belongs. The root layout is the wrong hook: for a static
 * route its module is evaluated at build time, so a report written there
 * describes the build machine rather than the deployment.
 */
export async function register(): Promise<void> {
  // Node only. The edge runtime has no process environment to report on and no
  // server log to write to.
  if (process.env["NEXT_RUNTIME"] !== "nodejs") return;
  const { reportEnvironment } = await import("./lib/env");
  reportEnvironment();
  /*
   * The session secret, before the first request. Outside development a
   * missing OBSERVER_SESSION_SECRET is not a warning line in the report above:
   * the resolver throws by name, and the process exits. Measured on
   * 2026-09-23: a throw alone leaves `next start` "Failed to prepare server"
   * with the port still bound and every request failing — a server that is
   * down without having stopped. So the error is printed once and the
   * process ends with a non-zero code, which is what a supervisor, a
   * platform and a person reading the log all recognise as "did not start".
   */
  const { signingSecretFrom } = await import("./lib/session-secret");
  try {
    signingSecretFrom(process.env);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}
