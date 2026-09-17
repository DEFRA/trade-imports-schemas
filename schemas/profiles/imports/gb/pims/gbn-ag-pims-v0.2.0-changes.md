# `gbn-ag-pims` v0.1.0 → v0.2.0 changes

`gbn-ag-pims-v0.1.0.schema.json` mirrors what `trade-imports-dynamics-gateway` currently
serialises to PIMS — a point-in-time snapshot of the code, not a contract. v0.2.0 breaks
that pattern deliberately: it's a **target** shape, minted ahead of the mapper code, so it
can be shared with the PIMS team for confirmation before `trade-imports-dynamics-gateway`
is changed to match it ([EUDPA-370](https://eaflood.atlassian.net/browse/EUDPA-370)).
v0.1.0 is unchanged and still valid for any consumer pinned to it.

Full field-by-field evidence for why each field below was ever dropped lives in
[`docs/analysis/gbn-ag-field-lineage.md`](https://github.com/DEFRA/trade-imports-workspace/blob/main/docs/analysis/gbn-ag-field-lineage.md)
§3, in the `trade-imports-workspace` repo. This document is the local, schema-adjacent
record of what changed and why — read the analysis doc for the wider three-hop
investigation (frontend → aggregate → generic GBN-AG → this PIMS event) that EUDPA-370 is
the last part of.

## Fields added in v0.2.0

Every field below existed on the generic `gbn-ag-v1.schema.json` already; PIMS never
received it because `trade-imports-dynamics-gateway`'s mappers dropped it (each PIMS
Java record carries its own `// … omitted (PR #52)` comment naming the field).

| PIMS schema path | What's new | Why it was missing / why this shape |
|---|---|---|
| `exchangedDocument.referenceDocument[]` | New array — accompanying documents (`typeCode`, `identifier`, `issueDateTime`) | Dropped entirely. Shape is deliberately the 3 sub-fields `pims-data-mapping.md` confirms PIMS needs ("Accompanying Document: Type/Reference/Date of Issue"), not the fuller core `ReferencedDocument` (`relationshipTypeCode`, attachments) |
| `*Party.partyRoleCode` (all 6 party slots) | New `codedValue` field | Dropped for every party role |
| `*Party.definedContact[]` (all 6 party slots) | New array — `personName`, `emailURIUniversalCommunication`, `telephoneUniversalCommunication` | Dropped for every party role |
| `*Address.postcodeCode`, `countryName`, `countrySubDivisionName` | New string fields | Dropped from every address |
| `originCountry.subordinateTradeCountrySubDivision` | New — region of origin, `{ identifier, urlId, functionTypeCode: { content } }` | Whole region-subdivision concept was unused. Shape is deliberately narrower than the generic core def: `trade-imports-animals-backend`'s `TradeCountrySubDivision.regionOfOrigin()` only ever constructs the region-of-origin case (`functionTypeCode` `"106"`) and has no `activityAuthorizedParty` field at all — so that part of the generic shape isn't modelled here. `functionTypeCode` is kept (not hardcoded away) as forward-compatible plumbing for any future non-animal journey through this same schema/mapper path |
| `codedValue.name` | New string field | Dropped everywhere a coded value appears |
| `unloadingBaseportLocation.urlId`, `name`, `typeCode`, `postalAddress` | New fields on the shared `logisticsLocation` def | Only `identifier` (port code) survived before |
| `mainCarriageLogisticsTransportMovement[].identifier`, `urlId`, `transportContractRelatedReferencedDocument[]` | New fields | Dropped, including the referenced-document list |
| `mainCarriageLogisticsTransportMovement[].arrivalEvent[].actualOccurrenceDateTime`, `occurrenceLogisticsLocation` | New fields | Only the scheduled time survived before |
| trade line `description[]`, `scientificName`, `commonName` | New fields (array-of-strings, string, string) | Hardcoded null upstream until [EUDPA-369](https://eaflood.atlassian.net/browse/EUDPA-369) threads `commodity.name`/`species[].value`/`text` through the generic event. Deliberately **excludes** `typeCode`/`urlId` — those stay null by design, resolved from CN-code reference data downstream rather than sourced from the notification |
| trade line `applicableClassification` | Changed from a single object to an array (`minItems: 1`) | The backend currently always produces exactly one; the generic schema already models it as a list |
| `applicableClassification.systemName`, `className[]` | New fields | Dropped from classification |
| `specifiedLineTradeDelivery[].productUnitQuantity.unitCode` | New string field | Always null before, though the generic schema requires it (`H87`/`KGM`) |
| `physicalReferencedLogisticsPackage[].levelCode`, `typeCode` | New fields | Only item quantity survived before |
| `individualTradeProductInstance[].name`, `permanentLocation` | New fields — `name` (string, `maxLength: 58`), `permanentLocation` (full `tradeParty`: name, address, contacts) | Permanent address dropped a second time, independently of the earlier frontend-side drop. `permanentLocation` reuses the full party shape, not an address-only one, matching the generic schema |
| `individualTradeProductInstance[].identifier[].urlId` | New string field | Dropped from every animal identifier |
| `specifiedConsignment.finalDestinationLocation` | New — reuses the same (now-extended) `logisticsLocation` def as `unloadingBaseportLocation` | No PIMS destination existed at all for the CPH number until EUDPA-369 added `finalDestinationLocation` to the generic event. No new, richer def and no `required` array: `trade-imports-animals-backend`'s `LogisticsLocation.cph()` only ever sends `identifier`+`urlId` — its own comment notes the generic schema requires a postal address here too, but nothing collected says which address belongs to the holding, so it's left unset. Matching what's actually sent, not the generic schema's `required: [identifier, urlId, postalAddress]` |
| `specifiedConsignment.transitTradeCountry[]` | New array of `tradeCountry` | Dropped entirely; only became non-moot once EUDPA-369 wired `transport.transitedCountries` through on the generic side |

## Explicitly not added in v0.2.0

- **`exchangedDocument.issuer`** (Responsible Person for Load / Contact Address) — needs
  its own follow-up ticket. No frontend source field exists yet for the organisation half
  (Responsible Person for Load), and the Contact Address half targets the same `issuer`
  object, so the two need to ship together rather than half-populate `issuer`. See the
  EUDPA-369 comment thread (2026-09-14) and analysis doc §2.
- **Trade line `typeCode`, `urlId`** — stay null by design (CN-code reference-data
  resolution downstream), not a notification-sourced field.
- **Species id, Weight, Transporter Status, Species Family/Class/Type Name** — no generic
  schema slot exists for any of these yet. Adding them here would be inventing PIMS scope
  ahead of the generic schema; see analysis doc §4 point 3.

## Comments for future reference

Things worth raising when this schema goes to the PIMS team for confirmation, or
revisiting once the mapper-code phase starts — not blockers to publishing v0.2.0 itself:

- **`referenceDocument[]` sub-fields are deliberately minimal.** Only `typeCode`,
  `identifier`, `issueDateTime` are modelled — the three `pims-data-mapping.md` actually
  confirms. The fuller core `ReferencedDocument` shape (`relationshipTypeCode`,
  `attachmentBinaryObject`, `information[]`) was left out rather than added speculatively.
  Easy to extend later if PIMS asks for more; JSON Schema additions are additive, not
  breaking.
- **Is the `applicableClassification` array itself PIMS-confirmed, or just inferred?**
  The Java mapper's comment says the backend "always produces exactly one" — today's
  implementation constraint, not necessarily a PIMS-side limit. Worth a direct question
  in the confirmation round rather than assuming PIMS is happy to receive more than one.
- **`usedLogisticsTransportMeans` (vessel/vehicle name) still sits alongside the new
  `identifier`/`urlId` transport-identification fields.** A prior, unrelated commit
  (`fa05fb7`, "Drop orphan usedLogisticsTransportMeans; fold TRACES means name into
  identifier") already retired the equivalent field from the core/DOCOM side of this repo
  in favour of `identifier`+`urlId`. Once the mapper-code phase populates those on the
  PIMS side too, `usedLogisticsTransportMeans` is a strong candidate for the same
  retirement — not done here, since removing an existing field is a separate, breaking
  decision outside this schema-minting step's scope.
- **The generic schema's own `finalDestinationLocation` `required` array
  (`identifier`, `urlId`, `postalAddress`) is already inconsistent with what
  `trade-imports-animals-backend` sends** (identifier+urlId only — see the table row
  above). Not introduced by this change, and not this ticket's job to fix, but worth
  flagging to whoever owns the generic schema next time it's touched.
- **Comment mechanism:** each `$def` above carries its "New in v0.2.0" note in its JSON
  Schema `description`, not the `$comment` keyword. `$comment` has zero precedent
  anywhere else in this repo, so `description` was used to stay consistent with every
  other schema here — confirm this reading of "per-field-group comments" is what was
  wanted before treating it as settled convention for future version bumps.
