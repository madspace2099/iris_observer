import { expect, test, type Page } from "@playwright/test";

/**
 * The API boundary, exercised rather than inspected.
 *
 * The unit suite asserts the route's source says the right things. These call
 * it: an anonymous request, a malformed one, an oversized one, and a burst —
 * because a control that has only ever been read is a control nobody has seen
 * work.
 */

const ASK = "/api/ask";

function body(overrides: Record<string, unknown> = {}) {
  return {
    question: "What changed this month?",
    tenantSlug: "alpha",
    projectSlug: "northgate",
    period: "quarter_to_date",
    unitCode: null,
    meetingId: null,
    ...overrides,
  };
}

async function signInAs(page: Page, name: string) {
  await page.goto("/sign-in");
  await page.getByRole("button", { name: new RegExp(`Continue as ${name}`) }).click();
  await page.waitForURL(/\/showroom/);
}

test.describe("Ask Observer's API boundary", () => {
  test("refuses an unauthenticated caller", async ({ request }) => {
    const response = await request.post(ASK, { data: body() });
    expect(response.status()).toBe(401);
    const json = (await response.json()) as { error?: string };
    // A fixed string. Nothing about which tenant exists or what the schema wants.
    expect(json.error).toBe("Not signed in.");
  });

  test("refuses a malformed body without echoing it back", async ({ page }) => {
    await signInAs(page, "Petra Novák");
    const response = await page.request.post(ASK, { data: { question: "" } });
    expect(response.status()).toBe(400);
    const text = await response.text();
    expect(text).toContain("Malformed request.");
    // Zod's own message would name the fields and quote the input.
    expect(text).not.toMatch(/tenantSlug|expected|invalid_type/i);
  });

  test("refuses a question longer than the ceiling", async ({ page }) => {
    await signInAs(page, "Petra Novák");
    const response = await page.request.post(ASK, {
      data: body({ question: "a".repeat(5_000) }),
    });
    // Rejected by the schema before a tool or a token is spent.
    expect(response.status()).toBe(400);
  });

  test("never returns a key, a header or an upstream error body", async ({ page }) => {
    await signInAs(page, "Petra Novák");
    const response = await page.request.post(ASK, { data: body() });
    expect(response.ok()).toBe(true);
    const text = await response.text();

    for (const forbidden of [
      "sk-proj",
      "sk-svcacct",
      "OPENAI_API_KEY",
      "Authorization",
      "Bearer ",
      "api.openai.com",
      "insufficient_quota",
      // The operator-facing sentences the provider raises internally.
      "openai:",
      "the key was rejected",
    ]) {
      expect(text, `${forbidden} reached the browser`).not.toContain(forbidden);
    }
  });

  test("answers from evidence even when the model layer cannot be reached", async ({ page }) => {
    await signInAs(page, "Petra Novák");
    const response = await page.request.post(ASK, { data: body() });
    const json = (await response.json()) as {
      answer: { findings: unknown[]; evidence: unknown[] } | null;
      refusal: string | null;
    };

    /*
     * The point of the whole architecture.
     *
     * Whether or not a model wrote the prose, the figures were computed by the
     * tools and the evidence references are real. A missing interpretation
     * degrades the answer; it does not remove it.
     */
    expect(json.refusal).toBeNull();
    expect(json.answer).not.toBeNull();
    expect(json.answer?.findings.length).toBeGreaterThan(0);
    expect(json.answer?.evidence.length).toBeGreaterThan(0);
  });

  test("is never cached", async ({ page }) => {
    await signInAs(page, "Petra Novák");
    const response = await page.request.post(ASK, { data: body() });
    expect(response.headers()["cache-control"]).toContain("no-store");
  });

  test("stops a burst and says when to come back", async ({ page }) => {
    test.setTimeout(180_000);
    /*
     * Its own identity, deliberately.
     *
     * The meter is keyed by viewer, and one server process serves all three
     * viewport projects — so a burst signed in as the profile every other test
     * uses spends *their* allowance too, and seventeen unrelated tests fail
     * three minutes later looking like flakiness. This test exhausts nobody
     * but itself.
     */
    await signInAs(page, "MADSPACE Operations");

    /*
     * At once, because that is what a burst is.
     *
     * This fired sixty requests in sequence, which reached the ceiling
     * instantly for as long as the answer came from the deterministic composer
     * and arrived in the same tick. Against a live model each request costs
     * about six seconds — so ten of them take almost exactly the sixty seconds
     * the per-minute window covers, and the window rolled over as fast as it
     * filled. The hourly ceiling could not catch it either: that limit is
     * sixty and the loop stopped at sixty, one short, by coincidence.
     *
     * The test did not fail because a ceiling was broken. It failed because a
     * sequential loop cannot outrun a rolling window when each turn costs a
     * tenth of it. Fifteen at once against a ceiling of ten leaves no such
     * race, and finishes in seconds rather than seven minutes.
     */
    const burst = await Promise.all(
      Array.from({ length: 15 }, () => page.request.post(ASK, { data: body() })),
    );

    let stopped: { retryAfter: string | undefined; refusal: string | null } | null = null;
    for (const response of burst) {
      if (response.status() !== 429) continue;
      // The gate answers a refusal with `error`; only the pipeline produces
      // a `refusal` on a 200. Read whichever the boundary actually sends.
      const json = (await response.json()) as { error?: string; refusal?: string | null };
      stopped = {
        retryAfter: response.headers()["retry-after"],
        refusal: json.error ?? json.refusal ?? null,
      };
      break;
    }

    expect(
      stopped,
      `the burst was never stopped — 15 concurrent requests returned ${burst
        .map((r) => r.status())
        .join(", ")}`,
    ).not.toBeNull();
    expect(Number(stopped?.retryAfter)).toBeGreaterThan(0);

    /*
     * Which ceiling fires first depends on the upstream.
     *
     * With a working key the per-minute limiter reaches ten first. With a key
     * that has no quota every call fails, and the breaker opens at five — which
     * is the right precedence: stop hammering a dead upstream before bothering
     * to count requests. Both are the demo's own fixed sentences, and neither
     * carries a word from the vendor.
     */
    expect(stopped?.refusal).toMatch(
      /faster than this demonstration allows|question limit|temporarily unavailable/i,
    );
    expect(stopped?.refusal).not.toMatch(/openai|quota|token|billing/i);
  });
});
