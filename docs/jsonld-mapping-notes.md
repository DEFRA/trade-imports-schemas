# JSON-LD Mapping Notes (EU UNVTD Profiles)

This note explains why `schemas/contexts/defra-unvtd-core-v1.context.jsonld` exists and how it should evolve.

## Current approach

- Base context: `https://vocabulary.uncefact.org/unece-context-D23B.jsonld`
- Local extension (protected) follows UNVTD-style scaffolding and adds:
  - JSON-LD prelude (`@version`, `id`, `type`, `xsd`, `schema`, `unece`)
  - Class/type aliases used in profile docs (`ExchangedDocument`, `Consignment`, `TradeParty`, `Authentication`)
  - Optional ergonomic aliases (`consignor`, `consignee`) mapped to UNECE properties
  - Defra profile aliases for the two missing BSP root keys:
  - `exchangedDocument` -> `defraUnvtdProfile:exchangedDocument`
  - `specifiedConsignment` -> `defraUnvtdProfile:specifiedConsignment`

## Why this extension exists

The D23B JSON-LD context defines many UNECE terms and classes, including `ExchangedDocument` and `Consignment` (PascalCase class/type aliases), but does not currently declare the BSP-style root property keys `exchangedDocument` and `specifiedConsignment` (camelCase).

To avoid minting unofficial `unece:` terms while keeping the TRACES-oriented payload shape stable, those two keys are mapped in a Defra profile namespace.

## Important distinction

- `Consignment` is a class/type alias.
- `specifiedConsignment` is a property key used at document/root assembly level.

These are different roles (type vs edge/property), so one does not replace the other.

## Alignment goals

- Keep payloads transform-friendly for TRACES round-tripping.
- Keep value typing aligned with UNECE D23B context (`xsd:string`, `@vocab`, `@id` semantics).
- Keep local aliases minimal and explicit.

## Future cleanup rule

If UNECE publishes official D23B mappings for `exchangedDocument` and `specifiedConsignment`, remove the two Defra aliases from `defra-unvtd-core-v1.context.jsonld` and use the official context directly.

## How the data dictionary generator merges `allOf`

`scripts/data-dictionary/schema-walker.js` flattens a profile that overlays core `$defs` through `allOf`.

- When two `allOf` branches give a property the same key, the generator wraps them in one `allOf` so the next pass merges both shapes. Keeping only the later one would drop the core `$ref` shape that a profile narrowing sits on top of.
- A branch that gives a property the schema `false` forbids it. The property is removed and stays out when a later branch adds it again.
- The later branch's description replaces the earlier one. The shape is still merged.
- For `minItems` and `maxItems` the stricter bound wins.
