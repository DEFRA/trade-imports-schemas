#!/usr/bin/env node
/**
 * Validate all JSON Schemas in /schemas against each other,
 * including external UNECE dependencies and vocabulary context checks.
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

const UNECE_CONTEXT_URL = 'https://vocabulary.uncefact.org/unece-context-D23B.jsonld'
const BSP_BASICCOMPONENTS_URL =
  'https://raw.githubusercontent.com/uncefact/spec-JSONschema/main/JSONschema2020-12/meta-library/BuyShipPay/D23B/UNECE-BasicComponents.json'
const BSP_BASICCOMPONENTS_LEGACY_URL =
  'https://raw.githubusercontent.com/uncefact/spec-JSONschema/main/JSONschema2020-12/meta-library/BuyShipPay/D23B/BasicComponents'

const VENDOR_DIR = join(ROOT, 'build/vendor/uncefact')
const BSP_VENDOR_PATH = join(VENDOR_DIR, 'UNECE-BasicComponents.json')
const CONTEXT_VENDOR_PATH = join(VENDOR_DIR, 'unece-context-D23B.jsonld')
const CONTEXTS_DIR = join(SCHEMAS_DIR, 'contexts')

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

function safeAddSchema(ajv, schema, key) {
  if (!key) return
  try {
    ajv.addSchema(schema, key)
  } catch {
    // Duplicate aliases are fine.
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

async function main() {
  console.log('Validating schemas')
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
  for (const schemaPath of schemaPaths) {
    const schema = await loadJson(schemaPath)
    schemaEntries.push({
      path: schemaPath,
      rel: toPosix(relative(ROOT, schemaPath)),
      schema,
      draft: draftForSchema(schema)
    })
  }

  const ajv07 = makeAjv('draft-07')
  const ajv2020 = makeAjv('2020-12')

  // External schema used by gbn-ag profile.
  safeAddSchema(ajv2020, bspBasicComponents, BSP_BASICCOMPONENTS_URL)
  safeAddSchema(ajv2020, bspBasicComponents, BSP_BASICCOMPONENTS_LEGACY_URL)
  safeAddSchema(ajv2020, bspBasicComponents, bspBasicComponents.$id)

  // Register all schemas first so refs resolve.
  for (const entry of schemaEntries) {
    const targetAjv = entry.draft === 'draft-07' ? ajv07 : ajv2020
    registerSchemaAliases(targetAjv, entry.schema, entry.path)
  }

  let failures = 0
  for (const entry of schemaEntries) {
    process.stdout.write(`  ${entry.rel} (${entry.draft}) ... `)
    try {
      const targetAjv = entry.draft === 'draft-07' ? ajv07 : ajv2020
      targetAjv.compile(entry.schema)
      console.log('ok')
    } catch (err) {
      console.log('FAIL')
      console.error(`    ${err.message}`)
      failures += 1
    }
  }

  // Validate each local context's chain reaches the official D23B URL,
  // following nested @context references between local files.
  if (await fileExists(CONTEXTS_DIR)) {
    const contextPaths = (await walkFiles(
      CONTEXTS_DIR,
      p => p.endsWith('.context.jsonld')
    )).sort()
    for (const contextPath of contextPaths) {
      process.stdout.write(`  ${toPosix(relative(ROOT, contextPath))} (context linkage) ... `)
      try {
        const localContext = await loadJson(contextPath)
        const ok = await contextIncludesOfficial(localContext['@context'], dirname(contextPath), UNECE_CONTEXT_URL)
        if (!ok) {
          throw new Error(`@context chain does not include ${UNECE_CONTEXT_URL}`)
        }
        console.log('ok')
      } catch (err) {
        console.log('FAIL')
        console.error(`    ${err.message}`)
        failures += 1
      }
    }
  }

  console.log('='.repeat(70))
  if (failures === 0) {
    console.log(`All ${schemaEntries.length} schemas compiled cleanly.`)
    process.exit(0)
  }
  console.log(`${failures} validation checks failed.`)
  process.exit(1)
}

main().catch(err => {
  console.error('Unexpected error:', err.message)
  process.exit(1)
})