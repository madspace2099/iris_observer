/**
 * THE TEST SERVER'S SLOW REQUESTS, WITH THE TIME THEY HAPPENED (EJJEL1, 2026-10-02).
 *
 * The end-to-end suite meets a stall now and then: one request that a living
 * server does not answer for 10 to 30 seconds, on a random test. Two traces
 * caught it — once a client navigation's RSC request (`/alpha/northgate/ask`),
 * once the sign-in server action whose redirect Next fetches from itself and
 * which broke with ECONNRESET after 20 s. A trace sees the browser's side
 * only. This sees the server's.
 *
 * Loaded with `node --import` into the harness's servers only
 * (`playwright.config.ts`, `HARNESS_SLOW_REQUESTS`), never into the product:
 * it wraps `http.Server`'s request event and writes one JSON line per request
 * that took longer than the threshold, and one the moment a request has been
 * open that long — a request that never ends is the one that matters most.
 * Every line carries an ISO timestamp, the process and the port, so it lines
 * up with the test log, the trace and Next's own output.
 *
 *   HARNESS_SLOW_REQUESTS=<file>        where the lines go (appended)
 *   HARNESS_SLOW_REQUESTS_MS=5000       the threshold
 */
import { appendFileSync } from "node:fs";
import http from "node:http";
import { clearTimeout, setInterval, setTimeout } from "node:timers";

const file = process.env.HARNESS_SLOW_REQUESTS;
const threshold = Number(process.env.HARNESS_SLOW_REQUESTS_MS ?? "5000");
const ARMED = Symbol.for("observer.harness.slowRequests");

function write(entry) {
  try {
    appendFileSync(
      file,
      `${JSON.stringify({ ts: new Date().toISOString(), pid: process.pid, ...entry })}\n`,
    );
  } catch {
    /* The log is evidence, never a reason for the server to fail. */
  }
}

if (file !== undefined && file.length > 0 && !http.Server.prototype[ARMED]) {
  const emit = http.Server.prototype.emit;
  http.Server.prototype.emit = function (event, req, res) {
    /* Which process serves which port, so a late loop can be told apart from its neighbour. */
    if (event === "listening") {
      const address = this.address();
      write({
        event: "listening",
        port: typeof address === "object" && address !== null ? address.port : null,
      });
    }
    if (event === "request" && req !== undefined && res !== undefined) {
      const started = Date.now();
      const address = this.address();
      const what = {
        method: req.method,
        url: req.url,
        port: typeof address === "object" && address !== null ? address.port : null,
      };
      const open = setTimeout(
        () => write({ event: "still-open", ms: Date.now() - started, ...what }),
        threshold,
      );
      open.unref();
      let ended = false;
      /* "finish" when the response was sent; "close" alone when the client went away first. */
      const end = (how) => () => {
        if (ended) return;
        ended = true;
        clearTimeout(open);
        const ms = Date.now() - started;
        if (ms >= threshold) write({ event: how, ms, status: res.statusCode, ...what });
      };
      res.once("finish", end("finished"));
      res.once("close", end("closed"));
    }
    return emit.apply(this, arguments);
  };
  http.Server.prototype[ARMED] = true;
  /* The command line names the process: `next start`, `next dev`, or a build worker. */
  write({ event: "armed", threshold, argv: process.argv.slice(1).join(" ").slice(-160) });

  /*
   * A BLOCKED EVENT LOOP LOOKS LIKE NOTHING ABOVE.
   *
   * A request is timed from the moment the server sees it, and a server whose
   * event loop is held sees it late — then answers it quickly, and nothing is
   * logged while the browser waited the whole time. On 2026-10-02 a 23-second
   * stall left no slow request here, so the loop's own lateness is logged too:
   * a tick that should come every 250 ms and came more than a second late.
   */
  const TICK = 250;
  let expected = Date.now() + TICK;
  setInterval(() => {
    const now = Date.now();
    const late = now - expected;
    if (late > 1_000) write({ event: "event-loop-late", ms: late });
    expected = now + TICK;
  }, TICK).unref();
}
