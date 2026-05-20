import { relative, dirname, resolve } from 'path'
import { PROFILES, SCHEMAS } from './profile.js'

function relativeSchemaPath (outDir, typeKey) {
  const profile = PROFILES[typeKey]
  const schemaAbs = resolve(SCHEMAS, profile.schema)
  const contextAbs = resolve(SCHEMAS, 'contexts/defra-unvtd-core-v1.context.jsonld')

  let schemaRel = relative(outDir, schemaAbs).split('\\').join('/')
  let contextRel = relative(outDir, contextAbs).split('\\').join('/')
  if (!schemaRel.startsWith('.')) schemaRel = `./${schemaRel}`
  if (!contextRel.startsWith('.')) contextRel = `./${contextRel}`
  return { schemaRel, contextRel }
}

/**
 * Order and add sample metadata ($model, $schema, @context, $type) like unvtd-*.json fixtures.
 * $model is always defra/certificate-internal/1 for CHED, INTRA, and DOCOM profiles.
 */
export function withMetadata (payload, typeKey, outputPath) {
  const profile = PROFILES[typeKey]
  const outDir = outputPath ? dirname(resolve(outputPath)) : process.cwd()
  const { schemaRel, contextRel } = relativeSchemaPath(outDir, typeKey)

  const {
    exchangedDocument,
    specifiedConsignment,
    laboratoryObservationResult,
    ...rest
  } = payload

  const ordered = {
    $model: 'defra/certificate-internal/1',
    $schema: schemaRel,
    '@context': contextRel,
    $type: profile.$type,
    exchangedDocument,
    specifiedConsignment
  }

  if (laboratoryObservationResult !== undefined) {
    ordered.laboratoryObservationResult = laboratoryObservationResult
  }

  for (const [k, v] of Object.entries(rest)) {
    if (k !== '$model' && k !== '$type' && k !== '$schema' && k !== '@context') {
      ordered[k] = v
    }
  }

  return ordered
}
