# Trade Imports Schemas

Defra JSON Schema definitions for Trade Import journeys, built against the UN/CEFACT Buy-Ship-Pay (BSP) D23B reference model. The first journey covered is live animals and germinals (`gbn-ag-v1`). Other import journeys (plants, products of animal origin) will follow as sibling schema families.

**Status:** WIP proposal, in active design review with the TIG (TRACES Integration Gateway) team. The slot-by-slot walkthrough of the worked example is in [`docs/TIG-GBN-AG-Analysis.md`](docs/TIG-GBN-AG-Analysis.md).

## Why UN/CEFACT BSP

The strategic choice is to define internal notification payloads against UN/CEFACT Buy-Ship-Pay. BSP is the international standard for cross-border trade documents; aligning on it gives Defra data interoperability with UN/CEFACT-aware peers and a canonical shape that is stable across any single regulatory regime.

## Repository layout

```
schemas/imports/
  event-envelope-v1.schema.json     Generic event envelope (transport-layer; payload-agnostic)
  gbn-ag-v1.schema.json             Payload schema for the GBN-AG live-animals journey
samples/
  gbn-ag-v1-example.json            Worked CHED-A → GBN-AG example payload
scripts/
  validate-schemas.js               Compile both schemas; report structural errors
  validate-samples.js               Validate the worked example against gbn-ag-v1
docs/
  TIG-GBN-AG-Analysis.md            Slot-by-slot walkthrough; joint-review reference
```

## The two schemas

**`event-envelope-v1.schema.json`** - the transport-layer envelope for events emitted by every import-journey service. Journeys publish via a transactional outbox onto a journey-specific SNS topic; consumers subscribe via SQS. The envelope carries `eventId`, `aggregateType`, `subType`, `aggregateId`, `aggregateVersion`, `eventType`, `timestamp`, `metadata`, and a payload `data` field. The envelope is deliberately payload-agnostic - `data` is a generic object - so adding a new journey does not require an envelope change.

**`gbn-ag-v1.schema.json`** - example payload that goes inside the envelope's `data` field.

```
event-envelope-v1 ─── data ──▶ gbn-ag-v1
                  (one envelope, many possible payload schemas - one per journey)
```

## Validation

```bash
npm install
npm run validate-schemas     # compile both schemas, report structural errors
npm run validate-samples     # validate the worked example against gbn-ag-v1
```

The schemas declare different JSON Schema drafts - envelope uses draft-07; gbn-ag uses 2020-12 - and the validators handle both.

The gbn-ag schema has one external `$ref` into BSP D23B's `BasicComponents` schema (for `indicatorType`). On first run, the validator fetches that file from `raw.githubusercontent.com/uncefact/spec-JSONschema` and caches it under `build/vendor/uncefact/`. Subsequent runs use the cached copy. Offline environments need to pre-populate the vendor directory or be online for the first run.

The worked example carries authorial `_comment` / `_mapping_note` keys that intentionally violate `additionalProperties: false`; the sample validator strips underscore-prefixed keys recursively before validating.

## Adding a new journey

This repository is set up to grow. To add a new import journey (plants, POAO) or an export journey:

1. Add a payload schema under `schemas/imports/` or `schemas/exports/`, named `<journey>-v<n>.schema.json`. Use the same BSP-grounded approach: inline primitives, open codelist strings, mirror BSP composite names.
2. Add at least one worked example under `samples/`, named `<journey>-v<n>-example.json`.
3. Register the schema + sample pair in `scripts/validate-schemas.js` and `scripts/validate-samples.js`.
4. The envelope does not need to change; consumers route on `aggregateType` / `subType` / `eventType`.

## Versioning

Two version axes, managed independently.

**Git releases (semver).** Tags (`v1.0.0`, `v1.1.0`, …) snapshot the whole repository. MAJOR for any breaking schema change, MINOR for new schemas or backward-compatible additions, PATCH for doc and tooling changes only.

**Per-file version suffix.** Filenames carry a major version (`gbn-ag-v1.schema.json`). A new suffix (`gbn-ag-v2.schema.json`) is introduced only for breaking changes to that specific schema; both versions coexist in the repo during the deprecation window. In-place edits are reserved for additive, backward-compatible changes.

Full history in [`CHANGELOG.md`](./CHANGELOG.md), formatted per [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/).

## Commit conventions

Conventional commits (`feat:`, `fix:`, `refactor:`, `docs:`…). Subject line ≤50 chars, imperative mood, capitalised, no trailing period. No emojis. Body wrapped at 72 chars; explain *what* and *why* (the code shows *how*). See the project-level `CLAUDE.md` for the full rules.