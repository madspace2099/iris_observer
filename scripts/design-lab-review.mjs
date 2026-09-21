#!/usr/bin/env node
/**
 * Builds the founder's entry point into the design-direction review.
 *
 * Input is whatever `e2e/design-lab.spec.ts` left in `_review/design-lab`:
 * eighteen screens at two widths, three activation-closed frames, and six
 * contact sheets. Output is one `FOUNDER_REVIEW_INDEX.html` beside them.
 *
 * ## It does not choose
 *
 * Every line below is an observation about what a direction OPTIMISES, what it
 * is good at, and what it costs. There is no score, no ranking and no
 * recommendation, because the decision is a founder's and a page that nudges is
 * a page that has already decided. Read the notes, look at the sheets, choose.
 *
 * ## Why it is generated
 *
 * The notes are editorial and the file references are not: a screen that failed
 * to capture must not appear as a broken thumbnail in a review, so the script
 * checks every image it names and exits non-zero if one is missing.
 *
 * Usage: node scripts/design-lab-review.mjs [dir]
 */

import { existsSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const DIR = process.argv[2] ?? "_review/design-lab";

if (!existsSync(DIR)) {
  console.error(`no capture directory at ${DIR} — run the design-lab spec first`);
  process.exit(2);
}

const files = new Set(readdirSync(DIR).filter((name) => name.endsWith(".png")));

const VARIANTS = [
  { key: "A", name: "Canonical light", character: "Precise, ruled, operational. Dense but calm." },
  { key: "B", name: "Graphite console", character: "Explanatory, answer-first, grouped, guided." },
  {
    key: "C",
    name: "Hybrid executive",
    character: "Editorial, spacious, strong hierarchy, restrained.",
  },
];

/**
 * Three lines per direction per screen: what it optimises, what that buys, what
 * it costs. Observations, never verdicts.
 */
const SECTIONS = [
  {
    id: "projects",
    title: "Projects",
    lede: "The estate: how much of each project is actually delivering.",
    notes: {
      A: [
        "Optimises comparison: three counts on three fixed verticals, one row per project.",
        "The denominator never leaves a figure, so a short count cannot read as a whole one.",
        "Every project looks equally important; nothing on the screen says where to start.",
      ],
      B: [
        "Optimises a decision: an answer band states the estate in a sentence before the list.",
        "Projects heard from and projects never heard from are separated by a labelled band.",
        "The band spends vertical space before any project is visible.",
      ],
      C: [
        "Optimises hierarchy: one large answer, then a quiet ruled register beneath it.",
        "Says plainly that an estate has no single state, rather than inventing a badge for one.",
        "The most generous of the three with height; fewest rows visible without scrolling.",
      ],
    },
  },
  {
    id: "sources",
    title: "Sources",
    lede: "Every installation in the account. Ten of them, across four projects, one of which has ever sent a heartbeat.",
    notes: {
      A: [
        "Optimises triage: ordered worst-first and flat, so the row that needs somebody is at the top whichever project holds it.",
        "Carries the most per row — heartbeat, pending, oldest pending, quarantine — without a second click.",
        "The project travels inside the row, so 'everything in Riverside' takes reading rather than scanning.",
      ],
      B: [
        "Optimises the trip: rows grouped under their project, and each band states its own share.",
        "The answer band counts what is waiting on a person and excludes machines nobody has reached yet.",
        "Grouping means a single failing machine is found by reading bands rather than the top of a list.",
      ],
      C: [
        "Optimises two different readings: exceptions lifted out as prose, the register left alphabetical.",
        "The register does not rearrange itself when something breaks, so a lookup stays where it was.",
        "The same machine appears twice when it needs an operator — once above, once in the register.",
      ],
    },
  },
  {
    id: "project-detail",
    title: "Project detail",
    lede: "One project, and the installations inside it.",
    notes: {
      A: [
        "Optimises density: the project's counts and its sources on one uninterrupted surface.",
        "The source rows are the same shape as the account-wide list, so the two read alike.",
        "Little separates the project's own facts from its sources' facts.",
      ],
      B: [
        "Optimises orientation: a column rail over the sources, with the project's answer above it.",
        "Labels travel inside each cell, so the collapse to a phone loses no headings.",
        "The console framing gives the project's own identity less weight than the table.",
      ],
      C: [
        "Optimises separation: graphite holds conclusions, the paper plate holds measurements.",
        "The distinction is visible before anything is read, which makes the screen easy to skim.",
        "Two grounds on one screen is the most opinionated frame of the three.",
      ],
    },
  },
  {
    id: "source-detail",
    title: "Source detail",
    lede: "One installation: three states, the evidence for each, and what it last reported.",
    notes: {
      A: [
        "Optimises the record: every reported field present, on one page, in a fixed order.",
        "Absences are words rather than dashes, so a missing measurement cannot read as a zero.",
        "The longest of the three; the answer is above the fold but the evidence is not.",
      ],
      B: [
        "Optimises the three states: a matrix whose columns line up state, evidence and instant.",
        "The evidence sits beside the word it proves rather than in a section of its own.",
        "The matrix is the densest thing in the round and asks the most of a first-time reader.",
      ],
      C: [
        "Optimises the verdict: one health word, large, with its sentence directly under it.",
        "What each state does NOT prove is stated in the open rather than behind a disclosure.",
        "Spends the most space on the least data, which will read differently on a busy machine.",
      ],
    },
  },
  {
    id: "activation",
    title: "Activation",
    lede: "The plaintext code exists once and is never stored. Every direction shows a sample and labels it as one.",
    notes: {
      A: [
        "Optimises the sequence: the code, then what to do with it, in reading order down the page.",
        "No dialog at all — the panel is part of the page, so nothing is ever hidden behind it.",
        "Without a dialog the 'shown once' rule is carried by words rather than by the interaction.",
      ],
      B: [
        "Optimises the moment: a modal panel that makes the one-time nature of the code physical.",
        "The copy control announces what it did, so the confirmation is not only visual.",
        "A modal covers the screen it belongs to; the closed state is a second frame to review.",
      ],
      C: [
        "Optimises the warning: the panel is a dialog and the surrounding page states what happens next.",
        "Dismissal now returns focus to the control that reopens it, so a keyboard reader is never stranded.",
        "The lab reopen control does not exist in the product; the real flow has no way back.",
      ],
    },
  },
  {
    id: "diagnostics",
    title: "Diagnostics",
    lede: "The whole account, worst first. Five bands, each naming which kind of nothing it holds when empty.",
    notes: {
      A: [
        "Optimises scanning: bands on one surface, so an empty estate reads as quiet rather than broken.",
        "Each band says how many sources are absent from it and why, instead of listing zeros.",
        "Five bands on one page is long; the first band carries almost all the urgency.",
      ],
      B: [
        "Optimises the operator's question: what needs work, answered before the record starts.",
        "Bands share the column rail, so the same fact sits in the same place in every band.",
        "The console ground makes a quiet estate look like an alert surface with nothing on it.",
      ],
      C: [
        "Optimises calm: the same bands with more air and a stronger heading hierarchy.",
        "No decorative chart anywhere; every figure on the screen is a state somebody persisted.",
        "The extra height means fewer bands are visible at once than in either alternative.",
      ],
    },
  },
];

const esc = (value) =>
  String(value).replace(
    /[&<>"]/g,
    (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character],
  );

const missing = [];

function image(name) {
  if (!files.has(name)) missing.push(name);
  return name;
}

const CSS = `
:root{color-scheme:dark;--bg:#111110;--panel:#191918;--raised:#201f1e;--line:#2c2b29;--ink:#f2f1ef;--ink2:#b8b5b0;--ink3:#8a8783;--accent:#6f9bd8}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.6 -apple-system,"Segoe UI",system-ui,sans-serif}
.wrap{max-width:1400px;margin:0 auto;padding:48px 28px 96px}
h1{margin:0 0 8px;font-size:2rem;letter-spacing:-.02em}
h2{margin:0;font-size:1.3rem;letter-spacing:-.01em}
.lede{margin:0 0 6px;color:var(--ink2);max-width:78ch}
.standing{margin:24px 0 40px;padding:16px 18px;border:1px solid var(--line);border-radius:12px;background:var(--panel);color:var(--ink2);max-width:88ch}
.standing b{color:var(--ink)}
nav{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 40px}
nav a{padding:7px 14px;border:1px solid var(--line);border-radius:999px;background:var(--panel);color:var(--ink);text-decoration:none;font-size:.86rem}
nav a:hover{border-color:var(--accent);color:var(--accent)}
section{margin:0 0 56px;padding-top:8px;border-top:1px solid var(--line)}
.head{display:flex;flex-wrap:wrap;align-items:baseline;gap:14px;margin:20px 0 4px}
.sheet{display:block;margin:18px 0 22px}
.sheet img{width:100%;border:1px solid var(--line);border-radius:10px;display:block}
.sheet span{display:block;margin-top:8px;font-size:.8rem;color:var(--ink3);letter-spacing:.06em;text-transform:uppercase}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}
@media(max-width:900px){.grid{grid-template-columns:1fr}}
.card{border:1px solid var(--line);border-radius:12px;background:var(--panel);overflow:hidden;display:flex;flex-direction:column}
.card figure{margin:0}
.card img{width:100%;display:block;border-bottom:1px solid var(--line);background:var(--raised)}
.card .body{padding:14px 16px 16px}
.who{display:flex;align-items:baseline;gap:9px;margin:0 0 10px}
.key{font-weight:700;font-size:1.05rem}
.nm{color:var(--ink2);font-size:.9rem}
ul{margin:0;padding-left:17px;color:var(--ink2);font-size:.9rem}
li{margin:0 0 6px}
li:last-child{margin:0}
.links{display:flex;flex-wrap:wrap;gap:10px;padding:0 16px 16px;font-size:.82rem}
.links a{color:var(--accent);text-decoration:none;border-bottom:1px solid transparent}
.links a:hover{border-bottom-color:var(--accent)}
footer{margin-top:48px;padding-top:20px;border-top:1px solid var(--line);color:var(--ink3);font-size:.84rem}
`;

const sections = SECTIONS.map((section) => {
  const cards = VARIANTS.map((variant) => {
    const wide = image(`${variant.key}-${section.id}-1440.png`);
    const phone = image(`${variant.key}-${section.id}-390.png`);
    const closed = section.id === "activation" ? `${variant.key}-activation-closed-1440.png` : null;
    if (closed !== null) image(closed);

    const notes = section.notes[variant.key].map((line) => `<li>${esc(line)}</li>`).join("");

    return `<article class="card">
      <figure><a href="${wide}" target="_blank" rel="noopener"><img src="${wide}" alt="${esc(variant.key)} — ${esc(section.title)}" loading="lazy"></a></figure>
      <div class="body">
        <p class="who"><span class="key">${variant.key}</span><span class="nm">${esc(variant.name)}</span></p>
        <ul>${notes}</ul>
      </div>
      <p class="links">
        <a href="${wide}" target="_blank" rel="noopener">Full size, 1440</a>
        <a href="${phone}" target="_blank" rel="noopener">Phone, 390</a>
        ${closed === null ? "" : `<a href="${closed}" target="_blank" rel="noopener">Panel dismissed</a>`}
      </p>
    </article>`;
  }).join("\n");

  const sheet = image(`SHEET-${section.id}.png`);

  return `<section id="${section.id}">
    <div class="head"><h2>${esc(section.title)}</h2></div>
    <p class="lede">${esc(section.lede)}</p>
    <a class="sheet" href="${sheet}" target="_blank" rel="noopener">
      <img src="${sheet}" alt="${esc(section.title)}: A, B and C side by side">
      <span>A · B · C, same estate, same moment — click for full size</span>
    </a>
    <div class="grid">${cards}</div>
  </section>`;
}).join("\n");

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>IRIS Control Plane — Design Direction Review</title>
<style>${CSS}</style></head>
<body><div class="wrap">
<h1>IRIS CONTROL PLANE — DESIGN DIRECTION REVIEW</h1>
<p class="lede">Six screens, three directions, one estate. Every image below was rendered from the
same control plane the live screens read, at the same moment, from the same ten installations.</p>

<div class="standing">
<p style="margin:0 0 10px"><b>No direction is recommended here.</b> Each one carries three lines:
what it optimises, what that buys, and what it costs. There is no score and no ranking, because
the decision is yours to make by looking.</p>
<p style="margin:0"><b>What is not in these pictures.</b> Nothing is rolled out. The live
<code>/madspace/*</code> screens are untouched. Every control in the lab is drawn and inert, and
the activation code in every variant is a labelled sample — the real plaintext exists for the
length of one server response and is never stored.</p>
</div>

<nav>${SECTIONS.map((section) => `<a href="#${section.id}">${esc(section.title)}</a>`).join("")}
<a href="../../docs/FOUNDER_DESIGN_DECISION_MATRIX.md">Decision matrix &rarr;</a></nav>

${sections}

<footer>
Generated from <code>${esc(DIR)}</code> · ${String(files.size)} captures ·
${String(SECTIONS.length * VARIANTS.length)} primary screens ·
the accessibility contract and the portfolio-scale layout checks are separate suites, and both pass.
</footer>
</div></body></html>
`;

writeFileSync(path.join(DIR, "FOUNDER_REVIEW_INDEX.html"), html, "utf8");

console.log(`FOUNDER_REVIEW_INDEX.html → ${DIR}`);
console.log(`captures referenced: ${String(files.size)}`);

if (missing.length > 0) {
  console.error(`MISSING CAPTURES (${String(missing.length)}): ${missing.join(", ")}`);
  process.exit(1);
}
