import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const GB = resolve(__dirname, '../schemas/profiles/imports/gb')

const readJson = (path) => JSON.parse(readFileSync(resolve(GB, path), 'utf-8'))

const propertyPathsNamed = (node, name, path = '') => {
  if (Array.isArray(node)) {
    return node.flatMap((item, index) => propertyPathsNamed(item, name, `${path}[${index}]`))
  }
  if (node === null || typeof node !== 'object') return []
  return Object.entries(node).flatMap(([key, value]) => [
    ...(key === name ? [`${path}/${key}`] : []),
    ...propertyPathsNamed(value, name, `${path}/${key}`)
  ])
}

test('the GBN-AG profile forbids exchangedDocument.issuer', () => {
  const schema = readJson('gbn-ag-v1.schema.json')
  assert.equal(schema.allOf.at(-1).properties.exchangedDocument.properties.issuer, false)
})

test('the PIMS v0.4.0 schema defines no issuer property anywhere', () => {
  const schema = readJson('pims/gbn-ag-pims-v0.4.0.schema.json')
  assert.deepEqual(propertyPathsNamed(schema, 'issuer'), [])
})
