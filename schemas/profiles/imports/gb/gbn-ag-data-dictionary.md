# GBN-AG data dictionary

Maps every property in the GBN-AG live-animals pre-notification payload to a plain-English description.

Descriptions come from the GBN-AG schema's own `description` fields (the live-animals domain), falling back to the UN/CEFACT D23B vocabulary (`uncefact.jsonld`) via the JSON-LD context chain where the schema is silent. The canonical UN/CEFACT meaning is always reachable as linked data from the property's IRI. Property names that resolve only to a Defra context - Defra extensions, profile-level slots - are listed in a separate section at the end with the context file that declares them.

Sections follow the payload's natural structure: Document, Consignment, Consignment item, Trade line item, Trade product, Per-animal. Each row identifies its type; where the value reuses a shared shape (`TradeParty`, `LogisticsLocation`, `IncludedNote`, ...) the type cell carries the `$def` name.

## Top-level payload structure

The root of the payload is a `CertificatePayload`. Top-level properties:

| Property | Type | Required | Description |
|---|---|---|---|
| `$model` | string | yes | Fixed value: `defra/certificate-internal/1`. |
| `$type` | string | yes | Fixed value: `gbn-ag`. |
| `exchangedDocument` | `ExchangedDocument` | yes | The document container at the root of a Defra UNVTD certificate payload. Holds the document identifier, the issuer, signatory authentications, included clauses (reason for import, animals certified for, sub-purpose when applicable), and the accompanying reference documents. |
| `specifiedConsignment` | `Consignment` | yes | The consignment carried by a Defra UNVTD certificate payload. |
| `laboratoryObservationResult` | array of `LaboratoryObservationResult` | no | UN vocabulary-aligned laboratory observations/results collection. |

## Document (`exchangedDocument`)

Carried at the top of every GBN-AG payload. Identifies the pre-notification, who issued it, what authentication and reference documents accompany it. Fields such as functionCode are complementary to the event specification (see [state transitions](gbn-ag-state-transitions.md)).

| Property | Type | Required | Description |
|---|---|---|---|
| `name` | string | no | An optional human-readable name for the document. GBN-AG identifies the pre-notification by its `identifier`. |
| `identifier` | string | yes | The final agreed format is `GBN-AG-26-7K8M2P`. `GBN` is Great Britain Notification, `AG` is Animals and Germinals, `26` is the two-digit year of allocation, and `7K8M2P` is a six-character Crockford base32 non-guessable body. The scheme is reusable for other GB import journeys (for example `GBN-P-26-XXXXXX` for Products of Animal Origin, `GBN-PP-26-XXXXXX` for Plants). |
| `traderAssignedId` | string | no | Optional reference the trader assigns to the pre-notification - their own internal reference number, carried through unchanged. |
| `documentTypeCode` | string | no | UNTDID 1001 code. GBN-AG leaves this optional and unset today because a UK pre-notification code has not yet been decided. INTRA and CHED carry codes 666/856 and 636 respectively. |
| `documentStatusCode` | string | no | TRACES-boundary value, populated by the gateway on outbound TRACES messages and round-tripped on inbound. UNCL1373 per UN/CEFACT. Internal workflow state is on `notificationStatusCode`. |
| `notificationStatusCode` | string | no | Defra-internal workflow status of this notification. Under GBN-AG the values are `DRAFT`, `SUBMITTED`, `AMEND`, `WITHDRAWN`, drawn from `https://codelists.tbc.defra.gov.uk/gbn-ag-notification-status`. |
| `versionId` | integer | no | Document revision number. V1 on first submission, increments on each subsequent re-submission. Distinct from the envelope's aggregateVersion (event sequence) and the schema's structural version. |
| `functionCode` | string | no | UNTDID 1225 message function: 9 (Original), 5 (Replace), 4 (Change), 1 (Cancellation), 3 (Deletion). Tells the consumer what the message does to its view of the document. |
| `issueDateTime` | string | no | A date, time, date time or other date time value for the issuance. |
| `issuer` | `TradeParty` | yes | The party responsible for issuing this document. For TRACES CHED and Defra import pre-notifications, this carries the responsible-person organisation with a named contact. |
| `includedNote` | array of `IncludedNote` | no | General notes attached to the document as a whole, distinct from the per-line notes on a trade line's `additionalInformationNote`. |
| `referenceDocument` | array of `ReferencedDocument` | yes (at least 1) | Carries the regulatory documents that accompany the consignment. At least one entry is the veterinary health certificate (`typeCode` `853` on UNTDID 1001); further entries cover the other accompanying documents (transport documents and the like), each distinguished by its `typeCode`. Attachments are referenced by `filename`, `mimeCode`, and `uri` rather than embedded inline. |
| `firstSignatoryAuthentication` | `Authentication` | yes | Beyond the primary signature, this hosts the consignment's coded declaration clauses on `includedClause[]`: the reason for import (`identifier` `PURPOSE`) and what the animals are certified for (`identifier` `GOODS_CERTIFIED_AS`), each carrying its value in `content` with the sibling `urlId` naming the `ched_consignment_clause` codelist. GBN-AG requires both clauses to be present. Carries an additional conditional clause when applicable. |
| `secondSignatoryAuthentication` | `Authentication` | no | The second signature, also known as the first counter signature, that has been authenticated on this exchanged document indicating where appropriate the authentication party. |
| `thirdSignatoryAuthentication` | `Authentication` | no | The third signature, also known as the second counter signature, that has been authenticated on this exchanged document indicating where appropriate the authentication party. |
| `fourthSignatoryAuthentication` | `Authentication` | no | The fourth signature, also known as the third counter signature, that has been authenticated on this exchanged document indicating where appropriate the authentication party. |

## Consignment (`specifiedConsignment`)

One consignment per payload. Carries the parties (consignor, consignee, delivery, importer, despatch, carrier), the transport movement(s), the regulatory procedure, the package count, and the destination.

| Property | Type | Required | Description |
|---|---|---|---|
| `availabilityDueDateTime` | string | no | The date, time, date time or other date time value when this supply chain consignment is due to be available. |
| `exportExitDateTime` | string | no | The date, time, date time or other date time value when this supply chain consignment will exit, or has exited from the last port, airport, or border post of the country of export. |
| `consignorParty` | `TradeParty` | yes | The party sending the animals under the trade contract - the exporter in regulatory terms. Distinct from `despatchParty` (the physical place the animals came from); the two may be the same legal entity (a farm that both raises and consigns) but are modelled separately. |
| `consigneeParty` | `TradeParty` | yes | The party receiving the animals under the trade contract. Kept separate from `importer` (the legal importer of record) and `deliveryParty` (the destination party); on a given consignment these may or may not be the same legal entity. Carries `name`, `postalAddress`, and a `definedContact` (telephone, email) for inspection coordination. |
| `despatchParty` | `TradeParty` | no | The place from which the animals were despatched, typically the origin farm or production site. Pairs with `deliveryParty` to form the origin-to-destination axis of the consignment. Optional for GBN-AG. |
| `deliveryParty` | `TradeParty` | yes | The party the animals will be delivered to at the immediate destination - the contractual delivery point, which may be temporary. The post-movement permanent home is carried separately: per-animal `permanentLocation`, or the consignment's `finalDestinationLocation` for livestock. |
| `carrier` | `TradeParty` | yes | The person or organisation responsible for moving the goods from the consignment's despatch point to the delivery point. Pre-notifications distinguish commercial from private transporters via the `operator_activity_type` code on `partyTypeCode`; private transporters carry a `private_transporter_approval_number` (issued under the UK welfare-in-transport regime) as the value of `identifier`. |
| `customsTransitAgentParty` | `TradeParty` | no | The party acting as an agent for, or on behalf of, the consignor with respect to customs transit procedures for this supply chain consignment. |
| `exportCountry` | `TradeCountry` | no | Consignment route origin country (TRACES ExportSPSCountry). |
| `importCountry` | `TradeCountry` | no | Consignment route destination/import country (TRACES ImportSPSCountry). |
| `reExportCountry` | array of `TradeCountry` | no | Re-export countries on the consignment route (TRACES ReExportSPSCountry[]). |
| `transitCountry` | array of `TradeCountry` | no | Transit countries on the consignment route (TRACES TransitSPSCountry[]). |
| `unloadingBaseportLocation` | object \\| array | yes | Port of entry / unloading baseport. Single location (BSP-canonical) or array (legacy CHED sample shape). For Defra import pre-notifications the identifier carries un_locode. |
| `mainCarriageLogisticsTransportMovement` | object \\| array | yes | Transport movement(s) for the main carriage leg(s). Accepts a single object (TRACES production data with one carriage leg) or an array (BSP-canonical / multi-leg, with entries distinguished by id.schemeId). The SPS profile collapses BSP's three-way pre/main/on carriage split into this slot. |
| `transitTradeCountry` | array of `TradeCountry` | no | The countries the consignment passes through between origin and destination, one entry per country with `identifier` carrying the ISO 3166-1 alpha-2 code. Material for live animals because each transit country may impose its own welfare checks under long-journey transport rules. Present only when the route crosses other countries. |
| `packageQuantity` | object | no | Optional consignment-level package count. BSP/D23B canonical slot (unece:packageQuantity) for the number of packages in the consignment. content carries the count; unitCode is conventionally omitted for raw piece counts. |
| `includedConsignmentItem` | array of `ConsignmentItem` | yes (exactly 1) | A consignment item included in the consignment. |
| `importer` | `TradeParty` | yes | The party legally importing the consignment, held as a full party with its own address and contacts. Modelled as a slot distinct from `consigneeParty` because the importer of record and the contractual receiver are frequently different legal entities on UK live-animal imports. |
| `finalDestinationLocation` | `finalDestinationLocation` | no | For livestock the `identifier` inside this slot carries the CPH (County Parish Holding) number of the destination farm, with the sibling `urlId` pinned to `https://codelists.tbc.defra.gov.uk/cph_number`. Pets omit this slot entirely and use per-animal `permanentLocation` instead. Codelist: `https://codelists.tbc.defra.gov.uk/cph_number`. |
| `applicableCrossBorderRegulatoryProcedure` | array of `crossBorderRegulatoryProcedure` | yes (at least 1) | A cross-border regulatory procedure applied to the consignment - for GBN-AG, the SPS inspection at the UK Border Control Post. typeCode names the procedure; entryCustomsOfficeSpecifiedLogisticsLocation names the BCP. The BCP identifier carries its urlId naming the Defra-curated UK BCP register. |
| `isOrHasUnweanedAnimals` | boolean | yes | True when the consignment contains any unweaned (non-ablacted) animals. A UK welfare indicator on live-animal import pre-notifications. |

## Consignment item (`specifiedConsignment.includedConsignmentItem[]`)

Groups trade line items. A live-animals consignment has one consignment item; the consignment item carries the trade lines.

| Property | Type | Required | Description |
|---|---|---|---|
| `natureIdCargo` | array of `CargoNature` | no | - |
| `includedTradeLineItem` | array of `TradeLineItem` | yes (at least 1) | GBN-AG trade line item. One per species or commodity on the certificate. Carries the trade product, the line delivery (per-line quantity), and any per-line notes (including per-animal identifier notes carried alongside the BSP-canonical placement on `individualTradeProductInstance[].identifier[]`). |

## Trade line item (`specifiedConsignment.includedConsignmentItem[].includedTradeLineItem[]`)

One line per species or commodity on the certificate. A line carries the trade product (species), the line quantity, and the per-animal notes.

| Property | Type | Required | Description |
|---|---|---|---|
| `sequenceNumeric` | integer | no | A sequence number. |
| `description` | string \\| array | no | A textual description. |
| `netWeight` | `UneceWeightMeasureType` | no | - |
| `grossWeight` | `UneceWeightMeasureType` | no | - |
| `applicableProductClassification` | array of `ProductClassification` | no | - |
| `physicalReferencedLogisticsPackage` | array of `LogisticsPackage` | no | - |
| `specifiedTradeProduct` | array of `TradeProduct` | yes (at least 1) | The trade product on this line. BSP-canonical structural slot; profile schemas may narrow shape and cardinality. |
| `specifiedLineTradeDelivery` | array of `LineTradeDelivery` | yes (at least 1) | Delivery aspect of this line (line-level quantities). |
| `additionalInformationNote` | array of `IncludedNote` | no | General-purpose annotations on the trade line. GBN-AG carries per-animal identifiers on `individualTradeProductInstance[].identifier[]`; for consumers that follow the TRACES convention, the same identifiers are also emitted here as notes with `subjectCode` `INDIVIDUAL_IDENTIFICATION_NUMBER`. |

## Trade product (`specifiedConsignment.includedConsignmentItem[].includedTradeLineItem[].specifiedTradeProduct[]`)

One entry per species or commodity on the trade line. Carries the classification, type, common and scientific names, country of origin, and the per-animal instances.

| Property | Type | Required | Description |
|---|---|---|---|
| `description` | string | yes | The free-text description of the commodity. Held at product scope because it describes the commodity itself, not the line that carries delivery quantity - which matters for mixed consignments (for example cats and dogs) where each species sits on its own product. Paired with `scientificName` and `commonName` for full species identification. |
| `typeCode` | string | no | The trade product's type or form - live animal, semen, embryo, or ova. Drawn from a Defra-curated species-type codelist named by the sibling `urlId`. |
| `urlId` | string | no | URL to the codelist this trade product's typeCode is drawn from. |
| `designatedProductClassification` | array of `ProductClassification` | yes (at least 1) | A classification entry on a trade product. `systemId` names the coding system the value is drawn from (`CN` for the customs nomenclature, `SPECIES_CLASS` for the taxonomic class, others as registered). `classCode` is the value within that system. A trade product can carry multiple classification entries when more than one system applies. |
| `scientificName` | array of `UneceTextType` | yes (at least 1) | The species name for the commodity, resolved from Defra reference data keyed on the CN code rather than entered by the trader. Required for live animals, where every commodity code maps to a species. |
| `commonName` | array of `UneceTextType` | yes (at least 1) | The everyday name for the species, paired with `scientificName` to identify the commodity. Like the scientific name, it is resolved from the CN code via reference data rather than trader-entered. |
| `originTradeCountry` | array of `originTradeCountry` | yes (exactly 1) | Country of origin for the trade product, with optional region of origin (UNCL3227 functionTypeCode='106'). |
| `individualTradeProductInstance` | array of `tradeProductInstance` | no | Path B per-animal identifiers (BSP-canonical, purpose-built slot): each instance carries an identifier array (microchip / passport / tattoo / ear tag / leg ring as appropriate per the refdata identifier set for the species). |

## Per-animal (`specifiedConsignment...individualTradeProductInstance[]`)

One entry per individual animal on the trade line. Carries the animal's identifier(s) and, where the commodity calls for it, the per-animal permanent address.

| Property | Type | Required | Description |
|---|---|---|---|
| `identifier` | array of object | no | A per-animal identifier. typeCode names the kind of identifier (EAR_TAG, PASSPORT, MICROCHIP, TATTOO, LEG_RING) and is a bare string drawn from the animal_identifier_types codelist. content is the identifier value itself - it is not drawn from a central registry (an ear-tag is issued by the farm; a microchip number is unique to the chip). The sibling urlId points to the codelist that typeCode is drawn from. Codelist: `https://codelists.tbc.defra.gov.uk/animal_identifier_types`. |
| `permanentLocation` | `LogisticsLocation` | no | Optional per-animal permanent address. The address where this individual animal will permanently reside after import (e.g. for pets imported to a business address and then shipped onwards to their owner's home). Shown for commodities where the producer's refdata indicates a permanent address applies. |

## Defra-declared property names

Property names declared in one of the local Defra JSON-LD context files rather than inherited from the D23B context. Two kinds: re-bindings (a bare TRACES-aligned name aliased to a canonical D23B IRI) and Defra concepts (no D23B equivalent).

### Defra concepts (no D23B equivalent)

| Property | Declared in | Notes |
|---|---|---|
| `exchangedDocument` | `defra-unvtd-core-v1.context.jsonld` | Defra concept; no D23B equivalent |
| `isOrHasUnweanedAnimals` | `defra-unvtd-gbn-ag-v1.context.jsonld` | Defra concept; no D23B equivalent |
| `notificationStatusCode` | `defra-unvtd-core-v1.context.jsonld` | Defra concept; no D23B equivalent |
| `permanentLocation` | `defra-unvtd-gbn-ag-v1.context.jsonld` | Defra concept; no D23B equivalent |
| `specifiedConsignment` | `defra-unvtd-core-v1.context.jsonld` | Defra concept; no D23B equivalent |

### TRACES-aligned aliases (re-bind to canonical D23B IRI)

| Property | Declared in | Notes |
|---|---|---|
| `carrier` | `defra-unvtd-core-v1.context.jsonld` | Re-binds to canonical `unece:carrierParty` |
| `importer` | `defra-unvtd-core-v1.context.jsonld` | Re-binds to canonical `unece:importerParty` |


## Generation

Generated from `schemas/profiles/imports/gb/gbn-ag-v1.schema.json` and the UN/CEFACT D23B vocabulary at `https://vocabulary.uncefact.org/`. Do not edit by hand - regenerate from the source schema.
