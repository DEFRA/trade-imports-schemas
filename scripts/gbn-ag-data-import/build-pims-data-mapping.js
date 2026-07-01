#!/usr/bin/env node
/**
 * Build the PIMS data mapping artefact from the collaborative answers JSON.
 *
 * Input:  data/portal-pims-answers.json (+ data/live-animals-table.json for progress)
 * Output: schemas/profiles/imports/gb/pims-data-mapping.md
 *
 * Layout:
 *   - A title.
 *   - One markdown table - one row per answered V4 field, with four columns:
 *       Data field | PIMS field | Schema path | Description
 *     Schema paths are rendered inside <code> tags with <br> after every "."
 *     so long paths stay legible inside table cells.
 *   - An "Examples" section below the table, with one subsection per row that
 *     has code_examples populated. Each example renders as a labelled JSON
 *     code block.
 *
 * Source fields the table uses:
 *   - v4.field_name -> Data field column
 *   - pims.field    -> PIMS field column
 *   - schema_path   -> Schema path column (broken at every ".")
 *   - description   -> Description column (the authored, agreed table text)
 *                      Falls back to agreed_answer if description is absent.
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

// Markdown table cells can't carry raw pipes or vertical whitespace without
// breaking the row. Escape pipes and collapse vertical whitespace; explicit
// <br> tags are preserved for in-cell line breaks.
function cell(value) {
  if (value === undefined || value === null) return "";
  return String(value).replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
}

// Render a schema path with line breaks after every "." segment, wrapped in
// <code> so the cell stays legibly formatted as code without using backticks
// (which don't compose with <br>).
function pathCell(path) {
  if (!path) return "";
  const segments = path.split(".");
  const joined = segments
    .map((seg, i) => (i < segments.length - 1 ? `${seg}.<br>` : seg))
    .join("");
  return `<code>${joined}</code>`;
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

// Render the actions[] array as a follow-up block with a bold label and
// hyphen-prefixed lines (separated by <br> for in-cell line breaks).
function actionsBlock(actions) {
  if (!Array.isArray(actions) || actions.length === 0) return "";
  const items = actions.map(a => `- ${a}`).join("<br>");
  return `**Actions:**<br>${items}`;
}

// Compose the description cell: description body, then a blank line, then
// the PIMS verdicts line, then (when present) a blank line and the actions
// block. Blank lines inside a markdown table cell are rendered with
// <br><br>.
function descriptionCell(entry) {
  const body = entry.description || entry.agreed_answer || "";
  const verdicts = pimsVerdictsLine(entry.pims_refs);
  const actions = actionsBlock(entry.actions);
  const parts = [body];
  if (verdicts) parts.push(verdicts);
  if (actions) parts.push(actions);
  return cell(parts.join("<br><br>"));
}

// PIMS field column: concatenate the field labels from pims_refs[] entries.
function pimsFieldCell(entry) {
  if (!Array.isArray(entry.pims_refs) || entry.pims_refs.length === 0) return "";
  return cell(entry.pims_refs.map(r => r.field || "").filter(Boolean).join(" / "));
}

function buildTable(answers) {
  const rows = (answers.answers || []).map(entry => {
    const dataField = (entry.v4 && entry.v4.field_name) || "";
    return `| ${cell(dataField)} | ${pimsFieldCell(entry)} | ${pathCell(entry.schema_path)} | ${descriptionCell(entry)} |`;
  });
  return [
    "| Data field | PIMS field | Schema path | Description |",
    "|---|---|---|---|",
    ...rows
  ];
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
    "## Mapping",
    "",
    ...buildTable(answers),
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
