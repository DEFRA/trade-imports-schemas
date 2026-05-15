# Trade Imports Schemas

Defra JSON Schema and JSON-LD artefacts for trade-import payloads.

## Current modelling approach

This repository uses a **UNVTD + UN/CEFACT vocabulary-first** approach:

- JSON Schema defines payload shape and constraints.
- JSON-LD context maps payload keys to UN/CEFACT vocabulary IRIs.
- Models align to `https://vocabulary.uncefact.org/unece-context-D23B.jsonld` typing/semantics.
- We **do not use the old SPSCertificate-nested schema pattern as the primary design approach**.

## Repository layout

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

samples/
  imports/
    international/ched/json/unvtd-ched.json
    eu/intra/json/unvtd-intra.json
    reference-data/node-detail/json/unvtd-reference-data-node-detail.json

docs/
  jsonld-mapping-notes.md
  TIG-GBN-AG-Analysis.md
```

## Notes on context usage

- Use `schemas/contexts/defra-unvtd-core-v1.context.jsonld` for UNVTD certificate-style payloads.
- It layers the official D23B context and adds only minimal Defra profile aliases where needed.
- See `docs/jsonld-mapping-notes.md` for rationale and cleanup rules when upstream context coverage changes.

## Validation tooling

Validation scripts remain in `scripts/`:

- `npm run validate-schemas`
- `npm run validate-samples`

Some validator wiring may still target legacy paths while migration completes; treat output accordingly and update script targets with each relocation/version bump.

## Versioning

- Files use explicit version suffixes (for example `*-v1.schema.json`, `*-v1.context.jsonld`).
- Breaking changes should introduce a new file version (for example `-v2`) rather than in-place rewrite.
- Git tags/versioning track repository releases separately.
