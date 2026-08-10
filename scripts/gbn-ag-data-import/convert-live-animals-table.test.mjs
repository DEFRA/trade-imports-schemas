// Tests for the V4 page converter: section contract, Field Block banners,
// anchored headings, cell encoding, and the loud-fail paths.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { rowKey } from './convert-live-animals-table.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SCRIPT = resolve(__dirname, 'convert-live-animals-table.mjs')
const FIXTURES = resolve(__dirname, 'test-fixtures')
const XHTML = readFileSync(join(FIXTURES, 'live-animals-page.small.xhtml'), 'utf8')
const META = join(FIXTURES, 'live-animals-page.small.meta.json')

function convert (xhtml) {
  const tmp = mkdtempSync(join(tmpdir(), 'gbn-ag-convert-'))
  const src = join(tmp, 'page.xhtml')
  writeFileSync(src, xhtml, 'utf8')
  const out = join(tmp, 'nested', 'out.json') // nested: proves mkdir-on-write
  const res = spawnSync('node', [SCRIPT, src, META, '-o', out], { encoding: 'utf8' })
  return { res, out }
}

test('rowKey strips decoration and normalises punctuation', () => {
  assert.equal(rowKey('Address Block', '** Transporter authorisation number'),
    'Address Block::transporter_authorisation_number')
  assert.equal(rowKey('Animal Identifiers', 'Animal Identifier – Description'),
    'Animal Identifiers::animal_identifier_description')
})

test('converts the six-section fixture page', () => {
  const { res, out } = convert(XHTML)
  assert.equal(res.status, 0, res.stderr)
  const table = JSON.parse(readFileSync(out, 'utf8'))

  assert.deepEqual(table.sections.map(s => s.section), [
    'Live Animal Data Elements', 'Reason of Import', 'Animal Identifiers',
    'Documents', 'Address Block', 'Out of Scope Data Elements'
  ])

  const byName = Object.fromEntries(table.sections.map(s => [s.section, s]))

  // Field Block banners captured as section-level block cells, data rows only
  // in row_count, numbering restarts after the banner.
  assert.equal(byName['Reason of Import'].block.text,
    'Reason of Import | Field Block - Mandatory to Submit - At least one')
  assert.equal(byName['Animal Identifiers'].block.text,
    'Animal Identifiers | Field Block - Mandatory to Submit - At least one')
  assert.equal(byName.Documents.block.text,
    'Accompanying Document | Field Block - Optional - All-or-nothing')
  for (const name of ['Live Animal Data Elements', 'Address Block', 'Out of Scope Data Elements']) {
    assert.equal('block' in byName[name], false, `${name} must not carry a block`)
  }
  assert.equal(byName['Reason of Import'].row_count, 1)
  assert.equal(byName['Reason of Import'].rows[0].row, 1)

  // Anchored heading resolves to the clean section name (the load-bearing fix).
  assert.equal(byName['Address Block'].section, 'Address Block')
  assert.deepEqual(byName['Address Block'].columns,
    ['field_name', 'attributes', 'validation', 'example', 'notes'])

  // po_approved_status derived on 8-column sections.
  const main = byName['Live Animal Data Elements']
  assert.deepEqual(main.rows.map(r => r.po_approved_status),
    ['complete', 'incomplete', 'incomplete'])
  assert.equal(byName['Reason of Import'].rows[0].po_approved_status, 'incomplete')

  // Cell encoding: entities, empty cells, expands, dates, user mentions, labels.
  assert.equal(byName['Animal Identifiers'].rows[0].field_name.text,
    'Animal Identifier – Description')
  assert.equal(byName['Address Block'].rows[0].example.text, 'Müller Farms GmbH')
  assert.deepEqual(main.rows[1].type, { text: '' })
  assert.equal(main.rows[0].conditions_values.expands[0].title, 'CPH required commodities (2)')
  assert.deepEqual(main.rows[0].conditions_values.expands[0].items, ['0102 - Cattle', '0103 - Pig'])
  assert.equal(byName['Address Block'].rows[1].field_name.text, '** Transporter authorisation number')
  const oos = byName['Out of Scope Data Elements'].rows[0]
  assert.deepEqual(oos.date.dates, ['2026-05-01'])
  assert.deepEqual(oos.notes.user_mentions, ['abc-123-def'])

  assert.equal(table.source.version, 1)
  assert.deepEqual(table.page_callouts,
    [{ kind: 'info', text: 'GERMINALS requirements are not yet defined' }])
})

test('loud-fails on an unknown section heading', () => {
  const { res } = convert(XHTML.replace('<span>Reason of Import</span>', '<span>Mystery Section</span>'))
  assert.equal(res.status, 1)
  assert.match(res.stderr, /Unknown section heading "Mystery Section"/)
})

test('loud-fails when a block section is missing its descriptor row', () => {
  const mutated = XHTML.replace(
    /<tr>\s*<td colspan="8"><p><strong>Animal Identifiers[^<]*<\/strong><\/p><\/td>\s*<\/tr>/, '')
  const { res } = convert(mutated)
  assert.equal(res.status, 1)
  assert.match(res.stderr, /Animal Identifiers.*Field Block descriptor row/)
})

test('loud-fails on a data row with a missing cell', () => {
  const { res } = convert(XHTML.replace('<td><p>Free text</p></td>', ''))
  assert.equal(res.status, 1)
  assert.match(res.stderr, /Section "Animal Identifiers": row 1 has 7 <td> cells, expected 8/)
})

test('loud-fails when an expected section is missing', () => {
  const { res } = convert(XHTML.slice(0, XHTML.indexOf('<h2><strong>Out of Scope')))
  assert.equal(res.status, 1)
  assert.match(res.stderr, /Missing expected section\(s\): Out of Scope Data Elements/)
})
