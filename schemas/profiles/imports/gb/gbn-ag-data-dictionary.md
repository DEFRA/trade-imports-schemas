# GBN-AG data dictionary

Maps every property in the GBN-AG live-animals pre-notification payload to a plain-English description.

Descriptions come from the GBN-AG schema's own `description` fields (the live-animals domain), falling back to the UN/CEFACT D23B vocabulary (`uncefact.jsonld`) via the JSON-LD context chain where the schema is silent. The canonical UN/CEFACT meaning is always reachable as linked data from the property's IRI. Property names that resolve only to a Defra context - Defra extensions, profile-level slots - are listed in a separate section at the end with the context file that declares them.

Sections follow the payload's natural structure: Document, Consignment, Consignment item, Trade line item, Per-animal. Each row identifies its type; where the value reuses a shared shape (`TradeParty`, `LogisticsLocation`, `IncludedNote`, ...) the type cell carries the `$def` name.

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
| `notificationStatusCode` | string | no | Defra-internal workflow status of this notification. Under GBN-AG the values are `DRAFT`, `SUBMITTED`, `AMEND`, `WITHDRAWN`, drawn from `https://refdata.tbc.defra.gov.uk/gbn-ag-notification-status`. |
| `versionId` | integer | no | Document revision number. V1 on first submission, increments on each subsequent re-submission. Distinct from the envelope's aggregateVersion (event sequence) and the schema's structural version. |
| `functionCode` | string | no | UNTDID 1225 message function: 9 (Original), 5 (Replace), 4 (Change), 1 (Cancellation), 3 (Deletion). Tells the consumer what the message does to its view of the document. |
| `issueDateTime` | string | no | The datetime this version of the document was issued. For a pre-notification, issuance is the submission, so this carries the submission moment and is re-stamped on each re-submission: the original submission datetime on the NotificationSubmitted event, and the amendment's submission datetime on the latest NotificationSubmissionAmended event. This is the notification's own issuance datetime, distinct from the issue dates of accompanying documents held under referenceDocument. |
| `issuer` | `TradeParty` | yes | The party responsible for issuing this document. For TRACES CHED and Defra import pre-notifications, this carries the responsible-person organisation with a named contact. This is the organisation of record, not the individual who submitted the notification; the submitting user is an event-level identity, not carried in this payload. |
| `includedNote` | array of `IncludedNote` | no | General notes attached to the document as a whole, distinct from the per-line notes on a trade line's `additionalInformationNote`. |
| `referenceDocument` | array of `ReferencedDocument` | yes (at least 1) | Carries the regulatory documents that accompany the consignment. At least one entry is the veterinary health certificate (`typeCode` `853` on UNTDID 1001); further entries cover the other accompanying documents (transport documents and the like), each distinguished by its `typeCode`. Attachments are referenced by `filename`, `mimeCode`, and `uri` rather than embedded inline. |
| `firstSignatoryAuthentication` | `Authentication` | yes | Beyond the primary signature, this hosts the consignment's coded declaration clauses on `includedClause[]`: the reason for import (`identifier` `PURPOSE`) and what the animals are certified for (`identifier` `GOODS_CERTIFIED_AS`), each carrying its value in `content` with the sibling `urlId` naming the `ched_consignment_clause` codelist. GBN-AG requires both clauses to be present. When the `PURPOSE` clause `content` is `INTERNAL_MARKET`, the payload must also include a clause with `identifier` `INTERNAL_MARKET_PURPOSE` declaring the fine-grained agricultural intent (slaughter / breeding / fattening / production / transfer of ownership), drawn from the same codelist. |
| `secondSignatoryAuthentication` | `Authentication` | no | The second signature, also known as the first counter signature, that has been authenticated on this exchanged document indicating where appropriate the authentication party. |
| `thirdSignatoryAuthentication` | `Authentication` | no | The third signature, also known as the second counter signature, that has been authenticated on this exchanged document indicating where appropriate the authentication party. |
| `fourthSignatoryAuthentication` | `Authentication` | no | The fourth signature, also known as the third counter signature, that has been authenticated on this exchanged document indicating where appropriate the authentication party. |

## Consignment (`specifiedConsignment`)

One consignment per payload. Carries the parties (consignor, consignee, delivery, importer, despatch, carrier), the transport movement(s), the regulatory procedure, the package count, and the destination.

| Property | Type | Required | Description |
|---|---|---|---|
| `availabilityDueDateTime` | string | no | The date, time, date time or other date time value when this supply chain consignment is due to be available. |
| `exportExitDateTime` | string | no | The date, time, date time or other date time value when this supply chain consignment will exit, or has exited from the last port, airport, or border post of the country of export. |
| `consignorParty` | `TradeParty` | yes | The party sending the animals under the trade contract - the exporter in regulatory terms. Distinct from `despatchParty` (the facility the animals were physically despatched from); the two may be the same legal entity (a farm that both raises and consigns) but are modelled separately. The consignor doesn't have to operate from the despatch facility: a consignor in one country can send animals despatched from a facility (typically an assembly centre or processing plant where animals are gathered for despatch) in another country. See `despatchParty` for what kind of facility goes there. |
| `consigneeParty` | `TradeParty` | yes | The party receiving the animals under the trade contract. Kept separate from `importer` (the legal importer of record) and `deliveryParty` (the destination party); on a given consignment these may or may not be the same legal entity. Carries `name`, `postalAddress`, and a `definedContact` (telephone, email) for inspection coordination. |
| `despatchParty` | `TradeParty` | no | The facility the animals were despatched from. This may be the source farm where the animals were born and raised (the direct case), or a consolidation hub - typically an assembly centre or processing plant - where animals are gathered for despatch from elsewhere (the consolidation case). It's a logistics fact (where the despatch happens), separate from `originCountry`, which is a residency fact (where the animals lived). See `originCountry` for the residency rule that determines its value and for the always-split rule for mixed-residence consignments. The two slots are independent: a consignment can carry FR-resident animals despatched via a GB-based assembly centre, with `originCountry: FR` and a GB postal address here. When animals are despatched directly from the farm they were raised at, the two coincide on country. Modelled as a party rather than a location because the regulatory chain pivots on the operator's identity: `identifier` carries the operator's TRACES-issued `operator_activity_id` (with `urlId` naming the codelist), `partyRoleCode` is `{ "value": "PW" }` ("Place of dispatch") to assert the role on this slot, and `postalAddress` carries the facility's address. One per certificate. |
| `deliveryParty` | `TradeParty` | yes | The party the animals will be delivered to at the immediate destination - the contractual delivery point, which may be temporary. The post-movement permanent home is carried separately: per-animal `permanentLocation`, or the consignment's `finalDestinationLocation` for livestock. |
| `carrier` | `TradeParty` | yes | The person or organisation responsible for moving the goods from the consignment's despatch point to the delivery point. The party's role is carried on `partyRoleCode` as `CA` (Carrier, UNTDID 3035). Pre-notifications distinguish commercial from private transporters via the `operator_activity_type` code on `partyTypeCode`, and the two are mutually exclusive: a transporter is one or the other, never both. `partyTypeCode` is an array of coded values: a single entry for the common case where the party carries one classification; multiple entries when the party carries codes from more than one TRACES list (e.g. an `operator_activity_type` code plus a `classification_section_code`). The array holds codes from different lists, not two transporter types. To read the transporter type, take the entry whose `urlId` is the `operator_activity_type` list. `identifier` is an optional party identifier, with `urlId` naming the register it is drawn from. |
| `customsTransitAgentParty` | `TradeParty` | no | The party acting as an agent for, or on behalf of, the consignor with respect to customs transit procedures for this supply chain consignment. |
| `originCountry` | `TradeCountry` | yes | The country where the animals lived before being exported. For most live-animal imports, country of origin is set by where the animals spent the required residency period defined by the GB health certificate for the species. It's a residency-and-health fact, not a logistics one: how the animals were physically despatched (direct from the farm, via an assembly centre, via a processing plant) doesn't affect what goes here. Required, exactly one per certificate. Consignments with animals from different residence countries are always split across separate certificates, one per residence country - there is no consolidation rule that lets a single certificate carry mixed residence countries. Registered horses re-entering Great Britain are a special case: their country of origin is the country they were last consigned from, not where they originally resided. `exportCountry` is a different fact (the country the consignment was physically despatched from), which usually matches but doesn't have to. Region of origin lives on `subordinateTradeCountrySubDivision` here, because regional disease zoning (FMD-free zones, BTV restriction zones) is a property of where the animals lived. |
| `exportCountry` | `TradeCountry` | no | The country the consignment was exported from. Optional on GBN-AG: populate when it differs from `originCountry` (for example animals produced in one country and exported via another). For the common case where origin and export coincide, leave this empty and carry the value on `originCountry`. |
| `importCountry` | `TradeCountry` | no | The country the consignment is imported into. For non-transit GBN-AG, `importCountry` is implicitly GB and may be left unpopulated. For transit cases (Reason for Import = Transit), `importCountry` carries the actual final destination country (not GB); GB then appears in `transitTradeCountry` as a country the consignment passes through. |
| `reExportCountry` | array of `TradeCountry` | no | Re-export countries on the consignment route (TRACES ReExportSPSCountry[]). |
| `transitCountry` | array of `TradeCountry` | no | Transit countries on the consignment route (TRACES TransitSPSCountry[]). |
| `unloadingBaseportLocation` | `LogisticsLocation` | yes | The UK port (or point) of entry the consignment arrives at, sourced from the MDM Countries API restricted to ports handling arrivals from EU and EFTA countries within scope of the GBN-AG journey under EU-Reset. `identifier` carries the port reference (typically a UN/LOCODE like `GBHUL`); `name` carries the human-readable port name. This slot is the structural anchor for identifying the UK arrival event: the `arrivalEvent` whose `occurrenceLogisticsLocation.identifier` matches this slot's `identifier` is the leg arriving at the UK port. Distinct from any inspection point under `applicableCrossBorderRegulatoryProcedure`, which is a separate regulatory concept. |
| `mainCarriageLogisticsTransportMovement` | array of `LogisticsTransportMovement` | yes | The transport legs that move the consignment to the UK port of entry. Producers may populate any number of legs. The consumer rule for finding the UK port arrival is to match `arrivalEvent.occurrenceLogisticsLocation.identifier` against `unloadingBaseportLocation.identifier`. Intra-EU upstream legs are modelled here; post-port onward legs are not. The Reason for Import clause distinguishes transit from internal-market cases. |
| `transitTradeCountry` | array of `TradeCountry` | no | The countries the consignment passes through between origin and destination, one entry per country with `code.value` carrying the ISO 3166-1 alpha-2 code. Material for live animals because each transit country may impose its own welfare checks under long-journey transport rules. Present only when the route crosses other countries. |
| `packageQuantity` | object | no | On GBN-AG, packageQuantity carries the count of boxes, cages, or stalls in which the animals are transported. At consignment level: the schema does not carry a per-species packaging count. Optional - bulk consignments where animals are loose-loaded (for example livestock in a single trailer compartment) omit it. |
| `includedConsignmentItem` | array of `ConsignmentItem` | yes (exactly 1) | GBN-AG consignment item. Exactly one per consignment - a GBN-AG certificate covers a single consignment item, which carries the 'trade lines', one per species or commodity. In UN/CEFACT D23B a `ConsignmentItem` is an item within a consignment separately identified for transport and customs purposes; here it groups the species or commodities carried by the consignment. |
| `importer` | `TradeParty` | yes | The Great Britain-based party responsible for the consignment on the import side. Makes the regulatory declarations to UK competent authorities and is the party of record for the import. Distinct from `consigneeParty` (the contractual receiver under the trade contract) and `deliveryParty` (the immediate delivery point) - the importer of record, the contractual receiver, and the delivery party are frequently three different legal entities on UK live-animal imports. Held as a full party with its own address and contacts. |
| `finalDestinationLocation` | `finalDestinationLocation` | no | For livestock the `identifier` inside this slot carries the CPH (County Parish Holding) number of the destination farm, with the sibling `urlId` pinned to `https://refdata.tbc.defra.gov.uk/cph_number`. One CPH per consignment - the schema does not carry a per-species CPH. Pets omit this slot entirely and use per-animal `permanentLocation` instead. Reference data: `https://refdata.tbc.defra.gov.uk/cph_number`. |
| `applicableCrossBorderRegulatoryProcedure` | array of `crossBorderRegulatoryProcedure` | no | Reserved for journeys where regulatory inspection at a UK BCP applies. GBN-AG under EU-Reset does not populate this slot - the UK Port of Entry sits on `unloadingBaseportLocation`, which is a distinct concept. Other GB-import journeys may use this slot to carry SPS-inspection data. |
| `isOrHasUnweanedAnimals` | boolean | yes | True when the consignment contains any unweaned (non-ablacted) animals. A UK welfare indicator on live-animal import pre-notifications. |

## Consignment item (`specifiedConsignment.includedConsignmentItem[]`)

Groups trade line items. A live-animals consignment has one consignment item; the consignment item carries the trade lines.

| Property | Type | Required | Description |
|---|---|---|---|
| `natureIdCargo` | array of `CargoNature` | no | - |
| `includedTradeLineItem` | array of `TradeLineItem` | yes (at least 1) | GBN-AG trade line item. One line per species or commodity on the certificate. Each line carries the commodity itself (classification, scientific and common names, type), the line quantity (head count for animals; weight for some germinals), the per-animal records, and any notes about that line. Mixed consignments (for example cattle plus sheep, or live animals plus germinals) split across multiple lines, one per species or commodity. |

## Trade line item (`specifiedConsignment.includedConsignmentItem[].includedTradeLineItem[]`)

One line per species or commodity on the certificate. A line carries the species (classification, scientific and common names, type), the line quantity, the per-animal records, and any notes.

| Property | Type | Required | Description |
|---|---|---|---|
| `sequenceNumeric` | integer | no | A sequence number. |
| `description` | array of string | yes | The free-text description of the commodity on this line, paired with `scientificName` and `commonName` for full species identification. Inherits the core line's array-of-strings form. |
| `scientificName` | string | yes | The species name for the commodity in Latin, resolved from Defra reference data keyed on the CN code rather than entered by the trader. Required for live animals, where every commodity code maps to a species. |
| `netWeight` | `UneceWeightMeasureType` | no | - |
| `grossWeight` | `UneceWeightMeasureType` | no | - |
| `applicableClassification` | array of `ApplicableClassification` | yes (at least 1) | A classification entry on a trade line. `systemId` names the coding system the value is drawn from (`CN` for the customs nomenclature, `SPECIES_CLASS` for the taxonomic class, others as registered). `classCode` is the value within that system. A trade line can carry multiple classification entries when more than one system applies. |
| `physicalReferencedLogisticsPackage` | array of `LogisticsPackage` | no | - |
| `specifiedTradeProduct` | array of `TradeProduct` | no | The trade product on this line. BSP-canonical structural slot; profile schemas may narrow shape and cardinality. |
| `specifiedLineTradeDelivery` | array of `LineTradeDelivery` | yes (at least 1) | Delivery aspect of this line (line-level quantities). |
| `additionalInformationNote` | array of `IncludedNote` | no | GBN-AG carries per-animal identifiers (microchip, passport, ear tag, tattoo, leg ring) here as separate note entries: `subjectCode` `INDIVIDUAL_IDENTIFICATION_NUMBER` and the identifier value in `content` - one note per identifier. |
| `typeCode` | string | no | The commodity's type or form - live animal, semen, embryo, or ova. Drawn from a Defra-curated species-type codelist named by the sibling `urlId`. |
| `urlId` | string | no | URL to the codelist this line's typeCode is drawn from. |
| `commonName` | string | yes | The everyday English name for the species, paired with `scientificName` to identify the commodity. Resolved from the CN code via reference data rather than trader-entered. |
| `individualTradeProductInstance` | array of `tradeProductInstance` | no | Per-animal records. Each entry represents one individual animal on the line. See `tradeProductInstance` for the fields each entry carries (regulatory identifiers, permanent location). |

## Per-animal (`specifiedConsignment...individualTradeProductInstance[]`)

One entry per individual animal on the trade line. Carries the animal's identifier(s) and, where the commodity calls for it, the per-animal permanent address.

| Property | Type | Required | Description |
|---|---|---|---|
| `name` | string | no | The given name of this individual animal. Required for equines (horses, donkeys, asses); omitted for other species. |
| `identifier` | array of object | no | A per-animal identifier. `typeCode` names the kind of identifier (EAR_TAG, PASSPORT, MICROCHIP, TATTOO, LEG_RING) as a bare string; `urlId` names the codelist the typeCode is drawn from. `content` is the identifier value itself - it is not drawn from a central registry (an ear-tag is issued by the farm; a microchip number is unique to the chip). Reference data: `https://codelists.tbc.defra.gov.uk/animal_identifier_types`. |
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
| `LogisticsTransportMovement` | `defra-unvtd-core-v1.context.jsonld` | Re-binds to canonical `unece:TransportMovement` |
| `carrier` | `defra-unvtd-core-v1.context.jsonld` | Re-binds to canonical `unece:carrierParty` |
| `entryCustomsOfficeSpecifiedLogisticsLocation` | `defra-unvtd-core-v1.context.jsonld` | Re-binds to canonical `unece:entryCustomsOfficeSpecifiedLocation` |
| `importer` | `defra-unvtd-core-v1.context.jsonld` | Re-binds to canonical `unece:importerParty` |
| `individualTradeProductInstance` | `defra-unvtd-core-v1.context.jsonld` | Re-binds to canonical `unece:individualProductInstance` |
| `mainCarriageLogisticsTransportMovement` | `defra-unvtd-core-v1.context.jsonld` | Re-binds to canonical `unece:mainCarriageTransportMovement` |
| `usedLogisticsTransportMeans` | `defra-unvtd-core-v1.context.jsonld` | Re-binds to canonical `unece:usedTransportMeans` |


## Generation

Generated from `schemas/profiles/imports/gb/gbn-ag-v1.schema.json` and the UN/CEFACT D23B vocabulary at `https://vocabulary.uncefact.org/`. Do not edit by hand - regenerate from the source schema.
