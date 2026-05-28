#!/usr/bin/env node
/**
 * Validate all JSON samples in /samples:
 *  - against their declared $schema
 *  - with basic JSON-LD context checks against UNECE D23B context usage
 */

import Ajv from 'ajv'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import { readFile, readdir } from 'fs/promises'
import { join, dirname, relative, resolve } from 'path'
import { fileURLToPath } from 'url'

import { ensureRemoteJson, fileExists } from './lib/vendor.js'
import { contextIncludesOfficial } from './lib/context-chain.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const SCHEMAS_DIR = join(ROOT, 'schemas')
const SAMPLES_DIR = join(ROOT, 'samples')

const UNECE_CONTEXT_URL = 'https://vocabulary.uncefact.org/unece-context-D23B.jsonld'
const BSP_BASICCOMPONENTS_URL =
  'https://raw.githubusercontent.com/uncefact/spec-JSONschema/main/JSONschema2020-12/meta-library/BuyShipPay/D23B/UNECE-BasicComponents.json'
const BSP_BASICCOMPONENTS_LEGACY_URL =
  'https://raw.githubusercontent.com/uncefact/spec-JSONschema/main/JSONschema2020-12/meta-library/BuyShipPay/D23B/BasicComponents'
const VENDOR_DIR = join(ROOT, 'build/vendor/uncefact')
const BSP_VENDOR_PATH = join(VENDOR_DIR, 'UNECE-BasicComponents.json')
const CONTEXT_VENDOR_PATH = join(VENDOR_DIR, 'unece-context-D23B.jsonld')

function toPosix(p) {
  return p.split('\\').join('/')
}

async function loadJson(path) {
  return JSON.parse(await readFile(path, 'utf-8'))
}

async function walkFiles(dir, predicate, acc = []) {
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      await walkFiles(full, predicate, acc)
    } else if (predicate(full)) {
      acc.push(full)
    }
  }
  return acc
}

function draftForSchema(schema) {
  const declared = String(schema.$schema || '')
  if (declared.includes('draft-07')) return 'draft-07'
  return '2020-12'
}

function makeAjv(draft) {
  const Ctor = draft === 'draft-07' ? Ajv : Ajv2020
  const ajv = new Ctor({
    strict: false,
    allErrors: true,
    validateFormats: true,
    validateSchema: true
  })
  addFormats(ajv)
  return ajv
}

function safeAddSchema(ajv, schema, key) {
  if (!key) return
  try {
    ajv.addSchema(schema, key)
  } catch {
    // duplicate alias is fine
  }
}

function registerSchemaAliases(ajv, schema, schemaAbsPath) {
  const relFromRoot = toPosix(relative(ROOT, schemaAbsPath))
  const relFromSchemas = relFromRoot.startsWith('schemas/')
    ? relFromRoot.slice('schemas/'.length)
    : null
  safeAddSchema(ajv, schema, relFromRoot)
  safeAddSchema(ajv, schema, relFromSchemas)
  safeAddSchema(ajv, schema, schema.$id)
}

/**
 * Remove keys starting with `_` recursively.
 */
function stripAuthorialKeys(value) {
  if (Array.isArray(value)) return value.map(stripAuthorialKeys)
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
  console.log('='.repeat(70))

  const [bspBasicComponents] = await Promise.all([
    ensureRemoteJson(BSP_BASICCOMPONENTS_URL, BSP_VENDOR_PATH, 'UNECE BasicComponents'),
    ensureRemoteJson(UNECE_CONTEXT_URL, CONTEXT_VENDOR_PATH, 'UNECE D23B context')
  ])

  const schemaPaths = (await walkFiles(
    SCHEMAS_DIR,
    p => p.endsWith('.schema.json')
  )).sort()

  const schemaEntries = []
  const schemaByAbsPath = new Map()
  for (const schemaPath of schemaPaths) {
    const schema = await loadJson(schemaPath)
    const entry = {
      path: schemaPath,
      schema,
      draft: draftForSchema(schema)
    }
    schemaEntries.push(entry)
    schemaByAbsPath.set(resolve(schemaPath), entry)
  }

  const ajv07 = makeAjv('draft-07')
  const ajv2020 = makeAjv('2020-12')

  safeAddSchema(ajv2020, bspBasicComponents, BSP_BASICCOMPONENTS_URL)
  safeAddSchema(ajv2020, bspBasicComponents, BSP_BASICCOMPONENTS_LEGACY_URL)
  safeAddSchema(ajv2020, bspBasicComponents, bspBasicComponents.$id)

  for (const entry of schemaEntries) {
    const targetAjv = entry.draft === 'draft-07' ? ajv07 : ajv2020
    registerSchemaAliases(targetAjv, entry.schema, entry.path)
  }

  const samplePaths = (await walkFiles(
    SAMPLES_DIR,
    p => p.endsWith('.json')
  )).sort()

  let failures = 0
  for (const samplePath of samplePaths) {
    const relSample = toPosix(relative(ROOT, samplePath))
    process.stdout.write(`  ${relSample} ... `)
    try {
      const sampleRaw = await loadJson(samplePath)
      const sample = stripAuthorialKeys(sampleRaw)

      const schemaRef = sample.$schema
      if (!schemaRef || typeof schemaRef !== 'string') {
        throw new Error('Missing $schema in sample')
      }

      // Two forms are accepted for sample.$schema:
      // 1. Filesystem-relative path from the sample's directory (legacy form,
      //    e.g. "../../../../../schemas/profiles/imports/eu/...schema.json").
      // 2. A registered schema identity - typically a bare filename matching
      //    the schema's $id (e.g. "gbn-ag-v1.schema.json"). This is the
      //    preferred form: shorter, location-independent, matches the TIG
      //    canonical core's bare-filename $id convention.
      let schemaEntry = null
      const schemaAbs = resolve(dirname(samplePath), schemaRef)
      if (await fileExists(schemaAbs)) {
        schemaEntry = schemaByAbsPath.get(resolve(schemaAbs))
      } else {
        schemaEntry = schemaEntries.find(e =>
          e.schema.$id === schemaRef ||
          toPosix(relative(SCHEMAS_DIR, e.path)) === schemaRef ||
          toPosix(relative(ROOT, e.path)) === schemaRef
        )
      }
      if (!schemaEntry) {
        throw new Error(`Sample $schema not resolvable as filesystem path or registered schema identity: ${schemaRef}`)
      }

      const draft = schemaEntry.draft
      const targetAjv = draft === 'draft-07' ? ajv07 : ajv2020
      const relFromRoot = toPosix(relative(ROOT, schemaEntry.path))
      const relFromSchemas = relFromRoot.startsWith('schemas/')
        ? relFromRoot.slice('schemas/'.length)
        : null
      const candidateKeys = [schemaEntry.schema.$id, relFromSchemas, relFromRoot].filter(Boolean)
      const validate = candidateKeys
        .map(key => targetAjv.getSchema(key))
        .find(Boolean)
      if (!validate) {
        throw new Error(`Unable to resolve compiled validator for schema: ${schemaRef}`)
      }
      const ok = validate(sample)

      if (!ok) {
        throw new Error(
          validate.errors.map(err => `${err.instancePath || '/'} ${err.message}`).join(' | ')
        )
      }

      // JSON-LD context check (only when @context is present).
      if (sample['@context']) {
        const hasOfficial = await contextIncludesOfficial(sample['@context'], dirname(samplePath), UNECE_CONTEXT_URL)
        if (!hasOfficial) {
          throw new Error(`@context does not include ${UNECE_CONTEXT_URL}`)
        }
      }

      console.log('ok')
    } catch (err) {
      console.log('FAIL')
      console.error(`    ${err.message}`)
      failures += 1
    }
  }

  console.log('='.repeat(70))
  if (failures === 0) {
    console.log(`All ${samplePaths.length} samples valid.`)
    process.exit(0)
  }
  console.log(`${failures} of ${samplePaths.length} samples failed.`)
  process.exit(1)
}

main().catch(err => {
  console.error('Unexpected error:', err.message)
  process.exit(1)
})