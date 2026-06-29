#!/usr/bin/env node
// Convert the "Live Animals Data Fields - V4" page XHTML into the
// live-animals-table.json shape, delivering the primary 8-column
// "Live Animal Data Elements" section.
//
// Zero npm deps; Node 18+. This is the keystone converter (stories.md story 02):
// it owns the table-JSON shape contract - section grouping, column inference,
// the cell-encoding model, the row-key rule, the clean field_name rule,
// deterministic ordering, and loud failure on unrecognised structure. Stories
// 03 (auxiliary sections) and 04 (diff/promote) follow the shape it sets.
//
// Output carries all three page sections in page order: the main 8-column
// "Live Animal Data Elements", plus the auxiliary "Common Attributes" (4 cols)
// and "Out of Scope Data Elements" (3 cols, which add dates[]/user_mentions[]).
//
// Usage:
//   convert-live-animals-table.mjs <xhtml-path> <meta-path> [-o <out-path>]
//
//   <xhtml-path>  V4 page storage-format XHTML (from fetch-confluence-page.mjs).
//   <meta-path>   Story-01 sidecar JSON; copied verbatim into `source`.
//   -o <out-path> Output file. Defaults to workspace/live-animals-table.next.json.

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { stderr, argv, cwd, exit } from 'node:process'
import { stripToText, readTd, slugify } from './lib/confluence-xhtml.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = resolve(__dirname, 'data')
const SCRATCH = resolve(DATA_DIR, 'scratch')

// The three page sections in page order, each with its expected column keys
// (slugified header text). poStatus marks the main section, which carries the
// extra row-level po_approved_status derived from its po_approved tasks.
const SECTIONS = [
  {
    name: 'Live Animal Data Elements',
    columns: ['field_name', 'type', 'conditions_values', 'applies_at',
      'source', 'mandatory', 'example', 'po_approved'],
    poStatus: true
  },
  { name: 'Common Attributes', columns: ['field_name', 'attributes', 'validation', 'example'] },
  { name: 'Out of Scope Data Elements', columns: ['field_name', 'notes', 'date'] }
]
const SECTION_BY_NAME = new Map(SECTIONS.map(s => [s.name, s]))

function die (msg) {
  stderr.write(msg.endsWith('\n') ? msg : msg + '\n')
  exit(1)
}

// ---- row-key rule (owned here; story 04 reads it via rowKey()) ----
// The stable diff key for a main-section row is (section, slug of the clean
// field_name label), with "_" separators to match the page's anchor-id style
// (e.g. "Reference Number" -> "reference_number"). Story 04 keys add/remove/
// modify detection on this; a label reword therefore reads as remove + add
// (stories.md Q1, accepted for the human-in-the-loop flow).
export function rowKey (section, fieldNameLabel) {
  return `${section}::${slugify(fieldNameLabel, '_')}`
}

// Collapse a field-name label to one clean line: drop the decorative link
// glyph and fold any in-label <br/> newlines to single spaces.
function cleanLabel (text) {
  return (text || '')
    .replace(/🔗/g, '') // U+1F517 LINK SYMBOL
    .replace(/\s*\n\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// ---- macro / list extractors ----
const RE_EXPAND = /<ac:structured-macro\b[^>]*\bac:name="expand"[^>]*>([\s\S]*?)<\/ac:structured-macro>/g
const RE_ANCHOR = /<ac:structured-macro\b[^>]*\bac:name="anchor"[^>]*>[\s\S]*?<\/ac:structured-macro>/g
const RE_TASKLIST = /<ac:task-list\b[^>]*>([\s\S]*?)<\/ac:task-list>/g
const RE_CALLOUT = /<ac:structured-macro\b[^>]*\bac:name="(note|info|warning|tip)"[^>]*>([\s\S]*?)<\/ac:structured-macro>/g

function liTexts (html) {
  return (html.match(/<li\b[\s\S]*?<\/li>/g) || []).map(li => stripToText(li))
}

function extractExpands (content) {
  const expands = []
  for (const m of content.matchAll(RE_EXPAND)) {
    const body = m[1]
    // RE_EXPAND closes on the first </ac:structured-macro>. A nested macro inside
    // the body would make it close early and silently truncate the cell, so fail
    // loudly instead (D9). The current page nests nothing inside expand bodies.
    if (/<ac:structured-macro/.test(body)) {
      die('An expand macro contains a nested structured-macro, which this parser ' +
          'cannot safely flatten. Refusing to write a partial output. ' +
          `Body begins: ${body.slice(0, 80)}`)
    }
    const titleM = body.match(/<ac:parameter\b[^>]*\bac:name="title"[^>]*>([\s\S]*?)<\/ac:parameter>/)
    const title = titleM ? stripToText(titleM[1]) : ''
    const rtb = body.match(/<ac:rich-text-body\b[^>]*>([\s\S]*?)<\/ac:rich-text-body>/)
    const items = liTexts(rtb ? rtb[1] : body)
    expands.push({ title, items })
  }
  return { expands, stripped: content.replace(RE_EXPAND, ' ') }
}

function extractTasks (content) {
  const tasks = []
  for (const m of content.matchAll(RE_TASKLIST)) {
    for (const s of m[1].matchAll(/<ac:task-status>([\s\S]*?)<\/ac:task-status>/g)) {
      tasks.push(stripToText(s[1]))
    }
  }
  const stripped = content.replace(RE_TASKLIST, ' ')
  return { tasks, stripped }
}

// Build a cell object from a <td> content string. Order of extraction matters:
// expands are pulled first so their inner <ul> is not re-counted as cell
// bullets; anchors are dropped so their id text never fuses into the label.
function parseCell (content, colKey) {
  let s = content.replace(RE_ANCHOR, ' ')

  const ex = extractExpands(s); s = ex.stripped
  const tk = extractTasks(s); s = tk.stripped

  // Remaining top-level bullets (after expands/tasks removed).
  const bullets = []
  for (const ul of s.match(/<ul\b[\s\S]*?<\/ul>/g) || []) bullets.push(...liTexts(ul))
  s = s.replace(/<ul\b[\s\S]*?<\/ul>/g, ' ')

  // dates: captured before stripToText converts <time datetime> into its date
  // text, then the <time> is removed so a date-only cell reads as {dates:[...]}.
  const dates = []
  for (const m of s.matchAll(/<time\b[^>]*\bdatetime="([^"]+)"[^>]*\/?>/g)) dates.push(m[1])
  s = s.replace(/<time\b[^>]*\/?>/g, ' ')

  // user mentions: captured before stripToText strips <ri:user>. The storage
  // format carries no resolved display name, so store the account id (matches v133).
  const userMentions = []
  for (const m of s.matchAll(/<ri:user\b[^>]*\bri:account-id="([^"]+)"[^>]*\/?>/g)) {
    userMentions.push(m[1])
  }

  let text = stripToText(s)
  if (colKey === 'field_name') text = cleanLabel(text)

  const hasOther = bullets.length || tk.tasks.length || ex.expands.length ||
    dates.length || userMentions.length
  const cell = {}
  if (text !== '') cell.text = text
  else if (!hasOther) cell.text = '' // empty cell preserved as {"text":""}
  if (bullets.length) cell.bullets = bullets
  if (tk.tasks.length) cell.tasks = tk.tasks
  if (ex.expands.length) cell.expands = ex.expands
  if (dates.length) cell.dates = dates
  if (userMentions.length) cell.user_mentions = userMentions
  return cell
}

function splitTables (xhtml) {
  return [...xhtml.matchAll(/<table\b[\s\S]*?<\/table>/g)].map(m => ({
    html: m[0],
    start: m.index
  }))
}

function headingBefore (xhtml, tableStart) {
  const before = xhtml.slice(0, tableStart)
  const headings = [...before.matchAll(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/g)]
  if (headings.length === 0) return null
  const last = headings[headings.length - 1]
  // Guard against a table whose own heading was removed: if another <table> sits
  // between the nearest heading and this one, that heading belongs to the earlier
  // table, not this one. Returning null makes the caller loud-fail (D9).
  const gap = xhtml.slice(last.index + last[0].length, tableStart)
  if (/<table\b/.test(gap)) return null
  return stripToText(last[1])
}

function parseSection (tableHtml, spec) {
  const trs = tableHtml.match(/<tr\b[\s\S]*?<\/tr>/g) || []
  const headerRow = trs.find(r => /<th\b/.test(r))
  if (!headerRow) die(`Section "${spec.name}": no header (<th>) row found`)

  const columns = (headerRow.match(/<th\b[\s\S]*?<\/th>/g) || [])
    .map(th => slugify(stripToText(th), '_'))
  if (JSON.stringify(columns) !== JSON.stringify(spec.columns)) {
    die(`Section "${spec.name}": inferred columns ${JSON.stringify(columns)} ` +
        `do not match expected ${JSON.stringify(spec.columns)}`)
  }

  const bodyRows = trs.filter(r => !/<th\b/.test(r))
  const rows = bodyRows.map((rowHtml, i) => {
    const tdCount = (rowHtml.match(/<td\b/g) || []).length
    if (tdCount !== spec.columns.length) {
      die(`Section "${spec.name}": row ${i + 1} has ${tdCount} <td> cells, ` +
          `expected ${spec.columns.length}`)
    }
    const row = { row: i + 1 }
    let pos = 0
    for (const col of spec.columns) {
      const td = readTd(rowHtml, pos)
      if (!td) die(`Section "${spec.name}": row ${i + 1} unreadable at column "${col}"`)
      row[col] = parseCell(td.content, col)
      pos = td.end
    }
    if (spec.poStatus) {
      const tasks = row.po_approved.tasks || []
      row.po_approved_status =
        tasks.length > 0 && tasks.every(t => t === 'complete') ? 'complete' : 'incomplete'
    }
    return row
  })

  return { section: spec.name, columns, row_count: rows.length, rows }
}

function extractCallouts (xhtml) {
  const callouts = []
  for (const m of xhtml.matchAll(RE_CALLOUT)) {
    const rtb = m[2].match(/<ac:rich-text-body\b[^>]*>([\s\S]*?)<\/ac:rich-text-body>/)
    callouts.push({ kind: m[1], text: stripToText(rtb ? rtb[1] : m[2]) })
  }
  return callouts
}

function parseArgs (raw) {
  const opts = { xhtml: null, meta: null, out: resolve(SCRATCH, 'live-animals-table.next.json') }
  for (let i = 0; i < raw.length; i++) {
    const a = raw[i]
    if (a === '-o' || a === '--output') opts.out = resolve(cwd(), raw[++i] ?? die('Missing value for -o'))
    else if (a.startsWith('-')) die(`Unknown option: ${a}`)
    else if (opts.xhtml === null) opts.xhtml = a
    else if (opts.meta === null) opts.meta = a
    else die(`Unexpected extra argument: ${a}`)
  }
  if (!opts.xhtml || !opts.meta) {
    die('Usage: convert-live-animals-table.mjs <xhtml-path> <meta-path> [-o <out-path>]')
  }
  return opts
}

function main () {
  const opts = parseArgs(argv.slice(2))
  const xhtml = readFileSync(resolve(cwd(), opts.xhtml), 'utf8')

  let source
  try { source = JSON.parse(readFileSync(resolve(cwd(), opts.meta), 'utf8')) } catch (err) {
    die(`Meta sidecar ${opts.meta} is not valid JSON: ${err.message}`)
  }

  const tables = splitTables(xhtml)
  if (tables.length === 0) die('No <table> elements found in the page XHTML')

  const sections = []
  const seen = new Set()
  for (const t of tables) {
    const heading = headingBefore(xhtml, t.start)
    const spec = heading === null ? undefined : SECTION_BY_NAME.get(heading)
    if (!spec) {
      die(`Unknown section heading "${heading}" - not in the known set ` +
          `{${SECTIONS.map(s => s.name).join(', ')}}. Refusing to write a partial output.`)
    }
    if (seen.has(spec.name)) {
      die(`Section "${spec.name}" appears more than once. Refusing to write a partial output.`)
    }
    seen.add(spec.name)
    sections.push(parseSection(t.html, spec))
  }
  const missing = SECTIONS.filter(s => !seen.has(s.name)).map(s => s.name)
  if (missing.length) {
    die(`Missing expected section(s): ${missing.join(', ')}. Refusing to write a partial output.`)
  }

  const out = {
    source,
    page_callouts: extractCallouts(xhtml),
    sections
  }
  writeFileSync(opts.out, JSON.stringify(out, null, 2) + '\n', 'utf8')
  stderr.write(`Wrote ${opts.out} (${sections.map(s => `${s.section}: ${s.row_count}`).join(', ')})\n`)
}

// Run only on direct execution; stay import-safe so story 04 can import rowKey()
// without triggering a CLI run (and a process exit) on import.
if (import.meta.url === pathToFileURL(argv[1] ?? '').href) main()