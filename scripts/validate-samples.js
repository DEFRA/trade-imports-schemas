#!/usr/bin/env node
/**
 * Validate sample payloads against their schemas.
 *
 * Today only one sample exists: samples/gbn-ag-v1-example.json validated
 * against schemas/imports/gbn-ag-v1.schema.json.
 *
 * The sample carries authorial _comment / _mapping_note keys that intentionally
 * violate additionalProperties:false; these are stripped recursively before
 * validation.
 *
 * The gbn-ag schema has one external $ref into BSP D23B's BasicComponents (for
 * indicatorType). The vendor file is fetched on first run and cached at
 * build/vendor/uncefact/UNECE-BasicComponents.json.
 */

import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import { readFile, writeFile, mkdir, access } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

const SAMPLE_TO_SCHEMA = {
  'samples/gbn-ag-v1-example.json': 'schemas/imports/gbn-ag-v1.schema.json'
}

const BSP_BASICCOMPONENTS_URL = 'https://raw.githubusercontent.com/uncefact/spec-JSONschema/main/JSONschema2020-12/meta-library/BuyShipPay/D23B/BasicComponents'
const BSP_VENDOR_PATH = join(ROOT, 'build/vendor/uncefact/UNECE-BasicComponents.json')

async function loadJson(path) {
  return JSON.parse(await readFile(path, 'utf-8'))
}

async function ensureBspBasicComponents() {
  try {
    await access(BSP_VENDOR_PATH)
  } catch {
    process.stdout.write(`  Fetching BSP BasicComponents from raw.githubusercontent.com ... `)
    const response = await fetch(BSP_BASICCOMPONENTS_URL)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} fetching ${BSP_BASICCOMPONENTS_URL}`)
    }
    const body = await response.text()
    await mkdir(dirname(BSP_VENDOR_PATH), { recursive: true })
    await writeFile(BSP_VENDOR_PATH, body)
    console.log('cached')
  }
  const bsp = await loadJson(BSP_VENDOR_PATH)
  delete bsp.$schema
  return bsp
}

/**
 * Remove keys starting with `_` recursively. Used to strip authorial comments
 * and mapping notes from sample payloads before schema validation.
 */
function stripAuthorialKeys(value) {
  if (Array.isArray(value)) {
    return value.map(stripAuthorialKeys)
  }
  if (value && typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) {
      if (k.startsWith('_')) continue
      out[k] = stripAuthorialKeys(v)
    }
    return out
  }
  return value
}

async function main() {
  console.log('Validating samples')
  console.log('='.repeat(60))

  const bsp = await ensureBspBasicComponents()

  const ajv = new Ajv2020({
    strict: false,
    allErrors: true,
    validateFormats: true,
    validateSchema: true
  })
  addFormats(ajv)
  ajv.addSchema(bsp)

  let failures = 0
  let total = 0
  for (const [samplePath, schemaPath] of Object.entries(SAMPLE_TO_SCHEMA)) {
    total += 1
    process.stdout.write(`  ${samplePath} ⇢ ${schemaPath} ... `)
    try {
      const schema = await loadJson(join(ROOT, schemaPath))
      const sample = await loadJson(join(ROOT, samplePath))
      const cleaned = stripAuthorialKeys(sample)
      const validate = ajv.compile(schema)
      const ok = validate(cleaned)
      if (ok) {
        console.log('ok')
      } else {
        console.log('FAIL')
        for (const err of validate.errors) {
          console.error(`    ${err.instancePath || '/'} ${err.message}`)
        }
        failures += 1
      }
    } catch (err) {
      console.log('FAIL')
      console.error(`    ${err.message}`)
      failures += 1
    }
  }

  console.log('='.repeat(60))
  if (failures === 0) {
    console.log(`All ${total} samples valid.`)
    process.exit(0)
  }
  console.log(`${failures} of ${total} samples failed.`)
  process.exit(1)
}

main().catch(err => {
  console.error('Unexpected error:', err.message)
  process.exit(1)
})