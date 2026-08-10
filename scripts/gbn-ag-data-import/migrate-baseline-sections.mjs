#!/usr/bin/env node
// One-off migration of the committed v173 baseline into the section layout the
// V4 page adopted between versions 174 and 188: the main table's identifier,
// reason and accompanying-document rows move to their own sections ("Animal
// Identifiers", "Reason of Import", "Documents"), and "Common Attributes"
// becomes "Address Block" with a new empty `notes` column. Cell content is
// copied byte-for-byte; only section membership, row numbers and the added
// notes cells change. This keeps the first post-restructure diff free of
// reorganisation noise, so it reports only true content changes.
//
// The script is deliberately inert against any other input: it refuses to run
// unless the baseline is exactly the v173 shape (version, section names,
// columns, row counts, and every moved row's label byte-asserted). It stays
// committed as the executable audit record of the reshape.
//
// Zero npm deps; Node 18+.
//
// Usage:
//   migrate-baseline-sections.mjs [--baseline <p>] [--out <p>] [--write]
//
//   --baseline <p>  Input baseline. Default data/live-animals-table.json.
//   --out <p>       Output path. Default data/scratch/live-animals-table.migrated.json.
//   --write         Rewrite the baseline in place (equivalent to --out <baseline>).
//                   The git diff of that rewrite is the review gate; --promote on
//                   the diff script remains the only pipeline writer of the baseline.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { stderr, argv, cwd, exit } from 'node:process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = resolve(__dirname, 'data')

// ---- the frozen v173 contract (input) and the target layout (output) ----

const COLS_MAIN = ['field_name', 'type', 'conditions_values', 'applies_at',
  'source', 'mandatory', 'example', 'po_approved']
const COLS_COMMON = ['field_name', 'attributes', 'validation', 'example']
const COLS_ADDRESS = [...COLS_COMMON, 'notes']
const COLS_OUT_OF_SCOPE = ['field_name', 'notes', 'date']

const EXPECTED = {
  version: 173,
  sections: [
    { name: 'Live Animal Data Elements', columns: COLS_MAIN, rows: 45 },
    { name: 'Common Attributes', columns: COLS_COMMON, rows: 9 },
    { name: 'Out of Scope Data Elements', columns: COLS_OUT_OF_SCOPE, rows: 4 }
  ]
}

// Every main-section row in v173 order, with its byte-asserted label and the
// section it belongs to in the new layout. MAIN = stays put.
const MAIN = 'Live Animal Data Elements'
const IDENTIFIERS = 'Animal Identifiers'
const REASON = 'Reason of Import'
const DOCUMENTS = 'Documents'
const MOVES = [
  ['Reference Number', MAIN],
  ['Responsible Person for Load', MAIN],
  ['Country of origin', MAIN],
  ['Region of origin code requirement', MAIN],
  ['Region of origin code', MAIN],
  ['Internal reference number', MAIN],
  ['Commodity selection', MAIN],
  ['Type selection', MAIN],
  ['Species selection', MAIN],
  ['Animal Identifier - Microchip', IDENTIFIERS],
  ['Animal Identifier - Leg Ring', IDENTIFIERS],
  ['Animal Identifier - Passport', IDENTIFIERS],
  ['Animal Identifier - Tattoo', IDENTIFIERS],
  ['Animal Identifier - Ear Tag', IDENTIFIERS],
  ['Horse Name', IDENTIFIERS],
  ['Animal Identifier – Identification details', IDENTIFIERS],
  ['Animal Identifier – Description', IDENTIFIERS],
  ['Number of packages', MAIN],
  ['Number of animals (quantity)', MAIN],
  ['Animals certified for', MAIN],
  ['Contains Unweaned Animals', MAIN],
  ['Reason for import', REASON],
  ['Purpose in internal market', REASON],
  ['Place of Origin', MAIN],
  ['Consignor', MAIN],
  ['Consignee', MAIN],
  ['Importer', MAIN],
  ['Place of destination', MAIN],
  ['Permanent Address', MAIN],
  ['Transporter type', MAIN],
  ['Commercial Transporter', MAIN],
  ['Private Transporter', MAIN],
  ['County Parish Holding (CPH)', MAIN],
  ['Port of Entry', MAIN],
  ['Arrival date at Port', MAIN],
  ['Means of transport', MAIN],
  ['Transport identification', MAIN],
  ['Transport document reference', MAIN],
  ['Accompanying Document: Type', DOCUMENTS],
  ['Accompanying Document: Attachment Type', DOCUMENTS],
  ['Accompanying Document: Reference', DOCUMENTS],
  ['Accompanying Document: Date of Issue', DOCUMENTS],
  ['Transited Countries', MAIN],
  ['Contact Address', MAIN],
  ['Contact Address', MAIN]
]

const TARGET_COUNTS = {
  [MAIN]: 31, [REASON]: 2, [IDENTIFIERS]: 8, [DOCUMENTS]: 4,
  'Address Block': 9, 'Out of Scope Data Elements': 4
}

// ---- helpers ----

function fail (msg) { throw new Error(`migrate-baseline-sections: ${msg}`) }

function canon (v) {
  if (Array.isArray(v)) return v.map(canon)
  if (v && typeof v === 'object') {
    const o = {}
    for (const k of Object.keys(v).sort()) o[k] = canon(v[k])
    return o
  }
  return v
}
const eq = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b))
const stripRow = ({ row, ...rest }) => rest

// ---- the migration (pure; throws on any contract violation) ----

export function migrate (baseline) {
  if (baseline?.source?.version !== EXPECTED.version) {
    fail(`baseline source.version is ${baseline?.source?.version}, expected ${EXPECTED.version} - ` +
         'this one-off migration only applies to the v173 baseline')
  }
  const sections = baseline.sections ?? []
  if (sections.length !== EXPECTED.sections.length) {
    fail(`expected ${EXPECTED.sections.length} sections, found ${sections.length}`)
  }
  EXPECTED.sections.forEach((exp, i) => {
    const s = sections[i]
    if (s.section !== exp.name) fail(`section ${i + 1} is "${s.section}", expected "${exp.name}"`)
    if (!eq(s.columns, exp.columns)) fail(`section "${exp.name}" columns mismatch`)
    if (s.rows.length !== exp.rows) fail(`section "${exp.name}" has ${s.rows.length} rows, expected ${exp.rows}`)
  })

  const [main, common, outOfScope] = sections
  const label = r => r.field_name?.text ?? ''

  const buckets = { [MAIN]: [], [REASON]: [], [IDENTIFIERS]: [], [DOCUMENTS]: [] }
  main.rows.forEach((r, i) => {
    const [expected, target] = MOVES[i]
    if (label(r) !== expected) {
      fail(`main row ${i + 1} label is "${label(r)}", expected "${expected}"`)
    }
    buckets[target].push(r)
  })

  const renumber = rows => rows.map((r, i) => ({ ...r, row: i + 1 }))

  const migrated = {
    source: baseline.source,
    page_callouts: baseline.page_callouts,
    sections: [
      { section: MAIN, columns: COLS_MAIN, row_count: buckets[MAIN].length, rows: renumber(buckets[MAIN]) },
      { section: REASON, columns: COLS_MAIN, row_count: buckets[REASON].length, rows: renumber(buckets[REASON]) },
      { section: IDENTIFIERS, columns: COLS_MAIN, row_count: buckets[IDENTIFIERS].length, rows: renumber(buckets[IDENTIFIERS]) },
      { section: DOCUMENTS, columns: COLS_MAIN, row_count: buckets[DOCUMENTS].length, rows: renumber(buckets[DOCUMENTS]) },
      {
        section: 'Address Block',
        columns: COLS_ADDRESS,
        row_count: common.rows.length,
        rows: renumber(common.rows).map(r => ({ ...r, notes: { text: '' } }))
      },
      { section: 'Out of Scope Data Elements', columns: COLS_OUT_OF_SCOPE, row_count: outOfScope.rows.length, rows: renumber(outOfScope.rows) }
    ]
  }

  selfCheck(baseline, migrated)
  return migrated
}

// Invariants: rows conserved (58 -> 58, per-section counts as expected), every
// migrated cell byte-equal to its source (Address Block rows gain exactly the
// empty notes cell), source and page_callouts copied verbatim, no block fields.
function selfCheck (baseline, migrated) {
  const counts = Object.fromEntries(migrated.sections.map(s => [s.section, s.rows.length]))
  if (!eq(counts, TARGET_COUNTS)) fail(`row-count invariant violated: ${JSON.stringify(counts)}`)
  for (const s of migrated.sections) {
    if (s.row_count !== s.rows.length) fail(`section "${s.section}" row_count mismatch`)
    if ('block' in s) fail(`section "${s.section}" must not carry a block field (none existed at v173)`)
    s.rows.forEach((r, i) => { if (r.row !== i + 1) fail(`section "${s.section}" row numbering broken at index ${i}`) })
  }

  const [bMain, bCommon, bOut] = baseline.sections
  const bySection = Object.fromEntries(migrated.sections.map(s => [s.section, s.rows]))
  const cursors = { [MAIN]: 0, [REASON]: 0, [IDENTIFIERS]: 0, [DOCUMENTS]: 0 }
  bMain.rows.forEach((src, i) => {
    const target = MOVES[i][1]
    const dst = bySection[target][cursors[target]++]
    if (!eq(stripRow(src), stripRow(dst))) fail(`content drift migrating main row ${i + 1} to "${target}"`)
  })
  for (const [target, cursor] of Object.entries(cursors)) {
    if (cursor !== bySection[target].length) fail(`section "${target}" holds rows the MOVES table did not place`)
  }
  bCommon.rows.forEach((src, i) => {
    const dst = bySection['Address Block'][i]
    if (!eq({ ...stripRow(src), notes: { text: '' } }, stripRow(dst))) {
      fail(`content drift migrating Common Attributes row ${i + 1}`)
    }
  })
  bOut.rows.forEach((src, i) => {
    const dst = bySection['Out of Scope Data Elements'][i]
    if (!eq(stripRow(src), stripRow(dst))) fail(`content drift in Out of Scope row ${i + 1}`)
  })
  if (!eq(baseline.source, migrated.source)) fail('source sidecar not copied verbatim')
  if (!eq(baseline.page_callouts, migrated.page_callouts)) fail('page_callouts not copied verbatim')
}

// ---- CLI ----

function die (msg) {
  stderr.write(msg.endsWith('\n') ? msg : msg + '\n')
  exit(1)
}

function parseArgs (raw) {
  const opts = {
    baseline: resolve(DATA_DIR, 'live-animals-table.json'),
    out: resolve(DATA_DIR, 'scratch', 'live-animals-table.migrated.json'),
    write: false
  }
  for (let i = 0; i < raw.length; i++) {
    const a = raw[i]
    if (a === '-h' || a === '--help') { stderr.write('See header comment for usage.\n'); exit(0) }
    else if (a === '--baseline') opts.baseline = resolve(cwd(), raw[++i] ?? die('Missing value for --baseline'))
    else if (a === '--out') opts.out = resolve(cwd(), raw[++i] ?? die('Missing value for --out'))
    else if (a === '--write') opts.write = true
    else die(`Unknown argument: ${a}`)
  }
  if (opts.write) opts.out = opts.baseline
  return opts
}

function main () {
  const opts = parseArgs(argv.slice(2))
  let baseline
  try { baseline = JSON.parse(readFileSync(opts.baseline, 'utf8')) } catch (err) {
    die(`${opts.baseline} unreadable or not valid JSON: ${err.message}`)
  }
  let migrated
  try { migrated = migrate(baseline) } catch (err) { die(err.message) }
  mkdirSync(dirname(opts.out), { recursive: true })
  writeFileSync(opts.out, JSON.stringify(migrated, null, 2) + '\n', 'utf8')
  stderr.write(`Wrote ${opts.out} (${migrated.sections.map(s => `${s.section}: ${s.row_count}`).join(', ')})\n`)
}

if (import.meta.url === pathToFileURL(argv[1] ?? '').href) main()
