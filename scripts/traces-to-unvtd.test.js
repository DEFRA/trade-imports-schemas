import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { parseTracesXml } from './lib/traces-xml.js'
import { normalizeTracesPayload } from './lib/traces-normalize.js'
import { mapTracesToUnvtd } from './lib/unvtd-map.js'
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
      typeCode: '999',
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
