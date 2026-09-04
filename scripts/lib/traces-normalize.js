/**
 * Normalize TRACES-shaped JSON: value-only codes, flattened notes/clauses, ISO dates.
 * Ported from trade-imports-documentation/schemas/TRACESNT/scripts/soap-response-to-json.js
 */

const CODE_ID_META_KEYS = new Set([
  'listId', 'listID', 'listAgencyId', 'listAgencyID', 'listAgencyIDSpecified',
  'listVersionId', 'listVersionID', 'listName', 'listURI', 'listSchemeURI',
  'schemeId', 'schemeID', 'schemeName', 'schemeAgencyId', 'schemeAgencyID', 'schemeAgencyName',
  'schemeVersionId', 'schemeVersionID', 'schemeDataURI', 'schemeURI',
  'name', 'languageId', 'languageID', 'languageLocaleID'
])

export function isCodeOrIdentifierType (obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false
  if (obj.value === undefined) return false
  const keys = Object.keys(obj)
  return keys.some((k) => CODE_ID_META_KEYS.has(k) || k.toLowerCase().startsWith('list') || k.toLowerCase().startsWith('scheme'))
}

/**
 * True when a value carries codelist or identifier-scheme metadata (listID,
 * schemeID and friends) rather than only a language tag or display name.
 * Such values keep their metadata through normalization so the mapper can
 * resolve it to a urlId; language-tagged values are still flattened.
 */
export function hasCodelistMeta (obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false
  if (obj.value === undefined) return false
  return Object.keys(obj).some((k) => {
    const key = k.toLowerCase()
    return key.startsWith('list') || key.startsWith('scheme')
  })
}

export function isDateTimeLike (obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false
  return (typeof obj.item === 'string') || (typeof obj.dateTime === 'string')
}

export function extractDateTime (obj) {
  if (obj?.item != null) return obj.item
  if (obj?.dateTime != null) return obj.dateTime
  return undefined
}

export function extractContentValue (content) {
  if (content === null || content === undefined) return undefined
  if (typeof content === 'string' || typeof content === 'number') return content
  if (Array.isArray(content)) {
    const withEn = content.find((c) => c && (c.languageId === 'en' || c.languageID === 'en'))
    const item = withEn ?? content[0]
    if (item == null) return undefined
    return item.value !== undefined ? item.value : item
  }
  if (typeof content === 'object' && content.value !== undefined) return content.value
  return content
}

/**
 * Content value for coded fields (note and clause content). TRACES emits the
 * code as an untagged element and repeats it as a language-tagged label
 * (<Content>INTERNAL_MARKET</Content> plus <Content languageID="en">For free
 * circulation</Content>). The code is the data, so prefer the untagged entry.
 */
export function extractCodeContentValue (content) {
  if (Array.isArray(content)) {
    for (const entry of content) {
      if (typeof entry === 'string' || typeof entry === 'number') return entry
      if (entry && entry.value !== undefined && entry.languageId === undefined && entry.languageID === undefined) {
        return entry.value
      }
    }
  }
  return extractContentValue(content)
}

export function extractCodeValue (obj) {
  if (obj == null) return undefined
  if (typeof obj === 'object' && 'value' in obj) return obj.value
  return obj
}

export function toCodeObject (obj) {
  if (obj == null) return undefined
  if (typeof obj === 'string' || typeof obj === 'number') return { value: obj }
  const o = typeof obj === 'object' ? obj : { value: obj }
  const value = o.value ?? o.Value ?? o['#text']
  if (value === undefined) return undefined
  const out = { value }
  if (o.listID != null || o.listId != null || o.listid != null) out.listID = o.listID ?? o.listId ?? o.listid
  if (o.listName != null) out.listName = o.listName
  if (o.name != null) out.name = o.name
  if (o.schemeID != null || o.schemeId != null || o.schemeid != null) out.schemeID = o.schemeID ?? o.schemeId ?? o.schemeid
  if (o.schemeName != null) out.schemeName = o.schemeName
  return out
}

function toContentCodesArray (contentCode) {
  if (contentCode == null) return []
  const arr = Array.isArray(contentCode) ? contentCode : [contentCode]
  return arr.map(toCodeObject).filter((c) => c != null)
}

export function simplifyToInternalModel (val, arrayKey = null) {
  if (val === null || val === undefined) return val
  if (Array.isArray(val)) {
    const key = (arrayKey || '').toLowerCase()
    if (key === 'includedspsnote') {
      const notes = []
      for (const item of val) {
        if (!item || typeof item !== 'object') continue
        const subjectCode = item.subjectCode ?? item.SubjectCode
        const content = item.content ?? item.Content
        const contentCode = item.contentCode ?? item.ContentCode
        const subjectObj = toCodeObject(subjectCode)
        if (subjectObj == null) continue
        const contentVal = extractCodeContentValue(content)
        const contentCodes = toContentCodesArray(contentCode)
        const note = {
          subjectCode: subjectObj,
          ...(contentVal !== undefined && contentVal !== '' && { content: contentVal }),
          ...(contentCodes.length > 0 && { contentCodes })
        }
        notes.push(note)
      }
      return notes
    }
    if (key === 'includedspsclause') {
      const clauses = []
      for (const item of val) {
        if (!item || typeof item !== 'object') continue
        const id = item.id ?? item.ID
        const content = item.content ?? item.Content
        const idObj = toCodeObject(id)
        if (idObj == null) continue
        const contentVal = extractCodeContentValue(content)
        clauses.push({
          ...idObj,
          ...(contentVal !== undefined && { content: contentVal })
        })
      }
      return clauses
    }
    // Repeated Name elements are either translations of one name (every entry
    // language-tagged, so pick one) or a packed address (mixed tagged and
    // untagged entries, whose order carries meaning — keep them all).
    const isNameTranslationSet = key === 'name' && val.length > 0 &&
      val.every((n) => n && typeof n === 'object' && (n.value !== undefined || n.Value !== undefined))
    if (isNameTranslationSet) {
      return extractContentValue(val)
    }
    return val.map((v) => simplifyToInternalModel(v, arrayKey))
  }
  if (typeof val !== 'object') return val

  if (isDateTimeLike(val)) return extractDateTime(val)
  if (hasCodelistMeta(val)) return toCodeObject(val)
  if (isCodeOrIdentifierType(val)) return val.value

  const out = {}
  for (const [k, v] of Object.entries(val)) {
    out[k] = simplifyToInternalModel(v, k)
  }
  return out
}

export function renameIncludedSPSNoteToNotes (val) {
  if (val === null || val === undefined) return val
  if (Array.isArray(val)) return val.map(renameIncludedSPSNoteToNotes)
  if (typeof val !== 'object') return val
  const out = {}
  for (const [k, v] of Object.entries(val)) {
    let key = k
    if (k === 'includedSPSNote' && Array.isArray(v)) key = 'includedSPSNotes'
    else if (k === 'includedSPSClause' && Array.isArray(v)) key = 'includedSPSClauses'
    out[key] = renameIncludedSPSNoteToNotes(v)
  }
  return out
}

/**
 * Normalize a TRACES certificate payload (spsCertificate + optional lab tests).
 */
export function normalizeTracesPayload (payload) {
  const simplified = simplifyToInternalModel(payload)
  return renameIncludedSPSNoteToNotes(simplified)
}
