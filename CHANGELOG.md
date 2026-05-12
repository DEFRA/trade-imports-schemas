## [Unreleased]

### Added
- `event-envelope-v1` schema - generic transport-layer envelope for all import-journey events.
- `gbn-ag-v1` schema - payload schema for the live-animals journey (GB Notification - Animals and Germinals).
- Worked CHED-A → GBN-AG example payload (`samples/gbn-ag-v1-example.json`).
- Schema validation script - compiles both schemas across draft-07 and 2020-12; fetches and caches the BSP D23B `BasicComponents` external reference on first run.
- Sample validation script - validates the worked example against `gbn-ag-v1`; strips authorial underscore-prefixed keys before validating.

[Unreleased]: https://github.com/DEFRA/trade-imports-schemas/compare/main...HEAD
