# Schemas Overview

This directory contains versioned schema and context artefacts for trade-import payloads.

## Design principle

The active design is **UNVTD + UN/CEFACT vocabulary-first**:

- JSON Schema defines structure/validation.
- JSON-LD context defines semantic mapping to UN/CEFACT vocabulary IRIs.
- Payloads align to D23B vocabulary typing (`xsd:string`, `@vocab`, `@id`) where applicable.
- We do not treat nested SPSCertificate inheritance as the primary modelling approach.

More information about the Import Notification and Event Envelope schemas can be found in [profiles/imports/README.md](profiles/imports/README.md)

## Directory map

```text
schemas/
  core/
    defra-unvtd-canonical-core-v1.schema.json

  contexts/
    defra-unvtd-core-v1.context.jsonld

  profiles/
    imports/
      international/
        defra-unvtd-profile-ched-v1.schema.json
      eu/
        defra-unvtd-profile-intra-v1.schema.json
        defra-unvtd-profile-docom-v1.schema.json
      gb/
        gbn-ag-v1.schema.json
      messaging/
        event-envelope-v1.schema.json

  reference-data/
    defra-unvtd-profile-reference-data-core-v1.schema.json
    defra-unvtd-profile-reference-data-ClassificationTreeNodeDetailResponse-v1.schema.json
    defra-unvtd-profile-reference-data-ClassificationTreeResponse-v1.schema.json
    defra-unvtd-profile-reference-data-ClassificationSectionListResponse-v1.schema.json
    defra-unvtd-profile-reference-data-MetadataListResponse-v1.schema.json
```

## Core + context + profile layering

Typical certificate layering:

1. `core/defra-unvtd-canonical-core-v1.schema.json`  
   Common UNVTD-aligned building blocks and certificate payload shape.
2. `contexts/defra-unvtd-core-v1.context.jsonld`  
   JSON-LD mapping layer (official D23B context + minimal Defra aliases where required).
3. Profile schema under `profiles/imports/...`  
   Type-specific constraints (for example CHED/INTRA/DOCOM document type constraints).

## BSP-qualified names and the JSON-LD bridge

The schemas use BSP-master-style names (`LogisticsTransportMovement`, `mainCarriageLogisticsTransportMovement`, `usedLogisticsTransportMeans`, `entryCustomsOfficeSpecifiedLogisticsLocation`) on the wire because TRACES SPS Certificate XML carries the same `Logistics_` BIE qualifier. Keeping the BSP shape avoids per-property name translation at the gateway.

The canonical UN/CEFACT D23B vocabulary publishes the shorter forms at `https://vocabulary.uncefact.org/` (`TransportMovement`, `mainCarriageTransportMovement`, `usedTransportMeans`, `entryCustomsOfficeSpecifiedLocation`). To keep both layers usable, `contexts/defra-unvtd-core-v1.context.jsonld` carries an `@id` binding for each BSP-qualified term to its canonical IRI. A consumer walking the context dereferences cleanly against the published vocabulary; the JSON payload on the wire matches TRACES.

When adding a new property or class to a core or profile schema, check the canonical D23B context (`build/vendor/uncefact/unece-context-D23B.jsonld`) for the equivalent IRI. If the BSP-qualified form is absent there, add a binding in the core context entry mapping it to the canonical short form. Some terms (e.g. `LogisticsLocation`, `occurrenceLogisticsLocation`, `LogisticsTransportMeans`) are canonical with the `Logistics` qualifier and need no bridge.

## Samples

Primary sample locations:

- `samples/imports/international/ched/json/unvtd-ched.json`
- `samples/imports/eu/intra/json/unvtd-intra.json`
- `samples/imports/gb/gbn-ag/json/gbn-ag-v1-example.json`
- `samples/imports/reference-data/node-detail/json/unvtd-reference-data-node-detail.json`

## Migration note

During migration to versioned filenames/paths, transitional internal `$id` and `$ref` values may still be present. Use file locations in this README as the source of truth for where artefacts live now.
