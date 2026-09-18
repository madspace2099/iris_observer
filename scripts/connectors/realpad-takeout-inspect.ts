import { readFileSync } from "node:fs";
import { readWorkbookRows } from "../../packages/connectors/src/xlsx";

/**
 * A READ-ONLY LOOK AT ONE REALPAD BUSINESS-CASE EXPORT.
 *
 * ADR-0036 leaves two REALPAD facts unpublished — the stable header ids of
 * `list-excel-business-cases` (`headermode=ids`) and the Lifecycle
 * vocabulary — and the adapter in `packages/connectors/src/realpad-deals.ts`
 * is told both through the integrations screen rather than guessing them.
 * This is the tool that reads them off a real export so a person can type
 * them in. It is not ingestion: nothing it reads is stored, and nothing it
 * prints is a row.
 *
 * What it prints, per column: the header id, the label REALPAD prints beside
 * it (`headermode=ids_labels` gives both rows), how many cells are filled,
 * how many distinct values there are, and — only for a column shaped like a
 * classification — the values themselves. A column is classification-shaped
 * when every value is a short integer, there are at most twelve distinct
 * ones and at least one repeats; a customer id, a name, an address or a
 * date never passes that test and is reported as a count alone. A column
 * whose id or label names a person (customer, salesman, user, owner, agent)
 * is reported as a count alone even when its shape passes: the name is used
 * to redact more, never to read more.
 *
 * What it never prints: the credential (read from the environment, sent to
 * REALPAD, never echoed), a cell from a column that failed the test, the
 * file itself.
 *
 *   pnpm connectors:realpad-inspect --file export.xlsx [--header-rows 1|2]
 *   REALPAD_TAKEOUT_LOGIN=… REALPAD_TAKEOUT_PASSWORD=… \
 *     pnpm connectors:realpad-inspect --project 3356887
 *
 * The fetch asks for one project (the documented way past the five-minute
 * cooldown), `headermode=ids_labels` and `xlsx=1`. A `401` is REALPAD's
 * answer for a wrong, unactivated or temporarily banned pair, and this tool
 * never retries one.
 */

const BASE = "https://cms.realpad.eu/ws/v10";
const MAX_VOCABULARY = 12;

interface Options {
  readonly file: string | null;
  readonly project: string | null;
  readonly headerRows: 1 | 2;
}

function options(argv: readonly string[]): Options {
  let file: string | null = null;
  let project: string | null = null;
  let headerRows: 1 | 2 | null = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--file" && next !== undefined) {
      file = next;
      i += 1;
    } else if (arg === "--project" && next !== undefined) {
      project = next;
      i += 1;
    } else if (arg === "--header-rows" && (next === "1" || next === "2")) {
      headerRows = next === "1" ? 1 : 2;
      i += 1;
    } else {
      usage(`unknown argument ${arg ?? ""}`);
    }
  }
  if ((file === null) === (project === null)) usage("give exactly one of --file or --project");
  /* A fetched export is asked for with both header rows; a file is what it is, one by default. */
  return { file, project, headerRows: headerRows ?? (file === null ? 2 : 1) };
}

function usage(problem: string): never {
  console.error(`realpad-takeout-inspect: ${problem}`);
  console.error(
    "usage: --file <export.xlsx> [--header-rows 1|2] | --project <realpad project id> (with REALPAD_TAKEOUT_LOGIN and REALPAD_TAKEOUT_PASSWORD in the environment)",
  );
  process.exit(2);
}

async function fetchExport(project: string): Promise<Uint8Array> {
  const login = process.env["REALPAD_TAKEOUT_LOGIN"] ?? "";
  const password = process.env["REALPAD_TAKEOUT_PASSWORD"] ?? "";
  if (login.length === 0 || password.length === 0) {
    usage("REALPAD_TAKEOUT_LOGIN and REALPAD_TAKEOUT_PASSWORD must be set for --project");
  }
  if (!/^\d+$/.test(project)) usage("--project takes REALPAD's numeric project id");
  const response = await fetch(`${BASE}/list-excel-business-cases`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      login,
      password,
      projectids: project,
      headermode: "ids_labels",
      xlsx: "1",
    }).toString(),
    signal: AbortSignal.timeout(60_000),
  });
  if (response.status === 401) {
    console.error(
      "REALPAD refused the pair (401): wrong, not activated, or temporarily banned. Not retried.",
    );
    process.exit(1);
  }
  if (response.status === 429) {
    console.error(
      `REALPAD is cooling this pair down (429); Retry-After ${response.headers.get("retry-after") ?? "unstated"} seconds.`,
    );
    process.exit(1);
  }
  if (!response.ok) {
    console.error(`REALPAD answered ${String(response.status)}.`);
    process.exit(1);
  }
  return new Uint8Array(await response.arrayBuffer());
}

/** A column that names a person is never listed, whatever its shape. Redaction only; nothing is read by name. */
const PERSON = /customer|salesman|user|owner|agent|contact|name|mail|phone/i;

/** Classification-shaped: short integers, few distinct, at least one repeated. */
function vocabulary(values: readonly string[], heading: string): readonly string[] | null {
  if (PERSON.test(heading)) return null;
  const filled = values.filter((v) => v.trim().length > 0);
  if (filled.length === 0) return null;
  if (!filled.every((v) => /^\d{1,4}$/.test(v.trim()))) return null;
  const distinct = [...new Set(filled.map((v) => v.trim()))];
  if (distinct.length > MAX_VOCABULARY || distinct.length === filled.length) return null;
  return distinct.sort((a, b) => Number(a) - Number(b));
}

async function main(): Promise<void> {
  const opts = options(process.argv.slice(2));
  const bytes =
    opts.file !== null ? readFileSync(opts.file) : await fetchExport(opts.project ?? "");
  const rows = readWorkbookRows(bytes);
  if (rows === null) {
    console.error("The bytes are not a workbook this reader accepts (.xlsx, first sheet).");
    process.exit(1);
  }
  const ids = rows[0] ?? [];
  const labels = opts.headerRows === 2 ? (rows[1] ?? []) : [];
  const data = rows.slice(opts.headerRows);
  const width = Math.max(ids.length, labels.length, ...data.map((r) => r.length));

  console.log(
    `source: ${opts.file !== null ? "file" : "REALPAD Data Takeout"} · header rows: ${String(opts.headerRows)} · deals (data rows): ${String(data.length)} · columns: ${String(width)}`,
  );
  console.log("");
  console.log(
    "column  header id                        label                            filled  distinct  values (classification-shaped columns only)",
  );
  for (let c = 0; c < width; c += 1) {
    const values = data.map((r) => r[c] ?? "");
    const filled = values.filter((v) => v.trim().length > 0).length;
    const distinct = new Set(values.filter((v) => v.trim().length > 0).map((v) => v.trim())).size;
    const id = (ids[c] ?? "").trim() || "(no id)";
    const label = (labels[c] ?? "").trim() || (opts.headerRows === 2 ? "(no label)" : "");
    const vocab = vocabulary(values, id + " " + label);
    console.log(
      `${String(c + 1).padStart(6)}  ${id.padEnd(32).slice(0, 32)} ${label.padEnd(32).slice(0, 32)} ${String(filled).padStart(6)}  ${String(distinct).padStart(8)}  ${vocab === null ? (filled === 0 ? "" : "redacted") : vocab.join(", ")}`,
    );
  }
  console.log("");
  console.log(
    "Type the header ids into the REALPAD connector's Deal columns (externalId, status, stage = Lifecycle, unitCode …) and the Lifecycle ids into its Stage words. Nothing from this export was stored.",
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "failed");
  process.exit(1);
});
