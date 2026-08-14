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
  carrierSPSParty: 'carrier',
  operatorSPSParty: 'operatorParty',
  exportSPSCountry: 'exportCountry',
  importSPSCountry: 'importCountry',
  originSPSCountry: 'originCountry',
  reExportSPSCountry: 'reExportCountry',
  transitSPSCountry: 'transitCountry',
  providerSPSParty: 'providerParty',
  specifiedSPSAddress: 'postalAddress',
  includedSPSConsignmentItem: 'includedConsignmentItem',
  includedSPSTradeLineItem: 'includedTradeLineItem',
  loadingBaseportSPSLocation: 'loadingBaseportLocation',
  unloadingBaseportSPSLocation: 'unloadingBaseportLocation',
  examinationSPSEvent: 'examinationEvent',
  occurrenceSPSLocation: 'occurrenceLogisticsLocation',
  mainCarriageSPSTransportMovement: 'mainCarriageLogisticsTransportMovement',
  usedSPSTransportMeans: 'usedLogisticsTransportMeans',
  utilizedSPSTransportEquipment: 'utilizedLogisticsTransportEquipment',
  affixedSPSSeal: 'affixedLogisticsSeal',
  appliedSPSProcess: 'appliedProcess',
  additionalInformationSPSNote: 'additionalInformationNote',
  applicableSPSClassification: 'applicableProductClassification',
  physicalReferencedSPSPackage: 'physicalReferencedLogisticsPackage',
  physicalSPSPackage: 'physicalReferencedLogisticsPackage',
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

const TRACES_CODELIST_BASE = 'https://traces-codelists.ec.europa.eu/'

/**
 * Codelist URL for a TRACES listId or identifier schemeId. Numeric list ids
 * (1001, 3035, 7085, 9417) are UNTDID/UNCL lists rather than TRACES
 * codelists, so they get no URL.
 */
function codelistUrl (listId) {
  if (!listId || /^\d+$/.test(listId)) return undefined
  return TRACES_CODELIST_BASE + listId
}

const CODE_VALUE_KEYS = new Set(['value', 'listID', 'listName', 'name', 'schemeID', 'schemeName'])

/** True for a normalized code / identifier object: a value plus its scheme. */
function isCodeOrIdentifierValue (val) {
  if (!val || typeof val !== 'object' || Array.isArray(val)) return false
  if (val.value === undefined) return false
  return Object.keys(val).every((k) => CODE_VALUE_KEYS.has(k))
}

/** The list a coded value is drawn from (TRACES listID). */
function listUrlId (raw) {
  if (!raw || typeof raw !== 'object') return undefined
  return codelistUrl(asString(raw.listId ?? raw.listID ?? raw.listid))
}

/** The register an identifier is drawn from (TRACES schemeID). */
function schemeUrlId (raw) {
  if (!raw || typeof raw !== 'object') return undefined
  return codelistUrl(asString(raw.schemeId ?? raw.schemeID ?? raw.schemeid))
}

/**
 * Split a TRACES identifier into the canonical `identifier` / `urlId` pair.
 * Returns an empty object when there is no identifier to carry.
 */
function mapIdentifier (raw) {
  if (raw == null) return {}
  const identifier = asString(typeof raw === 'object' ? raw.value : raw)
  if (!identifier) return {}
  const urlId = schemeUrlId(raw)
  return urlId ? { identifier, urlId } : { identifier }
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
  const urlId = listUrlId(raw) ?? schemeUrlId(raw)
  if (urlId) out.urlId = urlId
  const name = asString(raw.name)
  if (name) out.name = name
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
    const urlId = schemeUrlId(c) ?? listUrlId(c)
    if (urlId) clause.urlId = urlId
    if (c.content !== undefined) {
      clause.content = asString(c.content)
    }
    out.push(clause)
  }
  return out.length ? out : undefined
}

function mapPartyTypeCode (typeCode) {
  if (typeCode == null) return undefined
  const arr = Array.isArray(typeCode) ? typeCode : [typeCode]
  const values = arr.map(mapCodeType).filter(Boolean)
  return values.length ? values : undefined
}

function mapParty (party) {
  if (!party || typeof party !== 'object') return undefined
  const out = { ...mapIdentifier(party.id ?? party.identifier) }
  if (party.name != null) out.name = extractContentValue(party.name) ?? asString(party.name)
  const role = party.roleCode ?? party.partyRoleCode
  const roleCode = mapCodeType(role)
  if (roleCode) out.partyRoleCode = roleCode
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
  if (mappedNotes) {
    doc.includedNote = mappedNotes
    const lastUpdate = mappedNotes.find((n) => n.noteSubjectCode === 'LAST_UPDATE_DATETIME')
    const revisionDateTime = lastUpdate?.content?.[0]
    if (revisionDateTime) doc.revisionDateTime = revisionDateTime
  }

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
  const cc = mapCodeType(c.classCode)
  if (cc) out.classCode = cc
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
  const scientificName = asString(extractContentValue(item.scientificName))
  if (scientificName) out.scientificName = scientificName
  const netWeight = item.netWeight ?? item.netWeightMeasure
  if (netWeight) out.netWeight = mapMeasure(netWeight)
  const grossWeight = item.grossWeight ?? item.grossWeightMeasure
  if (grossWeight) out.grossWeight = mapMeasure(grossWeight)
  const netVolume = item.netVolume ?? item.netVolumeMeasure
  if (netVolume) out.netVolume = mapMeasure(netVolume)
  const origin = mapTradeCountry(item.originSPSCountry ?? item.originCountry)
  if (origin) out.originCountry = origin
  const apc = item.applicableSPSClassification ?? item.applicableProductClassification ?? item.applicableClassification
  if (apc) {
    out.applicableClassification = Array.isArray(apc)
      ? apc.map(mapClassification)
      : [mapClassification(apc)]
  }
  const pkg = item.physicalReferencedSPSPackage ?? item.physicalSPSPackage ?? item.physicalReferencedLogisticsPackage
  if (pkg) {
    out.physicalReferencedLogisticsPackage = (Array.isArray(pkg) ? pkg : [pkg]).map(mapTree)
  }
  const processes = item.appliedSPSProcess ?? item.appliedProcess
  if (processes) {
    const mapped = (Array.isArray(processes) ? processes : [processes]).map(mapAppliedProcess).filter(Boolean)
    if (mapped.length) out.appliedProcess = mapped
  }
  const lineNotes = mapNotes(item.additionalInformationSPSNotes ?? item.additionalInformationSPSNote ?? item.additionalInformationNote)
  if (lineNotes) out.additionalInformationNote = lineNotes
  return out
}

function mapAppliedProcess (process) {
  if (!process || typeof process !== 'object') return undefined
  const out = {}
  const tc = process.typeCode
  if (tc != null) {
    const typeCode = asString(typeof tc === 'object' ? tc.value : tc)
    if (typeCode) out.typeCode = typeCode
  }
  const operator = mapParty(process.operatorSPSParty ?? process.operatorParty)
  if (operator) out.operatorParty = operator
  return Object.keys(out).length ? out : undefined
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

/** Values of a location's Name elements, in the order TRACES sent them. */
function locationNames (name) {
  if (name == null) return []
  return (Array.isArray(name) ? name : [name])
    .map((n) => asString(typeof n === 'object' ? extractContentValue(n) ?? n.value : n))
    .filter((v) => v != null && v !== '')
}

/**
 * TRACES packs an address into repeated Name elements on baseport locations.
 * The slots are positional and the layout differs per element, so each call
 * site declares its own. Trailing slots may be absent.
 *
 * Place of loading (DOCOM I.14, INTRA I.13) describes an operator.
 */
const LOADING_BASEPORT_NAME_SLOTS = ['countryId', 'name', 'cityName', 'postcodeCode', 'lineOne']

/**
 * Point of entry / control authority (CHED I.4, I.5, II.20). Slots 2 and 5
 * repeat the authority's activity id and UN/LOCODE, one of which the
 * location's own ID already carries, so neither is mapped again.
 */
const UNLOADING_BASEPORT_NAME_SLOTS = ['countryId', 'cityName', null, 'name', 'lineOne', null]

function mapPackedLocationNames (names, slots) {
  const out = {}
  const address = {}
  names.forEach((value, index) => {
    const slot = slots[index]
    if (!slot) return
    if (slot === 'name') out.name = value
    else address[slot] = value
  })
  if (Object.keys(address).length) out.postalAddress = address
  return out
}

function mapLogisticsLocation (loc, options = {}) {
  if (!loc || typeof loc !== 'object') return loc
  const out = { ...mapIdentifier(loc.id ?? loc.identifier) }
  const names = locationNames(loc.name)
  if (options.nameSlots) {
    Object.assign(out, mapPackedLocationNames(names, options.nameSlots))
  } else if (names.length) {
    // Locations with no documented packing keep their names joined rather
    // than dropped.
    out.name = names.length === 1 ? names[0] : names.join(', ')
  }
  const tc = loc.typeCode
  if (tc != null) out.typeCode = asString(typeof tc === 'object' ? tc.value : tc)
  return out
}

function mapTransportMovement (movement) {
  if (!movement || typeof movement !== 'object') return undefined
  const out = { ...mapIdentifier(movement.id ?? movement.identifier) }
  const mode = movement.modeCode
  if (mode != null) {
    const v = Number(typeof mode === 'object' ? mode.value : mode)
    if (!Number.isNaN(v)) out.modeCode = v
  }
  const means = movement.usedSPSTransportMeans ?? movement.usedLogisticsTransportMeans
  if (means && typeof means === 'object') {
    const meansName = asString(extractContentValue(means.name) ?? means.name)
    if (meansName) out.usedLogisticsTransportMeans = { name: meansName }
  }
  return Object.keys(out).length ? out : undefined
}

function mapSeal (seal) {
  if (!seal || typeof seal !== 'object') return undefined
  const out = mapIdentifier(seal.id ?? seal.identifier)
  return out.identifier ? out : undefined
}

function mapTransportEquipment (equipment) {
  if (!equipment || typeof equipment !== 'object') return undefined
  const out = { ...mapIdentifier(equipment.id ?? equipment.identifier) }
  const seals = equipment.affixedSPSSeal ?? equipment.affixedLogisticsSeal
  if (seals) {
    const mapped = (Array.isArray(seals) ? seals : [seals]).map(mapSeal).filter(Boolean)
    if (mapped.length) out.affixedLogisticsSeal = mapped
  }
  return Object.keys(out).length ? out : undefined
}

function mapExaminationEvent (event) {
  if (!event || typeof event !== 'object') return undefined
  const out = {}
  if (event.scheduledOccurrenceDateTime) out.scheduledOccurrenceDateTime = asString(event.scheduledOccurrenceDateTime)
  if (event.actualOccurrenceDateTime) out.actualOccurrenceDateTime = asString(event.actualOccurrenceDateTime)
  const loc = event.occurrenceSPSLocation ?? event.occurrenceLogisticsLocation
  const mappedLoc = mapLogisticsLocation(loc)
  if (mappedLoc && Object.keys(mappedLoc).length) out.occurrenceLogisticsLocation = mappedLoc
  return Object.keys(out).length ? out : undefined
}

/**
 * A country sub-division: either a region, or the wrapper TRACES uses to hang
 * competent authorities and customs offices off a country (functionTypeCode
 * 44 / 42 / 41), in which case it has no identifier of its own.
 */
function mapCountrySubDivision (subDivision) {
  if (!subDivision || typeof subDivision !== 'object') return undefined
  const ftc = subDivision.functionTypeCode
  const content = asString(typeof ftc === 'object' ? ftc?.value : ftc)
  if (!content) return undefined
  const out = { ...mapIdentifier(subDivision.id ?? subDivision.identifier) }
  out.functionTypeCode = { content }
  const parties = subDivision.activityAuthorizedSPSParty ?? subDivision.activityAuthorizedParty
  if (parties) {
    const mapped = (Array.isArray(parties) ? parties : [parties]).map(mapParty).filter(Boolean)
    if (mapped.length) out.activityAuthorizedParty = mapped
  }
  return out
}

function mapTradeCountry (country) {
  if (!country || typeof country !== 'object') return undefined
  const out = {}
  const code = mapCodeType(country.id ?? country.identifier)
  if (code) {
    const name = asString(extractContentValue(country.name))
    if (name) code.name = name
    out.code = code
  }
  // TRACES sends the export country with an empty code when it carries only
  // the competent authorities (DOCOM I.3 / I.4), so the sub-division is mapped
  // whether or not there is a country code to go with it.
  const sub = country.subordinateSPSCountrySubDivision ?? country.subordinateTradeCountrySubDivision
  const subDivision = mapCountrySubDivision(Array.isArray(sub) ? sub[0] : sub)
  if (subDivision) out.subordinateTradeCountrySubDivision = subDivision
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

    // Codes and identifiers reaching the generic walk have no urlId slot of
    // their own, so they collapse to their bare value. Slots that do carry
    // codelist metadata are handled by the mappers above.
    if (isCodeOrIdentifierValue(v)) {
      out[newKey] = v.value
      continue
    }

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

    if (newKey === 'unloadingBaseportLocation' || newKey === 'loadingBaseportLocation') {
      const items = Array.isArray(v) ? v : [v]
      const nameSlots = newKey === 'loadingBaseportLocation'
        ? LOADING_BASEPORT_NAME_SLOTS
        : UNLOADING_BASEPORT_NAME_SLOTS
      const location = mapLogisticsLocation(items[0], { nameSlots })
      if (location && Object.keys(location).length) out[newKey] = location
      continue
    }

    if (newKey === 'mainCarriageLogisticsTransportMovement') {
      const items = Array.isArray(v) ? v : [v]
      out.mainCarriageLogisticsTransportMovement = items.map(mapTransportMovement).filter(Boolean)
      continue
    }

    if (newKey === 'utilizedLogisticsTransportEquipment') {
      const items = (Array.isArray(v) ? v : [v]).map(mapTransportEquipment).filter(Boolean)
      if (items.length) out.utilizedLogisticsTransportEquipment = items
      continue
    }

    if (newKey === 'examinationEvent') {
      const items = (Array.isArray(v) ? v : [v]).map(mapExaminationEvent).filter(Boolean)
      if (items.length) out.examinationEvent = items
      continue
    }

    if (newKey === 'exportCountry' || newKey === 'importCountry' || newKey === 'originCountry') {
      const country = mapTradeCountry(v)
      if (country) out[newKey] = country
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

function asBoolean (val) {
  if (typeof val === 'boolean') return val
  if (val === 'true') return true
  if (val === 'false') return false
  return undefined
}

function mapMeansOfTransport (means) {
  if (!means || typeof means !== 'object') return undefined
  const out = {}
  const movement = mapTransportMovement(means.spsTransportMovement ?? means.specifiedLogisticsTransportMovement)
  if (movement) out.specifiedLogisticsTransportMovement = movement
  // TRACES spells the element InternationalTrasportDocument.
  const document = asString(means.internationalTrasportDocument ?? means.internationalTransportDocument)
  if (document) out.internationalTransportDocument = document
  return Object.keys(out).length ? out : undefined
}

function mapRedispatchDetails (details) {
  if (!details || typeof details !== 'object') return undefined
  const out = {}
  if (details.redispatchDateTime) out.redispatchDateTime = asString(details.redispatchDateTime)
  const exitAuthority = mapParty(details.exitAuthoritySPSParty ?? details.exitAuthorityParty)
  if (exitAuthority) out.exitAuthorityParty = exitAuthority
  const destination = mapTradeCountry(details.countryOfDestination ?? details.destinationCountry)
  if (destination) out.destinationCountry = destination
  const means = details.meansOfTransport
  if (means) {
    const legs = (Array.isArray(means) ? means : [means]).map(mapMeansOfTransport).filter(Boolean)
    if (legs.length) out.meansOfTransport = legs
  }
  const placeOfDestination = mapParty(details.placeOfDestinationSPSParty ?? details.placeOfDestinationParty)
  if (placeOfDestination) out.placeOfDestinationParty = placeOfDestination
  return Object.keys(out).length ? out : undefined
}

function mapControlDetails (details) {
  if (!details || typeof details !== 'object') return undefined
  const out = {}
  const arrived = asBoolean(details.arrivalOfTheConsignment ?? details.consignmentArrivedIndicator)
  if (arrived !== undefined) out.consignmentArrivedIndicator = arrived
  const compliant = asBoolean(details.complianceOfTheConsignment ?? details.consignmentCompliantIndicator)
  if (compliant !== undefined) out.consignmentCompliantIndicator = compliant
  const notes = mapNotes(details.includedSPSNotes ?? details.includedSPSNote ?? details.includedNote)
  if (notes) out.includedNote = notes
  return Object.keys(out).length ? out : undefined
}

function mapFollowUpRecord (record) {
  if (!record || typeof record !== 'object') return undefined
  const out = {}
  if (record.createdOn) out.creationDateTime = asString(record.createdOn)
  if (record.updatedOn) out.revisionDateTime = asString(record.updatedOn)
  const redispatch = mapRedispatchDetails(record.redispatchDetails)
  if (redispatch) out.redispatchDetails = redispatch
  const control = mapControlDetails(record.controlDetails)
  if (control) out.controlDetails = control
  const auth = record.certifyingOfficerSPSAuthentication ?? record.certifyingOfficerAuthentication
  if (auth) {
    const mapped = mapSignatory(auth)
    if (mapped && Object.keys(mapped).length) out.certifyingOfficerAuthentication = mapped
  }
  return Object.keys(out).length ? out : undefined
}

/**
 * Convert normalized TRACES DOCOM follow-up records to the DOCOM follow-up profile.
 * Returns undefined when the payload carries no follow-up records.
 */
export function mapDocomFollowUps (input) {
  const raw = input?.docomFollowUp
  if (!raw) return undefined
  const records = (Array.isArray(raw) ? raw : [raw]).map(mapFollowUpRecord).filter(Boolean)
  if (!records.length) return undefined

  const id = input?.spsCertificate?.spsExchangedDocument?.id
  const certificateIdentifier = asString(typeof id === 'object' ? id?.value : id)
  if (!certificateIdentifier) {
    throw new Error('Cannot map DOCOM follow-ups: certificate identifier not found')
  }

  return {
    $model: 'defra/certificate-internal/1',
    $type: 'docom-followup',
    certificateIdentifier,
    followUp: records
  }
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
