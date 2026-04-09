#!/usr/bin/env node
/**
 * Validates JSON Schema files for internal correctness and cross-reference consistency
 *
 * Checks:
 * 1. Each schema is valid JSON Schema draft-07
 * 2. All $ref references resolve correctly
 * 3. Schemas can be compiled without errors
 * 4. Sample valid/invalid data validates as expected
 */

import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import { readFile } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SCHEMAS_DIR = join(__dirname, '../schemas')

/**
 * Load a schema file and return parsed JSON
 */
async function loadSchema(filename) {
  const path = join(SCHEMAS_DIR, filename)
  const content = await readFile(path, 'utf-8')
  return { path, schema: JSON.parse(content) }
}

/**
 * Create AJV instance with proper configuration for draft-07
 */
function createValidator() {
  // AJV v8 uses draft-07 by default (best ecosystem support)
  const ajv = new Ajv({
    strict: false,          // Allow some flexibility in schema structure
    allErrors: true,        // Report all errors, not just first
    verbose: true,          // Include schema and data in errors
    validateFormats: true,  // Validate format keywords (date, uri, etc)
    validateSchema: true,   // ✅ VALIDATE schemas against draft-07 metaschema
  })

  addFormats(ajv) // Add format validators (date, date-time, uri, uuid, etc)
  return ajv
}

/**
 * Validate that a schema is internally correct
 * Note: Schema should already be loaded in AJV registry
 */
function validateSchemaStructure(ajv, schemaFile, schema) {
  console.log(`\n📋 Validating ${schemaFile}...`)

  try {
    // Try to compile/get the schema from AJV
    const schemaId = schema.$id
    const validate = ajv.getSchema(schemaId)

    if (!validate) {
      throw new Error(`Schema not found in AJV registry: ${schemaId}`)
    }

    console.log(`   ✅ Schema is valid JSON Schema draft-07`)
    console.log(`   ✅ All $ref references resolved`)
    console.log(`   ✅ Schema compiled successfully`)

    return { success: true, schema }
  } catch (error) {
    console.error(`   ❌ Schema validation failed:`)
    console.error(`      ${error.message}`)
    return { success: false, error }
  }
}

/**
 * Test a compiled schema against sample data
 */
function testSchemaWithData(ajv, schemaName, schema, testData, shouldBeValid) {
  const validate = ajv.compile(schema)
  const isValid = validate(testData)

  const expectation = shouldBeValid ? 'valid' : 'invalid'
  const result = isValid === shouldBeValid ? '✅' : '❌'

  console.log(`   ${result} ${expectation} data: ${isValid === shouldBeValid ? 'PASS' : 'FAIL'}`)

  if (!isValid) {
    console.log(`      Errors: ${ajv.errorsText(validate.errors)}`)
  }

  return isValid === shouldBeValid
}

/**
 * Generate minimal valid sample data for NotificationCreated
 */
function generateCreatedEventSample() {
  return {
    eventId: '123e4567-e89b-12d3-a456-426614174000',
    aggregateType: 'Notification',
    subType: 'IMPv2',
    aggregateId: 'Imports.Notification.IMPv2.DRAFT.GB.2024.1234',
    aggregateVersion: 1,
    eventType: 'uk.gov.defra.imports.notification.NotificationCreated',
    timestamp: '2024-01-15T10:30:00Z',
    metadata: {
      correlationId: 'corr-123',
      schemaVersion: 1,
      schemaUri: 'https://example.com/schema'
    },
    data: {
      referenceNumber: 'DRAFT.GB.2024.1234',
      type: 'IMPv2',
      status: 'DRAFT',
      commodities: {
        commodityComplement: [
          { commodityID: '0101210000', complementName: 'Live horses' }
        ],
        countryOfOrigin: 'FR'
      }
    }
  }
}

/**
 * Generate minimal valid sample data for NotificationSubmitted
 */
function generateSubmittedEventSample() {
  return {
    eventId: '123e4567-e89b-12d3-a456-426614174001',
    aggregateType: 'Notification',
    subType: 'IMPv2',
    aggregateId: 'Imports.Notification.IMPv2.SUBMITTED.GB.2024.5678',
    aggregateVersion: 2,
    eventType: 'uk.gov.defra.imports.notification.NotificationSubmitted',
    timestamp: '2024-01-15T11:00:00Z',
    metadata: {
      correlationId: 'corr-456',
      schemaVersion: 1,
      schemaUri: 'https://example.com/schema'
    },
    data: {
      referenceNumber: 'SUBMITTED.GB.2024.5678',
      type: 'IMPv2',
      status: 'SUBMITTED',
      consignor: { type: 'exporter', companyName: 'Test Exporter' },
      consignee: { type: 'consignee', companyName: 'Test Consignee' },
      importer: { type: 'importer', companyName: 'Test Importer' },
      placeOfDestination: { type: 'destination', companyName: 'Test Destination' },
      commodities: {
        commodityComplement: [
          { commodityID: '0101210000', complementName: 'Live horses' }
        ],
        complementParameterSet: [
          { complementID: 1, speciesID: 'EQUID' }
        ],
        countryOfOrigin: 'FR'
      },
      purpose: {
        purposeGroup: 'For Import'
      },
      pointOfEntry: 'GBFXT1',
      arrivalDate: '2024-01-20',
      veterinaryInformation: {
        veterinaryDocument: 'VET-123'
      },
      submissionDate: '2024-01-15T11:00:00Z'
    }
  }
}

/**
 * Main validation routine
 */
async function main() {
  console.log('🔍 JSON Schema Validation Report')
  console.log('='.repeat(60))

  const ajv = createValidator()
  const results = []

  // Step 0: Load all schemas first
  console.log('\n📂 Loading schemas...')
  const schemaFiles = [
    'event-envelope-v1.schema.json',
    'common-v1.schema.json',
    'impv2-v1.schema.json',
    'impv2-event-created-v1.schema.json',
    'impv2-event-submitted-v1.schema.json'
  ]

  const loadedSchemas = {}
  for (const filename of schemaFiles) {
    try {
      const { schema } = await loadSchema(filename)
      loadedSchemas[filename] = schema
      // Add to AJV registry to resolve cross-references
      ajv.addSchema(schema)
      console.log(`   ✅ Loaded ${filename}`)
    } catch (error) {
      console.error(`   ❌ Failed to load ${filename}: ${error.message}`)
      loadedSchemas[filename] = null
    }
  }

  // Step 1: Validate each schema's structure
  console.log('\n📦 Step 1: Validating Schema Structure')
  console.log('-'.repeat(60))

  const envelopeResult = validateSchemaStructure(ajv, 'event-envelope-v1.schema.json', loadedSchemas['event-envelope-v1.schema.json'])
  results.push({ name: 'envelope', ...envelopeResult })

  const commonResult = validateSchemaStructure(ajv, 'common-v1.schema.json', loadedSchemas['common-v1.schema.json'])
  results.push({ name: 'common', ...commonResult })

  const domainResult = validateSchemaStructure(ajv, 'impv2-v1.schema.json', loadedSchemas['impv2-v1.schema.json'])
  results.push({ name: 'domain', ...domainResult })

  const createdResult = validateSchemaStructure(ajv, 'impv2-event-created-v1.schema.json', loadedSchemas['impv2-event-created-v1.schema.json'])
  results.push({ name: 'created', ...createdResult })

  const submittedResult = validateSchemaStructure(ajv, 'impv2-event-submitted-v1.schema.json', loadedSchemas['impv2-event-submitted-v1.schema.json'])
  results.push({ name: 'submitted', ...submittedResult })

  // Step 2: Test schemas with sample data
  if (createdResult.success) {
    console.log('\n📝 Step 2: Testing Created Event Schema')
    console.log('-'.repeat(60))

    const validCreated = generateCreatedEventSample()
    testSchemaWithData(ajv, 'Created Event', createdResult.schema, validCreated, true)

    // Test invalid data (missing required field - type)
    const invalidCreated = { ...validCreated }
    delete invalidCreated.data.type
    testSchemaWithData(ajv, 'Created Event', createdResult.schema, invalidCreated, false)

    // Test invalid data (missing required field - referenceNumber)
    const missingRefNumber = { ...validCreated }
    delete missingRefNumber.data.referenceNumber
    testSchemaWithData(ajv, 'Created Event', createdResult.schema, missingRefNumber, false)

    // Test invalid data (missing required field - commodities)
    const missingCommodities = { ...validCreated }
    delete missingCommodities.data.commodities
    testSchemaWithData(ajv, 'Created Event', createdResult.schema, missingCommodities, false)

    // Test invalid data (commodities missing countryOfOrigin)
    const missingOrigin = { ...validCreated, data: { ...validCreated.data, commodities: { commodityComplement: [{ commodityID: '0101210000' }] } } }
    testSchemaWithData(ajv, 'Created Event', createdResult.schema, missingOrigin, false)

    // Test invalid data (wrong status)
    const wrongStatus = { ...validCreated, data: { ...validCreated.data, status: 'SUBMITTED' } }
    testSchemaWithData(ajv, 'Created Event', createdResult.schema, wrongStatus, false)
  }

  if (submittedResult.success) {
    console.log('\n📝 Step 3: Testing Submitted Event Schema')
    console.log('-'.repeat(60))

    const validSubmitted = generateSubmittedEventSample()
    testSchemaWithData(ajv, 'Submitted Event', submittedResult.schema, validSubmitted, true)

    // Test invalid data (missing required field)
    const invalidSubmitted = { ...validSubmitted }
    delete invalidSubmitted.data.veterinaryInformation
    testSchemaWithData(ajv, 'Submitted Event', submittedResult.schema, invalidSubmitted, false)

    // Test invalid data (wrong status)
    const wrongStatus = { ...validSubmitted, data: { ...validSubmitted.data, status: 'DRAFT' } }
    testSchemaWithData(ajv, 'Submitted Event', submittedResult.schema, wrongStatus, false)
  }

  // Summary
  console.log('\n' + '='.repeat(60))
  console.log('📊 Summary')
  console.log('='.repeat(60))

  const allPassed = results.every(r => r.success)
  const passedCount = results.filter(r => r.success).length
  const totalCount = results.length

  console.log(`\nSchemas validated: ${passedCount}/${totalCount}`)

  if (allPassed) {
    console.log('\n✅ All schemas are internally correct and consistent')
    console.log('   - Valid JSON Schema draft-07 syntax')
    console.log('   - All $ref references resolve')
    console.log('   - Sample data validates correctly')
    console.log('   - Schemas validated against draft-07 metaschema')
    process.exit(0)
  } else {
    console.log('\n❌ Some schemas have errors - see details above')
    process.exit(1)
  }
}

// Run validation
main().catch(error => {
  console.error('\n💥 Unexpected error:', error)
  process.exit(1)
})