#!/usr/bin/env node
/**
 * Validate JSON Schema files for structural correctness.
 *
 * Schemas in scope:
 *   - schemas/imports/event-envelope-v1.schema.json  (JSON Schema draft-07)
 *   - schemas/imports/gbn-ag-v1.schema.json          (JSON Schema 2020-12)
 *
 * The gbn-ag schema has one external $ref into BSP D23B's BasicComponents
 * (for indicatorType). The vendor file is fetched on first run and cached at
 * build/vendor/uncefact/UNECE-BasicComponents.json; subsequent runs use the
 * cached copy.
 */

import Ajv from 'ajv'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import { readFile, writeFile, mkdir, access } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

const SCHEMAS = [
  { path: 'schemas/imports/event-envelope-v1.schema.json', draft: 'draft-07' },
  { path: 'schemas/imports/gbn-ag-v1.schema.json',         draft: '2020-12' }
]

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

function makeValidator(draft) {
  const Ctor = draft === '2020-12' ? Ajv2020 : Ajv
  const ajv = new Ctor({
    strict: false,
    allErrors: true,
    validateFormats: true,
    validateSchema: true
  })
  addFormats(ajv)
  return ajv
}

async function main() {
  console.log('Validating schemas')
  console.log('='.repeat(60))

  const bsp = await ensureBspBasicComponents()

  let failures = 0
  for (const { path, draft } of SCHEMAS) {
    process.stdout.write(`  ${path} (${draft}) ... `)
    try {
      const schema = await loadJson(join(ROOT, path))
      const ajv = makeValidator(draft)
      if (draft === '2020-12') {
        ajv.addSchema(bsp)
      }
      ajv.compile(schema)
      console.log('ok')
    } catch (err) {
      console.log('FAIL')
      console.error(`    ${err.message}`)
      failures += 1
    }
  }

  console.log('='.repeat(60))
  if (failures === 0) {
    console.log(`All ${SCHEMAS.length} schemas compiled cleanly.`)
    process.exit(0)
  }
  console.log(`${failures} of ${SCHEMAS.length} schemas failed.`)
  process.exit(1)
}

main().catch(err => {
  console.error('Unexpected error:', err.message)
  process.exit(1)
})