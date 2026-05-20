import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '../..')
const SCHEMAS = join(ROOT, 'schemas')

const PROFILES = {
  ched: {
    $type: 'ched',
    schema: 'profiles/imports/international/defra-unvtd-profile-ched-v1.schema.json',
    documentTypeCodes: new Set(['636'])
  },
  intra: {
    $type: 'intra',
    schema: 'profiles/imports/eu/defra-unvtd-profile-intra-v1.schema.json',
    documentTypeCodes: new Set(['666', '856'])
  },
  docom: {
    $type: 'docom',
    schema: 'profiles/imports/eu/defra-unvtd-profile-docom-v1.schema.json',
    documentTypeCodes: null
  }
}

export function detectProfileType (payload, override) {
  if (override && PROFILES[override]) return override

  const dtc = payload?.exchangedDocument?.documentTypeCode
  if (dtc != null) {
    const code = String(dtc)
    if (PROFILES.ched.documentTypeCodes.has(code)) return 'ched'
    if (PROFILES.intra.documentTypeCodes.has(code)) return 'intra'
  }
  return 'docom'
}

export function applyProfile (payload, typeKey) {
  const profile = PROFILES[typeKey]
  if (!profile) throw new Error(`Unknown profile type: ${typeKey}`)
  return {
    ...payload,
    $type: profile.$type
  }
}

export function profileSchemaPath (typeKey) {
  const profile = PROFILES[typeKey]
  if (!profile) throw new Error(`Unknown profile type: ${typeKey}`)
  return join(SCHEMAS, profile.schema)
}

export { PROFILES, ROOT, SCHEMAS }
