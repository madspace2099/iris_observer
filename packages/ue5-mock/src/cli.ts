import { MockObserverBackend } from "./backend";
import { startMockServer } from "./server";

/**
 * RUN THE REFERENCE BACKEND LOCALLY. MOCK-ONLY.
 *
 *   pnpm ue5:mock                     a fresh source, one activation code printed
 *   pnpm ue5:mock --port 8787         a fixed port, for a build with a baked URL
 *
 * Prints an activation code on start, because the first thing an Unreal
 * transport test needs is something to exchange. Nothing is persisted: stop the
 * process and every source, credential and stored event is gone, which is the
 * correct behaviour for a fixture and the wrong behaviour for anything else.
 *
 * Binds `127.0.0.1` only. There is no configuration that changes that.
 */

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main(): Promise<void> {
  const port = Number.parseInt(argument("port") ?? "0", 10);
  const backend = new MockObserverBackend({ baseUrl: "http://127.0.0.1" });
  const server = await startMockServer(backend, Number.isNaN(port) ? 0 : port);
  const code = backend.issueActivationCode({
    displayLabel: "Mock showroom",
    environment: "development",
    expiresInMs: 24 * 60 * 60_000,
  });

  console.log(`UE5 mock backend on ${server.url}  (loopback only)`);
  console.log("");
  console.log(`  POST ${server.url}/functions/v1/observer-activate`);
  console.log(`  POST ${server.url}/functions/v1/observer-ingest      Bearer <source_token>`);
  console.log(`  POST ${server.url}/functions/v1/observer-heartbeat   Bearer <source_token>`);
  console.log("");
  console.log(`  activation_code: ${code}`);
  console.log("");
  console.log("MOCK-ONLY. Not a production implementation. Nothing is persisted.");

  const stop = (): void => {
    void server.close().then(() => process.exit(0));
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
