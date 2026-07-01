#!/usr/bin/env node
/**
 * Walks the PIMS draft mapping (portal-pims-table.json) and reports which
 * rows are covered by an entry in portal-pims-answers.json, which are not,
 * and what verdict (confirmed / modified) each covered row received.
 *
 * Coverage is determined by pims_refs[] on each answer: each entry's
 * { section, row } locates a PIMS row.
 *
 * Run by hand at checkpoints to track progress against the source doc.
 *
 *   node scripts/gbn-ag-data-import/pims-coverage-report.js
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const DATA_DIR = resolve(new URL(".", import.meta.url).pathname, "data");
const PIMS_PATH = resolve(DATA_DIR, "portal-pims-table.json");
const ANSWERS_PATH = resolve(DATA_DIR, "portal-pims-answers.json");

const pims = JSON.parse(readFileSync(PIMS_PATH, "utf8"));
const ans = JSON.parse(readFileSync(ANSWERS_PATH, "utf8"));

// Build a lookup: PIMS coordinate -> array of { answer_row_id, verdict, note }.
const coverage = new Map();
for (const a of ans.answers || []) {
  for (const ref of a.pims_refs || []) {
    const key = ref.section + "#" + ref.row;
    if (!coverage.has(key)) coverage.set(key, []);
    coverage.get(key).push({
      answer_row_id: a.row_id,
      verdict: ref.verdict || "",
      note: ref.note || "",
      pims_status: ref.status || "",
    });
  }
}

let total = 0;
let covered = 0;
const byVerdict = { confirmed: 0, modified: 0, other: 0 };
const uncoveredByStatus = {};
const sectionsOut = [];

for (const s of pims.sections || []) {
  const sectionLines = [`\n## ${s.section} (${s.rows.length} rows)\n`];
  for (const r of s.rows || []) {
    total++;
    const key = s.section + "#" + r.row;
    const entries = coverage.get(key);
    const pimsStatus = (r.statuses && r.statuses[0] && r.statuses[0].label) || "(none)";
    const pimsField = (r.pims_field || "").slice(0, 60).replace(/\s+/g, " ");
    const v4Field = (r.live_animal_data_field || "").slice(0, 40).replace(/\s+/g, " ");
    if (entries && entries.length > 0) {
      covered++;
      for (const e of entries) {
        byVerdict[e.verdict] = (byVerdict[e.verdict] || 0) + 1;
        sectionLines.push(`  row ${String(r.row).padStart(2)}  [${e.verdict}]  ${pimsField || "(no pims field)"} -> ${e.answer_row_id}`);
      }
    } else {
      uncoveredByStatus[pimsStatus] = (uncoveredByStatus[pimsStatus] || 0) + 1;
      sectionLines.push(`  row ${String(r.row).padStart(2)}  [UNCOVERED, PIMS status: ${pimsStatus}]  PIMS: ${pimsField || "(no pims field)"}${v4Field ? "  | V4: " + v4Field : ""}`);
    }
  }
  sectionsOut.push(sectionLines.join("\n"));
}

console.log(`PIMS coverage: ${covered} of ${total} rows`);
const verdictLine = Object.entries(byVerdict)
  .filter(([k, v]) => v > 0 && k !== "other")
  .map(([k, v]) => `${k}=${v}`)
  .join(", ");
console.log(`  Verdicts: ${verdictLine || "(none)"}`);
const ub = Object.entries(uncoveredByStatus).map(([k, v]) => `${k}=${v}`).join(", ");
console.log(`  Uncovered by PIMS status: ${ub || "(none)"}`);
console.log(sectionsOut.join("\n"));
