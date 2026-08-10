import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { localName, eqLocal, isXsd, isHttpUrl, classify } from './check-coherence.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const SCRIPT = resolve(__dirname, 'check-coherence.js')
const VOCAB_VENDORED = resolve(ROOT, 'build/vendor/uncefact/uncefact.jsonld')

// --- Integration: the real repo must stay coherent --------------------------
// This is the regression guard - the whole point of the tool. A future edit
// that introduces structure/semantics drift makes the script exit non-zero,
// which fails this test. Skipped offline (the script fetches the D23B vocab on
// first run); once cached it runs without network.
test('gbn-ag is coherent (no ERROR findings)', { skip: !existsSync(VOCAB_VENDORED) && 'D23B vocabulary not cached yet (first-run fetch required)' }, () => {
  const result = spawnSync('node', [SCRIPT, 'gbn-ag'], { cwd: ROOT, encoding: 'utf-8' })
  assert.equal(
    result.status, 0,
    `check-coherence reported errors:\n${result.stdout}\n${result.stderr}`
  )
  assert.match(result.stdout, /0 error\(s\)/, 'expected a clean error count in the summary')
})

// --- Unit: the comparison core that produced 113 false errors when wrong ----
test('localName strips prefix, path, and fragment', () => {
  assert.equal(localName('uncefact:LogisticsLocation'), 'LogisticsLocation')
  assert.equal(localName('xsd:boolean'), 'boolean')
  assert.equal(localName('https://refdata.tbc.defra.gov.uk/gbn-ag-notification-status'), 'gbn-ag-notification-status')
  assert.equal(localName('http://www.w3.org/2001/XMLSchema#token'), 'token')
})

test('eqLocal compares local names case-insensitively', () => {
  // the turn-4 match: schema $def vs vocab range, different prefixes, same class
  assert.equal(eqLocal('uncefact:LogisticsLocation', 'LogisticsLocation'), true)
  // intentional case divergence: schema $def vs domain IRI
  assert.equal(eqLocal('tradeProductInstance', 'TradeProductInstance'), true)
  // the bug that flagged string-vs-string and boolean-vs-token as mismatches
  assert.equal(eqLocal('xsd:string', 'xsd:string'), true)
  assert.equal(eqLocal('xsd:boolean', 'xsd:token'), false)
  // a genuine value-type mismatch must stay false
  assert.equal(eqLocal('uncefact:Party', 'LogisticsLocation'), false)
})

test('isXsd / isHttpUrl classify range strings', () => {
  assert.equal(isXsd('xsd:boolean'), true)
  assert.equal(isXsd('http://www.w3.org/2001/XMLSchema#token'), true)
  assert.equal(isXsd('uncefact:Party'), false)
  assert.equal(isHttpUrl('https://refdata.tbc.defra.gov.uk/x'), true)
  assert.equal(isHttpUrl('uncefact:LogisticsLocation'), false)
})

test('classify maps a Node to its structural value-type', () => {
  assert.deepEqual(classify({ type: 'boolean' }), { kind: 'scalar', xsd: 'xsd:boolean' })
  assert.deepEqual(classify({ type: 'string' }), { kind: 'scalar', xsd: 'xsd:string' })
  assert.deepEqual(classify({ schemaDef: 'LogisticsLocation' }), { kind: 'object', defName: 'LogisticsLocation' })
  assert.deepEqual(classify({ codelistConst: 'https://codelists.tbc.defra.gov.uk/x' }), { kind: 'codelist', url: 'https://codelists.tbc.defra.gov.uk/x' })
  assert.deepEqual(
    classify({ type: 'array', items: { schemaDef: 'tradeProductInstance' } }),
    { kind: 'array-object', defName: 'tradeProductInstance' }
  )
})
