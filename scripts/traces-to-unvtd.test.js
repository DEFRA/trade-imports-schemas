import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { parseTracesXml } from './lib/traces-xml.js'
import { normalizeTracesPayload } from './lib/traces-normalize.js'
import { mapTracesToUnvtd, mapDocomFollowUps } from './lib/unvtd-map.js'
import { detectProfileType, applyProfile } from './lib/profile.js'
import { validateUnvtdPayload } from './lib/validate-output.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

const FIXTURES = {
  intra: resolve(
    ROOT,
    '../TRACESNT/docs/TNT-INTRA-WebServices-Package-2024.09.05/samples/INTRA.EU.NL.2021.0000001-with-controls-and-laboratory-tests.xml'
  ),
  ched: resolve(
    ROOT,
    '../TRACESNT/docs/TNT-CHED-WebServices-Package-2025.02.07/samples/retrieve/CHED-PP/CHEDPP.DE.2018.0000015.xml'
  )
}

const docomJsonFixture = {
  spsCertificate: {
    spsExchangedDocument: {
      id: 'DOCOM.EU.DE.2020.0000001',
      typeCode: '332',
      statusCode: '70',
      issueDateTime: '2020-01-15T10:00:00.000+01:00',
      name: 'DOCOM certificate',
      signatorySPSAuthentication: [
        {
          typeCode: 4,
          actualDateTime: '2020-01-15T10:00:00.000+01:00',
          providerSPSParty: {
            id: 'DE001',
            name: 'Test Authority',
            roleCode: 'VJ',
            typeCode: 'AUTHORITY'
          }
        }
      ]
    },
    spsConsignment: {
      consignorSPSParty: {
        id: '123',
        name: 'Consignor Ltd',
        roleCode: 'CZ',
        typeCode: 'IMPORTER'
      },
      consigneeSPSParty: {
        id: '456',
        name: 'Consignee Ltd',
        roleCode: 'CN',
        typeCode: 'IMPORTER'
      }
    }
  }
}

function convertXml (xmlPath) {
  const xml = readFileSync(xmlPath, 'utf8')
  const traces = parseTracesXml(xml)
  const normalized = normalizeTracesPayload(traces)
  const unvtd = mapTracesToUnvtd(normalized)
  const typeKey = detectProfileType(unvtd)
  return applyProfile(unvtd, typeKey)
}

test('INTRA XML converts to UNVTD shape and validates', { skip: !existsSync(FIXTURES.intra) }, async () => {
  const out = convertXml(FIXTURES.intra)
  assert.equal(out.$type, 'intra')
  assert.equal(out.$model, 'defra/certificate-internal/1')
  assert.ok(out.exchangedDocument)
  assert.equal(out.exchangedDocument.documentTypeCode, '856')
  assert.ok(out.specifiedConsignment && typeof out.specifiedConsignment === 'object')
  assert.ok(out.exchangedDocument.firstSignatoryAuthentication)
  assert.ok(out.laboratoryObservationResult?.length >= 1)

  const { valid, errors } = await validateUnvtdPayload(out, 'intra')
  assert.equal(valid, true, JSON.stringify(errors, null, 2))
})

test('CHED submission request XML converts and validates', async () => {
  const submission = resolve(
    ROOT,
    'samples/imports/international/ched/xml/CreateAndSubmitChedForDecision-0101-Horse.xml'
  )
  const out = convertXml(submission)
  assert.equal(out.$type, 'ched')
  assert.equal(out.exchangedDocument.documentTypeCode, '636')
  const { valid, errors } = await validateUnvtdPayload(out, 'ched')
  assert.equal(valid, true, JSON.stringify(errors, null, 2))
})

test('CHED retrieve XML converts to UNVTD shape and validates', { skip: !existsSync(FIXTURES.ched) }, async () => {
  const out = convertXml(FIXTURES.ched)
  assert.equal(out.$type, 'ched')
  assert.equal(out.exchangedDocument.documentTypeCode, '636')
  assert.ok(out.exchangedDocument.firstSignatoryAuthentication)

  const { valid, errors } = await validateUnvtdPayload(out, 'ched')
  assert.equal(valid, true, JSON.stringify(errors, null, 2))
})

test('LAST_UPDATE_DATETIME note is copied to revisionDateTime and retained', async () => {
  const fixture = {
    spsCertificate: {
      spsExchangedDocument: {
        id: 'INTRA.EU.NL.2021.0000001',
        typeCode: '856',
        statusCode: '70',
        issueDateTime: '2021-02-18T16:09:51.000+01:00',
        includedSPSNote: [
          {
            content: '2026-07-22T12:38:45.000+02:00',
            subjectCode: { value: 'LAST_UPDATE_DATETIME' }
          }
        ]
      },
      spsConsignment: {
        consignorSPSParty: { id: '1', name: 'Consignor', roleCode: 'CZ' },
        consigneeSPSParty: { id: '2', name: 'Consignee', roleCode: 'CN' }
      }
    }
  }
  const normalized = normalizeTracesPayload(fixture)
  const unvtd = applyProfile(mapTracesToUnvtd(normalized), 'intra')
  assert.equal(unvtd.exchangedDocument.revisionDateTime, '2026-07-22T12:38:45.000+02:00')
  assert.ok(
    unvtd.exchangedDocument.includedNote.some((n) => n.noteSubjectCode === 'LAST_UPDATE_DATETIME')
  )
  const { valid, errors } = await validateUnvtdPayload(unvtd, 'intra')
  assert.equal(valid, true, JSON.stringify(errors, null, 2))
})

test('DOCOM XML carries follow-up records into the follow-up profile', async () => {
  const docom = resolve(ROOT, 'samples/imports/eu/docom/xml/DOCOM.ES.2026.xml')
  const traces = normalizeTracesPayload(parseTracesXml(readFileSync(docom, 'utf8')))

  const certificate = applyProfile(mapTracesToUnvtd(traces), 'docom')
  assert.equal(certificate.exchangedDocument.documentTypeCode, '332')
  // Follow-ups are a separate aggregate - they must not leak onto the certificate.
  assert.equal(certificate.docomFollowUp, undefined)
  assert.equal(certificate.followUp, undefined)

  const followUps = mapDocomFollowUps(traces)
  assert.equal(followUps.$type, 'docom-followup')
  assert.equal(followUps.certificateIdentifier, 'DOCOM.ES.2026.0000001')
  assert.equal(followUps.followUp.length, 2)

  const [redispatch, control] = followUps.followUp
  assert.equal(redispatch.redispatchDetails.destinationCountry.code.value, 'NL')
  assert.deepEqual(
    redispatch.redispatchDetails.meansOfTransport.map((m) => m.internationalTransportDocument),
    ['sdfgsdfgg444', '344ff44']
  )
  assert.equal(control.controlDetails.consignmentArrivedIndicator, true)
  assert.equal(control.controlDetails.consignmentCompliantIndicator, true)

  const { valid, errors } = await validateUnvtdPayload(followUps, 'docom-followup')
  assert.equal(valid, true, JSON.stringify(errors, null, 2))
})

test('DOCOM trade lines keep leading-zero CN codes and line-level detail', () => {
  const docom = resolve(ROOT, 'samples/imports/eu/docom/xml/DOCOM.ES.2026.xml')
  const out = convertXml(docom)
  const lines = out.specifiedConsignment.includedConsignmentItem[0].includedTradeLineItem
  const species = lines.find((l) => l.scientificName === 'Sus scrofa domesticus')
  assert.equal(species.applicableClassification[0].classCode.value, '0103')
  assert.equal(species.applicableClassification[0].systemId, 'CN')
  assert.deepEqual(species.netVolume, { value: '1', unitCode: 'H87' })
  assert.equal(species.additionalInformationNote[0].noteSubjectCode, 'OFFICIAL_IDENTIFICATION')
  assert.equal(lines[0].originCountry.code.value, 'ES')
  assert.equal(lines[0].appliedProcess[0].operatorParty.name, 'DK Test')
  assert.equal(out.specifiedConsignment.carrier.name, 'Test Test')
  assert.equal(out.specifiedConsignment.consignorParty.postalAddress.countryId, 'XI')
  assert.equal(
    out.specifiedConsignment.utilizedLogisticsTransportEquipment[0].affixedLogisticsSeal[0].identifier,
    'fdsdf3'
  )
})

test('TRACES schemeID and listID become urlId codelist pointers', () => {
  const docom = resolve(ROOT, 'samples/imports/eu/docom/xml/DOCOM.ES.2026.xml')
  const out = convertXml(docom)
  const consignment = out.specifiedConsignment
  const base = 'https://traces-codelists.ec.europa.eu/'

  assert.equal(consignment.consignorParty.urlId, `${base}operator_internal_activity_id`)
  assert.equal(consignment.loadingBaseportLocation.urlId, `${base}operator_activity_id`)
  assert.equal(
    consignment.utilizedLogisticsTransportEquipment[0].affixedLogisticsSeal[0].urlId,
    `${base}seal_number`
  )
  assert.deepEqual(
    consignment.consignorParty.partyTypeCode.map((c) => c.urlId),
    [`${base}operator_activity_type`, `${base}classification_section_code`]
  )
  assert.equal(
    out.exchangedDocument.firstSignatoryAuthentication.includedClause[0].urlId,
    `${base}docom_consignment_clause`
  )
  // Numeric list ids are UNTDID/UNCL lists, not TRACES codelists.
  assert.equal(consignment.consignorParty.partyRoleCode.urlId, undefined)
  assert.equal(consignment.consignorParty.partyRoleCode.value, 'CZ')
})

test('packed baseport Name elements map to their documented slots', () => {
  const docom = resolve(ROOT, 'samples/imports/eu/docom/xml/DOCOM.ES.2026.xml')
  const loading = convertXml(docom).specifiedConsignment.loadingBaseportLocation
  assert.equal(loading.identifier, 'ES290250000096')
  assert.equal(loading.name, 'Sea Life Centre Spain sa')
  assert.equal(loading.postalAddress.countryId, 'ES')
  assert.equal(loading.postalAddress.cityName, 'Benalmádena')
  assert.equal(loading.postalAddress.postcodeCode, '29630')

  const ched = resolve(ROOT, 'samples/imports/international/ched/xml/CHEDPP.DE.2018.0000015.xml')
  // The point of entry uses a different slot layout and sends only the leading
  // slots, so the city must not land in the place-of-loading name slot.
  const unloading = convertXml(ched).specifiedConsignment.unloadingBaseportLocation
  assert.equal(unloading.identifier, 'DEFRA4')
  assert.equal(unloading.name, undefined)
  assert.equal(unloading.postalAddress.countryId, 'DE')
  assert.equal(unloading.postalAddress.cityName, 'Frankfurt Am Main, Stadt')
})

test('competent authorities survive an export country with no country code', () => {
  const docom = resolve(ROOT, 'samples/imports/eu/docom/xml/DOCOM.ES.2026.xml')
  const exportCountry = convertXml(docom).specifiedConsignment.exportCountry
  // TRACES sends this country as a wrapper for the authorities alone.
  assert.equal(exportCountry.code, undefined)

  const subDivision = exportCountry.subordinateTradeCountrySubDivision
  assert.deepEqual(subDivision.functionTypeCode, { content: '44' })
  assert.deepEqual(
    subDivision.activityAuthorizedParty.map((p) => [p.partyRoleCode.value, p.identifier]),
    [['RA', 'ES00000'], ['VG', 'ES45901']]
  )
})

test('DOCOM JSON fixture maps with docom profile override', async () => {
  const normalized = normalizeTracesPayload(docomJsonFixture)
  let unvtd = mapTracesToUnvtd(normalized)
  unvtd = applyProfile(unvtd, 'docom')
  assert.equal(unvtd.$type, 'docom')
  assert.equal(unvtd.exchangedDocument.identifier, 'DOCOM.EU.DE.2020.0000001')
  assert.ok(unvtd.specifiedConsignment && typeof unvtd.specifiedConsignment === 'object')

  const { valid, errors } = await validateUnvtdPayload(unvtd, 'docom')
  assert.equal(valid, true, JSON.stringify(errors, null, 2))
})
