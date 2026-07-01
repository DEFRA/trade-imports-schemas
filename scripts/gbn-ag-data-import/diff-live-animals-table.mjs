#!/usr/bin/env node
// Diff the baseline live-animals-table.json against a freshly converted
// live-animals-table.next.json and emit a field-level delta (JSON + markdown).
// --promote is the ONLY action that advances the baseline.
//
// Zero npm deps; Node 18+. The cell-encoding model and the (section, clean-label)
// row-key rule are owned by the converter (story 02); this script imports rowKey
// rather than re-deriving it, so there is one owner for the shape.
//
// Usage:
//   diff-live-animals-table.mjs [--baseline <p>] [--next <p>] [--out <p>] [--promote]
//
//   --baseline <p>  Baseline table JSON. Default workspace/live-animals-table.json.
//                   If absent on disk, every next row is reported as added (bootstrap).
//   --next <p>      Converted table JSON. Default workspace/live-animals-table.next.json.
//   --out <p>       Delta JSON path. Default workspace/live-animals-delta.json; the
//                   markdown summary is written alongside with a .md extension.
//   --promote       After diffing, replace the baseline with the next file. This is
//                   the only path that writes the baseline. Bootstrap a brand-new
//                   page with: convert, then --promote (the diff is all-added).

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { stderr, argv, cwd, exit } from 'node:process'
import { rowKey } from './convert-live-animals-table.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = resolve(__dirname, 'data')
const SCRATCH = resolve(DATA_DIR, 'scratch')

function die (msg) {
  stderr.write(msg.endsWith('\n') ? msg : msg + '\n')
  exit(1)
}

function loadJSON (path) {
  if (!existsSync(path)) return null
  try { return JSON.parse(readFileSync(path, 'utf8')) } catch (err) {
    die(`${path} is not valid JSON: ${err.message}`)
  }
}

const label = row => (row.field_name && row.field_name.text) || ''

// Order-independent deep equality, so a cell that differs only in JSON key order
// is not reported as a change.
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

function keyRows (section, rows) {
  const map = new Map()
  const dupes = []
  for (const r of rows) {
    const k = rowKey(section, label(r))
    if (map.has(k)) dupes.push(k)
    map.set(k, r)
  }
  return { map, dupes }
}

function diffSection (name, baseRows, nextRows) {
  const base = keyRows(name, baseRows || [])
  const next = keyRows(name, nextRows || [])
  const bMap = base.map
  const nMap = next.map
  const added = []
  const removed = []
  const changed = []
  for (const [k, r] of nMap) if (!bMap.has(k)) added.push(label(r))
  for (const [k, r] of bMap) if (!nMap.has(k)) removed.push(label(r))
  for (const [k, nr] of nMap) {
    if (!bMap.has(k)) continue
    const br = bMap.get(k)
    // Compare each column cell. 'row' is positional; 'po_approved_status' is
    // derived from the po_approved cell's tasks, so a task change is reported once
    // (as the po_approved column) rather than twice.
    const cols = new Set([...Object.keys(br), ...Object.keys(nr)])
    cols.delete('row')
    cols.delete('po_approved_status')
    for (const col of cols) {
      if (!eq(br[col], nr[col])) {
        changed.push({ field: label(nr), column: col, before: br[col] ?? null, after: nr[col] ?? null })
      }
    }
  }
  const duplicate_keys = [...new Set([...base.dupes, ...next.dupes])]
  const section = { section: name, added, removed, changed }
  if (duplicate_keys.length) section.duplicate_keys = duplicate_keys
  return section
}

function buildDelta (baseline, next) {
  const baseSections = baseline?.sections ?? []
  const nextSections = next.sections ?? []
  const order = nextSections.map(s => s.section)
  for (const s of baseSections) if (!order.includes(s.section)) order.push(s.section)

  const sections = order.map(name => {
    const bs = baseSections.find(s => s.section === name)
    const ns = nextSections.find(s => s.section === name)
    if (ns && !bs) return { section: name, section_added: true, added: ns.rows.map(label), removed: [], changed: [] }
    if (bs && !ns) return { section: name, section_removed: true, added: [], removed: bs.rows.map(label), changed: [] }
    return diffSection(name, bs.rows, ns.rows)
  })

  const bc = baseline?.page_callouts ?? []
  const nc = next.page_callouts ?? []

  // Surface row-key collisions in the persisted delta, not just on stderr: two
  // rows sharing a clean field_name label collapse to one key, so a sibling row
  // can be hidden from added/changed. A precise delta must flag that, not drop it.
  const warnings = []
  for (const s of sections) {
    for (const k of s.duplicate_keys ?? []) {
      warnings.push(`section "${s.section}": duplicate row-key "${k}" - rows share a clean ` +
        'field_name label, so only the last is compared and a sibling row may be hidden')
    }
  }

  return {
    from_version: baseline?.source?.version ?? null,
    to_version: next.source?.version ?? null,
    from_version_when: baseline?.source?.version_when ?? null,
    to_version_when: next.source?.version_when ?? null,
    warnings,
    sections,
    callouts: {
      added: nc.filter(c => !bc.some(b => eq(b, c))),
      removed: bc.filter(c => !nc.some(n => eq(n, c)))
    }
  }
}

function fmt (v) {
  if (v === null || v === undefined) return '(absent)'
  const s = (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 1 && 'text' in v)
    ? JSON.stringify(v.text)
    : JSON.stringify(v)
  // Keep the markdown summary legible; the full before/after lives in delta.json.
  return s.length > 160 ? s.slice(0, 157) + '... (see delta.json)' : s
}

function renderMarkdown (delta) {
  const L = ['# Live Animals delta', '']
  const whenFrom = delta.from_version_when ?? '?'
  const whenTo = delta.to_version_when ?? '?'
  L.push(`Source version ${delta.from_version ?? '(none)'} -> ${delta.to_version ?? '(none)'} (${whenFrom} -> ${whenTo})`)
  L.push('')
  if (delta.warnings.length) {
    L.push('## Warnings')
    delta.warnings.forEach(w => L.push(`- ${w}`))
    L.push('')
  }
  for (const s of delta.sections) {
    L.push(`## ${s.section}`)
    if (s.section_added) L.push('_New section._')
    if (s.section_removed) L.push('_Section removed._')
    if (!s.added.length && !s.removed.length && !s.changed.length) {
      L.push('No changes.', '')
      continue
    }
    if (s.added.length) { L.push(`Added (${s.added.length}):`); s.added.forEach(f => L.push(`- ${f}`)) }
    if (s.removed.length) { L.push(`Removed (${s.removed.length}):`); s.removed.forEach(f => L.push(`- ${f}`)) }
    if (s.changed.length) {
      L.push(`Changed (${s.changed.length}):`)
      s.changed.forEach(c => L.push(`- ${c.field} / ${c.column}: ${fmt(c.before)} -> ${fmt(c.after)}`))
    }
    L.push('')
  }
  const { added, removed } = delta.callouts
  if (added.length || removed.length) {
    L.push('## Page callouts')
    added.forEach(c => L.push(`- added [${c.kind}] ${c.text}`))
    removed.forEach(c => L.push(`- removed [${c.kind}] ${c.text}`))
    L.push('')
  }
  return L.join('\n')
}

function parseArgs (raw) {
  const opts = {
    baseline: resolve(DATA_DIR, 'live-animals-table.json'),
    next: resolve(SCRATCH, 'live-animals-table.next.json'),
    out: resolve(SCRATCH, 'live-animals-delta.json'),
    promote: false
  }
  for (let i = 0; i < raw.length; i++) {
    const a = raw[i]
    if (a === '-h' || a === '--help') { stderr.write('See header comment for usage.\n'); exit(0) }
    else if (a === '--baseline') opts.baseline = resolve(cwd(), raw[++i] ?? die('Missing value for --baseline'))
    else if (a === '--next') opts.next = resolve(cwd(), raw[++i] ?? die('Missing value for --next'))
    else if (a === '--out') opts.out = resolve(cwd(), raw[++i] ?? die('Missing value for --out'))
    else if (a === '--promote') opts.promote = true
    else die(`Unknown argument: ${a}`)
  }
  return opts
}

function main () {
  const opts = parseArgs(argv.slice(2))

  const next = loadJSON(opts.next)
  if (!next) die(`Next table ${opts.next} not found - run the converter first.`)
  const baseline = loadJSON(opts.baseline) // null => bootstrap (all added)

  const delta = buildDelta(baseline, next)
  const mdPath = opts.out.replace(/\.json$/, '') + '.md'
  writeFileSync(opts.out, JSON.stringify(delta, null, 2) + '\n', 'utf8')
  writeFileSync(mdPath, renderMarkdown(delta) + '\n', 'utf8')

  const totals = delta.sections.reduce((a, s) => {
    a.added += s.added.length; a.removed += s.removed.length; a.changed += s.changed.length
    return a
  }, { added: 0, removed: 0, changed: 0 })
  stderr.write(`Wrote ${opts.out} and ${mdPath} ` +
    `(v${delta.from_version ?? '?'} -> v${delta.to_version ?? '?'}; ` +
    `+${totals.added} -${totals.removed} ~${totals.changed})\n`)
  for (const w of delta.warnings) stderr.write(`warning: ${w}\n`)

  if (opts.promote) {
    writeFileSync(opts.baseline, readFileSync(opts.next, 'utf8'), 'utf8')
    stderr.write(`Promoted: ${opts.baseline} now equals ${opts.next}\n`)
  }
}

if (import.meta.url === pathToFileURL(argv[1] ?? '').href) main()