/**
 * Proves the shared ceiling is real.
 *
 * Not a unit test — a unit test would mock the database and pass whether or not
 * the function exists. This calls the deployed one over the same transport the
 * application uses, drives it past a limit, and asserts it refuses.
 *
 * Prints outcomes only. No key, no URL, no row contents.
 */
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

/* .env.local is read here rather than exported into the shell, so no secret
 * ever appears in a command line or a process listing. */
function env(name) {
  if (process.env[name] !== undefined && process.env[name] !== "") return process.env[name];
  try {
    const line = readFileSync(".env.local", "utf8")
      .split(/\r?\n/)
      .find((l) => l.startsWith(`${name}=`));
    return line === undefined ? undefined : line.slice(name.length + 1).trim();
  } catch {
    return undefined;
  }
}

const url = env("SUPABASE_URL");
const key = env("SUPABASE_SECRET_KEY");

if (url === undefined || key === undefined) {
  console.log("SUPABASE: not configured — shared ceiling would fail open");
  process.exit(2);
}

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
  "Accept-Profile": "observer",
  "Content-Profile": "observer",
};

async function consume(body) {
  const response = await fetch(`${url}/rest/v1/rpc/consume_ai_quota`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`HTTP ${response.status} ${detail.slice(0, 200)}`);
  }
  return (await response.json())[0];
}

const failures = [];
function check(label, condition, detail = "") {
  console.log(`${condition ? "ok  " : "FAIL"}  ${label}${detail === "" ? "" : ` — ${detail}`}`);
  if (!condition) failures.push(label);
}

const session = `verify_${randomUUID()}`;
const client = `verify_${randomUUID()}`;
const project = `verify/${randomUUID()}`;
const generous = { p_per_hour: 10_000, p_client_per_hour: 10_000, p_project_per_day: 10_000 };

try {
  /* 1. reachable at all */
  const first = await consume({
    p_session: session,
    p_client_hash: client,
    p_project: project,
    p_per_minute: 3,
    ...generous,
  });
  check("the function is reachable over PostgREST", first !== undefined);
  check("a fresh subject is allowed", first?.allowed === true);

  /* 2. the minute ceiling actually stops */
  let refusal = null;
  for (let i = 0; i < 4; i += 1) {
    const verdict = await consume({
      p_session: session,
      p_client_hash: client,
      p_project: project,
      p_per_minute: 3,
      ...generous,
    });
    if (!verdict.allowed) {
      refusal = verdict;
      break;
    }
  }
  check("the per-minute ceiling refuses", refusal !== null, refusal?.reason ?? "never refused");
  check(
    "the refusal names its reason and a retry",
    refusal?.reason === "rate_limited" && Number(refusal?.retry_after_seconds) > 0,
  );

  /* 3. a refused request does not spend the other ceilings */
  const other = await consume({
    p_session: `${session}_b`,
    p_client_hash: client,
    p_project: project,
    p_per_minute: 3,
    ...generous,
  });
  check("an unrelated session is unaffected", other?.allowed === true);

  /* 4. the daily budget — the ceiling that bounds the bill */
  const budgetProject = `verify/${randomUUID()}`;
  let dayRefusal = null;
  for (let i = 0; i < 3; i += 1) {
    const verdict = await consume({
      p_session: `${session}_d${i}`,
      p_client_hash: `${client}_d${i}`,
      p_project: budgetProject,
      p_per_minute: 100,
      p_per_hour: 100,
      p_client_per_hour: 100,
      p_project_per_day: 2,
    });
    if (!verdict.allowed) dayRefusal = verdict;
  }
  check(
    "the daily budget refuses across different sessions",
    dayRefusal?.reason === "daily_budget",
    dayRefusal?.reason ?? "never refused",
  );

  /* 5. the tables are not readable without the secret key */
  const anon = await fetch(`${url}/rest/v1/ai_rate_buckets?select=count`, {
    headers: { "Accept-Profile": "observer" },
  });
  check("the counters are unreadable without a key", anon.status === 401 || anon.status === 404);

  /* 6. the audit table accepts a record with no content in it */
  const audit = await fetch(`${url}/rest/v1/ai_requests`, {
    method: "POST",
    headers: { ...headers, Prefer: "return=minimal" },
    body: JSON.stringify({
      subject: session,
      client_hash: client,
      tenant_slug: "verify",
      project_slug: "verify",
      viewer_role: "developer",
      outcome: "answered",
      model: null,
      tools: [],
      tool_calls: 0,
      question_chars: 42,
    }),
  });
  check("the audit table accepts a record", audit.ok, audit.ok ? "" : `HTTP ${audit.status}`);

  /* housekeeping — this run's rows do not belong in anyone's counters */
  await fetch(`${url}/rest/v1/ai_requests?subject=eq.${encodeURIComponent(session)}`, {
    method: "DELETE",
    headers,
  });
  await fetch(`${url}/rest/v1/ai_rate_buckets?subject=like.verify_*`, {
    method: "DELETE",
    headers,
  });
} catch (error) {
  console.log(`FAIL  the shared ceiling could not be exercised — ${String(error.message)}`);
  failures.push("transport");
}

console.log(failures.length === 0 ? "\nShared ceiling verified." : `\n${failures.length} failed.`);
process.exit(failures.length === 0 ? 0 : 1);
