# `gbn-ag-pims` v0.2.0 → v0.3.0 changes

v0.3.0 answers the PIMS review of v0.2.0. It adds the person responsible, the region of
origin code, and a published list of expected values for every coded field PIMS asked
about, with each field naming its list in `urlId`.

Every change is an addition, so a valid v0.2.0 payload is also a valid v0.3.0 payload.
v0.1.0 and v0.2.0 are unchanged and are still published alongside v0.3.0: each event is
sent once per version, and `metadata.schemaVersion` says which one a message is.

The schema is [`gbn-ag-pims-v0.3.0.schema.json`](gbn-ag-pims-v0.3.0.schema.json), and a
full example is
[`samples/imports/gb/gbn-ag/json/pims/gbn-ag-pims-v0.3.0.json`](../../../../../samples/imports/gb/gbn-ag/json/pims/gbn-ag-pims-v0.3.0.json).

## Fields added in v0.3.0

| PIMS schema path | What's new |
|---|---|
| `exchangedDocument.issuer` | The person responsible's company details: the GB contact the notifier picks for the consignment. Organisation `name`, `postalAddress`, and email and phone on `definedContact[]`. No `personName`: contacts come from the organisation's address book, which holds no person's name |
| `exchangedDocument.referenceDocument[].urlId` | Names the document-type list `typeCode` is drawn from |
| `specifiedConsignment.originCountry.regionOfOriginCode` | The region of origin code from the health certificate: a disease-control zone. Present only when the notifier says the certificate carries one |

## Fields with a published list of values

Each list is a file in [`schemas/codelists/`](../../../../codelists/) in this repo. The
`urlId` on the event is the list's `$id`. It names the list; it is not a web address you
can open yet. When a Defra reference-data service goes live, the file is retired and the
name stays the same.

| Field | `urlId` | List file |
|---|---|---|
| `includedClause[]` where `identifier` is `PURPOSE` | `https://refdata.tbc.defra.gov.uk/gbn-ag-purposes` | [`gbn-ag-purposes.json`](../../../../codelists/gbn-ag-purposes.json) |
| `includedClause[]` where `identifier` is `INTERNAL_MARKET_PURPOSE` | `https://refdata.tbc.defra.gov.uk/gbn-ag-internal-market-purposes` | [`gbn-ag-internal-market-purposes.json`](../../../../codelists/gbn-ag-internal-market-purposes.json) |
| `includedClause[]` where `identifier` is `GOODS_CERTIFIED_AS` | `https://refdata.tbc.defra.gov.uk/gbn-ag-goods-certified-as` | [`gbn-ag-goods-certified-as.json`](../../../../codelists/gbn-ag-goods-certified-as.json) |
| `referenceDocument[].typeCode` | `https://refdata.tbc.defra.gov.uk/gbn-ag-document-types` | [`gbn-ag-document-types.json`](../../../../codelists/gbn-ag-document-types.json) |
| `individualTradeProductInstance[].identifier[].typeCode` | `https://codelists.tbc.defra.gov.uk/animal_identifier_types` | [`gbn-ag-animal-identifier-types.json`](../../../../codelists/gbn-ag-animal-identifier-types.json) |

**How the codes are chosen.** Where TRACES `ched_consignment_clause` has a code for the
same value, the list uses it: `INTERNAL_MARKET`, `TEMPORARY_ADMISSION` and
`REGISTERED_EQUIDAE`. Every other value has a Defra code in capitals. Each entry's
`description` says which it is. TRACES codes are those seen in TRACES CHED data.

**Internal market purpose.** The clause is present only when the `PURPOSE` content is
`INTERNAL_MARKET`. TRACES has no equivalent clause, so all its codes are Defra codes.

**Animal identifiers.** Exactly four types are sent: `EAR_TAG`, `PASSPORT`, `MICROCHIP`
and `TATTOO`.

## Meaning described in v0.3.0

| PIMS schema path | Meaning |
|---|---|
| `originCountry.subordinateTradeCountrySubDivision` | The country subdivision the animals came from, as the `106` entry. `identifier` is the MDM subdivision code, such as `ES-CN` for the Canary Islands, and `urlId` names the MDM subdivision list. This is already what the v0.2.0 stream carries. It stays a single object, as in v0.2.0 |

## Values on every stream

The clause codes and `urlId`s come from the event the gateway receives, so v0.1.0 and
v0.2.0 carry them too once the services send them. Both earlier schemas already allow any
string in clause `content` and `urlId`, so their payloads stay valid. The internal market
purpose clause appears on every stream for a notification whose purpose is the internal
market.

## Not in v0.3.0

- **A link or id for caseworkers to open an accompanying document.** How caseworkers will
  open documents is not decided yet. It will come in a later version.

## Confirmation status

Not yet confirmed by PIMS.
