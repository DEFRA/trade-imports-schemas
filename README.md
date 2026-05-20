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
- `npm test` — converter unit tests (INTRA/CHED XML fixtures skip if sibling `TRACESNT` repo is absent)

Some validator wiring may still target legacy paths while migration completes; treat output accordingly and update script targets with each relocation/version bump.

## TRACES → UNVTD conversion

Convert TRACES CHED, INTRA, and DOCOM certificates (XML or TRACES-shaped JSON) to UNVTD profile payloads:

```bash
npm run convert:traces -- path/to/certificate.xml -o out.json --validate
npm run convert:traces -- path/to/traces.json --from-json -o out.json --type docom
npm run convert:traces -- path/to/certificate.xml -o samples/imports/eu/intra/json/converted.json
```

Written files include `$model`, `$schema`, `@context`, and `$type` in the same order as `unvtd-*.json` samples (`$model` is always `defra/certificate-internal/1`; `$type` is `ched`, `intra`, or `docom`). Use `--no-metadata` for payload-only JSON.

Pipeline:

1. **Parse** TRACES SOAP/XML (`scripts/lib/traces-xml.js`) or accept `--from-json`.
2. **Normalize** codes, dates, notes, and clauses (`scripts/lib/traces-normalize.js`).
3. **Map** to `exchangedDocument`, `specifiedConsignment[]`, and optional `laboratoryObservationResult[]` (`scripts/lib/unvtd-map.js`).
4. **Profile** detection by `documentTypeCode` (`636` → CHED, `666`/`856` → INTRA, else DOCOM unless `--type` overrides).

Field rules follow [TRACES to internal model mapping](https://github.com/defra/trade-imports-documentation) (EUDP / TIG analysis). Message roots are listed via `node scripts/traces-to-unvtd.js --list`.

**Two different “type” flags:**

- **`--type ched|intra|docom`** — UNVTD **profile** override. Usually omitted; inferred from `documentTypeCode` (`636` → CHED, `666`/`856` → INTRA).
- **`--message <id>`** — TRACES **XML wrapper** (SOAP root). Only needed if auto-detection fails. Use `--list` for ids (e.g. `createAndSubmitChedForDecision.request` for CHED submission envelopes, `getChedCertificate.response` for retrieve).

## Versioning

- Files use explicit version suffixes (for example `*-v1.schema.json`, `*-v1.context.jsonld`).
- Breaking changes should introduce a new file version (for example `-v2`) rather than in-place rewrite.
- Git tags/versioning track repository releases separately.
