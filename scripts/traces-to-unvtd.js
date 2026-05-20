#!/usr/bin/env node
/**
 * Convert TRACES CHED, INTRA, and DOCOM certificates to UNVTD profile JSON.
 *
 * Pipeline: XML or TRACES JSON → normalize → map to UNVTD → optional validate.
 * Field rules: trade-imports-documentation TRACES to internal model mapping.md
 *
 * Usage:
 *   node scripts/traces-to-unvtd.js <input.xml|json> [-o output.json]
 *     [--type ched|intra|docom] [--from-json] [--no-metadata] [--validate]
 *     [--message <id>] [--verbose] [--list]
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { normalizeTracesPayload } from './lib/traces-normalize.js'
import { mapTracesToUnvtd } from './lib/unvtd-map.js'
import { parseTracesXml, loadMessageConfig } from './lib/traces-xml.js'
import { detectProfileType, applyProfile } from './lib/profile.js'
import { withMetadata } from './lib/emit-metadata.js'
import { validateUnvtdPayload } from './lib/validate-output.js'

function usage () {
  console.error(`Usage: node scripts/traces-to-unvtd.js <input> [options]

Options:
  -o, --output <file> Write output to file (default: stdout); creates parent dirs
  --from-json         Input is TRACES-shaped JSON (not XML)
  --type <ched|intra|docom>  Force profile type
  --no-metadata       Omit $schema, @context (default: include when writing to a file)
  --validate          Validate against profile JSON Schema
  --message <id>      TRACES message type (see --list)
  --verbose           Log warnings for mapping edge cases
  --list              List configured XML message types
`)
}

async function main () {
  const args = process.argv.slice(2)
  let inputPath = null
  let outputPath = null
  let fromJson = false
  let typeOverride = null
  let noMetadata = false
  let validate = false
  let messageId = null
  let verbose = false
  let listOnly = false

  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if ((a === '-o' || a === '--output') && args[i + 1]) {
      outputPath = resolve(process.cwd(), args[++i])
    }
    else if (a === '--from-json') fromJson = true
    else if (a === '--type' && args[i + 1]) typeOverride = args[++i]
    else if (a === '--with-metadata') { /* legacy alias: metadata is default when -o is used */ }
    else if (a === '--no-metadata') noMetadata = true
    else if (a === '--validate') validate = true
    else if (a === '--message' && args[i + 1]) messageId = args[++i]
    else if (a === '--verbose') verbose = true
    else if (a === '--list') listOnly = true
    else if (a === '-h' || a === '--help') { usage(); process.exit(0) }
    else if (!a.startsWith('-')) inputPath = resolve(process.cwd(), a)
  }

  if (listOnly) {
    const messages = loadMessageConfig()
    console.log('Configured TRACES XML message types:')
    for (const [id, c] of Object.entries(messages)) {
      console.log(`  ${id}`)
      console.log(`    xmlRoot: ${c.xmlRoot}`)
    }
    return
  }

  if (!inputPath) {
    usage()
    process.exit(1)
  }

  const raw = readFileSync(inputPath, 'utf8')
  let tracesPayload

  if (fromJson) {
    tracesPayload = JSON.parse(raw)
    if (tracesPayload.spsCertificate) {
      tracesPayload = {
        spsCertificate: tracesPayload.spsCertificate,
        spsConsignmentItemLaboratoryTest: tracesPayload.spsConsignmentItemLaboratoryTest,
        productSPSLaboratoryTest: tracesPayload.productSPSLaboratoryTest
      }
    }
  } else {
    tracesPayload = parseTracesXml(raw, messageId)
    if (verbose) {
      console.error('Parsed TRACES payload keys:', Object.keys(tracesPayload).join(', '))
    }
  }

  const normalized = normalizeTracesPayload(tracesPayload)
  let unvtd = mapTracesToUnvtd(normalized, { typeOverride })

  const profileType = detectProfileType(unvtd, typeOverride)
  unvtd = applyProfile(unvtd, profileType)

  const includeMetadata = !noMetadata && (outputPath != null || process.argv.includes('--with-metadata'))
  if (includeMetadata) {
    unvtd = withMetadata(unvtd, profileType, outputPath ?? inputPath)
  }

  const jsonStr = JSON.stringify(unvtd, null, 2)

  if (outputPath) {
    mkdirSync(dirname(outputPath), { recursive: true })
    writeFileSync(outputPath, jsonStr, 'utf8')
    console.error('Wrote', outputPath)
  } else {
    console.log(jsonStr)
  }

  if (validate) {
    const { valid, errors } = await validateUnvtdPayload(unvtd, profileType)
    if (!valid) {
      console.error('Validation failed:', JSON.stringify(errors, null, 2))
      process.exit(1)
    }
    console.error(`Validation passed (${profileType} profile)`)
  }
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
