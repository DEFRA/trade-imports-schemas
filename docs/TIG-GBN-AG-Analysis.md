---
title: Traces Integration Gateway (TIG) IPAFFS-CHED comparison alongside the GBN-AG worked example
description: Slot-by-slot walk through the live CHED-A example (schema/samples/gbn-ag-v1-example.json) placing each slot next to what the TIG team's concept-level analysis predicts. Built for the joint review meeting.
---

# Traces Integration Gateway (TIG) IPAFFS-CHED comparison alongside the GBN-AG worked example

## Purpose

TIG team analysed data flows from TRACES ITAHC/CHED into IPAFFS (exports). This analysis started from the other direction: IPAFFS notification → SPS Certificate (imports). The goal being to define a Defra import schema for the live animals journey. 

This document walks our worked CHED-A example (`schema/samples/gbn-ag-v1-example.json`). The example payload is a translation of a live CHED-A notification (`GBN-AG-26-0000001-8`, "Bos taurus" live cattle from Switzerland transiting through France and Belgium to the UK).

## How to read this document

Open `schema/samples/gbn-ag-v1-example.json` in one pane. Open this document in another. The "Walking through the example" section below moves down the JSON in the order the slots appear in the file, so the two panes stay in sync. References to "row N in TIG's concept list" refer to TIG's own numbered analysis at *TRACES to IPAFFS CHED comparison.md* - that's TIG's numbering, kept for traceability only.

---

## Aligned

Alignment with TIG's concept-level analysis. Full matches or naming-only differences between the BSP-canonical JSON name and the SPS-namespace XML name.

| Slot in our example                                                           | TIG concept                                                                   | Alignment                                                                                                                                                                                                                                                                                                                                              |
|-------------------------------------------------------------------------------|-------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `exchangedDocument.id`                                                        | Certificate / document reference (row 1)                                      | Match - both place the CHED reference number on `exchangedDocument.id`                                                                                                                                                                                                                                                                                 |
| `exchangedDocument.issueDateTime` (slotted but not populated by this example) | Issue date / time (row 5)                                                     | Match on the SPS slot. TIG marks the IPAFFS side as `- (submission in partOne)` rather than committing to a specific IPAFFS field; our mapping uses `partOne.submissionDate`                                                                                                                                                                           |
| `exchangedDocument.referenceReferencedDocument[]`                             | Referenced documents (row 7) and Veterinary / accompanying documents (row 18) | Match - naming-only difference (BSP-canonical `referenceReferencedDocument` vs SPS-namespace `referenceSPSReferencedDocument`)                                                                                                                                                                                                                         |
| `specifiedConsignment[].consignor`                                            | Consignor (row 9)                                                             | Match - naming-only                                                                                                                                                                                                                                                                                                                                    |
| `specifiedConsignment[].consignee`                                            | Consignee (row 10)                                                            | Match - naming-only                                                                                                                                                                                                                                                                                                                                    |
| `specifiedConsignment[].delivery`                                             | Place of destination (row 12)                                                 | Match - TIG's "consignment / delivery party" wording lands on the same slot                                                                                                                                                                                                                                                                            |
| Commodities tree (`includedConsignmentItem[].includedTradeLineItem[]`)        | Commodities (row 13)                                                          | Match on the structure. The sub-fields `totalGrossWeight`, `totalNetWeight`, `totalGrossVolume`, `consignedCountry` are CHED-D/P concerns parked for the per-CHED-journey work; recorded in the crosswalk with category `pending_decomposition`.                                                                                                       |
| `mainCarriageLogisticsTransportMovement[]` (cardinality)                      | Means of transport (row 17)                                                   | Match on the slot. TIG row 17 lists the slot without committing to cardinality; operational evidence (the `bos-taurus.json` peer payload populates two entries in `mainCarriageSPSTransportMovement[]` - one for the before-BCP leg, one for the after-BCP leg, distinguished by `schemeID` on the `id`) supports our single-slot-two-entries approach |
| `version`, `etag`, `chedTypeVersion` (not in this example payload)            | Version / etag (row 26)                                                       | Match - both teams treat as IPAFFS-internal versioning concerns, not regulatory data                                                                                                                                                                                                                                                                   |
| UK-specific fields (not all populated in this example)                        | UK-specific (row 27)                                                          | Match on per-field categorisation: workflow flags as Defra extensions, risk-pipeline outputs as internal state flags, CUC family as structural pointer, external references as external linkage                                                                                                                                                        |

---

## What's not exercised by this example

The example does not exercise every TIG concept. The following are deferred either because they live in different events (Part II / III), are handled at the schema-instance layer (CHED type), or are routed through the event envelope (status, audit metadata).

| TIG concept                                       | Why not in this example                                                                                                      | Where the decision lives                                                                   |
|---------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------|
| Document title (row 2)                            | Neither side carries; derived from type/template                                                                             | Acknowledged design choice - revisit if IPAFFS introduces a free-text document title field |
| Document type (row 3)                             | We treat as schema-instance (one schema per CHED-type - GBN-AG for animals, future per-type schemas for plants and products) | The schema family, not a value carried on the document                                     |
| Status (row 4)                                    | We treat as event-envelope concern, not a document property                                                                  | Event Envelope schema (separate from this regulatory payload)                              |
| Submission / last-updated audit fields (row 19)   | We route audit data via the Event Envelope, not inline on the document                                                       | Event Envelope schema                                                                      |
| Part II - decision (row 20)                       | Decision is a separate event in our model                                                                                    | Future Part II event schema                                                                |
| Part II - consignment check / validation (row 21) | Same architecture                                                                                                            | Future Part II event schema                                                                |
| Part II - laboratory tests required (row 22)      | Same architecture                                                                                                            | Future Part II event schema                                                                |
| Part II - inspection required (row 23)            | Same architecture                                                                                                            | Future Part II event schema                                                                |
| Part III - seal check (row 24)                    | Same architecture                                                                                                            | Future Part III event schema                                                               |
| Signatory parties (part of row 25)                | IPAFFS has no source data for signatory identity in the import-side flow                                                     | The signatory is the issuing veterinarian on the source CHED, not a Defra-import actor     |

---

## Three patterns worth recognising up front

Three JSON shapes recur throughout the example. They are not slot-specific - once you can recognise them, you can read most of the example's structural choices without needing them re-explained at every site. Each pattern is introduced here with real data from the example so the shape is concrete from the start.

### The codelist-metadata-on-id pattern

An identifier on its own is ambiguous. `CPH19876` could be a serial number, a passport reference, anything. The pattern attaches a tag saying which codelist the value comes from, so a consumer reading the JSON knows what it's looking at without guessing.

The tag lives as sibling fields on the same `id` object: `schemeId` and `schemeName` name the codelist; `schemeAgencyId` and `schemeAgencyName` name who maintains it.

```json
{
  "content": "CPH19876",
  "schemeId": "cph_number",
  "schemeName": "County Parish Holding Number",
  "schemeAgencyId": "defra",
  "schemeAgencyName": "DEFRA"
}
```

We use this pattern wherever an identifier comes from a known codelist: the **CPH number** on the final destination, the **BCP reference** on the regulatory inspection point, the **UN/LOCODE** for the physical port, the **private transporter approval number** on the carrier, and the **vessel-name scheme** on the transport movement.

### The discriminator-typeCode-array pattern

A party can be classified in more than one way at once. Our carrier is a `COMMERCIAL_TRANSPORTER` under one classification scheme and a `TRANSPORTER` under another. A single typeCode can't carry both. The pattern is an array on `typeCode[]` where each entry tags itself with `listId` - the codelist scheme it belongs to - so a consumer can filter for whichever scheme it cares about.

```json
"typeCode": [
  {
    "content": "COMMERCIAL_TRANSPORTER",
    "listId": "operator_activity_type",
    "listName": "Operator activity type"
  },
  {
    "content": "TRANSPORTER",
    "listId": "classification_section_code",
    "listName": "Operator classification section code"
  }
]
```

We use this on **trade parties** that need to carry classification codes from more than one scheme - the **carrier** in our example, and (per the operational TRACES sample) consignor, consignee, and delivery wherever those parties have regulated roles.

### The clause-coded pattern

A document's signature authentication carries codelist-coded statements - the regulator's affirmations about the consignment. Each statement has to declare what kind of affirmation it is and what value goes with it. The pattern wraps both: `id.content` names the kind, `id.schemeId` names the codelist of kinds, and `content[]` carries the value.

```json
{
  "id": { "content": "PURPOSE", "schemeId": "ched_consignment_clause" },
  "content": [{ "content": "INTERNAL_MARKET" }]
}
```

---

## Walking through the example

The subsections below move down the example file in slot-appearance order. Slots covered in "What we agree on" above are skipped here.

### 1. `exchangedDocument.issuer` - Kai Inc., Worthing GB

In our example, the document carries an `issuer` party with name, address, and contact:

```json
"issuer": {
  "name": [{ "content": "Kai Inc." }],
  "specifiedTradeAddress": {
    "lineOne": { "content": "UNCANNY COMICS" },
    "lineTwo": { "content": "3 TARRING ROAD" },
    "cityName": { "content": "WORTHING" },
    "postcodeCode": { "content": "BN11 4SS" },
    "countryId": { "content": "GB" }
  },
  "definedTradeContact": [
    {
      "personName": { "content": "Kai Atkinson" },
      "emailURIUniversalCommunication": { "content": "kaiatkinson@jourrapide.com" },
      "telephoneUniversalCommunication": { "content": "0123456788" }
    }
  ]
}
```

IPAFFS captures the person responsible for the notification - the regulatory contact party with name, address, and contact details.

**TIG (row 8).** Leaves this open - "signatories or consignment parties" - without committing to a specific JSON slot.

**Defra Schema Proposal.** Map to `exchangedDocument.issuer`, the BSP slot for the party accountable for the document. `issuer` is distinct from `signatory` (the issuing veterinarian on the source ITAHC, from an import perspective) and from the consignment parties (who handle the goods, not the regulatory submission).

**Question for the joint review.** Does TIG's XSD analysis produce a separate issuer party, a consignment-attached party, or fold this concept into signatory clauses?

### 2. `exchangedDocument.firstSignatoryDocumentAuthentication.includedDocumentClause[]` - purpose and goods-certified-as

In our example, two clauses sit under `firstSignatoryDocumentAuthentication.includedDocumentClause[]`:

```json
"firstSignatoryDocumentAuthentication": {
  "includedDocumentClause": [
    {
      "id": { "content": "PURPOSE", "schemeId": "ched_consignment_clause" },
      "content": [{ "content": "INTERNAL_MARKET" }]
    },
    {
      "id": { "content": "GOODS_CERTIFIED_AS", "schemeId": "ched_consignment_clause" },
      "content": [{ "content": "BREEDING_AND_PRODUCTION" }]
    }
  ]
}
```

IPAFFS requires the importer to declare two things on the notification: the reason for the import, and the animal certification category. The schema captures both as codelist-coded clauses on the document's signature authentication.

**Codelist.** UN/CEFACT lets schemas specify enums as codelists. Here `schemeId: "ched_consignment_clause"` is not a Defra codelist - it's an EU TRACES codelist owned by EC DG SANTE, restricting the statement kinds to operational TRACES values such as `PURPOSE` and `GOODS_CERTIFIED_AS`. The peer `bos-taurus.json` confirms ownership with `schemeAgencyID: "ec_sante_traces"`.

**TIG.** Row 14 (Purpose) covers this data and accepts "notes or clauses". Row 6 (Document notes) covers notes generally; the operational `bos-taurus.json` populates notes for things like `CHED_TYPE` and `LAST_UPDATE_DATETIME`, but the reason-for-import and animal-certification clauses go in clauses, not notes. The animal-certification category itself is not enumerated in TIG's concept list.

**Defra Schema Proposal.** Place these clauses on `firstSignatoryDocumentAuthentication.includedDocumentClause[]`. The choice of clauses over notes is backed by both TIG row 14 and operational TRACES. The choice of clause slot differs from operational TRACES, which uses `signatorySPSAuthentication[].includedSPSClause[]` (the repeating signatory-authentication array, TIG row 25) - the same clause data, structurally distinct slot. Our choice is recorded in DL-021.

**Question for the joint review.** Should we align on the operational slot (`signatorySPSAuthentication[].includedSPSClause[]`) rather than the primary-signatory variant? And does `GOODS_CERTIFIED_AS` appear in TIG's analysis under a row we missed, or is it a Defra concept TIG has not catalogued?

### 3. `specifiedConsignment[].includedConsignmentItem[].includedTradeLineItem[]` - the Bos taurus line

In our example, a single trade-line item carries the commodity data:

```json
{
  "specifiedTradeProduct": [
    {
      "designatedProductClassification": [
        { "systemId": { "content": "CN" }, "classCode": { "content": "01020000" } }
      ],
      "scientificName": [
        { "content": "Bos taurus", "languageId": "la" }
      ],
      "originTradeCountry": [
        {
          "id": { "content": "FR" },
          "subordinateTradeCountrySubDivision": [
            { "id": { "content": "FR-12345" }, "functionTypeCode": { "content": "106" } }
          ]
        }
      ],
      "individualTradeProductInstance": [
        { "id": { "schemeId": "EAR_TAG", "content": "et1" } },
        { "id": { "schemeId": "PASSPORT", "content": "passport1" } }
      ]
    }
  ],
  "specifiedLineTradeDelivery": [
    { "productUnitQuantity": { "content": 20, "unitCode": "H87" } }
  ],
  "generalInformationDescription": [
    { "content": "Live bovine animals" }
  ]
}
```

IPAFFS captures what the commodity is, where it came from, and how many. This single trade-line item carries six pieces of data: the CN code `01020000` (EU Combined Nomenclature) identifying the commodity; the Latin scientific name `Bos taurus`; the origin country `FR` with sub-division `FR-12345` flagged as a region of origin via `functionTypeCode: 106`; two per-animal identifiers (one ear tag, one passport); a piece count of 20 animals (UN/CEFACT unit code `H87` meaning "one of"); and a free-text description.

**TIG (row 13).** Same sub-fields, same `specifiedTradeProduct` / `specifiedLineTradeDelivery` tree. Both teams converge on the BSP-canonical structure.

**Substantive divergence - per-individual animal identifiers.** Both teams agree per-animal identifiers must be carried; we disagree on where. BSP offers two paths and both are preserved through SPS Certificate D23B. Path A places each identifier as an annotation on the line item (`additionalInformationSPSNote[]` with `subjectCode = "INDIVIDUAL_IDENTIFICATION_NUMBER"`), declaring the identifier system separately via `applicableSPSClassification`. Path B places each animal as a discrete entity on `specifiedTradeProduct.individualTradeProductInstance[]`, carrying its own identifier system and value together. Operational TRACES (`bos-taurus.json`) uses Path A. Our schema uses Path B per DL-022, on the basis that per-individual data structurally belongs on a per-instance entity rather than being flattened into line-level notes with the identifier-system split across two slots.

**Defra-addition - region of origin.** IPAFFS captures the region as well as the country. The schema places this on `originTradeCountry[].subordinateTradeCountrySubDivision[]` and uses `functionTypeCode: 106` (UN/CEFACT code for "Region") to mark the sub-division as a region of origin rather than some other administrative sub-division.

**Question for the joint review.** Should we align on Path A or Path B for per-animal identifiers? Both are defensible; alignment matters more than the choice itself.

### 4. `specifiedConsignment[].isOrHasUnweanedAnimals` - `true`

In our example:

```json
"isOrHasUnweanedAnimals": true
```

IPAFFS asks the importer whether the consignment includes any unweaned animals - a UK welfare concern. The source field (`notification.partOne.commodities.includeNonAblactedAnimals`, where "ablacted" means "weaned") is a single boolean, asked once per consignment.

**TIG.** Not in TIG's concept list. CHED-A-specific Defra concern.

**Defra Schema Proposal.** No BSP or SPS analogue exists. Add as a Defra extension on the consignment, following BSP's `isOrHas` naming convention used elsewhere on consignment (e.g. `isOrHasContainerization`, `isOrHasShipStores`). Placed once on the consignment, matching the IPAFFS cardinality.

**Question for the joint review.** Does TIG handle the unweaned-animals concept under a different slot or wording? If so, we should align.

### 5. `specifiedConsignment[].despatch` - Astra Rosales, CH

In our example:

```json
"despatch": {
  "name": [{ "content": "Astra Rosales" }],
  "specifiedTradeAddress": {
    "lineOne": { "content": "43 East Hague Extension" },
    "lineTwo": { "content": "Delectus sit odio p" },
    "lineThree": { "content": "Laborum Odio tempor" },
    "cityName": { "content": "Quas occaecat ut ear" },
    "postcodeCode": { "content": "30055" },
    "countryId": { "content": "CH" }
  }
}
```

BSP distinguishes the party who physically despatched the goods from the consignor (the commercial seller). IPAFFS does not carry despatch as a separate field. In our example the despatch and consignor data are the same (Astra Rosales in Switzerland) - synthesised from the consignor.

**TIG.** Not separately enumerated. TIG's concept list folds despatch into consignor.

**Defra Schema Proposal.** BSP and SPS Certificate D23B both carry `despatch` and `consignor` as distinct party slots. Operational CHED data does not populate `despatch` - the TIG workbook tags it "INTRA + DOCOM (NOT CHED)". We retain the slot for forward compatibility with ITAHC and DOCOM flows the schema may need to serve later. The example synthesises despatch from consignor because IPAFFS does not carry the distinction today.

**Question for the joint review.** Does TIG's analysis surface a real despatch-versus-consignor distinction worth preserving, or should we drop the slot until ITAHC/DOCOM ingest is in scope?

### 6. `specifiedConsignment[].importer` - Importerporter, FR

In our example:

```json
"importer": {
  "name": [{ "content": "Importerporter" }],
  "specifiedTradeAddress": {
    "lineOne": { "content": "186 Ditchling Road" },
    "lineTwo": { "content": "BRIGHTON" },
    "cityName": { "content": "Brighton" },
    "postcodeCode": { "content": "BN17DD" },
    "countryId": { "content": "FR" }
  }
}
```

IPAFFS captures the importer separately from the consignee. The importer is the legal entity bringing the goods into GB customs territory; the consignee is the commercial recipient. In real flows they are frequently different parties - in our example the importer is in FR and the consignee in CH.

**TIG (row 11).** Observes that in SPS the importer is frequently the same party as the consignee. The operational `bos-taurus.json` confirms this, carrying a single party labelled "Consignee (Importer)" with no separate importer slot populated.

**Defra Schema Proposal.** Carry `importer` as a distinct party. BSP carries the slot; SPS Certificate D23B strips it; we re-include from BSP because IPAFFS distinguishes importer from consignee and UK regulation requires both. Preserving the distinction matters on the import side even where TRACES production data merges them.

**Question for the joint review.** Should TIG's TRACES ingest preserve the importer-vs-consignee distinction when it is detectable, or always merge to a single party? If TIG merges, how does the import side re-derive the distinction from a TRACES-shaped payload?

### 7. `specifiedConsignment[].finalDestinationLogisticsLocation` - Linus George Ltd with CPH 19876

In our example:

```json
"finalDestinationLogisticsLocation": {
  "id": [
    {
      "content": "CPH19876",
      "schemeId": "cph_number",
      "schemeName": "County Parish Holding Number",
      "schemeAgencyId": "defra",
      "schemeAgencyName": "DEFRA"
    }
  ],
  "name": [{ "content": "Linus George Ltd" }],
  "postalTradeAddress": {
    "lineOne": { "content": "558 Oak Street" },
    "lineTwo": { "content": "Ut aperiam in volupt" },
    "lineThree": { "content": "Nisi tempore aliqua" },
    "cityName": { "content": "Eligendi et beatae p" },
    "postcodeCode": { "content": "24271" },
    "countryId": { "content": "CH" }
  }
}
```

UK livestock tracking requires the animals' permanent address - where they will permanently reside after all movements. This is distinct from the immediate delivery party, which may be temporary (a quarantine facility, a market). The address is tagged with a CPH (County Parish Holding) number, the UK identifier for animal premises.

**TIG.** Not in TIG's concept list. TIG does not separate immediate delivery from permanent destination, and does not address CPH.

**Defra Schema Proposal.** BSP provides both slots: `delivery` (immediate destination party, may be temporary) and `finalDestinationLogisticsLocation` (permanent post-movements location). SPS Certificate D23B strips the second; we re-include from BSP because UK regulation requires the permanent address separately from the immediate delivery party. The CPH number lands on the location's `id[]` with `schemeId: "cph_number"` - a Defra-owned codelist, not a UN/CEFACT or EU one. The schema accepts any CPH string; the source system validates against the Defra register. In the worked example both addresses point at the same building, but the slots represent distinct concepts and would diverge in flows with intermediate destinations.

**Question for the joint review.** Does TRACES carry a permanent-address concept under a different name? If not, this remains a Defra-side re-inclusion driven by UK livestock-tracking law.

### 8. `specifiedConsignment[].applicableCrossBorderRegulatoryProcedure[]` - SPS inspection at Dover BCP

In our example:

```json
"applicableCrossBorderRegulatoryProcedure": [
  {
    "typeCode": {
      "content": "SPS_INSPECTION",
      "listId": "regulatory_procedure_type",
      "listName": "Cross-border regulatory procedure type"
    },
    "entryCustomsOfficeSpecifiedLogisticsLocation": {
      "id": [
        {
          "content": "GBDVR1",
          "schemeId": "bcp_reference",
          "schemeName": "UK Border Control Post reference",
          "schemeAgencyId": "defra",
          "schemeAgencyName": "DEFRA"
        }
      ],
      "name": [{ "content": "Dover BCP", "languageId": "en" }],
      "postalTradeAddress": {
        "lineOne": { "content": "Border Control Post, Port of Dover" },
        "cityName": { "content": "Dover" },
        "postcodeCode": { "content": "CT17 9TF" },
        "countryId": { "content": "GB" }
      }
    }
  }
]
```

IPAFFS captures the Border Control Post that handles the SPS inspection - distinct from the physical port where goods are unloaded. The BCP is a regulatory office; the port is a physical location. The schema records the regulatory procedure (SPS inspection) together with the BCP that handles it.

**TIG (row 15).** Lists `pointOfEntry` from IPAFFS and says it lands "in consignment or notes" - generic, no specific slot.

**Defra Schema Proposal.** Place on `applicableCrossBorderRegulatoryProcedure[].entryCustomsOfficeSpecifiedLogisticsLocation`. UN/CEFACT defines this slot as "the location of the specified customs office at which the goods subject to this cross-border regulatory procedure enter the customs territory of entry" - exactly what a BCP is for the SPS inspection. The BCP identifier is tagged with `schemeId: "bcp_reference"`, a Defra-curated codelist of UK Border Control Posts. The port lands separately on `unloadingBaseportLogisticsLocation` (§9). In our example both are at Dover, but the values differ: `GBDVR` for the port (UN/LOCODE), `GBDVR1` for the BCP. DL-048 records this decision and the alternatives considered.

**Question for the joint review.** Does TIG carry the BCP identifier under a different slot or codelist? If TRACES does not surface a BCP code (because TRACES describes the EU-side procedure, not the UK-side inspection point), this remains a UK import-side concern.

### 9. `specifiedConsignment[].unloadingBaseportLogisticsLocation` - Dover (UN/LOCODE `GBDVR`)

In our example:

```json
"unloadingBaseportLogisticsLocation": {
  "id": [
    {
      "content": "GBDVR",
      "schemeId": "un_locode",
      "schemeName": "UN/LOCODE",
      "schemeAgencyId": "un",
      "schemeAgencyName": "United Nations"
    }
  ],
  "name": [{ "content": "Dover", "languageId": "en" }],
  "postalTradeAddress": {
    "lineOne": { "content": "Port of Dover" },
    "cityName": { "content": "Dover" },
    "postcodeCode": { "content": "CT17 9TF" },
    "countryId": { "content": "GB" }
  }
}
```

IPAFFS captures the UK port where the goods physically unload, as a UN/LOCODE. `GBDVR` is the Dover code. This is distinct from the BCP (§8) - same geographical area, different regulatory concept.

**TIG (row 15).** Lists `pointOfEntry` and `portOfEntry` together with the generic landing "in consignment or notes".

**Defra Schema Proposal.** Place the port on `unloadingBaseportLogisticsLocation` and the BCP on `applicableCrossBorderRegulatoryProcedure[].entryCustomsOfficeSpecifiedLogisticsLocation` (§8). Two BSP-canonical slots for two distinct concepts. The port identifier is tagged with `schemeId: "un_locode"` and `schemeAgencyId: "un"` - the UN/LOCODE codelist is maintained internationally by UN/ECE, not by Defra or the EU.

**Question for the joint review.** Slot-choice is aligned. Worth confirming the metadata pattern: does TIG carry codelist information as sibling fields on the id (`schemeId`, `schemeAgencyId`) or as some other structure?

### 10. `specifiedConsignment[].mainCarriageLogisticsTransportMovement[]` - vessel SHIPPY, arriving 2026-05-06 22:00 UTC

In our example:

```json
"mainCarriageLogisticsTransportMovement": [
  {
    "id": [
      {
        "content": "SHIPPY",
        "schemeId": "vessel_name_after_bcp",
        "schemeName": "Vessel name (after BCP)"
      }
    ],
    "modeCode": { "content": "1" },
    "transportContractRelatedReferencedDocument": [
      { "typeCode": { "content": "705" }, "id": { "content": "doc-ref-BOL" } }
    ],
    "arrivalEvent": [
      { "scheduledOccurrenceDateTime": "2026-05-06T22:00:00Z" }
    ]
  }
]
```

IPAFFS captures the means of transport (mode, vessel, contract document) and the scheduled arrival at the border. In our example: vessel `SHIPPY`, mode code 1 (maritime, per UN/CEFACT Recommendation 19), UNTDID 1001 typeCode 705 (Bill of lading - the standard maritime contract document), arrival scheduled at 2026-05-06 22:00 UTC.

**TIG.** Row 17 (Means of transport) - aligned. Both teams place the data on a single repeating `mainCarriageLogisticsTransportMovement[]` slot covering both transport legs. Row 16 (Arrival timing) - TIG suggests `availabilityDueDateTime` on the consignment, which carries the same datetime value but in a different slot.

**Defra Schema Proposal.** Place arrival on `mainCarriageLogisticsTransportMovement[].arrivalEvent[].scheduledOccurrenceDateTime`. The IPAFFS source describes the vehicle's scheduled arrival at the Border Control Post - a transport event. `availabilityDueDateTime` describes a different moment: when the goods become available at delivery, after clearance. Placing arrival on the transport event preserves the IPAFFS semantic; `availabilityDueDateTime` answers a different question.

**Question for the joint review.** Does TIG's XSD analysis confirm `availabilityDueDateTime`, or does TIG's TRACES ingest also use `arrivalEvent`? If the latter, the divergence is concept-list shorthand only.

### 11. `specifiedConsignment[].carrier` - Alistair Wilson (private transporter UK/INVER/T1/00091851)

In our example:

```json
"carrier": {
  "name": [{ "content": "ALISTAIR WILSON" }],
  "id": [
    {
      "content": "UK/INVER/T1/00091851",
      "schemeId": "private_transporter_approval_number",
      "schemeName": "Private transporter approval number",
      "schemeAgencyId": "defra",
      "schemeAgencyName": "DEFRA"
    }
  ],
  "typeCode": [
    { "content": "COMMERCIAL_TRANSPORTER", "listId": "operator_activity_type", "listName": "Operator activity type" },
    { "content": "TRANSPORTER", "listId": "classification_section_code", "listName": "Operator classification section code" }
  ],
  "specifiedTradeAddress": {
    "lineOne": { "content": "AUCHENBLAE" },
    "lineTwo": { "content": "INVER SHIN" },
    "lineThree": { "content": "LAIRG" },
    "cityName": { "content": "SUTHERLAND" },
    "postcodeCode": { "content": "IV27 4ET" },
    "countryId": { "content": "GB" }
  }
}
```

IPAFFS captures three pieces of operational metadata about the carrier: an approval number identifying the regulated transporter, and two classification codes describing what kind of operator they are. Our example carries a UK private transporter approval (`UK/INVER/T1/00091851`) and the two operational classifications (`COMMERCIAL_TRANSPORTER` for activity, `TRANSPORTER` for classification section).

**TIG.** Not separately addressed. TIG's concept list treats the carrier as a generic consignment party; the operational metadata (approval number, classifications) is not surfaced.

**Defra Schema Proposal.** Carrier identifier tagged with `schemeId: "private_transporter_approval_number"` and `schemeAgencyId: "defra"`. Two classification codes carried simultaneously on `typeCode[]`, each tagged with `listId` for the scheme - `operator_activity_type` and `classification_section_code`. The classifications are EU TRACES schemes; operational TRACES populates both. The approval-number scheme is tagged Defra-owned in our example, but the operational `bos-taurus.json` carries the same data under `operator_internal_activity_id` (EC DG SANTE owned) - whether the UK scheme is genuinely separate or the same scheme tagged differently needs confirming with the source-system owner.

**Question for the joint review.** Does TIG carry the approval number and the classifications? On which slots, with which codelist tags? If TRACES does not surface a UK private-transporter approval concept, this stays a UK regulatory re-inclusion.

### 12. `specifiedConsignment[].transitTradeCountry[]` - Belgium

In our example:

```json
"transitTradeCountry": [
  { "id": { "content": "BE" } }
]
```

IPAFFS captures the countries a consignment transits through on its way to GB. In our example: Belgium, between France (origin) and the UK. Sourced from IPAFFS `partOne.route.transitingStates[]`.

**TIG.** Aligned on the same `transitTradeCountry[]` slot.

**Defra Schema Proposal.** Place on `transitTradeCountry[]` - BSP-canonical, both teams converge. For CHED-A the IPAFFS `route.transitingStates[]` field is the canonical source. CHED-PP has additional transit fields in `purpose` (exitBIP, finalBIP, transitThirdCountries) that would also land on this slot or its sub-divisions; that decomposition is parked under per-CHED-journey work and not exercised in this example.

**Question for the joint review.** None for CHED-A. The CHED-PP transit decomposition is a separate per-journey question, out of scope here.

---

## Primitive types - the building blocks underneath the row-level concepts

The row-by-row reconciliation above places IPAFFS fields and TIG concepts against UN/CEFACT slots. Underneath those slots are the **primitive types** - the simple shapes for things like "an identifier value with a scheme tag", "a code value with a codelist tag", "a text value with a language tag", "a numeric measurement with a unit". Every field carrying a code, an identifier, a piece of text, a measurement, an attachment, or a true/false flag is composed from these primitives. UN/CEFACT defines them once in a file called BasicComponents; both BSP and the SPS certificate use them.

The TIG analysis is concept-level and does not address primitive shape. The GBN-AG schema does take a position on primitives, and that position should be discussed at the joint review so both teams hold a consistent line. There is only one substantive position to discuss; everything else is parked.

### The one position the schema takes: do not enum-bind codelist properties

UN/CEFACT BasicComponents declares several primitive properties with a reference into an external codelist file. For example, the agency identifier on a code value is declared as a reference into `UNECE_AgencyIdentificationCode.json` - a file that lists the valid agency codes. A validator that follows the reference enforces the codelist at schema time: any value not in the file is rejected.

The GBN-AG schema does not adopt this enum-binding. The codelist-bearing properties are typed as plain strings. The schema accepts any string value; the source system is responsible for ensuring the value is valid against the relevant codelist.

The reason is the same in every case. The codelists in question (agency identifiers, language codes, MIME types, measurement units) are curated by external bodies - UN/CEFACT, ISO, IANA. Binding the schema to those files would mean every codelist revision becomes a schema revision. The schema's lifecycle and the reference-data lifecycle would be coupled. We do not want that coupling: reference data evolves on its own cadence, managed by whichever Master Data Management capability is responsible for it, and the schema should remain stable across those changes.

The properties affected are: the agency identifier on `idType`, the agency identifier and language identifier on `codeType`, the language identifier on `textType`, the unit code on `measureType`, the unit code and codelist-agency identifiers on `quantityType`, and the MIME code on `binaryObjectType`.

**The joint-review question.** Does TIG enforce these codelists at the schema layer or at runtime? If TIG enforces at the schema, TIG's pipeline will reject values that our schema accepts; if TIG defers like we do, the two teams are aligned on the principle. Either answer is workable; what matters is that we know.

### The non-position: everything else is BSP shape, no extra restrictions

Outside the codelist-binding question above, the GBN-AG primitives are the BSP shape with no additional restrictions added. Every slot UN/CEFACT defines on each primitive is present. There is no `additionalProperties: false` clamp, so a message can carry sibling properties beyond the defined ones without being rejected. The slot list is the full UN/CEFACT slot list, not a trimmed subset.

This is a **deliberately permissive starting position**, not an oversight. The reasoning is straightforward: we have no concrete operational requirement driving a tighter contract today. We do not have evidence that producers will send malformed primitive instances. We do not have a documented payload-size limit forcing rejection of inline binary attachments. We do not have a use case requiring rejection of standard UN/CEFACT slots we happen not to populate. In the absence of a concrete reason, the schema does not add a restriction. If a reason appears later - a real interoperability problem, a documented size constraint, a regulatory drift concern - the restriction is added then with the receipt attached to the decision.

**The joint-review question.** Does TIG impose any primitive-level restrictions (extra-property rejection, slot trimming, value constraints) for concrete reasons we should know about? If so, we should evaluate whether those reasons apply to us too. If not, the two teams are aligned on the principle.

### What this means for compatibility

Because the GBN-AG primitives carry the full UN/CEFACT slot list with no extra restrictions, a message valid against GBN-AG primitives is valid against BSP primitives, and a message valid against BSP primitives is valid against GBN-AG. The two are interoperable at the primitive layer. The only asymmetry is the codelist-binding case above: a message that satisfies our schema can carry a codelist value that BSP's enum-bound check would reject, and a message that satisfies BSP's enum-bound check will always be accepted by ours.

### `indicatorType` - referenced from BSP, not redeclared

The schema does not declare its own `indicatorType`. The single usage site (`isOrHasUnweanedAnimals` on the consignment) references BSP's `indicatorType` directly via its canonical URI. This is a sourcing choice, not a restriction. BSP defines `indicatorType` as a boolean and that is what we use. The validator registers the vendored BSP BasicComponents file at compile time so the reference resolves without a network fetch.

---

## Summary of joint-meeting agenda

The discussion items in "Walking through the example" cluster into three groups.

### Slot-choice questions

Both teams agree on the underlying data; we disagree (or need to confirm alignment) on which BSP slot carries it. Likely-resolvable by comparing actual JSON output.

| Section | Concept | Our slot | TIG / operational position |
|---|---|---|---|
| §2 | PURPOSE clause | `firstSignatoryDocumentAuthentication.includedDocumentClause[]` | TIG row 14 accepts notes or clauses; operational `bos-taurus.json` uses `signatorySPSAuthentication[].includedSPSClause[]` (different clause slot from ours) |
| §2 | GOODS_CERTIFIED_AS clause | Same as above | Not in TIG concept list; operational `bos-taurus.json` populates it in the same slot as PURPOSE |
| §1 | Person responsible | `exchangedDocument.issuer` | TIG row 8 unspecified ("signatories or consignment parties") |
| §3 | Per-individual animal identifiers | Path B - `individualTradeProductInstance[]` | TIG concept-level only; operational `bos-taurus.json` uses Path A - `additionalInformationSPSNote[]` |
| §10 | Arrival timing | `arrivalEvent[].scheduledOccurrenceDateTime` | TIG row 16 `availabilityDueDateTime` |
| §8 | BCP code (point of entry) | `applicableCrossBorderRegulatoryProcedure[].entryCustomsOfficeSpecifiedLogisticsLocation` (declared per DL-048) | TIG row 15 "In consignment or notes" - generic |

### Architectural questions

The two teams model parts of the data flow differently. These need real conversation.

| Concept | Our model | TIG model |
|---|---|---|
| Document type | Schema-instance (one schema per CHED-type) | `typeCode` value on the document |
| Status | Event-envelope concern | `statusCode` value on the document |
| Submission audit fields | Event-envelope routing | Inline notes on the document |
| §6 Importer | Distinct party re-included from BSP | TIG observes "may be same party as consignee"; operational sample merges them |
| Part II / III content | Separate downstream events | Inline on the document |

### Defra additions / re-inclusions for joint awareness

Slots we populate that TIG's concept list does not address explicitly. Joint awareness rather than divergence - TIG may carry the same data on different slots, or may not carry it at all.

| Section | Slot or pattern | Why it's there |
|---|---|---|
| §3 | Region of origin via `functionTypeCode: 106` | Sub-country origin tracking |
| §4 | `isOrHasUnweanedAnimals` on consignment | CHED-A-specific animal welfare indicator; no BSP analogue |
| §5 | `despatch` party distinct from `consignor` | BSP/SPS-canonical slot, not populated by operational CHED data; we re-include for forward compatibility with ITAHC/DOCOM |
| §7 | `finalDestinationLogisticsLocation` distinct from `delivery`; `cph_number` codelist | UK regulatory livestock tracking - permanent vs immediate destination; CPH codelist is Defra-owned |
| §8 | `bcp_reference` codelist on BCP id | Defra-curated UK Border Control Post registry |
| §11 | `private_transporter_approval_number` on carrier id (ownership to confirm); `operator_activity_type` and `classification_section_code` discriminators on `typeCode[]` | UK / EU TRACES carrier classification |

### Primitive-type questions

Two short questions for TIG, in the "Primitive types" section above.

1. Does TIG enum-bind codelist-bearing properties at the schema layer, or defer codelist validation to runtime?
2. Does TIG impose any primitive-level restrictions (extra-property rejection, slot trimming) for concrete reasons we should know about?

The GBN-AG primitives are BSP shape with no extra restrictions and one deliberate divergence (codelist-bearing properties typed as open strings, to keep the schema independent of externally-curated reference data evolution).
