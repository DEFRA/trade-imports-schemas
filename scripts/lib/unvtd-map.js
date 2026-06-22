/**
 * Map normalized TRACES certificate JSON to UNVTD CertificatePayload.
 * Field rules: TRACES to internal model mapping.md (trade-imports-documentation).
 */

import { extractCodeValue, extractContentValue } from './traces-normalize.js'

const SIGNATORY_SLOTS = {
  4: 'firstSignatoryAuthentication',
  1: 'secondSignatoryAuthentication',
  8: 'thirdSignatoryAuthentication'
}

const SIGNATORY_SLOT_FALLBACK = 'fourthSignatoryAuthentication'

/** Keys renamed everywhere they appear (TRACES SPS prefix → UNVTD). */
const GLOBAL_KEY_RENAMES = {
  consignorSPSParty: 'consignorParty',
  consigneeSPSParty: 'consigneeParty',
  despatchSPSParty: 'despatchParty',
  customsTransitAgentSPSParty: 'customsTransitAgentParty',
  deliverySPSParty: 'deliveryParty',
  exportSPSCountry: 'exportCountry',
  importSPSCountry: 'importCountry',
  reExportSPSCountry: 'reExportCountry',
  transitSPSCountry: 'transitCountry',
  providerSPSParty: 'providerParty',
  specifiedSPSAddress: 'postalAddress',
  includedSPSConsignmentItem: 'includedConsignmentItem',
  includedSPSTradeLineItem: 'includedTradeLineItem',
  unloadingBaseportSPSLocation: 'unloadingBaseportLocation',
  mainCarriageSPSTransportMovement: 'mainCarriageLogisticsTransportMovement',
  utilizedSPSTransportEquipment: 'utilizedLogisticsTransportEquipment',
  affixedSPSSeal: 'affixedLogisticsSeal',
  applicableSPSClassification: 'applicableProductClassification',
  physicalReferencedSPSPackage: 'physicalReferencedLogisticsPackage',
  natureIdentificationSPSCargo: 'natureIdCargo',
  referenceSPSReferencedDocument: 'referenceDocument',
  referencedSPSAttachmentBinaryObject: 'attachmentBinaryObject',
  productSPSLaboratoryTest: 'productLaboratoryTest',
  spsLaboratoryTest: 'laboratoryTest',
  laboratorySPSParty: 'laboratory',
  productSPSClassification: 'applicableProductClassification',
  analysys: 'analysis',
  spsConsignmentItemLaboratoryTest: 'laboratoryObservationResult'
}

function asString (val) {
  if (val === null || val === undefined) return undefined
  if (typeof val === 'string') return val
  if (typeof val === 'number' || typeof val === 'boolean') return String(val)
  return undefined
}

function mapCodeType (raw) {
  if (raw == null) return undefined
  if (typeof raw !== 'object') {
    const value = asString(raw)
    return value ? { value } : undefined
  }
  const value = asString(raw.value)
  if (!value) return undefined
  const out = { value }
  const listId = asString(raw.listId ?? raw.listID ?? raw.listid)
  if (listId) out.listId = listId
  const listName = asString(raw.listName)
  if (listName) out.listName = listName
  const name = asString(raw.name)
  if (name) out.name = name
  const listAgencyId = asString(raw.listAgencyId ?? raw.listAgencyID ?? raw.listagencyid)
  if (listAgencyId) out.listAgencyId = listAgencyId
  const listAgencyName = asString(raw.listAgencyName)
  if (listAgencyName) out.listAgencyName = listAgencyName
  const listVersionId = asString(raw.listVersionId ?? raw.listVersionID ?? raw.listversionid)
  if (listVersionId) out.listVersionId = listVersionId
  return out
}

function mapContentArray (raw) {
  if (raw == null) return []
  const arr = Array.isArray(raw) ? raw : [raw]
  return arr
    .map((v) => {
      if (typeof v === 'object' && v !== null) return asString(v.value ?? v.content)
      return asString(v)
    })
    .filter(Boolean)
}

function mapNotes (notes) {
  if (!notes) return undefined
  const arr = Array.isArray(notes) ? notes : [notes]
  const out = []
  for (const n of arr) {
    if (!n || typeof n !== 'object') continue
    const subject = n.subjectCode
    const noteSubjectCode = typeof subject === 'object' ? asString(subject.value) : asString(subject)
    if (!noteSubjectCode) continue
    const note = {
      type: 'Note',
      noteSubjectCode,
      content: []
    }
    note.content = mapContentArray(n.content)
    const cc = n.contentCodes ?? n.contentCode
    const ccArr = cc == null ? [] : (Array.isArray(cc) ? cc : [cc])
    note.contentCode = ccArr.map(mapCodeType).filter(Boolean)
    out.push(note)
  }
  return out.length ? out : undefined
}

function mapClauses (clauses) {
  if (!clauses) return undefined
  const arr = Array.isArray(clauses) ? clauses : [clauses]
  const out = []
  for (const c of arr) {
    if (!c || typeof c !== 'object') continue
    const identifier = asString(c.value ?? c.identifier ?? extractCodeValue(c.id))
    if (!identifier) continue
    const clause = { identifier }
    if (c.content !== undefined) {
      clause.content = asString(c.content)
    }
    out.push(clause)
  }
  return out.length ? out : undefined
}

function mapPartyTypeCode (typeCode) {
  if (typeCode == null) return undefined
  let values
  if (Array.isArray(typeCode)) {
    values = typeCode.map((t) => asString(typeof t === 'object' ? t?.value : t)).filter(Boolean)
  } else if (typeof typeCode === 'object' && typeCode.value !== undefined) {
    values = [asString(typeCode.value)]
  } else {
    const s = asString(typeCode)
    values = s ? [s] : []
  }
  return values.length ? values : undefined
}

function mapParty (party) {
  if (!party || typeof party !== 'object') return undefined
  const out = {}
  const id = party.id ?? party.identifier
  if (id != null) out.identifier = asString(typeof id === 'object' ? id.value : id)
  if (party.name != null) out.name = extractContentValue(party.name) ?? asString(party.name)
  const role = party.roleCode ?? party.partyRoleCode
  if (role != null) out.partyRoleCode = asString(typeof role === 'object' ? role.value : role)
  const ptc = mapPartyTypeCode(party.typeCode ?? party.partyTypeCode)
  if (ptc) out.partyTypeCode = ptc

  const addr = party.specifiedSPSAddress ?? party.postalAddress
  if (addr) out.postalAddress = mapAddress(addr)

  const person = party.specifiedSPSPerson
  if (person) {
    const personName = person.name ?? person.personName
    if (personName != null) {
      out.definedContact = [{ personName: asString(personName) }]
    }
  } else if (party.definedContact) {
    out.definedContact = mapTree(party.definedContact)
  }

  return Object.keys(out).length ? out : undefined
}

function mapAddress (addr) {
  if (!addr || typeof addr !== 'object') return undefined
  const source = {
    postcodeCode: addr.postcodeCode,
    lineOne: addr.lineOne,
    lineTwo: addr.lineTwo,
    cityName: addr.cityName,
    countryId: addr.countryId ?? addr.countryID,
    countryName: addr.countryName,
    countrySubDivisionName: addr.countrySubDivisionName
  }
  const out = {}
  for (const [f, raw] of Object.entries(source)) {
    if (raw === undefined) continue
    let v = raw
    if (typeof v === 'object' && v?.value !== undefined) {
      v = extractContentValue(v) ?? v.value
    }
    if (f === 'postcodeCode' || f === 'countryId') {
      v = asString(v)
    } else if (typeof v === 'number') {
      v = String(v)
    }
    out[f] = v
  }
  return Object.keys(out).length ? out : undefined
}

function mapSignatory (auth) {
  if (!auth || typeof auth !== 'object') return undefined
  const out = {}
  const typeCode = auth.typeCode ?? auth.governmentActionTypeCode
  if (typeCode != null) {
    out.governmentActionTypeCode = asString(typeof typeCode === 'object' ? typeCode.value : typeCode)
  }
  if (auth.actualDateTime) out.actualDateTime = asString(auth.actualDateTime)

  const provider = auth.providerSPSParty ?? auth.providerParty
  if (provider) out.providerParty = mapParty(provider)

  const clauses = auth.includedSPSClauses ?? auth.includedSPSClause ?? auth.includedClause
  const mappedClauses = mapClauses(clauses)
  if (mappedClauses) out.includedClause = mappedClauses

  return out
}

function assignSignatories (doc, signatories) {
  if (!signatories) return
  const arr = Array.isArray(signatories) ? signatories : [signatories]
  let fallbackIndex = 0
  for (const auth of arr) {
    const rawType = auth?.typeCode ?? auth?.governmentActionTypeCode
    const code = Number(typeof rawType === 'object' ? rawType?.value : rawType)
    let slotKey = SIGNATORY_SLOTS[code]
    if (!slotKey) {
      const fallbacks = ['fourthSignatoryAuthentication']
      slotKey = fallbacks[fallbackIndex] ?? SIGNATORY_SLOT_FALLBACK
      fallbackIndex++
    }
    if (doc[slotKey] && slotKey !== SIGNATORY_SLOT_FALLBACK) {
      slotKey = SIGNATORY_SLOT_FALLBACK
    }
    doc[slotKey] = mapSignatory(auth)
  }
}

function mapReferencedDocuments (refs) {
  if (!refs) return undefined
  const arr = Array.isArray(refs) ? refs : [refs]
  return arr.map((r) => {
    if (!r || typeof r !== 'object') return r
    const out = {}
    const id = r.id ?? r.identifier
    if (id != null) out.identifier = asString(typeof id === 'object' ? id.value : id)
    const tc = r.typeCode ?? r.documentTypeCode
    if (tc != null) out.documentTypeCode = asString(typeof tc === 'object' ? tc.value : tc)
    const rel = r.relationshipTypeCode
    if (rel != null) out.relationshipTypeCode = asString(typeof rel === 'object' ? rel.value : rel)
    if (r.information) {
      out.information = Array.isArray(r.information)
        ? r.information.map((i) => asString(typeof i === 'object' ? i?.value : i))
        : [asString(r.information)]
    }
    const att = r.referencedSPSAttachmentBinaryObject ?? r.attachmentBinaryObject
    if (att) out.attachmentBinaryObject = mapTree(att)
    return out
  })
}

function mapExchangedDocument (spsDoc) {
  if (!spsDoc || typeof spsDoc !== 'object') {
    throw new Error('Missing spsExchangedDocument on certificate')
  }
  const doc = {}
  const name = spsDoc.name
  if (name != null) doc.name = extractContentValue(name) ?? asString(name)

  const id = spsDoc.id ?? spsDoc.identifier
  if (id != null) doc.identifier = asString(typeof id === 'object' ? id.value : id)

  const dtc = spsDoc.typeCode ?? spsDoc.documentTypeCode
  if (dtc != null) doc.documentTypeCode = asString(typeof dtc === 'object' ? dtc.value : dtc)

  const st = spsDoc.statusCode ?? spsDoc.documentStatusCode
  if (st != null) doc.documentStatusCode = asString(typeof st === 'object' ? st.value : st)

  if (spsDoc.issueDateTime) doc.issueDateTime = asString(spsDoc.issueDateTime)

  const notes = spsDoc.includedSPSNotes ?? spsDoc.includedSPSNote ?? spsDoc.includedNote
  const mappedNotes = mapNotes(notes)
  if (mappedNotes) doc.includedNote = mappedNotes

  const refs = spsDoc.referenceSPSReferencedDocument ?? spsDoc.referenceDocument
  const mappedRefs = mapReferencedDocuments(refs)
  if (mappedRefs) doc.referenceDocument = mappedRefs

  assignSignatories(doc, spsDoc.signatorySPSAuthentication)

  return doc
}

function mapMeasure (m) {
  if (!m || typeof m !== 'object') return m
  const out = {}
  const val = m.value ?? m.content
  if (val != null) out.value = asString(val)
  if (m.unitCode != null) out.unitCode = asString(typeof m.unitCode === 'object' ? m.unitCode.value : m.unitCode)
  return out
}

function mapClassification (c) {
  if (!c || typeof c !== 'object') return c
  const out = {}
  const sys = c.systemID ?? c.systemId
  if (sys != null) out.systemId = asString(typeof sys === 'object' ? sys.value : sys)
  if (c.systemName) out.systemName = extractContentValue(c.systemName) ?? asString(c.systemName)
  const cc = c.classCode
  if (cc != null) {
    const v = typeof cc === 'object' ? cc.value : cc
    out.classCode = typeof v === 'number' ? v : (Number.isNaN(Number(v)) ? asString(v) : Number(v))
  }
  if (c.className) {
    const cn = c.className
    if (Array.isArray(cn)) {
      out.className = cn.map((x) => (typeof x === 'object' ? extractContentValue(x) ?? asString(x.value) : asString(x)))
    } else {
      out.className = [extractContentValue(cn) ?? asString(cn)]
    }
  }
  return out
}

function mapTradeLineItem (item) {
  if (!item || typeof item !== 'object') return item
  const out = {}
  if (item.sequenceNumeric != null) out.sequenceNumeric = item.sequenceNumeric
  if (item.description) {
    const d = item.description
    out.description = Array.isArray(d)
      ? d.map((x) => extractContentValue(x) ?? asString(x))
      : [extractContentValue(d) ?? asString(d)]
  }
  if (item.netWeight) out.netWeight = mapMeasure(item.netWeight)
  if (item.grossWeight) out.grossWeight = mapMeasure(item.grossWeight)
  const apc = item.applicableSPSClassification ?? item.applicableProductClassification ?? item.applicableClassification
  if (apc) {
    out.applicableClassification = Array.isArray(apc)
      ? apc.map(mapClassification)
      : [mapClassification(apc)]
  }
  const pkg = item.physicalReferencedSPSPackage ?? item.physicalReferencedLogisticsPackage
  if (pkg) {
    out.physicalReferencedLogisticsPackage = (Array.isArray(pkg) ? pkg : [pkg]).map(mapTree)
  }
  return out
}

function mapConsignmentItem (item) {
  if (!item || typeof item !== 'object') return item
  const out = {}
  const nature = item.natureIdentificationSPSCargo ?? item.natureIdCargo
  if (nature) {
    out.natureIdCargo = (Array.isArray(nature) ? nature : [nature]).map((n) => {
      const tc = n?.typeCode
      return { typeCode: asString(typeof tc === 'object' ? tc?.value : tc) }
    })
  }
  const tli = item.includedSPSTradeLineItem ?? item.includedTradeLineItem
  if (tli) {
    out.includedTradeLineItem = (Array.isArray(tli) ? tli : [tli]).map(mapTradeLineItem)
  }
  return out
}

function mapLogisticsLocation (loc) {
  if (!loc || typeof loc !== 'object') return loc
  const out = {}
  const id = loc.id ?? loc.identifier
  if (id != null) out.identifier = asString(typeof id === 'object' ? id.value : id)
  const name = loc.name
  if (name != null) {
    out.name = extractContentValue(name) ?? (Array.isArray(name)
      ? name.map((n) => (typeof n === 'object' ? asString(n.value) : asString(n))).filter(Boolean).join(', ')
      : asString(name))
  }
  const tc = loc.typeCode
  if (tc != null) out.typeCode = asString(typeof tc === 'object' ? tc.value : tc)
  return out
}

function mapTradeCountry (country) {
  if (!country || typeof country !== 'object') return undefined
  const out = {}
  const id = country.id ?? country.identifier
  if (id != null) out.id = asString(typeof id === 'object' ? id.value : id)
  const name = country.name
  if (name != null) {
    out.name = extractContentValue(name) ?? asString(name)
  }
  return Object.keys(out).length ? out : undefined
}

function mapConsignment (consignment) {
  if (!consignment || typeof consignment !== 'object') {
    throw new Error('Missing spsConsignment on certificate')
  }
  return mapTree(consignment, { consignment: true })
}

function mapLaboratoryObservation (entry) {
  if (!entry || typeof entry !== 'object') return entry
  const out = {}
  const nature = entry.natureIdentificationSPSCargo ?? entry.natureIdCargo
  if (nature) {
    const n = Array.isArray(nature) ? nature[0] : nature
    const tc = n?.typeCode
    out.natureIdCargo = { typeCode: asString(typeof tc === 'object' ? tc?.value : tc) }
  }
  const plt = entry.productSPSLaboratoryTest ?? entry.productLaboratoryTest
  if (plt) {
    out.productLaboratoryTest = (Array.isArray(plt) ? plt : [plt]).map((p) => {
      const po = {}
      const apc = p.productSPSClassification ?? p.applicableProductClassification ?? p.applicableSPSClassification
      if (apc) po.applicableProductClassification = mapClassification(Array.isArray(apc) ? apc[0] : apc)
      const tests = p.spsLaboratoryTest ?? p.laboratoryTest
      if (tests) po.laboratoryTest = (Array.isArray(tests) ? tests : [tests]).map(mapLabTest)
      return po
    })
  }
  return out
}

function mapLabTest (test) {
  if (!test || typeof test !== 'object') return test
  const out = mapTree(test)
  if (out.analysis && typeof out.analysis === 'object') {
    const a = out.analysis
    if (a.laboratory && typeof a.laboratory === 'object') {
      a.laboratory = mapParty(a.laboratory) ?? a.laboratory
    }
  }
  return out
}

function renameKey (key) {
  return GLOBAL_KEY_RENAMES[key] ?? key
}

function mapTree (val, ctx = {}) {
  if (val === null || val === undefined) return val
  if (Array.isArray(val)) return val.map((v) => mapTree(v, ctx))
  if (typeof val !== 'object') return val

  const out = {}
  for (const [k, v] of Object.entries(val)) {
    let newKey = renameKey(k)

    if (k === 'id' && !ctx.keepId) {
      if (ctx.party || k.endsWith('Party') || GLOBAL_KEY_RENAMES[k]) {
        newKey = 'identifier'
      } else if (ctx.document) {
        newKey = 'identifier'
      } else if (ctx.clause) {
        newKey = 'identifier'
      }
    }

    if (k === 'roleCode') newKey = 'partyRoleCode'
    if (k === 'typeCode' && ctx.party) newKey = 'partyTypeCode'

    if (GLOBAL_KEY_RENAMES[k] === 'consignorParty' || k.endsWith('SPSParty')) {
      out[newKey] = mapParty(v)
      continue
    }

    if (k === 'specifiedSPSPerson') {
      const personName = v?.name
      if (personName != null) {
        if (!out.definedContact) out.definedContact = []
        out.definedContact.push({ personName: asString(personName) })
      }
      continue
    }

    if (k === 'includedSPSConsignmentItem' || newKey === 'includedConsignmentItem') {
      out.includedConsignmentItem = (Array.isArray(v) ? v : [v]).map(mapConsignmentItem)
      continue
    }

    if (k === 'includedSPSTradeLineItem' || newKey === 'includedTradeLineItem') {
      out.includedTradeLineItem = (Array.isArray(v) ? v : [v]).map(mapTradeLineItem)
      continue
    }

    if (k === 'applicableSPSClassification' || newKey === 'applicableProductClassification') {
      out.applicableProductClassification = Array.isArray(v) ? v.map(mapClassification) : mapClassification(v)
      continue
    }

    const childCtx = { ...ctx }

    if (newKey === 'unloadingBaseportLocation') {
      const items = Array.isArray(v) ? v : [v]
      out.unloadingBaseportLocation = items.map(mapLogisticsLocation)
      continue
    }

    if (newKey === 'exportCountry' || newKey === 'importCountry') {
      out[newKey] = mapTradeCountry(v)
      continue
    }

    if (newKey === 'reExportCountry' || newKey === 'transitCountry') {
      const items = Array.isArray(v) ? v : [v]
      out[newKey] = items.map(mapTradeCountry).filter(Boolean)
      continue
    }

    if (k === 'netWeight' || k === 'grossWeight') {
      out[newKey] = mapMeasure(v)
      continue
    }
    if (newKey.endsWith('Party')) childCtx.party = true

    out[newKey] = mapTree(v, childCtx)
  }
  return out
}

/**
 * Extract certificate body from various TRACES payload shapes.
 */
export function extractTracesCertificate (input) {
  if (!input || typeof input !== 'object') {
    throw new Error('Expected object payload')
  }

  let cert = input.spsCertificate ?? input
  let labTests = input.spsConsignmentItemLaboratoryTest ?? input.laboratoryObservationResult

  if (input.spsCertificate) {
    cert = input.spsCertificate
    labTests = labTests ?? input.spsConsignmentItemLaboratoryTest
  }

  if (!cert?.spsExchangedDocument && cert?.exchangedDocument) {
    return { alreadyUnvtd: true, payload: input }
  }

  if (!cert?.spsExchangedDocument) {
    throw new Error('Payload missing spsCertificate.spsExchangedDocument')
  }

  return { cert, labTests }
}

/**
 * Convert normalized TRACES JSON to UNVTD CertificatePayload (without $type / metadata).
 */
export function mapTracesToUnvtd (input, options = {}) {
  const extracted = extractTracesCertificate(input)
  if (extracted.alreadyUnvtd) {
    const p = { ...extracted.payload }
    delete p.$schema
    delete p['@context']
    return p
  }

  const { cert, labTests } = extracted
  const exchangedDocument = mapExchangedDocument(cert.spsExchangedDocument)
  const specifiedConsignment = mapConsignment(cert.spsConsignment)

  const payload = {
    $model: 'defra/certificate-internal/1',
    exchangedDocument,
    specifiedConsignment
  }

  if (labTests) {
    const arr = Array.isArray(labTests) ? labTests : [labTests]
    payload.laboratoryObservationResult = arr.map(mapLaboratoryObservation)
  }

  if (options.typeOverride) {
    payload.$type = options.typeOverride
  }

  return payload
}
