# PIMS data mapping

This guide maps the Defra V4 Live Animals Data Fields specification against the GBN-AG schema. For each V4 field it gives the schema path, an implementation description, the engagement with the PIMS team's draft mapping (`Confirmed` where the draft was right; `Modified` where it was off; `Deferred` where an open question remains), and any follow-up actions captured during the review.

Read the description first to understand what the slot carries, then the schema path to know where to read it from, then the bold PIMS engagement line for the verdict against the consumer draft.

## Scope decisions

### Arrival time at port

Descoped by PO. The schema field is date-time; PIMS uses the date component only. No commitment to the time component being operationally meaningful.

### Journey Log

Descoped by PO (V4 Out of Scope Data Elements row 2). No schema slot for journey logs.

### Transport after BCP / post-port legs

Descoped by PO (V4 Out of Scope Data Elements row 3). Onward legs from the UK port (road to BCP, BCP to delivery) are not modelled in mainCarriageLogisticsTransportMovement. This aligns with the parallel decision that BCPs are not in scope for GBN-AG under EU-Reset.

### Animal Identifier - Wing Ring

Descoped by PO (V4 Out of Scope Data Elements row 4). Wing Ring is not in the animal_identifier_types codelist values used by GBN-AG (no avian identifier in scope).

### Transit case (Reason for Import = Transit)

TRACES-aligned. No exit-port slot on the entry notification. The Reason for Import = Transit clause (firstSignatoryAuthentication.includedClause where identifier = PURPOSE, content = Transit) signals the transit case. Downstream notifications cover any exit-specific certificate, consistent with how TRACES handles TEMPORARY_ADMISSION and INTRA samples. For transit, importCountry carries the actual final destination country (not GB), and GB appears in transitTradeCountry. For non-transit, importCountry is implicitly GB.

### Identifying the UK port arrival event without positional assumptions

Multi-leg journeys allowed. Consumer rule: read specifiedConsignment.mainCarriageLogisticsTransportMovement[].arrivalEvent[], find the event whose occurrenceLogisticsLocation.identifier matches specifiedConsignment.unloadingBaseportLocation.identifier, take that event's scheduledOccurrenceDateTime. The core schema carries occurrenceLogisticsLocation on TransportEvent (optional, range LogisticsLocation, D23B-canonical).

### Submitted-on and last-amended-on datetime

The notification's own issuance datetime is `exchangedDocument.issueDateTime` (date-time), re-stamped on each submission. Consumer rule: submitted-on is the `issueDateTime` on the `NotificationSubmitted` event; last-amended-on is the `issueDateTime` on the latest `NotificationSubmissionAmended` event. This is distinct from the accompanying-document issue date at `exchangedDocument.referenceDocument[].issueDateTime` (the Accompanying Document: Date of Issue row).

## Mapping

| Data field | PIMS field | Schema path | Description |
|---|---|---|---|
| Reference Number | Reference Number | <code>exchangedDocument.<br>identifier</code> | The unique reference for the notification, in the format `GBN-AG-{year}-{body}`. GBN is Great Britain Notification, AG is Animals and Germinals, year is two digits, body is a six-character Crockford base32 non-guessable identifier. Example: `GBN-AG-26-7K8M2P`.<br><br>**Confirmed PIMS row 17.** |
| Responsible Person for Load | Person Responsible Address / Country / Company Name / Email / Name / Phone / Person Responsible City / Company Id / Contact Id / Fax / Id / Postcode / Type | <code>exchangedDocument.<br>issuer</code> | The Great Britain-based responsible-person organisation of record for the load. Modelled as a `TradeParty` at `exchangedDocument.issuer`. Organisation name and address live at `name` and `postalAddress`; the named person and their phone and email live as a `definedContact[]` entry. This is the organisation of record, not the individual who submitted the notification; that acting user is an event-level identity and is not carried in the payload. The schema only carries a single contact line per entry. If a second number is needed (personal and organisational) another `definedContact[]` entry can be added in future.<br><br>**Confirmed PIMS row 14.** **Confirmed PIMS Importer Notification - PIMS fields believed not required row 10.** Address normalised to a single postalAddress block (city / postcode live inside it); no separate Id / Type / Fax slots. |
| Country of origin | Country of Origin | <code>specifiedConsignment.<br>originCountry.<br>identifier</code> | The country where the animals lived before being exported. Sourced from the MDM Countries API (EU, EEA, and EFTA countries within scope of GBN-AG under EU-Reset). Read the ISO 3166-1 alpha-2 code at `originCountry.identifier`.<br><br>**Confirmed PIMS row 6.** |
| Region of origin code requirement |  |  | UI Journey related workflow flag, not part of the model. Controls whether the origin code needs to be captured. Default to no; when it is collected it's held at `specifiedConsignment.originCountry.subordinateTradeCountrySubDivision[]`. |
| Region of origin code | Region of Origin | <code>specifiedConsignment.<br>originCountry.<br>subordinateTradeCountrySubDivision[0].<br>identifier</code> | The region within the country of origin (e.g. `FR-75` for a French department). Sourced from MDM. Read the first entry of `subordinateTradeCountrySubDivision[]`. GBN-AG only carries region-of-origin subdivisions (UNCL3227 `functionTypeCode = 106`), so the array has at most one entry; the first value assumption is structurally correct.<br><br>**Confirmed PIMS row 18.** |
| Internal reference number | Internal Reference Number | <code>exchangedDocument.<br>traderAssignedId</code> | An optional reference the trader assigns to the pre-notification - their own internal reference number, carried through unchanged. Whether PIMS stores it is a PIMS-side decision; the slot is available.<br><br>**Confirmed PIMS row 28.** Confirmed slot at exchangedDocument.traderAssignedId. |
| Commodity selection | Commodity Id / Commodity Description / Species Family Name / Species Class Name / Commodity Code / Complement / Description / ID Types / Intended For / Species Class / etc. / Commodity Description | <code>specifiedConsignment.<br>includedConsignmentItem[].<br>includedTradeLineItem[].<br>specifiedTradeProduct[]</code> | The CN commodity code for the trade product, drawn from the MDM commodity list. Stored on each `specifiedTradeProduct[].designatedProductClassification[]` entry where `systemId = "CN"`; the value sits at `classCode.value` and the codelist URL at `classCode.urlId`. The MDM commodity list row also carries human common name and scientific name, stored at `commonName[].content` and `scientificName[].content`. The same CN code may repeat across trade lines when the consignment carries multiple species.<br><br>**Confirmed PIMS Commodity Species row 1.** **Modified PIMS Commodity Species row 5.** Species Family Name is not in the V4 data model and not in the schema. Out of scope until V4 reintroduces it. **Modified PIMS Commodity Species row 6.** Species Class was removed from V4 in the recent re-export; the schema's SPECIES_CLASS classification is being removed (see queued actions on this row). Stays out until V4 reintroduces it. **Confirmed PIMS Importer Notification - PIMS fields believed not required row 3.** Legacy flat commodity fields superseded by per-species shape (commodity-selection, type-selection, species-selection). **Confirmed PIMS Commodity Species row 2.** Commodity Description lives at specifiedTradeProduct[].description.<br><br>**Actions:**<br>- Consider narrowing the schema description of designatedProductClassification[] for the GBN-AG profile so that only CN is in use, dropping the SPECIES_CLASS legacy. |
| Type selection | Species Type Name | <code>specifiedConsignment.<br>includedConsignmentItem[].<br>includedTradeLineItem[].<br>specifiedTradeProduct[].<br>typeCode</code> | The product type for the trade product, used as a filter in the notifier UI when picking species. Stored at `specifiedTradeProduct[].typeCode` with `urlId` naming the Defra `species_type` codelist.<br><br>**Confirmed PIMS Commodity Species row 7.** Maps to specifiedTradeProduct[].typeCode (Defra species_type scheme); V4 row 8 Type selection populates this. |
| Species selection | Species Name / Species Common Name | <code>specifiedConsignment.<br>includedConsignmentItem[].<br>includedTradeLineItem[]</code> | The species carried on the consignment. Multi-select: each selected species becomes a separate `includedTradeLineItem[]` entry. Within each line, the scientific name lives at `specifiedTradeProduct[].scientificName[].content` (`languageId: "la"`) and the common name at `commonName[].content` (`languageId: "en"`). To enumerate the species on a notification, iterate `includedTradeLineItem[]` across every `includedConsignmentItem[]`.<br><br>**Confirmed PIMS Commodity Species row 3.** Scientific (Latin) species name lives at specifiedTradeProduct[].scientificName[].content (languageId='la'). **Confirmed PIMS Commodity Species row 4.** Common name lives at specifiedTradeProduct[].commonName[].content (languageId='en').<br><br>**Actions:**<br>- Confirm that scientificName and commonName landing on the Commodity Species child table is acceptable. |
| Animal Identifier (Microchip, Leg Ring, Passport, Tattoo, Ear Tag, Identification details, Description) |  | <code>specifiedConsignment.<br>includedConsignmentItem[].<br>includedTradeLineItem[].<br>specifiedTradeProduct[].<br>individualTradeProductInstance[].<br>identifier[]</code> | Per-animal identifiers. Each animal is one `individualTradeProductInstance[]` entry on the trade product; within each, `identifier[]` carries one entry per identifier the animal holds. Each identifier entry has a `typeCode` (the kind of identifier), a `content` (the value), and a `urlId` pinning the `animal_identifier_types` codelist. Established typeCodes: `MICROCHIP`, `LEG_RING`, `PASSPORT`, `TATTOO`, `EAR_TAG`. For commodities with no specific identifier type, the V4 form falls back to `IDENTIFICATION_DETAILS` (free-text identifier) and `DESCRIPTION` (free-text animal description); these typeCodes need adding to the `animal_identifier_types` codelist.<br><br>**Confirmed PIMS Commodity Species row 6.** Per-animal-per-identifier model: individualTradeProductInstance[] for animals, identifier[] for identifiers per animal. **Confirmed PIMS Commodity Species row 9.** Confirms per-animal-per-identifier child table model; same as the parent Animal Identifier row.<br><br>**Actions:**<br>- Add IDENTIFICATION_DETAILS and DESCRIPTION typeCodes to the animal_identifier_types codelist on the Defra side.<br>- Confirm that the per-animal-per-identifier model is acceptable. |
| Number of packages | Number of Packages | <code>specifiedConsignment.<br>packageQuantity.<br>content</code> | Optional count of boxes, cages, or stalls in which the animals are transported. Lives at consignment level (not per species), even though V4 displays it conditionally per commodity. Read the numeric value at `packageQuantity.content`.<br><br>**Modified PIMS row 22.** PIMS proposes species-level capture; V4 defines packageQuantity at consignment level. Schema stays at specifiedConsignment.packageQuantity per V4. |
| Number of animals (quantity) | Number of Animals | <code>specifiedConsignment.<br>includedConsignmentItem[].<br>includedTradeLineItem[].<br>specifiedLineTradeDelivery[].<br>productUnitQuantity.<br>content</code> | How many animals the consignment carries, broken down by species. Each species line on the notification carries its own count, so a notification with three species carries three counts. The count itself lives at `productUnitQuantity.content` on the trade line. The sibling `unitCode` tells you how to read it: `H87` means a head count (the usual case for live animals); `KGM` means a kilogram weight (used by some commodities like embryos or ova, which are measured by weight rather than head).<br><br>**Confirmed PIMS Commodity Species row 5.** **Confirmed PIMS Commodity Species row 8.** Per-species count at productUnitQuantity.content per trade line; same slot as the parent Number of animals row. |
| Animals certified for | Certified For | <code>exchangedDocument.<br>firstSignatoryAuthentication.<br>includedClause[].<br>content</code> | The category the animals are certified for (e.g. Slaughter, Further keeping, Breeding). Carried as a clause on `firstSignatoryAuthentication.includedClause[]` where `identifier = GOODS_CERTIFIED_AS`. Read the `content` of that clause.<br><br>**Confirmed PIMS row 3.** |
| Contains Unweaned Animals | Include Non-Ablacted Animals | <code>specifiedConsignment.<br>isOrHasUnweanedAnimals</code> | A UK welfare indicator on the consignment. True when the consignment contains any unweaned animals; false otherwise. Read as a boolean at `isOrHasUnweanedAnimals`.<br><br>**Confirmed PIMS row 9.** PIMS comment refreshed: 'Mainly used for welfare. Not relevant for EU journey.' Removal queued as an action pending PO confirmation.<br><br>**Actions:**<br>- Remove isOrHasUnweanedAnimals from the schema and worked samples. PIMS notes the field is mainly for welfare and not relevant for the EU journey; PO confirmation pending before removal. |
| Reason for import | Purpose of Consignment / Purpose of Movement | <code>exchangedDocument.<br>firstSignatoryAuthentication.<br>includedClause[].<br>content</code> | The reason for importing the consignment (e.g. Internal market, Transit, Re-entry). Carried as a clause on `firstSignatoryAuthentication.includedClause[]` where `identifier = PURPOSE`. Read the `content` of that clause.<br><br>**Confirmed PIMS row 16.** **Confirmed PIMS Importer Notification - PIMS fields believed not required row 13.** Confirmed. Purpose of Movement is superseded by Reason for Import (PURPOSE clause on firstSignatoryAuthentication). |
| Purpose in internal market | Internal Market Purpose | <code>exchangedDocument.<br>firstSignatoryAuthentication.<br>includedClause[].<br>content</code> | The specific agricultural intent within the internal market (Slaughter, Breeding, Fattening, etc.). Conditional: only present when Reason for import = Internal market. Carried as a clause on `firstSignatoryAuthentication.includedClause[]` where `identifier = INTERNAL_MARKET_PURPOSE`. Read the `content` of that clause.<br><br>**Modified PIMS row 10.** PIMS pointed at the PURPOSE clause; the fine-grained intent lives on a separate INTERNAL_MARKET_PURPOSE clause. |
| Place of Origin | Place of Original Harvest - multiple fields | <code>specifiedConsignment.<br>despatchParty</code> | The facility from which the animals were despatched - typically the source farm where the animals were born and raised, or a consolidation hub in mixed-source cases. Modelled as a `TradeParty` carrying name, address, contact details, and operator-activity-id as `identifier`. Distinct from country of origin (the residency fact, at `originCountry`).<br><br>**Confirmed PIMS row 29.** **Confirmed PIMS Importer Notification - PIMS fields believed not required row 11.** Yes. Place of Original Harvest in the legacy PIMS model is what V4 calls Place of Origin; lands on specifiedConsignment.despatchParty. |
| Consignor | Consignor (multiple address-block fields) / Consignor additional fields | <code>specifiedConsignment.<br>consignorParty</code> | The party sending the animals under the trade contract - the exporter in regulatory terms. Modelled as a `TradeParty` with name, address, and contact details. Distinct from `despatchParty` (the physical despatch facility); the consignor doesn't have to operate from the despatch premises.<br><br>**Confirmed PIMS row 5.** **Confirmed PIMS Importer Notification - PIMS fields believed not required row 5.** Typed as TradeAddress. |
| Consignee | Consignee (multiple address-block fields) / Consignee Address Line 3 / Approval Number / Country ISO Code / Id / Telephone variants / Other Identifier / Status / Type / UK Telephone | <code>specifiedConsignment.<br>consigneeParty</code> | The party receiving the animals under the trade contract. Modelled as a `TradeParty` with name, address, and `definedContact[]` (telephone, email) for inspection coordination. Distinct from `importer` (the legal importer of record) and `deliveryParty` (the immediate delivery point).<br><br>**Confirmed PIMS row 4.** **Confirmed PIMS Importer Notification - PIMS fields believed not required row 4.** Typed as TradeAddress. countryId carries ISO alpha-2 (covers the rest-of-world ask). |
| Importer | Importer (multiple address-block fields) / Importer additional fields | <code>specifiedConsignment.<br>importer</code> | The Great Britain-based party responsible for the consignment on the import side - makes the regulatory declarations to UK competent authorities and is the party of record for the import. Modelled as a `TradeParty`. Distinct from `consigneeParty` (the contractual receiver) and `deliveryParty` (the delivery point) - these are frequently three different legal entities on UK live-animal imports.<br><br>**Confirmed PIMS row 8.** **Confirmed PIMS Importer Notification - PIMS fields believed not required row 6.** Typed as TradeAddress. |
| Place of destination | Place of Destination (multiple address-block fields) / Place of Destination additional fields | <code>specifiedConsignment.<br>deliveryParty</code> | The immediate delivery point for the consignment - the contractual delivery party where the animals are delivered. Modelled as a `TradeParty` at `specifiedConsignment.deliveryParty`. For livestock specifically, the CPH-tagged permanent farm address lives separately at `finalDestinationLocation` (County Parish Holding); for pets, per-animal `permanentLocation` (Permanent Address) is used instead.<br><br>**Modified PIMS row 15.** PIMS mapped to despatchParty (which is Place of Origin); correct slot is deliveryParty. **Confirmed PIMS Importer Notification - PIMS fields believed not required row 7.** Typed as TradeAddress. |
| Permanent Address | Permanent Address (address-block fields) | <code>specifiedConsignment.<br>includedConsignmentItem[].<br>includedTradeLineItem[].<br>specifiedTradeProduct[].<br>individualTradeProductInstance[].<br>permanentLocation</code> | Per-animal permanent address - where the individual animal will live long-term after import. Carried on each `individualTradeProductInstance[].permanentLocation`. Different animals on the same trade line can carry different addresses (common for pets imported to a business address and shipped onwards to their owners). Required for Cats, Dogs, Ferrets.<br><br>**Confirmed PIMS Permanent Address row 1.** |
| Transporter (type, Commercial Transporter, Private Transporter) | Transporter Address City / Country / Line 1 / Line 2 / Postcode / Company Name / Email / Individual Name / Telephone / Type / Status / Approval Number / Transporter Address Line 3 / Country ISO Code / Details Required / Id / International Telephone / Telephone ISO Code / Other Identifier / UK Telephone | <code>specifiedConsignment.<br>carrier</code> | The party responsible for moving the consignment from despatch to delivery. Modelled as a `TradeParty` at `specifiedConsignment.carrier`. The transporter type (Commercial or Private) is carried as a `partyTypeCode` value (`COMMERCIAL_TRANSPORTER` or `PRIVATE_TRANSPORTER`), and the two are mutually exclusive: a transporter is one or the other, never both. `partyTypeCode` is an array of coded values (`CodedValue`): a single entry when the party carries one classification, multiple entries when it carries codes from more than one TRACES list. The array holds codes from different lists, not two transporter types. To read the transporter type, take the entry whose `urlId` is the `operator_activity_type` list. When an approval number applies, it lives at `identifier`, with `urlId` pinning the Defra-curated scheme that issues UK transporter approval numbers. Name, postal address, telephone, and email live at `name`, `postalAddress`, and `definedContact[]`. Transporter status (active, suspended, expired) is not in the notification payload; consumers resolve it by looking the approval number up against the issuing scheme at consumption time.<br><br>**Confirmed PIMS row 20.** Confirms specifiedConsignment.carrier. Type on partyTypeCode (array of coded values, read by the `operator_activity_type` urlId); approval number on identifier + urlId; status not in payload (refdata lookup). **Confirmed PIMS Importer Notification - PIMS fields believed not required row 8.** Typed as TradeAddress.<br><br>**Actions:**<br>- Confirm whether Private transporters carry an approval number. V4 row 31 lists only the address block; the schema's identifier slot is available if one is required.<br>- Confirm the final scheme URL on the Defra side. The worked samples use `https://refdata.tbc.defra.gov.uk/uk_transporter_authorisation` as a parking-lot scheme identifier; both the host and the path segment are decisions pending the Defra reference-data service publication.<br>- Extend the `refdata.tbc.defra.gov.uk` host rename to non-GBN-AG samples (INTRA, CHED-PP, reference-data) when those profiles touch Defra scheme URLs. |
| County Parish Holding (CPH) | CPH Number | <code>specifiedConsignment.<br>finalDestinationLocation.<br>identifier</code> | The County Parish Holding (CPH) number of the destination farm. Required for livestock commodities (cattle, pigs, sheep, goats, poultry); not used for pets. Read the string at `finalDestinationLocation.identifier`. The sibling `urlId` is pinned to the Defra-curated CPH register.<br><br>**Modified PIMS row 7.** PIMS proposes species-level CPH; V4 defines CPH per consignment. Schema stays at specifiedConsignment.finalDestinationLocation.identifier per V4. |
| Port of Entry | BCP or Port of Entry | <code>specifiedConsignment.<br>unloadingBaseportLocation</code> | The UK Port of Entry the consignment lands. Note our concept of the BCP is separate from the Port of Entry.<br><br>**Modified PIMS row 2.** PIMS pointed at the BCP slot (applicableCrossBorderRegulatoryProcedure); Port of Entry is a distinct slot, unloadingBaseportLocation. |
| Arrival date at Port | Arrival Date / Arrival Time | <code>specifiedConsignment.<br>mainCarriageLogisticsTransportMovement[].<br>arrivalEvent[].<br>scheduledOccurrenceDateTime</code> | The date the consignment arrives at the UK Port of Entry. Multi-leg journeys are allowed. PIMS read these events by finding the event whose `occurrenceLogisticsLocation` matches the `identifier` of the `unloadingBaseportLocation`. PIMS may store the date component only, time is descoped.<br><br>**Modified PIMS row 1.** PIMS used a positional heuristic (first leg, first arrival); correct rule matches arrivalEvent.occurrenceLogisticsLocation against unloadingBaseportLocation.identifier. **Confirmed PIMS Importer Notification - PIMS fields believed not required row 1.** Arrival Time descoped per Arrival Time scope decision; PIMS reads date only from scheduledOccurrenceDateTime. |
| Means of transport | Means of Transport To Entry Point Type | <code>specifiedConsignment.<br>mainCarriageLogisticsTransportMovement[].<br>modeCode</code> | The mode of transport for the consignment's arrival at the UK Port of Entry. Carried as `modeCode` per UN/EDIFACT Recommendation 19: 1 = Maritime (Vessel), 2 = Rail (Railway), 3 = Road (Road Vehicle), 4 = Air (Airplane). Read on the same leg whose `arrivalEvent.occurrenceLogisticsLocation` matches the UK port (see Arrival date at Port).<br><br>**Modified PIMS row 13.** usedLogisticsTransportMeans.name is in the schema and carries the means' identifying name (vessel name, vehicle registration, flight callsign); the mode of transport lives on modeCode (UN/EDIFACT Rec 19 numeric). |
| Transport identification | Means of Transport To Entry Point Id | <code>specifiedConsignment.<br>mainCarriageLogisticsTransportMovement[].<br>identifier</code> | Free-text transport identifier - vessel name, vehicle registration, flight number, or train identity. Read on the same leg as the UK port arrival event (see Arrival date at Port).<br><br>**Confirmed PIMS row 12.** |
| Transport document reference | Means of Transport To Entry Point Document | <code>specifiedConsignment.<br>mainCarriageLogisticsTransportMovement[].<br>transportContractRelatedReferencedDocument[]</code> | The transport document for the leg arriving at the UK port (typically the Bill of Lading for maritime, Road Consignment Note (CMR) for road, Air Waybill for air, Rail Consignment Note for rail). Carried on each `transportContractRelatedReferencedDocument[]` entry on the relevant leg of `mainCarriageLogisticsTransportMovement[]`; each entry has a `typeCode` (per UNTDID 1001) and an `identifier` (the reference number). Find the relevant leg by matching its `arrivalEvent.occurrenceLogisticsLocation.identifier` against `unloadingBaseportLocation.identifier`, using the same deterministic rule as Arrival date at Port. V4 captures only the reference; the `typeCode` is inferred from the means of transport.<br><br>**Modified PIMS row 11.** PIMS used a positional heuristic (first leg, first arrival); correct rule matches the leg's arrivalEvent.occurrenceLogisticsLocation against unloadingBaseportLocation.identifier (same rule as Arrival date at Port). |
| Accompanying Document: Type | Document Type / Veterinary Document | <code>exchangedDocument.<br>referenceDocument[].<br>typeCode</code> | The type of accompanying document. Sent as a code per UNTDID 1001 (e.g. `853` for veterinary health certificate, `636` for health certificate). PIMS would need the UNTDID 1001 codelist to resolve codes to the V4 human-readable labels.<br><br>**Confirmed PIMS Document Fields row 1.** **Confirmed PIMS Importer Notification - PIMS fields believed not required row 12.** Confirmed. Veterinary documents carry on exchangedDocument.referenceDocument[] with typeCode 853 (UNTDID 1001). Legacy flat 'Veterinary Document' field superseded by the related-documents table. |
| Accompanying Document: Reference | Document Reference | <code>exchangedDocument.<br>referenceDocument[].<br>identifier</code> | Free-text reference identifier for an accompanying document (e.g. `GBHC1234567890`). Read at `referenceDocument[].identifier` on each entry.<br><br>**Confirmed PIMS Document Fields row 2.** |
| Accompanying Document: Date of Issue | Document Issue Date | <code>exchangedDocument.<br>referenceDocument[].<br>issueDateTime</code> | The date an accompanying document was issued. Carried as `issueDateTime` (date-time); PIMS may take the date component only. Read on each `referenceDocument[]` entry.<br><br>**Confirmed PIMS Document Fields row 3.** |
| Transition Countries | Route Transiting States | <code>specifiedConsignment.<br>transitTradeCountry[]</code> | The countries the consignment passes through between origin and destination. Up to 12 entries, multi-select. Required when Means of Transport is Railway or Road Vehicle (Means of transport); optional otherwise. Carried as an array of `TradeCountry` references; each entry has an ISO 3166-1 alpha-2 `identifier`.<br><br>**Confirmed PIMS row 19.** |
| Contact Address |  | <code>exchangedDocument.<br>issuer.<br>postalAddress</code> | The submitter's preferred contact postal address for the notification, sourced from the gov.uk identity of the signed-in user (the user picks one when their profile carries more than one; they may supply a standard address block). Lands on the same slot as the Responsible Person for Load's organisation address: `exchangedDocument.issuer.postalAddress`. The V4 selection step is workflow flow; the schema does not carry a separate contact-address slot distinct from the responsible-person slot.<br><br>**Confirmed PIMS row 30.** Confirms the submitter's preferred address lands on exchangedDocument.issuer.postalAddress, same slot as Responsible Person for Load (V4 row 2). |
| (none - PIMS-only descope) | Charity Address / Approval Number / Company Name / Consignor Email / Id / Individual Name / Telephone / Type / Status / etc. |  | No charity-party concept is captured in GBN-AG. The PIMS legacy charity-related fields are out of scope for this journey.<br><br>**Confirmed PIMS Importer Notification - PIMS fields believed not required row 2.** No charity-party concept in GBN-AG. |
| (none - PIMS-only descope) | Means of Transport From Entry Point Document / Id / Type / Departure Date / Departure Time / Exit Border Control Post / Exit BCP Date / Port of Exit / Port of Exit Date |  | Onward transport after the UK Port of Entry, exit border control post, and port of exit are not modelled in GBN-AG. PIMS-side fields covering 'Means of Transport From Entry Point', 'Departure Date / Time', 'Exit BCP', 'Port of Exit', and related date fields are out of scope per the descope at `Post-Port-of-Entry Transport scope decision`.<br><br>**Confirmed PIMS Importer Notification - PIMS fields believed not required row 9.** Post-Port-of-Entry transport, exit BCP, and port of exit not modelled; descoped per Post-Port-of-Entry Transport scope decision. |
| (none - PIMS-only descope) | Document URL |  | The Document URL ask (a link to the document in the notification portal for caseworker navigation) is not part of the schema definition. The notification carries the document content (`attachmentBinaryObject`) and references on `exchangedDocument.referenceDocument[]`; URLs into a downstream portal are a consumer-side concern.<br><br>**Confirmed PIMS Document Fields row 5.** Document URL stays a consumer-side concern; not added to the schema. |
| Horse Name |  | <code>specifiedConsignment.<br>includedConsignmentItem[].<br>includedTradeLineItem[].<br>individualTradeProductInstance[].<br>name</code> | The given name of the individual horse. Carried on the per-animal record (individualTradeProductInstance) as a plain string. Applies to equines (commodity 0101); omitted for all other species. |

## Examples

### Species selection

**Multi-species shape: one trade-line item per species, sharing CN code and typeCode**

```json
"includedConsignmentItem": [
  {
    "includedTradeLineItem": [
      {
        "specifiedTradeProduct": [
          {
            "typeCode": "LIVE_ANIMAL",
            "urlId": "https://refdata.tbc.defra.gov.uk/species_type",
            "designatedProductClassification": [
              { "systemId": "CN", "classCode": { "value": "01061900", "urlId": "https://traces-codelists.ec.europa.eu/cn" } }
            ],
            "scientificName": [ { "content": "Felis catus", "languageId": "la" } ],
            "commonName":    [ { "content": "Cat",         "languageId": "en" } ]
          }
        ]
      },
      {
        "specifiedTradeProduct": [
          {
            "typeCode": "LIVE_ANIMAL",
            "urlId": "https://refdata.tbc.defra.gov.uk/species_type",
            "designatedProductClassification": [
              { "systemId": "CN", "classCode": { "value": "01061900", "urlId": "https://traces-codelists.ec.europa.eu/cn" } }
            ],
            "scientificName": [ { "content": "Mustela furo", "languageId": "la" } ],
            "commonName":    [ { "content": "Ferret",       "languageId": "en" } ]
          }
        ]
      }
    ]
  }
]
```

### Animal Identifier (Microchip, Leg Ring, Passport, Tattoo, Ear Tag, Identification details, Description)

**One animal carrying ear-tag and passport**

```json
"individualTradeProductInstance": [
  {
    "identifier": [
      { "typeCode": "EAR_TAG",  "content": "UK123456789012", "urlId": "https://refdata.tbc.defra.gov.uk/animal_identifier_types" },
      { "typeCode": "PASSPORT", "content": "UK123456789",    "urlId": "https://refdata.tbc.defra.gov.uk/animal_identifier_types" }
    ]
  }
]
```

### Transporter (type, Commercial Transporter, Private Transporter)

**Commercial transporter carrying an approval number**

```json
"carrier": {
  "name": "Ulster Livestock Transport Ltd",
  "identifier": "UK/NEWCA/T1/00090953",
  "urlId": "https://refdata.tbc.defra.gov.uk/uk_transporter_authorisation",
  "partyTypeCode": ["COMMERCIAL_TRANSPORTER", "TRANSPORTER"],
  "postalAddress": {
    "lineOne": "Unit 6, Bally Business Centre",
    "lineTwo": "Fenaghy Road",
    "cityName": "Ballymena",
    "postcodeCode": "BT42 1FL",
    "countryId": "GB"
  },
  "definedContact": [
    { "telephoneUniversalCommunication": "+44 1733 560890", "emailURIUniversalCommunication": "ops@ulsterlivestock.co.uk" }
  ]
}
```

### Arrival date at Port

**Port reference on the consignment**

```json
"unloadingBaseportLocation": {
  "identifier": "GBBRS",
  "name": "Bristol",
  "postalAddress": {
    "lineOne": "Port of Bristol",
    "cityName": "Bristol",
    "postcodeCode": "BS1 1AA",
    "countryId": "GB"
  },
  "urlId": "https://service.unece.org/locode/"
}
```

**Matching arrival event**

```json
"arrivalEvent": [
  {
    "scheduledOccurrenceDateTime": "2026-05-27T22:00:00Z",
    "occurrenceLogisticsLocation": {
      "identifier": "GBBRS",      // which we can match to the unloadingBaseportLocation.identifier
      "name": "Port of Bristol"
    }
  }
]
```

### Horse Name

**Horse trade line with named animal**

```json
"individualTradeProductInstance": [
  {
    "name": "Starlight",
    "identifier": [
      { "typeCode": "PASSPORT", "content": "826003200123456", "urlId": "https://codelists.tbc.defra.gov.uk/animal_identifier_types" },
      { "typeCode": "MICROCHIP", "content": "826003200123456", "urlId": "https://codelists.tbc.defra.gov.uk/animal_identifier_types" }
    ]
  }
]
```

