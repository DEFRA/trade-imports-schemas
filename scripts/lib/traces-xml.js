/**
 * Parse TRACES SOAP/XML to TRACES-shaped JSON (camelCase).
 */

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { XMLParser } from 'fast-xml-parser'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MESSAGE_CONFIG_PATH = resolve(__dirname, '../traces-message-config.json')

const FXP_ARRAY_TAGS = [
  'ProductSPSLaboratoryTest',
  'SPSLaboratoryTest',
  'SPSConsignmentItemLaboratoryTest',
  'IncludedSPSNote',
  'ReferenceSPSReferencedDocument',
  'SignatorySPSAuthentication',
  'IncludedSPSClause',
  'IncludedSPSConsignmentItem',
  'IncludedSPSTradeLineItem',
  'ApplicableSPSClassification'
]

export function toCamelCase (str) {
  if (!str || typeof str !== 'string') return str
  if (str.includes('_')) {
    return str
      .split('_')
      .map((part, i) => {
        const s = part.toLowerCase()
        return i === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1)
      })
      .join('')
  }
  const segments = str.match(/[A-Z]+(?=[A-Z])|[A-Z]+[a-z]*|[a-z]+/g)
  if (!segments || segments.length === 0) return str
  const isAcronym = (s) => s.length > 1 && /^[A-Z]+$/.test(s)
  return segments
    .map((s, i) => {
      if (i === 0) return s.toLowerCase()
      if (isAcronym(s)) return s
      if (s.length === 1) return s.toLowerCase()
      return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
    })
    .join('')
}

function toOutputKey (key) {
  const name = key.startsWith('@_') ? key.slice(2) : key
  return toCamelCase(name)
}

export function toSchemaShape (val) {
  if (val === null || val === undefined) return val
  if (Array.isArray(val)) return val.map(toSchemaShape)
  if (typeof val !== 'object') return val

  const out = {}
  for (const [key, v] of Object.entries(val)) {
    if (key === ':@') continue
    if (key === '#text') {
      out.value = v
      continue
    }
    const camel = toOutputKey(key)
    const converted = toSchemaShape(v)
    if (camel in out && Array.isArray(out[camel]) && !Array.isArray(converted)) {
      out[camel].push(converted)
    } else if (camel in out && !Array.isArray(out[camel]) && !Array.isArray(converted)) {
      out[camel] = [out[camel], converted]
    } else {
      out[camel] = converted
    }
  }
  return out
}

function normalizeElement (obj) {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return obj
  const attrs = obj[':@']
  const text = obj['#text']
  const rest = { ...obj }
  delete rest[':@']
  delete rest['#text']
  const keys = Object.keys(rest)
  if (keys.length === 0 && (attrs || text !== undefined)) {
    const node = attrs ? { ...attrs } : {}
    if (text !== undefined) node.value = text
    return node
  }
  const out = {}
  for (const k of keys) out[k] = normalizeElement(rest[k])
  if (attrs) Object.assign(out, attrs)
  if (text !== undefined) out.value = text
  return out
}

function findRoot (parsed, xmlRoot) {
  const direct = parsed[xmlRoot] ?? parsed.Envelope?.Body?.[xmlRoot]
  if (direct) return direct
  const key = Object.keys(parsed).find(
    (k) => k === xmlRoot || k.endsWith(':' + xmlRoot)
  )
  return key ? parsed[key] : null
}

export function parsedToJson (parsed, config) {
  const { xmlRoot, rootMap } = config
  let root = findRoot(parsed, xmlRoot)
  if (!root && xmlRoot === 'SPSCertificate') {
    const nested = findNestedSPSCertificate(parsed)
    if (nested) root = nested
  }
  if (!root) {
    const keys = Object.keys(parsed).join(', ')
    throw new Error(
      `Expected root element "${xmlRoot}". Top-level keys: ${keys}`
    )
  }

  const rootKeys = Object.keys(root)
  const result = {}
  const arrayKeys = new Set(config.arrayKeys || [])

  if (Object.keys(rootMap).length === 0) {
    return { spsCertificate: toSchemaShape(normalizeElement(root)) }
  }

  for (const [xmlName, jsonKey] of Object.entries(rootMap)) {
    const raw =
      root[xmlName] ??
      root[rootKeys.find((k) => k === xmlName || k.endsWith(':' + xmlName))]
    if (raw === undefined) continue
    const normalized = normalizeElement(raw)
    const converted = toSchemaShape(normalized)
    if (arrayKeys.has(jsonKey) && !Array.isArray(converted)) {
      result[jsonKey] = converted ? [converted] : []
    } else {
      result[jsonKey] = converted
    }
  }
  return result
}

export function loadMessageConfig () {
  const raw = readFileSync(MESSAGE_CONFIG_PATH, 'utf8')
  const data = JSON.parse(raw)
  return data.messages || data
}

export function getMessageConfig (messages, messageId) {
  if (messages[messageId]) return { id: messageId, config: messages[messageId] }
  const short = messageId.replace(/^.*\//, '')
  const entry = Object.entries(messages).find(([id]) => id.endsWith('/' + short) || id === short)
  return entry ? { id: entry[0], config: entry[1] } : null
}

function findNestedSPSCertificate (node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 8) return null
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findNestedSPSCertificate(item, depth + 1)
      if (found) return found
    }
    return null
  }
  for (const [key, val] of Object.entries(node)) {
    const local = key.includes(':') ? key.replace(/^[^:]+:/, '') : key
    if (local === 'SPSCertificate') return val
    const found = findNestedSPSCertificate(val, depth + 1)
    if (found) return found
  }
  return null
}

export function inferMessageConfig (parsed, messages) {
  const rootName = (obj) =>
    obj && Object.keys(obj).find((k) => !k.startsWith(':') && k !== 'Envelope' && k !== 'Body')
  const topRoot = rootName(parsed)
  const bodyRoot = parsed.Envelope?.Body ? rootName(parsed.Envelope.Body) : null
  const name = topRoot || bodyRoot
  if (!name) {
    throw new Error('Could not determine root element name from parsed XML. Use --message <id>.')
  }
  const xmlRootLocal = name.includes(':') ? name.replace(/^[^:]+:/, '') : name
  const entry = Object.entries(messages).find(
    ([, c]) => c.xmlRoot === xmlRootLocal || c.xmlRoot === name
  )
  if (entry) return { id: entry[0], config: entry[1] }

  const nestedCert = findNestedSPSCertificate(parsed)
  if (nestedCert) {
    const certConfig = messages['certificate/SPSCertificate']
    if (certConfig) {
      return { id: 'certificate/SPSCertificate (inferred from nested SPSCertificate)', config: certConfig }
    }
  }

  throw new Error(
    `Root element "${xmlRootLocal}" did not match any configured message. Use --message <id> or --list.`
  )
}

export function parseTracesXml (xml, messageId = null) {
  const parser = new XMLParser({
    ignoreDeclaration: true,
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    parseTagValue: true,
    trimValues: true,
    removeNSPrefix: true,
    isArray: (name) => FXP_ARRAY_TAGS.includes(name)
  })
  const parsed = parser.parse(xml)
  const messages = loadMessageConfig()
  const resolved = messageId
    ? getMessageConfig(messages, messageId)
    : inferMessageConfig(parsed, messages)
  if (!resolved) throw new Error(`Unknown message type: ${messageId}`)
  return parsedToJson(parsed, resolved.config)
}
