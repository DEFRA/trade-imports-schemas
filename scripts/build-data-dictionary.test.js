import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

const GENERATOR = resolve(__dirname, 'build-data-dictionary.js')
const OUTPUT = resolve(ROOT, 'schemas/profiles/imports/gb/gbn-ag-data-dictionary.md')
const VOCAB_VENDORED = resolve(ROOT, 'build/vendor/uncefact/uncefact.jsonld')

function runGenerator() {
  const result = spawnSync('node', [GENERATOR, 'gbn-ag'], {
    cwd: ROOT,
    encoding: 'utf-8'
  })
  if (result.status !== 0) {
    throw new Error(`generator exited ${result.status}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`)
  }
  return result
}

test('generator writes the dictionary to the expected path', () => {
  runGenerator()
  assert.ok(existsSync(OUTPUT), `output not found at ${OUTPUT}`)
  const body = readFileSync(OUTPUT, 'utf-8')
  assert.ok(body.startsWith('# GBN-AG data dictionary'), 'title heading missing')
})

test('profile schema descriptions are preferred over the generic vocab', () => {
  const body = readFileSync(OUTPUT, 'utf-8')
  const domain = [
    ['importer', 'The party legally importing the consignment'],
    ['consigneeParty', 'The party receiving the animals under the trade contract'],
    ['carrier', 'responsible for moving the goods from the consignment'],
    ['scientificName', 'resolved from Defra reference data keyed on the CN code'],
    ['firstSignatoryAuthentication', 'coded declaration clauses']
  ]
  for (const [property, expected] of domain) {
    assert.ok(
      body.includes(expected),
      `expected gbn-ag schema description "${expected}" for property \`${property}\` not found in dictionary`
    )
  }
})

test('vocab fallback applies where the schema has no description', { skip: !existsSync(VOCAB_VENDORED) && 'vocabulary not cached yet (first-run fetch required)' }, () => {
  const body = readFileSync(OUTPUT, 'utf-8')
  const fallback = [
    // D23B fallback for canonical slots the profile does not describe
    ['customsTransitAgentParty', 'The party acting as an agent for, or on behalf of, the consignor'],
    ['availabilityDueDateTime', 'when this supply chain consignment is due to be available'],
    // Defra vocab fallback for a Defra-owned term with no schema description
    ['specifiedConsignment', 'The consignment carried by a Defra UNVTD certificate payload.']
  ]
  for (const [property, expected] of fallback) {
    assert.ok(
      body.includes(expected),
      `expected vocab fallback "${expected}" for property \`${property}\` not found in dictionary`
    )
  }
})

test('Defra-declared section splits concepts from TRACES-aligned aliases', () => {
  const body = readFileSync(OUTPUT, 'utf-8')
  assert.ok(body.includes('### Defra concepts (no D23B equivalent)'), 'Defra concepts sub-heading missing')
  assert.ok(body.includes('### TRACES-aligned aliases (re-bind to canonical D23B IRI)'), 'TRACES aliases sub-heading missing')

  // Concepts table rows end with "Defra concept; no D23B equivalent".
  // Aliases table rows end with "Re-binds to canonical `unece:...`".
  const conceptsRow = /\| `isOrHasUnweanedAnimals` \| `[^`]+` \| Defra concept; no D23B equivalent \|/
  const aliasesRow = /\| `carrier` \| `[^`]+` \| Re-binds to canonical `unece:carrierParty` \|/
  assert.match(body, conceptsRow, 'isOrHasUnweanedAnimals should appear in the Defra concepts table row form')
  assert.match(body, aliasesRow, 'carrier should appear in the TRACES aliases table row form')
})

test('generator is idempotent', () => {
  const before = readFileSync(OUTPUT, 'utf-8')
  runGenerator()
  const after = readFileSync(OUTPUT, 'utf-8')
  assert.equal(after, before, 'generator produced a different file on re-run; expected byte-identical output')
})
