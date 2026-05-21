# Problem Statement

Sanitary and Phytosanitary (SPS) controls are the measures governments use to protect human, animal, and plant health when goods move across borders. They apply to live animals, animal products, plants, and plant products. The official SPS Certificate schema, part of the larger Buy-Ship-Pay (BSP) model, describes an export-oriented model for the movement of these goods.

Defra requires that some categories of goods be raised in UK national systems as Import Notifications to support UK-specific operational and regulatory needs.

The BSP / SPS model does not provide a UK Import model for live animals. It does provide common concepts and means of extension that allow such a journey to be described.

The goal is to maximise interoperability within the Defra ecosystem by using a common model to describe UK Import Notifications.

# Context

While a member of the EU, the UK operated within a shared SPS framework governed by the Official Controls Regulation (EU 2017/625, the OCR). The OCR mandates the use of TRACES as the system of record for import notifications, border controls, and certification. UK SPS processes, systems, and enforcement practices were built around this framework.

When the UK left the EU single market on 31 December 2020, it needed to stand up its own SPS controls regime. Rest of World (RoW) imports applied full controls immediately. EU imports were delayed repeatedly over three years.

The Border Target Operating Model (BTOM), published in August 2023, set out a phased introduction of SPS controls on EU imports. Since Brexit and the adoption of the BTOM, the UK has required importers to raise notifications as Common Health Entry Documents (CHEDs) using IPAFFS (Import of Products, Animals, Food and Feed System).

The May 2025 UK-EU Common Understanding committed to removing certificates and controls for the vast majority of EU movements. This is the policy change that triggered EU Reset.

EU Reset will deliver a new set of SPS controls for EU imports and replatform the existing CHED journeys. In the process, the data definitions will be restructured to align with UN/CEFACT.

# UN/CEFACT SPS Certificate

The UN/CEFACT Sanitary and Phytosanitary (SPS) Certificate is an international standard for exchanging electronic health certificates for animals, plants, and products. It is based on the Buy-Ship-Pay (BSP) model and enables government authorities to exchange data securely.

- https://github.com/uncefact/spec-JSONschema/blob/main/JSONschema2020-12/meta-library/BuyShipPay/D23B/UNECE-SPSCertificate.json
- https://service.unece.org/trade/uncefact/publication/SupplyChainMGMT/SCRDM/HTML/001.htm
- https://github.com/uncefact

# Data Structures

## IPAFFS and the Notification Schema

The CHED import control process follows three parts: Notification, Decision, and Follow-up (EU Regulation 2019/1715 - Article 40). Both EU and RoW imports follow the same three parts and use the same systems (the Notification Portal for Part 1, a case management system for Parts 2 and 3). The difference is in what happens at each part (depth of checks, where the decision is made, whether follow-up is triggered), not the systems or whether the part exists.

The data captured for each CHED type (CHED-A, CHED-D, CHED-P, CHED-PP) via the IPAFFS User Journeys is defined by the [IPAFFS Notification Schema](https://github.com/DEFRA/ipaffs-imports-notification-schema/tree/master/notification-schema-core/resources).

## EU Live Animals

Each journey follows an architecturally similar pattern. It raises events using a transactional outbox pattern onto a journey-specific SNS Topic; interested consumers subscribe via SQS queues.

**Transactional outbox pattern:**
- Journey service writes the Import Notification and the "outbox event" in a single transaction.
- An embedded background worker (within the same service container) polls the outbox collection and publishes to SNS.
- FIFO ordering guaranteed by (1) MongoDB distributed locking in the outbox worker, (2) SQS FIFO queues with `MessageGroupId` for gateway/adapter processing.
- Remediation / failure recovery:
  - SQS ensures failed messages automatically reappear for retry.
  - A DLQ captures messages that fail repeatedly, enables manual investigation, and supports redrive for replay.
  - Worker processes continuously retry unsent events from the outbox collection.

Events emitted by the journey services share a common envelope. The data section of each event is a JSON object that conforms to a schema based on the UN/CEFACT SPS Certificate.

# Lessons from IPAFFS Schema Analysis

## Conflating Concerns

The current IPAFFS schema serves every CHED type (CHED-A, CHED-D, CHED-P, CHED-PP) from a single notification model. That model holds the regulatory data, but it also holds fields that track where the user is in the form-filling journey, internal risk-assessment outputs, billing fields, workflow flags, and deprecated fields that no current journey populates.

The new schema family is journey-specific - GB Notification for Animals and Germinals (GBN-AG) for live animals; future schemas for plants and plant products will be GBN-P and GBN-PP. Workflow and internal state live in a journey collection in MongoDB. The schema and the events it shapes carry only the regulatory payload.

## Mapping IPAFFS to UN/CEFACT

Three patterns recur in the JSON.

**Identifiers / UN/CEFACT codelists.** When the schema records a County Parish Holding (CPH) number, a Border Control Post (BCP) reference, a port's UN/LOCODE, or a transporter's approval number, it also records which list that identifier was drawn from and who maintains the list. The value travels with its provenance. A reader does not have to guess what `CPH19876` is - the metadata next to it says "this is from the CPH register, maintained by Defra".

**Carrier / UN/CEFACT typeCodes.** The carrier in our example is both a "commercial transporter" under one operator-activity scheme and a "transporter" under a separate operator-classification scheme. The schema carries both classifications at once, tagging each with the scheme it comes from. A consumer reading the party can filter for whichever scheme it cares about.

**Reasons and certifications / UN/CEFACT documentClause.** The reason for import ("internal market", "transit", "re-entry") is a formal statement where the value comes from a controlled list. So is the animal certification category ("breeding and production", "slaughter", "approved bodies"). The schema records each statement as two parts: what is being declared (the reason for import; the animal certification category) and the value being given for that declaration ("internal market"; "breeding and production").

The UN/CEFACT model is layered. The full Buy-Ship-Pay (BSP) library defines a vocabulary for moving goods across borders. The SPS Certificate is a narrower profile of that vocabulary; it leaves out slots it does not need for plant-and-animal health certificates. Some of what the SPS profile leaves out matters to UK imports: the importer party, the permanent destination location, the cross-border regulatory procedure declaration, and the document clauses. Where this happens, we go back to the full BSP library and put the slot back into our schema.

Not every concept maps cleanly. The IPAFFS `purpose` data, for example, ends up split across three different UN/CEFACT slots depending on whether the sub-field describes the reason for import, the transit countries, or the regulatory procedure. Some IPAFFS concepts have no UN/CEFACT slot at all. The unweaned-animals indicator (does this consignment contain unweaned animals?) is a UK welfare question with no UN/CEFACT equivalent, so we add a Defra-specific field on the consignment.

## Reference Data

The schema is not bound to lists of valid values. Properties that carry codelist values are typed as plain strings; their metadata names which list the value should be drawn from. The list itself lives in Master Data Management (MDM), Defra's reference-data system. The source system filling in a notification validates against MDM at submission time.

The schema does not embed reference-data lists. The reason is operational: reference data evolves on its own cadence (a new CPH number issued today, a transporter approval revoked tomorrow), and the schema's release cycle should not be coupled to it.

Where EU TRACES lists cover the concept, we adopt them rather than inventing parallel Defra lists. The `ched_consignment_clause` list, owned by European Commission DG SANTE, supplies the values for purpose and animal certification category. The `operator_activity_type` and `classification_section_code` lists supply party classifications. Adopting EU or ISO lists where they exist keeps the import side compatible with TRACES production data and avoids a translation layer at the boundary.

## UK-Specific Concepts

UK regulatory needs introduce concepts no EU list covers:

- **County Parish Holding (CPH) numbers** identify UK animal premises; every farm or holding has one. Needed for livestock tracking.
- **Border Control Post (BCP) references** identify the specific inspection point at the border that handles each consignment.
- **Private transporter approval numbers** identify hauliers approved under the UK welfare-in-transport regime.

All three are Defra-curated lists; none exists in the EU's published codelists. In the schema we model each as a UN/CEFACT `idType` carrying a Defra `schemeId` tag, placed on the semantically relevant slot:

- CPH on the consignment's final destination location.
- BCP on the cross-border regulatory procedure's entry customs office.
- Transporter approval on the carrier party.

## TRACES Integration Gateway Modelling

The TRACES Integration Gateway (TIG) team are building similar models. Three divergences are worth flagging:

- Coded statements (the reason for import, the animal certification category) live on one part of the document in our schema and on a different part of the document in TRACES production data. Same data, different home.
- Per-animal identifiers (ear tags, passports) can sit either on each individual animal (BSP-canonical placement, on `individualTradeProductInstance[]`) or as notes against the consignment line item tagged by note type (operational TRACES placement). The GBN-AG worked example currently carries both placements with the same data so the joint review with TIG can settle on a single canonical placement.
- We treat the importer as a distinct party with its own slot; TRACES production data often merges the importer into the consignee.

```mermaid
%%{
  init: {
    'theme': 'default',
    'themeVariables': {
      'fontSize': '14px'
    },
    'flowchart': {
      'padding': 20
    }
  }
}%%
flowchart TD
    subgraph Infrastructure["1. Event Infrastructure (generic, reusable)"]
        envelope[event-envelope-v1.schema.json<br/>eventId, aggregateType, subType,<br/>aggregateId, eventType, timestamp, metadata]
    end

    subgraph Common["2. Common Domain (shared across all journeys)"]
        common[defra-unvtd-canonical-core-v1.schema<br />defra-unvtd-profile-intra-v1.schema.json]
    end

    subgraph JourneyDomain["3. Journey-Specific Domain"]
        impv2[schemas/profiles/imports/gb/gbn-ag-v1.schema.json]
    end

    subgraph Events["4. Event  (specific, composed)"]
        created[gbn-ag-event-created-v1.schema.json<br/>DRAFT notifications]
        submitted[gbn-ag-event-submitted-v1.schema.json<br/>SUBMITTED notifications]
    end

    common -->|"$ref<br/>(extends)"| impv2
    common -->|"$ref<br/>(extends)"| plants
    envelope -->|"allOf<br/>(inherits)"| created
    envelope -->|"allOf<br/>(inherits)"| submitted
    impv2 -->|"$ref<br/>(uses types)"| created
    impv2 -->|"$ref<br/>(uses types)"| submitted

    style envelope fill:#e1f5ff
    style common fill:#f3e5f5
    style impv2 fill:#fff4e1
    style plants fill:#fff4e1,stroke-dasharray: 5 5
    style created fill:#e8f5e9
    style submitted fill:#e8f5e9
```
