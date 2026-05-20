import Ajv from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import { readFile, readdir } from 'fs/promises'
import { join, dirname, relative, resolve } from 'path'
import { fileURLToPath } from 'url'
import { profileSchemaPath, SCHEMAS, ROOT } from './profile.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

function toPosix (p) {
  return p.split('\\').join('/')
}

async function loadJson (path) {
  return JSON.parse(await readFile(path, 'utf-8'))
}

async function walkSchemas (dir, acc = []) {
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) await walkSchemas(full, acc)
    else if (entry.name.endsWith('.schema.json')) acc.push(full)
  }
  return acc
}

function safeAddSchema (ajv, schema, key) {
  if (!key) return
  try {
    ajv.addSchema(schema, key)
  } catch {
    // duplicate alias
  }
}

function registerSchemaAliases (ajv, schema, schemaAbsPath) {
  const relFromRoot = toPosix(relative(ROOT, schemaAbsPath))
  const relFromSchemas = relFromRoot.startsWith('schemas/')
    ? relFromRoot.slice('schemas/'.length)
    : null
  safeAddSchema(ajv, schema, relFromRoot)
  safeAddSchema(ajv, schema, relFromSchemas)
  safeAddSchema(ajv, schema, schema.$id)
}

let ajvInstance = null

async function getAjv () {
  if (ajvInstance) return ajvInstance

  const ajv = new Ajv({
    strict: false,
    allErrors: true,
    validateFormats: true
  })
  addFormats(ajv)

  const schemaPaths = await walkSchemas(SCHEMAS)
  for (const schemaPath of schemaPaths) {
    const schema = await loadJson(schemaPath)
    registerSchemaAliases(ajv, schema, schemaPath)
  }

  ajvInstance = ajv
  return ajv
}

/**
 * Validate UNVTD payload against the profile schema for the given type.
 */
export async function validateUnvtdPayload (payload, typeKey) {
  const schemaPath = profileSchemaPath(typeKey)
  const schema = await loadJson(schemaPath)
  const ajv = await getAjv()
  const relFromSchemas = toPosix(relative(SCHEMAS, schemaPath))
  let validate = ajv.getSchema(relFromSchemas) ?? ajv.getSchema(schema.$id)
  if (!validate) {
    validate = ajv.compile(schema)
  }
  const valid = validate(payload)
  return { valid, errors: validate.errors ?? [] }
}
