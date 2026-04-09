#!/usr/bin/env node
/**
 * Validates sample event JSON files against their corresponding schemas
 *
 * Requirements:
 * - Sample files must be complete events (not just data payloads)
 * - Must include: eventId, aggregateType, subType, aggregateId, aggregateVersion, eventType, timestamp, metadata, data
 * - Must include metadata with schemaVersion and schemaUri
 *
 * Conventions:
 * - Sample files in /samples/ directory
 * - Naming: {journey}-notification-{event}-v{version}.json
 *   Examples:
 *     imp-notification-created-v1.json -> validates against event-created-v1.schema.json
 *     imp-notification-submitted-v1.json -> validates against event-submitted-v1.schema.json
 *     plants-notification-created-v1.json -> validates against plants-event-created-v1.schema.json
 */

import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import { readFile, readdir } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SCHEMAS_DIR = join(__dirname, '../schemas')
const SAMPLES_DIR = join(__dirname, '../samples')

/**
 * Load a schema file
 */
async function loadSchema(filename) {
  const path = join(SCHEMAS_DIR, filename)
  const content = await readFile(path, 'utf-8')
  return { path, schema: JSON.parse(content) }
}

/**
 * Load a sample file
 */
async function loadSample(filename) {
  const path = join(SAMPLES_DIR, filename)
  const content = await readFile(path, 'utf-8')
  return { path, sample: JSON.parse(content) }
}

/**
 * Create AJV instance
 */
function createValidator() {
  const ajv = new Ajv({
    strict: false,
    allErrors: true,
    verbose: true,
    validateFormats: true,
    validateSchema: true,
  })
  addFormats(ajv)
  return ajv
}

/**
 * Determine which schema to use for a sample file
 *
 * Naming conventions:
 * - imp-notification-created-v1.json -> impv2-event-created-v1.schema.json (animals)
 * - imp-notification-submitted-v1.json -> impv2-event-submitted-v1.schema.json (animals)
 * - plants-notification-created-v1.json -> plants-event-created-v1.schema.json
 * - plants-notification-submitted-v1.json -> plants-event-submitted-v1.schema.json
 */
function determineSchema(sampleFilename) {
  // Extract components from sample filename
  const match = sampleFilename.match(/^([a-z]+)-notification-(created|submitted)(?:-v(\d+))?\.json$/)

  if (!match) {
    return null
  }

  const [, journey, eventType, version = '1'] = match

  // Map journey to schema prefix
  const schemaPrefix = journey === 'imp' ? 'impv2-' : `${journey}-`

  return `${schemaPrefix}event-${eventType}-v${version}.schema.json`
}


/**
 * Main validation routine
 */
async function main() {
  console.log('🔍 Sample Event Validation Report')
  console.log('='.repeat(60))

  const ajv = createValidator()

  // Step 1: Load all schemas
  console.log('\n📂 Loading schemas...')
  const schemaFiles = [
    'event-envelope-v1.schema.json',
    'common-v1.schema.json',
    'impv2-v1.schema.json',
    'impv2-event-created-v1.schema.json',
    'impv2-event-submitted-v1.schema.json'
  ]

  for (const filename of schemaFiles) {
    try {
      const { schema } = await loadSchema(filename)
      ajv.addSchema(schema)
      console.log(`   ✅ Loaded ${filename}`)
    } catch (error) {
      console.error(`   ❌ Failed to load ${filename}: ${error.message}`)
    }
  }

  // Step 2: Find and validate sample files
  console.log('\n📝 Validating sample files...')
  console.log('-'.repeat(60))

  let sampleFiles
  try {
    sampleFiles = await readdir(SAMPLES_DIR)
    sampleFiles = sampleFiles.filter(f => f.endsWith('.json'))
  } catch (error) {
    console.error(`❌ Could not read samples directory: ${error.message}`)
    process.exit(1)
  }

  if (sampleFiles.length === 0) {
    console.log('⚠️  No sample files found in /samples directory')
    process.exit(0)
  }

  const results = []

  for (const sampleFile of sampleFiles) {
    console.log(`\n📄 ${sampleFile}`)

    // Determine which schema to use
    const schemaFile = determineSchema(sampleFile)
    if (!schemaFile) {
      console.log(`   ⚠️  Could not determine schema (unknown naming pattern)`)
      results.push({ file: sampleFile, valid: false, reason: 'Unknown naming pattern' })
      continue
    }

    console.log(`   → Using schema: ${schemaFile}`)

    // Load the sample
    let sample
    try {
      const loaded = await loadSample(sampleFile)
      sample = loaded.sample
    } catch (error) {
      console.log(`   ❌ Failed to load: ${error.message}`)
      results.push({ file: sampleFile, valid: false, reason: error.message })
      continue
    }

    // Validate the sample as-is (must be a complete event)
    if (!sample.eventId || !sample.metadata) {
      console.log(`   ❌ Invalid: Sample must be a complete event with eventId and metadata`)
      results.push({ file: sampleFile, valid: false, reason: 'Missing eventId or metadata - samples must be complete events' })
      continue
    }

    // Get schema and validate
    try {
      const schemaId = `https://github.com/DEFRA/trade-imports-schemas/blob/main/schemas/${schemaFile}`
      const validate = ajv.getSchema(schemaId)

      if (!validate) {
        console.log(`   ❌ Schema not found: ${schemaFile}`)
        results.push({ file: sampleFile, valid: false, reason: 'Schema not found' })
        continue
      }

      const isValid = validate(sample)

      if (isValid) {
        console.log(`   ✅ Valid`)
        results.push({ file: sampleFile, valid: true })
      } else {
        console.log(`   ❌ Invalid:`)
        for (const error of validate.errors) {
          console.log(`      • ${error.instancePath || '/'} ${error.message}`)
        }
        results.push({ file: sampleFile, valid: false, errors: validate.errors })
      }
    } catch (error) {
      console.log(`   ❌ Validation failed: ${error.message}`)
      results.push({ file: sampleFile, valid: false, reason: error.message })
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60))
  console.log('📊 Summary')
  console.log('='.repeat(60))

  const validCount = results.filter(r => r.valid).length
  const totalCount = results.length

  console.log(`\nSamples validated: ${validCount}/${totalCount}`)

  if (validCount === totalCount) {
    console.log('\n✅ All sample events are valid')
    process.exit(0)
  } else {
    console.log('\n❌ Some samples have validation errors - see details above')
    process.exit(1)
  }
}

// Run validation
main().catch(error => {
  console.error('\n💥 Unexpected error:', error)
  process.exit(1)
})
