#!/usr/bin/env node
/**
 * Validate all JSON samples in /samples:
 *  - against their declared $schema
 *  - with basic JSON-LD context checks against UNECE D23B context usage
 *  - for GBN-AG samples that carry metadata, against the release process:
 *    metadata.schemaUri, metadata.schemaVersion and, for events, data["@context"]
 */

import Ajv from 'ajv'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import { readFile, readdir } from 'fs/promises'
import { join, dirname, relative, resolve } from 'path'
import { fileURLToPath } from 'url'

import { ensureRemoteJson, fileExists } from './lib/vendor.js'
import { contextIncludesOfficial, parseRepoRawUrl } from './lib/context-chain.js'

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

const ENVELOPE_SCHEMA_PATH = 'schemas/profiles/imports/messaging/event-envelope-v1.schema.json'
const REPO_RAW_BASE = 'https://raw.githubusercontent.com/DEFRA/trade-imports-schemas'
const RELEASE_SCHEMA_URI =
  /^https:\/\/raw\.githubusercontent\.com\/DEFRA\/trade-imports-schemas\/((?:release|prerelease)-\d{8}-\d{2})\/(.+)$/
// The release rules cover GBN-AG only. The CHED, DOCOM and INTRA event samples
// still use the earlier metadata form; widen this when those journeys migrate.
const RELEASE_RULES_SAMPLE_PREFIX = 'samples/imports/gb/gbn-ag/'

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

function collectRefs(node, acc = new Set()) {
  if (Array.isArray(node)) {
    node.forEach(item => collectRefs(item, acc))
  } else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (key === '$ref' && typeof value === 'string') acc.add(value)
      else collectRefs(value, acc)
    }
  }
  return acc
}

/**
 * Find the profile schemas behind an event schema: the profile schemas it
 * references, other than the envelope. An event schema that references none,
 * such as NotificationDeleted, is matched to the profile by the `$type` const
 * they share.
 */
function profilesForEvent(eventEntry, schemaEntries) {
  const isProfile = e => {
    const rel = toPosix(relative(ROOT, e.path))
    return rel.startsWith('schemas/profiles/') && rel !== ENVELOPE_SCHEMA_PATH
  }

  const referenced = new Set()
  for (const ref of collectRefs(eventEntry.schema)) {
    const target = ref.split('#')[0]
    const entry = target && schemaEntries.find(e =>
      e.schema.$id === target ||
      toPosix(relative(SCHEMAS_DIR, e.path)) === target ||
      toPosix(relative(ROOT, e.path)) === target
    )
    if (entry && isProfile(entry)) referenced.add(entry)
  }
  if (referenced.size > 0) return [...referenced]

  const dataType = eventEntry.schema.allOf
    ?.map(branch => branch.properties?.data?.properties?.$type?.const)
    .find(Boolean)
  return schemaEntries.filter(e =>
    dataType && isProfile(e) &&
    e.schema.allOf?.some(branch => branch.properties?.$type?.const === dataType)
  )
}

/**
 * Check a sample against the release process: metadata.schemaUri,
 * metadata.schemaVersion and, for an event, data["@context"]. Returns one
 * message for each problem found.
 */
function releaseRuleProblems(sample, relSample, schemaEntry, schemaEntries) {
  const problems = []
  const report = (field, found, expected) => problems.push(
    `${relSample}: ${field} is ${JSON.stringify(found)}, expected ${expected}`
  )

  const schemaPath = toPosix(relative(ROOT, schemaEntry.path))
  const { schemaUri, schemaVersion } = sample.metadata

  const uriMatch = RELEASE_SCHEMA_URI.exec(schemaUri)
  const ref = uriMatch?.[1]
  if (!uriMatch || uriMatch[2] !== schemaPath) {
    report(
      'metadata.schemaUri',
      schemaUri,
      `${REPO_RAW_BASE}/${ref ?? '<release-YYYYMMDD-NN or prerelease-YYYYMMDD-NN>'}/${schemaPath} (the raw URL, at a release tag, of the schema named by $schema)`
    )
  }

  const declaredVersion = schemaEntry.schema.version
  if (declaredVersion === undefined) {
    problems.push(
      `${relSample}: metadata.schemaVersion is ${JSON.stringify(schemaVersion)}, but ${schemaPath} has no "version" keyword to compare it with. Add "version" to the schema.`
    )
  } else if (schemaVersion !== declaredVersion) {
    report('metadata.schemaVersion', schemaVersion, `${JSON.stringify(declaredVersion)} (the "version" keyword of ${schemaPath})`)
  }

  if (!schemaPath.includes('/events/')) return problems

  const profiles = profilesForEvent(schemaEntry, schemaEntries)
  if (profiles.length !== 1) {
    const names = profiles.map(e => toPosix(relative(ROOT, e.path))).join(', ') || 'none'
    problems.push(
      `${relSample}: data["@context"] cannot be checked, because ${schemaPath} must identify exactly one profile schema through a $ref or its data $type const (found: ${names})`
    )
    return problems
  }

  const profile = profiles[0]
  const profilePath = toPosix(relative(ROOT, profile.path))
  const xContext = profile.schema['x-context']
  if (!xContext) {
    problems.push(
      `${relSample}: data["@context"] cannot be checked, because ${profilePath} has no "x-context" keyword. Add "x-context" to the schema, as the relative path of its context file.`
    )
    return problems
  }

  const contextAbs = resolve(dirname(profile.path), xContext)
  const contextPath = toPosix(relative(ROOT, contextAbs))
  const found = sample.data?.['@context']
  const expectedContext =
    `${REPO_RAW_BASE}/${ref ?? '<the ref used in metadata.schemaUri>'}/${contextPath} (the raw URL of the "x-context" of ${profilePath}, at the same ref as metadata.schemaUri)`
  const parsed = typeof found === 'string' ? parseRepoRawUrl(found) : null
  if (found === undefined) {
    problems.push(`${relSample}: data["@context"] is missing, expected ${expectedContext}`)
  } else if (!parsed || parsed.absPath !== contextAbs || (ref && parsed.ref !== ref)) {
    report('data["@context"]', found, expectedContext)
  }
  return problems
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
      const sample = await loadJson(samplePath)

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
      const dataContext = sample.data?.['@context']
      if (dataContext) {
        const hasOfficial = await contextIncludesOfficial(dataContext, dirname(samplePath), UNECE_CONTEXT_URL)
        if (!hasOfficial) {
          throw new Error(`${relSample}: data["@context"] is ${JSON.stringify(dataContext)}, expected a context whose chain reaches ${UNECE_CONTEXT_URL}`)
        }
      }

      if (sample.metadata && relSample.startsWith(RELEASE_RULES_SAMPLE_PREFIX)) {
        const problems = releaseRuleProblems(sample, relSample, schemaEntry, schemaEntries)
        if (problems.length > 0) {
          throw new Error(problems.join('\n    '))
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