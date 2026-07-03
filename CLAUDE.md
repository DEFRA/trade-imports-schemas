# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A Node.js artefacts repository — JSON Schema and JSON-LD context files for Defra trade-import payloads. There is no application to build or deploy. The only executables are validation scripts.

The parent `../CLAUDE.md` (at `/Users/benoit/projects/defra/cdp/CLAUDE.md`) describes a Java Spring Boot service (Maven, MongoDB, ECS logging, etc.). Only its **commit message rules** apply here. The architecture, package layout, testing, and CDP-runtime sections do **not** apply to this repo.

## Commands

```bash
npm run validate-schemas    # Compile every *.schema.json with AJV
npm run validate-samples    # Validate every JSON sample against its declared $schema
```

There is no test runner, no lint, no build step. Validation is the whole CI surface.

## Local-only tooling (workspace/)

The `workspace/` directory is gitignored. It holds developer tooling and reference material that isn't part of the committed contract with consumers:

- `workspace/scripts/build-glossary.js` — regenerates `workspace/docs/example-glossary.md` from the BSP D23B vendor cache and the current schema.
- `workspace/scripts/extract-data-elements.js` — parses `workspace/docs/live-animals-gap-analysis.table.xhtml` (the Confluence gap analysis) into `workspace/scripts/gbn-ag-data-elements.json`.
- `workspace/scripts/validate-data-elements.js` — checks the data-elements file against the committed schema and the worked example.
- `workspace/docs/` — IPAFFS sample notifications, Defra refdata, in-flight proposal and PR-description drafts.

These run by hand (`node workspace/scripts/<name>.js`), not via npm. Internal path resolution uses `WORKSPACE = resolve(__dirname, "..")` for workspace files and `REPO = resolve(WORKSPACE, "..")` for schemas/samples.

## Validator mechanics worth knowing

- **Two JSON Schema drafts coexist.** Most schemas declare `2020-12`; `event-envelope-v1` declares `draft-07`. Both validators select per-file from the declared `$schema`. New schemas should default to 2020-12 unless there is a reason.
- **External dependencies are vendored on first run.** `scripts/validate-*.js` fetches `UNECE-BasicComponents.json` and `unece-context-D23B.jsonld` into `build/vendor/uncefact/` and reuses them on subsequent runs. `build/` is gitignored, so a fresh clone (or CI) re-fetches. Network must be available the first time.
- **Schemas are registered under multiple aliases.** Each schema is added to AJV under its absolute-from-root path, its path-from-`schemas/`, and its `$id`. This is what lets samples reference schemas by relative path while in-tree `$ref`s use whatever the schema author chose. Don't assume `$id` is the canonical key.
- **Sample `$schema` is a relative file path**, resolved from the sample's directory — not a URL. Every sample must declare it.
- **`@context` check is structural.** When a sample carries `@context`, the validator walks it (including nested local context files) and fails if `https://vocabulary.uncefact.org/unece-context-D23B.jsonld` is not reachable somewhere in the chain.

## Design principle (load-bearing)

**UNVTD + UN/CEFACT vocabulary-first.** JSON Schema defines structure; JSON-LD context maps keys to UN/CEFACT D23B vocabulary IRIs. The repo deliberately does **not** use the older SPSCertificate-nested inheritance pattern as the primary design.

When adding to a profile, prefer extending the canonical core schema (`schemas/core/defra-unvtd-canonical-core-v1.schema.json`) and naming properties to match BSP D23B composite names (with the `Type` suffix dropped). Codelist-bearing properties are typed as open strings — **not** enums — so reference-data changes do not force schema releases. The list a value is drawn from is carried in `schemeId`/`schemeName`/`schemeAgencyName` siblings, not in the schema.

## Schema layering

```
core/      → UNVTD/UN-CEFACT building blocks (the $defs library)
contexts/  → JSON-LD context that maps payload keys to D23B IRIs
profiles/  → Journey-specific schemas (CHED, INTRA, DOCOM, GBN-AG, envelopes)
reference-data/ → Standalone schemas for MDM response shapes
```

A profile is typically: core building blocks + the local context + type-specific constraints. All four profiles (`gbn-ag-v1`, `defra-unvtd-profile-intra-v1`, `defra-unvtd-profile-ched-v1`, `defra-unvtd-profile-docom-v1`) derive from the core's `CertificatePayload` via `allOf` and add their own narrowings / extensions.

## Versioning

- Filenames carry an explicit version suffix: `*-v1.schema.json`, `*-v1.context.jsonld`.
- Breaking changes mint a new version file (`-v2`) rather than rewriting in place. Old versions stay until consumers migrate.
- Git tags track repository releases; they are not the same as schema file versions.

## Migration in flight — read before chasing `$ref` mismatches

The repo is mid-rename. Some schema files still carry transitional `$id` and `$ref` values pointing at legacy paths (e.g. `gbn-ag-v1.schema.json`'s `$id` is `schemas/imports/gbn-ag-v1.schema.json`, not its current location under `schemas/profiles/imports/gb/`). The validator masks this by registering schemas under multiple aliases. **Use the on-disk file location as the source of truth**; if you see a `$ref` or `$id` that doesn't match, it is a known migration artefact, not necessarily a bug. The schemas/README.md "Migration note" section documents this.

## Where to look

- `README.md` — repo entry point, modelling approach, layout.
- `schemas/README.md` — schema directory map, core/context/profile layering, migration note.
- `schemas/profiles/imports/README.md` — UK Import Notification problem statement, IPAFFS → UN/CEFACT mapping patterns, the three TIG team divergences, journey-specific Defra extensions (CPH, BCP, transporter approvals).
- `docs/jsonld-mapping-notes.md` — why the local context exists and the cleanup rule when D23B catches up.
- `CHANGELOG.md` — chronological record of schema/profile/example changes.
- `workspace/docs/example-glossary.md` — generated UN/CEFACT term glossary for the worked example (regenerated by `node workspace/scripts/build-glossary.js`).
- `workspace/docs/core-enrichment-proposal.md` — side-by-side record of core schema enrichments for the TIG joint review.
- `workspace/docs/pr-description.md` — pull-request body draft summarising the GBN-AG work.