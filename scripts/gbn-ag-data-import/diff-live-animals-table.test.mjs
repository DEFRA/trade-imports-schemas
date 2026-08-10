// Tests for the baseline/next diff: row pairing, exclusions, block_changed,
// duplicate-key warnings, callouts, markdown rendering, promote mechanics.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildDelta, renderMarkdown } from './diff-live-animals-table.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SCRIPT = resolve(__dirname, 'diff-live-animals-table.mjs')

const row = (n, label, extra = {}) => ({ row: n, field_name: { text: label }, ...extra })
const section = (name, rows, extra = {}) => ({ section: name, ...extra, columns: ['field_name'], row_count: rows.length, rows })
const table = (version, sections) => ({ source: { version, version_when: `v${version}` }, page_callouts: [], sections })

test('reports added, removed and changed rows', () => {
  const base = table(1, [section('S', [row(1, 'kept', { type: { text: 'a' } }), row(2, 'gone')])])
  const next = table(2, [section('S', [row(1, 'kept', { type: { text: 'b' } }), row(2, 'new')])])
  const delta = buildDelta(base, next)
  const s = delta.sections[0]
  assert.deepEqual(s.added, ['new'])
  assert.deepEqual(s.removed, ['gone'])
  assert.deepEqual(s.changed, [{ field: 'kept', column: 'type', before: { text: 'a' }, after: { text: 'b' } }])
})

test('ignores row numbers, po_approved_status and JSON key order', () => {
  const base = table(1, [section('S', [{ row: 1, field_name: { text: 'x' }, cell: { a: 1, b: 2 }, po_approved_status: 'complete' }])])
  const next = table(2, [section('S', [{ row: 9, field_name: { text: 'x' }, cell: { b: 2, a: 1 }, po_approved_status: 'incomplete' }])])
  const s = buildDelta(base, next).sections[0]
  assert.deepEqual(s.changed, [])
})

test('flags one-sided sections', () => {
  const base = table(1, [section('Old', [row(1, 'a')])])
  const next = table(2, [section('New', [row(1, 'b')])])
  const delta = buildDelta(base, next)
  const byName = Object.fromEntries(delta.sections.map(s => [s.section, s]))
  assert.equal(byName.New.section_added, true)
  assert.deepEqual(byName.New.added, ['b'])
  assert.equal(byName.Old.section_removed, true)
  assert.deepEqual(byName.Old.removed, ['a'])
})

test('warns on duplicate row keys', () => {
  const next = table(2, [section('S', [row(1, 'Contact Address'), row(2, 'Contact Address')])])
  const delta = buildDelta(table(1, [section('S', [])]), next)
  assert.equal(delta.warnings.length, 1)
  assert.match(delta.warnings[0], /duplicate row-key "S::contact_address"/)
})

test('reports block appearance, disappearance and rewording', () => {
  const banner = t => ({ text: t })
  const none = table(1, [section('S', [])])
  const withA = table(2, [section('S', [], { block: banner('A') })])
  const withB = table(3, [section('S', [], { block: banner('B') })])

  assert.deepEqual(buildDelta(none, withA).sections[0].block_changed, { before: null, after: banner('A') })
  assert.deepEqual(buildDelta(withA, none).sections[0].block_changed, { before: banner('A'), after: null })
  assert.deepEqual(buildDelta(withA, withB).sections[0].block_changed, { before: banner('A'), after: banner('B') })
  assert.equal('block_changed' in buildDelta(withA, withA).sections[0], false)
})

test('reports block on section add and remove', () => {
  const banner = { text: 'A' }
  const base = table(1, [section('Old', [], { block: banner })])
  const next = table(2, [section('New', [], { block: banner })])
  const byName = Object.fromEntries(buildDelta(base, next).sections.map(s => [s.section, s]))
  assert.deepEqual(byName.New.block_changed, { before: null, after: banner })
  assert.deepEqual(byName.Old.block_changed, { before: banner, after: null })
})

test('diffs page callouts by deep equality', () => {
  const a = { kind: 'info', text: 'same' }
  const b = { kind: 'note', text: 'added' }
  const base = { ...table(1, []), page_callouts: [a] }
  const next = { ...table(2, []), page_callouts: [{ ...a }, b] }
  const delta = buildDelta(base, next)
  assert.deepEqual(delta.callouts, { added: [b], removed: [] })
})

test('markdown renders a block-only change instead of "No changes."', () => {
  const base = table(1, [section('S', [row(1, 'x')])])
  const next = table(2, [section('S', [row(1, 'x')], { block: { text: 'Field Block - At least one' } })])
  const md = renderMarkdown(buildDelta(base, next))
  assert.match(md, /## S\nBlock: \(absent\) -> "Field Block - At least one"/)
  assert.doesNotMatch(md, /No changes\./)
})

test('integration: writes delta into a fresh directory; --promote byte-copies next over baseline', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'gbn-ag-diff-'))
  const basePath = join(tmp, 'baseline.json')
  const nextPath = join(tmp, 'next.json')
  writeFileSync(basePath, JSON.stringify(table(1, [section('S', [row(1, 'a')])])), 'utf8')
  writeFileSync(nextPath, JSON.stringify(table(2, [section('S', [row(1, 'a'), row(2, 'b')])])) + '\n', 'utf8')
  const out = join(tmp, 'made', 'by', 'diff', 'delta.json')

  const plain = spawnSync('node', [SCRIPT, '--baseline', basePath, '--next', nextPath, '--out', out], { encoding: 'utf8' })
  assert.equal(plain.status, 0, plain.stderr)
  assert.equal(existsSync(out), true)
  assert.equal(existsSync(out.replace(/\.json$/, '.md')), true)
  assert.notEqual(readFileSync(basePath, 'utf8'), readFileSync(nextPath, 'utf8')) // untouched without --promote

  const promote = spawnSync('node', [SCRIPT, '--baseline', basePath, '--next', nextPath, '--out', out, '--promote'], { encoding: 'utf8' })
  assert.equal(promote.status, 0, promote.stderr)
  assert.equal(readFileSync(basePath, 'utf8'), readFileSync(nextPath, 'utf8'))
})
