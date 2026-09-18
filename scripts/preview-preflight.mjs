/**
 * IS THE PREVIEW READY FOR THE M10 ACCEPTANCE RUN?
 *
 * Read-only, from outside, over HTTP: nothing here signs in, uploads,
 * saves or syncs, and nothing here reads a secret's value. It answers the
 * questions a person can answer without touching anything, and it says
 * plainly which questions it cannot answer from here.
 *
 *   node scripts/preview-preflight.mjs https://<preview>
 *
 * Exit 0 when every check it CAN make passes, 1 when one fails, 2 on usage.
 * A 0 is not "ready": the three secrets and the two migrations are
 * verified by the operator, and the acceptance suite fails on the sentence
 * the product says when one is missing.
 */

const BASE = process.argv[2];
if (BASE === undefined) {
  console.log("usage: node scripts/preview-preflight.mjs <base-url>");
  process.exit(2);
}
const base = BASE.replace(/\/+$/, "");

const failures = [];
function check(label, condition, detail = "") {
  console.log(`${condition ? "ok  " : "FAIL"}  ${label}${detail === "" ? "" : ` — ${detail}`}`);
  if (!condition) failures.push(label);
}
function unknown(label, detail) {
  console.log(`?     ${label} — ${detail}`);
}

async function get(path, init = {}) {
  return fetch(`${base}${path}`, { redirect: "manual", ...init });
}

/* --- 1. the deployment answers, and it is a staging deployment ------------- */

const signIn = await get("/sign-in");
check("the deployment answers at /sign-in", signIn.status === 200, `HTTP ${signIn.status}`);
const html = await signIn.text();
check(
  "the sign-in is the demonstration one (accounts switched on)",
  /Work email address/.test(html),
  "the form the suite types into",
);
check(
  "the sign-in names its demonstration accounts, so the suite can type one",
  /Demonstration accounts/.test(html),
);
check("refuses indexing", /noindex/.test(signIn.headers.get("x-robots-tag") ?? ""));

/* --- 2. the routes the acceptance suite walks exist ------------------------ */

const madspace = await get("/madspace/projects");
check(
  "the MADSPACE surface exists and sends a stranger to sign in",
  madspace.status === 307 || madspace.status === 302 || madspace.status === 303,
  `HTTP ${madspace.status} → ${madspace.headers.get("location") ?? "(no location)"}`,
);
const flow = await get("/alpha/ister-tower/flow");
check(
  "Sales Flow exists for the twin project and sends a stranger to sign in",
  flow.status === 307 || flow.status === 302 || flow.status === 303,
  `HTTP ${flow.status}`,
);

/* --- 3. the scheduled sync refuses a stranger ------------------------------- */

const cron = await get("/api/observer/connectors/sync");
/*
 * Two different failures, told apart: a 401 is the M10 build refusing a
 * stranger, which is what it should do; a 404 is a build that predates the
 * connector layer altogether, which means the branch has not been pushed
 * since M10 was built and nothing below is worth checking yet.
 */
check(
  "the daily sync route exists (the deployment carries the M10 code)",
  cron.status !== 404,
  cron.status === 404
    ? "HTTP 404 — the deployed build predates M10; push the branch first"
    : `HTTP ${cron.status}`,
);
check(
  "the daily sync refuses a call without the cron secret",
  cron.status === 401,
  `HTTP ${cron.status}`,
);
unknown(
  "CRON_SECRET is set",
  "a deployment without it also answers 401; only Vercel's project settings say",
);

/* --- 4. what cannot be seen from here, and who can see it ------------------ */

unknown(
  "OBSERVER_CREDENTIAL_KEY is set",
  "not observable over HTTP without saving a credential; the integrations screen says 'holds no credential key' on a save attempt — the operator checks the Vercel project settings (name and scope, never the value)",
);
unknown(
  "OBSERVER_SUBJECT_PEPPER is set",
  "the startup log line '[observer] Ask Observer subjects are keyed' names presence without a value; read it in the Vercel runtime logs of the Preview deployment, or let the acceptance suite fail on 'holds no subject pepper'",
);
unknown(
  "migrations 20260907100000 and 20260907180000 are applied to tfcchobwobpadenampyh",
  "checked in the Supabase SQL Editor: select to_regclass('observer.deals_current'); a null means the deals migration is not applied",
);

/* --- 5. nothing secret in what the browser is sent ------------------------- */

const SECRET_SHAPES = [
  ["OpenAI key", /sk-[A-Za-z0-9_-]{20,}/],
  ["Supabase secret key", /sb_secret_[A-Za-z0-9_-]{10,}/],
  ["service-role JWT", /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ["database URL with a password", /postgres(ql)?:\/\/[^\s:]+:[^\s@]+@/],
];
for (const [name, shape] of SECRET_SHAPES) {
  check(`no ${name} in the sign-in HTML`, !shape.test(html));
}

console.log("");
console.log(
  failures.length === 0
    ? "Every check that can be made from outside passed. The three secrets and the two migrations remain the operator's to confirm; then run the acceptance suite with OBSERVER_ACCEPTANCE_TARGET=preview."
    : `${String(failures.length)} check(s) failed: ${failures.join("; ")}`,
);
process.exit(failures.length === 0 ? 0 : 1);
