// Tests for the one-off v173 baseline migration: shape, content conservation,
// guards, and zero self-noise through the diff.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { migrate } from './migrate-baseline-sections.mjs'
import { buildDelta } from './diff-live-animals-table.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURE = join(resolve(__dirname, 'test-fixtures'), 'baseline-v173.json')
const load = () => JSON.parse(readFileSync(FIXTURE, 'utf8'))
const stripRow = ({ row, ...rest }) => rest

test('reshapes v173 into the six-section layout, conserving all 58 rows', () => {
  const fixture = load()
  const m = migrate(fixture)

  assert.deepEqual(m.sections.map(s => [s.section, s.row_count]), [
    ['Live Animal Data Elements', 31],
    ['Reason of Import', 2],
    ['Animal Identifiers', 8],
    ['Documents', 4],
    ['Address Block', 9],
    ['Out of Scope Data Elements', 4]
  ])
  assert.equal(m.sections.reduce((n, s) => n + s.rows.length, 0), 58)
  assert.deepEqual(m.source, fixture.source)
  assert.deepEqual(m.page_callouts, fixture.page_callouts)
  for (const s of m.sections) assert.equal('block' in s, false)

  const byName = Object.fromEntries(m.sections.map(s => [s.section, s]))
  assert.equal(byName['Animal Identifiers'].rows[0].field_name.text, 'Animal Identifier - Microchip')
  assert.deepEqual(byName['Reason of Import'].rows.map(r => r.field_name.text),
    ['Reason for import', 'Purpose in internal market'])
  assert.deepEqual(byName['Live Animal Data Elements'].rows.slice(-2).map(r => r.field_name.text),
    ['Contact Address', 'Contact Address'])

  // Content is copied byte-for-byte (spot check: Passport moved from main row 12).
  assert.deepEqual(stripRow(byName['Animal Identifiers'].rows[2]), stripRow(fixture.sections[0].rows[11]))

  // Address Block: renamed section gains the notes column with empty cells.
  assert.deepEqual(byName['Address Block'].columns, ['field_name', 'attributes', 'validation', 'example', 'notes'])
  for (const [i, r] of byName['Address Block'].rows.entries()) {
    assert.deepEqual(r.notes, { text: '' })
    assert.deepEqual(stripRow(r), { ...stripRow(fixture.sections[1].rows[i]), notes: { text: '' } })
  }
})

test('the migrated baseline diffs clean against itself', () => {
  const m = migrate(load())
  const delta = buildDelta(m, m)
  for (const s of delta.sections) {
    assert.deepEqual([s.added, s.removed, s.changed], [[], [], []], s.section)
    assert.equal('block_changed' in s, false, s.section)
  }
  // The duplicate Contact Address pair is a page fact the diff must keep flagging.
  assert.equal(delta.warnings.length, 1)
  assert.match(delta.warnings[0], /contact_address/)
})

test('refuses any baseline that is not exactly the v173 shape', () => {
  const wrongVersion = load()
  wrongVersion.source.version = 174
  assert.throws(() => migrate(wrongVersion), /source\.version is 174, expected 173/)

  const wrongLabel = load()
  wrongLabel.sections[0].rows[9].field_name.text = 'Animal Identifier - Chip'
  assert.throws(() => migrate(wrongLabel), /main row 10 label/)

  // Self-disarming: its own output is not a valid input.
  assert.throws(() => migrate(migrate(load())), /expected 3 sections, found 6/)
})
