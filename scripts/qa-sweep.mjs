/**
 * QA SWEEP — every account, every surface it may open, one browser.
 *
 * A breadth pass a person would do by hand: sign in as each demonstration
 * account through the visible form, open every project the account holds,
 * walk every declared surface and a bounded sample of the detail pages each
 * one links to, and write down what a tester would write down — an uncaught
 * error, a console error, a request the page made that failed, a word that
 * only ever reaches a screen by mistake (`undefined`, `NaN`, `null`,
 * `Infinity`, `[object Object]`), a main column that is empty or still says
 * "Loading", a page wider than the window, an axe violation, or a refusal
 * where the account should have been let in. Then the negative half: a
 * project the account does not hold, and every route with no session.
 *
 * Nothing here asserts; it reports. `artifacts/qa-sweep/report.json` holds
 * every page; `report.md` is the triage list.
 *
 * Usage: node scripts/qa-sweep.mjs http://localhost:3310 [--mobile] [--only=account,...]
 */
/* global document -- the `page.evaluate` callbacks below run inside the page, not in Node */
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:3310";
const MOBILE = process.argv.includes("--mobile");
const ONLY = (process.argv.find((a) => a.startsWith("--only=")) ?? "--only=")
  .slice("--only=".length)
  .split(",")
  .filter(Boolean);
const OUT = `artifacts/qa-sweep${MOBILE ? "-mobile" : ""}`;
mkdirSync(OUT, { recursive: true });

const PASSWORD = "observer-demo";
const ACCOUNTS = [
  { key: "petra", email: "petra.novak@alpha-estates.example", role: "developer" },
  { key: "tomas", email: "tomas.varga@meridian-sales.example", role: "agency_manager" },
  { key: "monika", email: "monika.kovacova@meridian-sales.example", role: "sales_agent" },
  { key: "akhilesh", email: "akhilesh.undev@meridian-sales.example", role: "sales_agent" },
  { key: "martin", email: "martin.kovac@meridian-sales.example", role: "sales_agent" },
  { key: "madspace", email: "operations@madspace.example", role: "madspace_admin" },
].filter((a) => ONLY.length === 0 || ONLY.includes(a.key));

/** Every declared project surface, from apps/web/src/lib/routes.ts. */
const PROJECT_SURFACES = [
  "",
  "/ask",
  "/ask/history",
  "/flow",
  "/project",
  "/units",
  "/meetings",
  "/features",
  "/agents",
  "/presentation",
  "/attention",
  "/audience",
  "/people",
  "/report",
  "/showroom",
  "/storytelling",
  "/overview",
];
/** Detail pages, discovered from links; this many of each kind per project. */
const DETAIL_CAP = { units: 4, meetings: 4, agents: 6, ask: 3 };
const MADSPACE_SEEDS = [
  "/madspace",
  "/madspace/projects",
  "/madspace/projects/new",
  "/madspace/diagnostics",
  "/madspace/directory",
  "/design-lab",
  "/design-lab/observer",
  "/lab",
  "/lab/overview-a",
  "/lab/overview-b",
];
/** A project nobody in the list holds, per account, for the refusal check. */
const NOT_HELD = {
  petra: "/beta/kingsford/ask",
  tomas: "/alpha/riverside/ask",
  monika: "/beta/kingsford/ask",
  akhilesh: "/alpha/riverside/ask",
  martin: "/alpha/northgate/ask",
  madspace: null,
};

const FORBIDDEN =
  /(^|[^\w.-])(undefined|NaN|Infinity|-Infinity|\[object Object\])([^\w.-]|$)|(^|[\s(])null([\s).,;:]|$)/;

const findings = [];
const pages = [];
function note(kind, where, detail) {
  findings.push({ kind, where, detail });
}

async function signIn(page, email) {
  await page.context().clearCookies();
  await page.goto(`${BASE}/sign-in`, { waitUntil: "load", timeout: 90_000 });
  await page.getByLabel("Work email address").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in with password" }).click();
  await page.waitForURL((u) => !/\/sign-in$/.test(u.pathname), { timeout: 90_000 });
  await page.waitForLoadState("networkidle").catch(() => {});
}

/** Project roots the account may open, read off /projects, which every role reaches. */
async function projectRoots(page) {
  await page.goto(`${BASE}/projects`, { waitUntil: "load", timeout: 90_000 });
  const hrefs = await page.evaluate(() =>
    [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href") ?? ""),
  );
  const roots = new Set();
  for (const h of hrefs) {
    const m = /^\/([a-z0-9-]+)\/([a-z0-9-]+)\/ask$/.exec(h);
    if (m) roots.add(`/${m[1]}/${m[2]}`);
  }
  return [...roots];
}

async function inspect(page, account, url, expectation) {
  const started = Date.now();
  const record = {
    account: account.key,
    url,
    status: null,
    finalUrl: null,
    pageErrors: [],
    consoleErrors: [],
    failedRequests: [],
    forbidden: [],
    mainChars: 0,
    stuckLoading: false,
    overflow: 0,
    axe: [],
    refused: false,
    redirected: false,
    ms: 0,
  };
  const onPageError = (e) => record.pageErrors.push(String(e?.message ?? e));
  const onConsole = (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    // Dev-server noise, not the page's: HMR sockets and preload timing hints.
    if (/_next\/hmr|preloaded using link preload|Download the React DevTools/.test(t)) return;
    record.consoleErrors.push(t.slice(0, 300));
  };
  const onResponse = (r) => {
    const u = r.url();
    if (!u.startsWith(BASE)) return;
    if (r.status() >= 400) record.failedRequests.push(`${r.status()} ${u.slice(BASE.length)}`);
  };
  page.on("pageerror", onPageError);
  page.on("console", onConsole);
  page.on("response", onResponse);
  try {
    const response = await page.goto(`${BASE}${url}`, { waitUntil: "load", timeout: 90_000 });
    record.status = response?.status() ?? null;
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(400);
    record.finalUrl = new URL(page.url()).pathname + new URL(page.url()).search;

    const probe = await page.evaluate(() => {
      const main = document.querySelector("main") ?? document.body;
      const text = (main.innerText ?? "").trim();
      return {
        text,
        bodyText: (document.body.innerText ?? "").trim(),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        title: document.title,
        refused: /not available to your account|Not available/i.test(text.slice(0, 400)),
      };
    });
    record.mainChars = probe.text.length;
    record.stuckLoading = /^Loading (this|the) /i.test(probe.text) || probe.text.length < 40;
    record.overflow = probe.overflow;
    record.refused = probe.refused;
    for (const line of probe.bodyText.split("\n")) {
      if (FORBIDDEN.test(line)) record.forbidden.push(line.trim().slice(0, 160));
    }
    if (!probe.title || /undefined/.test(probe.title))
      note("title", `${account.key} ${url}`, probe.title);

    if (!record.stuckLoading) {
      try {
        const axe = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
          .analyze();
        record.axe = axe.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          nodes: v.nodes.length,
          sample: v.nodes[0]?.target?.join(" ") ?? "",
        }));
      } catch (e) {
        note("axe-error", `${account.key} ${url}`, String(e?.message ?? e).slice(0, 200));
      }
    }
  } catch (e) {
    record.pageErrors.push(`navigation: ${String(e?.message ?? e).slice(0, 300)}`);
  } finally {
    page.off("pageerror", onPageError);
    page.off("console", onConsole);
    page.off("response", onResponse);
  }
  record.ms = Date.now() - started;
  pages.push(record);

  const where = `${account.key} ${url}`;
  /*
   * Two shapes of refusal are both by design: the layout's "Not available to
   * your account" panel (a project the account does not hold), and a redirect
   * away from the address to a surface the role may see — `requireSurface`
   * sends MADSPACE from /people to /agents, and a signed-out reader to
   * /sign-in. Only a page that stays at the refused address and renders it is
   * a finding.
   */
  record.redirected =
    record.finalUrl !== null && record.finalUrl.split("?")[0] !== url.split("?")[0];
  if (expectation === "allowed" && record.refused)
    note("refused-unexpectedly", where, record.finalUrl);
  if (expectation === "refused" && !record.refused && !record.redirected)
    note("NOT-refused", where, record.finalUrl);
  if (record.status !== null && record.status >= 400) note("http", where, `HTTP ${record.status}`);
  for (const e of record.pageErrors) note("pageerror", where, e);
  for (const e of record.consoleErrors) note("console", where, e);
  for (const e of record.failedRequests) note("request", where, e);
  for (const e of record.forbidden) note("forbidden-text", where, e);
  if (expectation === "allowed" && record.stuckLoading)
    note("empty-or-loading", where, `${record.mainChars} chars`);
  if (record.overflow > 1) note("overflow", where, `${record.overflow}px`);
  for (const v of record.axe)
    if (v.impact === "serious" || v.impact === "critical")
      note("axe", where, `${v.id} (${v.impact}) x${v.nodes} ${v.sample}`);
  if (record.axe.some((v) => v.impact === "moderate" || v.impact === "minor"))
    note(
      "axe-minor",
      where,
      record.axe
        .filter((v) => v.impact === "moderate" || v.impact === "minor")
        .map((v) => `${v.id} x${v.nodes}`)
        .join(", "),
    );
  process.stdout.write(
    `  ${record.status ?? "--"} ${String(record.ms).padStart(5)}ms ${url}${record.refused ? "  [refused]" : ""}\n`,
  );
  return record;
}

async function internalLinks(page, root) {
  return page.evaluate((root) => {
    const seen = new Set();
    for (const a of document.querySelectorAll("a[href]")) {
      const h = a.getAttribute("href") ?? "";
      if (h.startsWith(root + "/")) seen.add(h.split("#")[0]);
    }
    return [...seen];
  }, root);
}

const browser = await chromium.launch();
const viewport = MOBILE ? { width: 412, height: 915 } : { width: 1440, height: 900 };

for (const account of ACCOUNTS) {
  console.log(`\n== ${account.key} (${account.role}) ==`);
  const context = await browser.newContext({ viewport, colorScheme: "dark" });
  const page = await context.newPage();
  try {
    await signIn(page, account.email);
  } catch (e) {
    note("sign-in", account.key, String(e?.message ?? e).slice(0, 200));
    await context.close();
    continue;
  }
  const roots = await projectRoots(page);
  console.log(`  projects: ${roots.join(", ") || "(none listed)"}`);
  if (roots.length === 0) note("no-projects", account.key, "/projects lists no project");

  await inspect(page, account, "/projects", "allowed");
  await inspect(page, account, "/settings/ai", "allowed");

  for (const root of roots) {
    const detailSeen = { units: 0, meetings: 0, agents: 0, ask: 0 };
    const queue = PROJECT_SURFACES.map((s) => `${root}${s}`);
    const visited = new Set();
    while (queue.length > 0) {
      const url = queue.shift();
      if (visited.has(url)) continue;
      visited.add(url);
      // People is declared for three roles only; MADSPACE is refused there by design.
      const expectation =
        url.endsWith("/people") && account.role === "madspace_admin" ? "refused" : "allowed";
      await inspect(page, account, url, expectation);
      for (const link of await internalLinks(page, root)) {
        const rest = link.slice(root.length);
        const m = /^\/(units|meetings|agents|ask)\/[^/?]+/.exec(rest);
        if (!m) continue;
        const kind = m[1];
        if (rest === "/ask/history") continue;
        if (visited.has(link) || queue.includes(link)) continue;
        if (detailSeen[kind] >= DETAIL_CAP[kind]) continue;
        detailSeen[kind] += 1;
        queue.push(link);
      }
    }
  }

  if (account.role === "madspace_admin") {
    const seen = new Set();
    const queue = [...MADSPACE_SEEDS];
    while (queue.length > 0) {
      const url = queue.shift();
      if (seen.has(url)) continue;
      seen.add(url);
      await inspect(page, account, url, "allowed");
      const links = await page.evaluate(() =>
        [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href") ?? ""),
      );
      for (const h of links) {
        if (/^\/madspace\/(projects|sources)\/[^/]+/.test(h) && !seen.has(h) && !queue.includes(h))
          queue.push(h.split("#")[0]);
        if (
          /^\/design-lab\/[^/]+\/[^/]+$/.test(h) &&
          !seen.has(h) &&
          !queue.includes(h) &&
          queue.filter((q) => q.startsWith("/design-lab/")).length < 6
        )
          queue.push(h);
      }
    }
  } else {
    for (const url of MADSPACE_SEEDS.slice(0, 2)) await inspect(page, account, url, "refused");
  }

  const notHeld = NOT_HELD[account.key];
  if (notHeld) await inspect(page, account, notHeld, "refused");
  await context.close();
}

// Signed out: every project route must send the reader to sign in.
{
  console.log(`\n== anonymous ==`);
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const anon = { key: "anonymous", role: "none" };
  for (const url of [
    "/projects",
    "/alpha/northgate/ask",
    "/alpha/northgate/flow",
    "/madspace",
    "/settings/ai",
  ]) {
    const r = await inspect(page, anon, url, "refused");
    if (!/\/sign-in/.test(r.finalUrl ?? "")) note("anonymous-not-redirected", url, r.finalUrl);
  }
  await context.close();
}

await browser.close();

writeFileSync(
  `${OUT}/report.json`,
  JSON.stringify({ base: BASE, mobile: MOBILE, pages, findings }, null, 2),
);
const byKind = new Map();
for (const f of findings) byKind.set(f.kind, [...(byKind.get(f.kind) ?? []), f]);
const md = [
  `# QA sweep — ${BASE}${MOBILE ? " (mobile)" : ""}`,
  ``,
  `${pages.length} pages visited · ${findings.length} findings`,
  ``,
  ...[...byKind.entries()].flatMap(([kind, list]) => [
    `## ${kind} (${list.length})`,
    ``,
    ...list.map((f) => `- \`${f.where}\` — ${f.detail}`),
    ``,
  ]),
];
writeFileSync(`${OUT}/report.md`, md.join("\n"));
console.log(`\n${pages.length} pages, ${findings.length} findings → ${OUT}/report.md`);
