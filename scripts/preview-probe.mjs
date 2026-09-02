/**
 * The black-box check of a deployment.
 *
 * Everything here is asserted from outside, over HTTP, with no knowledge of the
 * build: the response headers, what the browser bundles contain, and what the
 * API does to a caller who has not signed in. A test that imports the
 * application can only prove the application agrees with itself.
 *
 * Prints outcomes. Never prints a matched secret — a scanner that echoes what
 * it finds has published it.
 *
 * Usage: node scripts/preview-probe.mjs https://deployment.example
 */
const BASE = process.argv[2];
if (BASE === undefined) {
  console.log("usage: node scripts/preview-probe.mjs <base-url>");
  process.exit(2);
}

const failures = [];
function check(label, condition, detail = "") {
  console.log(`${condition ? "ok  " : "FAIL"}  ${label}${detail === "" ? "" : ` — ${detail}`}`);
  if (!condition) failures.push(label);
}

/* --- 1. the security headers ------------------------------------------------ */

const home = await fetch(`${BASE}/sign-in`, { redirect: "manual" });
const headers = Object.fromEntries(home.headers.entries());

check("the deployment answers", home.status === 200, `HTTP ${home.status}`);
check("declares a content security policy", headers["content-security-policy"] !== undefined);
check("refuses framing", /frame-ancestors/.test(headers["content-security-policy"] ?? ""));
check("declares nosniff", headers["x-content-type-options"] === "nosniff");
check(
  "refuses indexing",
  /noindex/.test(headers["x-robots-tag"] ?? ""),
  headers["x-robots-tag"] ?? "absent",
);
check("sets a referrer policy", headers["referrer-policy"] !== undefined);
check(
  "declares strict transport security",
  headers["strict-transport-security"] !== undefined,
  headers["strict-transport-security"] ?? "absent",
);

/* --- 2. nothing secret in what the browser is sent --------------------------- */

const html = await home.text();

/*
 * The patterns are shapes, not values. Nothing matched is ever printed: the
 * output says which file and which shape, which is everything a person needs
 * to go and look, and nothing an onlooker can use.
 */
const SECRET_SHAPES = [
  ["OpenAI key", /sk-[A-Za-z0-9_-]{20,}/],
  ["Supabase secret key", /sb_secret_[A-Za-z0-9_-]{10,}/],
  ["service-role JWT", /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ["database URL with a password", /postgres(ql)?:\/\/[^\s:]+:[^\s@]+@/],
];

function scan(label, text) {
  for (const [what, pattern] of SECRET_SHAPES) {
    check(`${label} carries no ${what}`, !pattern.test(text));
  }
}

scan("the sign-in page", html);

/* Every script the page loads, fetched and scanned the same way. */
const scripts = [...html.matchAll(/src="(\/_next\/static\/[^"]+\.js)"/g)].map((m) => m[1]);
check("the page loads its own bundles", scripts.length > 0, `${scripts.length} scripts`);

let bundleBytes = 0;
let bundleFindings = 0;
for (const src of scripts.slice(0, 40)) {
  const body = await fetch(`${BASE}${src}`).then((r) => (r.ok ? r.text() : ""));
  bundleBytes += body.length;
  for (const [, pattern] of SECRET_SHAPES) if (pattern.test(body)) bundleFindings += 1;
  // The prompt is not a secret, but it is not the browser's either.
  if (/You are Observer, the intelligence inside/.test(body)) bundleFindings += 1;
}
check(
  "no bundle carries a secret or the system prompt",
  bundleFindings === 0,
  `${scripts.length} scripts, ${Math.round(bundleBytes / 1024)} KB scanned`,
);

/* --- 3. the API without a session -------------------------------------------- */

const anonymous = await fetch(`${BASE}/api/ask`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    tenantSlug: "alpha",
    projectSlug: "northgate",
    period: "quarter_to_date",
    question: "How is Northgate performing?",
    depth: "standard",
  }),
});
const anonymousBody = await anonymous.text();

check(
  "an unauthenticated question is refused",
  anonymous.status === 401,
  `HTTP ${anonymous.status}`,
);
check("the refusal is one sentence", anonymousBody.length < 200, `${anonymousBody.length} bytes`);
check(
  "the refusal carries no stack trace",
  !/ at |\.ts:\d+|\.js:\d+/.test(anonymousBody),
  anonymousBody.slice(0, 80),
);
scan("the unauthenticated refusal", anonymousBody);

/* A forged session must be worth nothing. */
const forged = await fetch(`${BASE}/api/ask`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Cookie: "observer_session=madspace.99999999999999.0000000000000000.forged",
  },
  body: JSON.stringify({
    tenantSlug: "alpha",
    projectSlug: "northgate",
    period: "quarter_to_date",
    question: "How is Northgate performing?",
    depth: "standard",
  }),
});
check("a forged session is refused", forged.status === 401, `HTTP ${forged.status}`);

/* --- 4. the voice capability endpoint ---------------------------------------- */

const voice = await fetch(`${BASE}/api/observer/voice/session`, { method: "GET" });
const voiceBody = await voice.text();
check(
  "the voice endpoint names no environment variable",
  !/OPENAI|SUPABASE|OBSERVER_[A-Z_]+/.test(voiceBody),
  voiceBody.slice(0, 120),
);
scan("the voice endpoint", voiceBody);

/* --- 5. what the deployment says it is configured with ------------------------ */

/*
 * There is no endpoint that reports the environment, and there should not be:
 * a public page listing which secrets a server holds is a reconnaissance gift.
 *
 * The voice capability endpoint answers the same question sideways and without
 * naming anything. It is available only when a key is configured *and* the
 * voice model is on the allowlist, so `available: true` is proof a key is
 * present. It cannot say whether the key works — only the API can say that,
 * and only by being called.
 */
const capability = JSON.parse(voiceBody === "" ? "{}" : voiceBody);
console.log(
  `info  a model key is ${capability.available === true ? "configured" : "absent or rejected"} on this deployment`,
);

/* --- 6. what the sign-in screen promises -------------------------------------- */

check(
  "the sign-in screen says it is not authentication",
  /not authentication|demonstration/i.test(html),
);
check("the deployment declares itself synthetic", /synthetic|demonstration/i.test(html));

console.log(
  failures.length === 0 ? `\nBlack-box probe clean: ${BASE}` : `\n${failures.length} failed.`,
);
process.exit(failures.length === 0 ? 0 : 1);
