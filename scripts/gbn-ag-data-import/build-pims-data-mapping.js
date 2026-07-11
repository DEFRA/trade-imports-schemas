#!/usr/bin/env node
/**
 * Build the PIMS data mapping artefact from the collaborative answers JSON.
 *
 * Input:  data/portal-pims-answers.json (+ data/live-animals-table.json for progress)
 * Output: schemas/profiles/imports/gb/pims-data-mapping.md
 *
 * Layout:
 *   - A title and intro.
 *   - The scope decisions.
 *   - One `##` section per answered V4 field: a `PIMS field` bullet, a
 *     `Schema path` bullet (inline `code` for shallow paths, a fenced ASCII
 *     tree for paths deeper than two dots), a `Description` bullet, and any
 *     follow-up actions. A fenced code block renders a real tree in GitHub and
 *     cannot sit in a table cell, so the mapping is sections, not a table.
 *   - An "Examples" section, with one subsection per row that has code_examples
 *     populated. Each example renders as a labelled JSON code block.
 *
 * Source fields each field section uses:
 *   - v4.field_name -> the `##` heading (falls back to row_id)
 *   - pims.field    -> the PIMS field bullet
 *   - schema_path   -> the Schema path bullet (inline, or a tree when deep)
 *   - description   -> the Description bullet (falls back to agreed_answer),
 *                      with the PIMS verdicts appended
 *
 * The richer per-row context (v4 metadata, agreed_answer narrative,
 * consumer_rule, notes, actions, scope decisions, pending schema updates)
 * stays in the JSON as the historical record of the walk. The markdown is the
 * distilled consumer-facing view.
 *
 * Run:
 *   node scripts/gbn-ag-data-import/build-pims-data-mapping.js
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const SCRIPT_DIR = resolve(new URL(".", import.meta.url).pathname);
const DATA_DIR = resolve(SCRIPT_DIR, "data");
const REPO = resolve(SCRIPT_DIR, "..", "..");
const ANSWERS_PATH = resolve(DATA_DIR, "portal-pims-answers.json");
const V4_PATH = resolve(DATA_DIR, "live-animals-table.json");
const OUTPUT_PATH = resolve(REPO, "schemas/profiles/imports/gb/pims-data-mapping.md");

function readAnswers() {
  return JSON.parse(readFileSync(ANSWERS_PATH, "utf8"));
}

// Read the V4 spec to learn how many "Live Animal Data Elements" exist, so the
// console output can report progress as "X of N V4 rows answered".
function readV4Total() {
  try {
    const v4 = JSON.parse(readFileSync(V4_PATH, "utf8"));
    const section = (v4.sections || []).find(s => s.section === "Live Animal Data Elements");
    return (section && section.row_count) || 0;
  } catch {
    return 0;
  }
}

// Collapse a value to a single line (runs of whitespace become one space) and
// escape pipes defensively so a stray pipe never breaks downstream markdown.
function cell(value) {
  if (value === undefined || value === null) return "";
  return String(value).replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
}

// Schema path as a bullet. Inline `code` for shallow paths (<= 2 dots); for a
// deeper path, a fenced ASCII tree nested under the bullet - a fenced code block
// renders a real tree in GitHub but cannot sit in a table cell. Each deeper
// level sits under its parent with a "└── " connector.
function pathBullet(path) {
  if (!path) return "- **Schema path:** _none_";
  const dots = (path.match(/\./g) || []).length;
  if (dots <= 2) return "- **Schema path:** `" + path + "`";
  const tree = path.split(".").map((seg, i) =>
    i === 0 ? seg : `${" ".repeat((i - 1) * 4)}└── ${seg}`
  );
  // Indent the fence and its lines by two so the code block belongs to the bullet.
  return ["- **Schema path:**", "", "  ```", ...tree.map(line => "  " + line), "  ```"].join("\n");
}

// Render each pims_refs[] entry's verdict as a short bold line.
// "Confirmed PIMS row 7." for the default Importer Notification section;
// "Confirmed PIMS Commodity Species row 1." for other sections. Joined with
// spaces. Returned without a trailing separator so the caller controls layout.
function pimsVerdictsLine(refs) {
  if (!Array.isArray(refs) || refs.length === 0) return "";
  const parts = refs.map(ref => {
    const verdict = ref.verdict ? ref.verdict[0].toUpperCase() + ref.verdict.slice(1) : "";
    const section = (ref.section || "").replace(/^Importer Notification - mapped fields$/, "");
    const sectionPart = section ? `${section} ` : "";
    const head = `**${verdict} PIMS ${sectionPart}row ${ref.row}.**`;
    return ref.note ? `${head} ${ref.note}` : head;
  });
  return parts.join(" ");
}

// PIMS field bullet value: concatenate the field labels from pims_refs[] entries.
function pimsFieldCell(entry) {
  if (!Array.isArray(entry.pims_refs) || entry.pims_refs.length === 0) return "";
  return cell(entry.pims_refs.map(r => r.field || "").filter(Boolean).join(" / "));
}

// One `##` section per answered field, replacing the old table row. The V4
// field name is the heading; PIMS field, schema path, and description are
// bullets; the description carries the PIMS verdicts; follow-up actions become
// a bullet list under an **Actions:** label.
function fieldSection(entry) {
  const name = (entry.v4 && entry.v4.field_name) || entry.row_id || "(unnamed)";
  const description = [entry.description || entry.agreed_answer || "", pimsVerdictsLine(entry.pims_refs)]
    .filter(Boolean)
    .join(" ");
  const out = [`## ${name}`, ""];
  const pims = pimsFieldCell(entry);
  if (pims) out.push(`- **PIMS field:** ${pims}`);
  out.push(pathBullet(entry.schema_path));
  if (description) out.push(`- **Description:** ${description}`);
  if (Array.isArray(entry.actions) && entry.actions.length > 0) {
    out.push("", "**Actions:**", "");
    for (const action of entry.actions) out.push(`- ${action}`);
  }
  out.push("");
  return out;
}

function buildEntries(answers) {
  return (answers.answers || []).flatMap(fieldSection);
}

function buildExamples(answers) {
  const entries = (answers.answers || []).filter(e =>
    Array.isArray(e.code_examples) && e.code_examples.length > 0
  );
  if (entries.length === 0) return [];
  const lines = ["", "## Examples", ""];
  for (const entry of entries) {
    const heading = (entry.v4 && entry.v4.field_name) || entry.row_id || "(unnamed)";
    lines.push(`### ${heading}`);
    lines.push("");
    for (const ex of entry.code_examples) {
      if (ex.label) {
        lines.push(`**${ex.label}**`);
        lines.push("");
      }
      lines.push("```json");
      lines.push(ex.code || "");
      lines.push("```");
      lines.push("");
    }
  }
  return lines;
}

// Short intro for cold readers landing on the committed file.
const INTRO = [
  "This guide maps the Defra V4 Live Animals Data Fields specification against the GBN-AG schema. For each V4 field it gives the schema path, an implementation description, the engagement with the PIMS team's draft mapping (`Confirmed` where the draft was right; `Modified` where it was off; `Deferred` where an open question remains), and any follow-up actions captured during the review.",
  "",
  "Read the description first to understand what the slot carries, then the schema path to know where to read it from, then the bold PIMS engagement line for the verdict against the consumer draft.",
  ""
];

// Render the scope_decisions section. Each decision lists its topic and the
// agreed position - readers see at a glance what is out of scope for GBN-AG.
function buildScopeDecisions(answers) {
  const decisions = answers.scope_decisions || [];
  if (decisions.length === 0) return [];
  const lines = ["## Scope decisions", ""];
  for (const sd of decisions) {
    lines.push(`### ${sd.topic}`);
    lines.push("");
    lines.push(sd.decision);
    lines.push("");
  }
  return lines;
}

function main() {
  const answers = readAnswers();
  const lines = [
    "# PIMS data mapping",
    "",
    ...INTRO,
    ...buildScopeDecisions(answers),
    ...buildEntries(answers),
    ...buildExamples(answers),
    ""
  ];
  writeFileSync(OUTPUT_PATH, lines.join("\n"));
  const fieldsCount = (answers.answers || []).length;
  const examplesCount = (answers.answers || []).filter(e =>
    Array.isArray(e.code_examples) && e.code_examples.length > 0
  ).length;
  const v4Total = readV4Total();
  const progress = v4Total ? `${fieldsCount} of ${v4Total} V4 rows answered` : `${fieldsCount} rows`;
  console.log(`Wrote ${OUTPUT_PATH}`);
  console.log(`  ${progress}, ${examplesCount} with examples`);
}

main();
