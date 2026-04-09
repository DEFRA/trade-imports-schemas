# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 09/04/2026

### Added
- Event envelope v1 schema (generic event infrastructure for all journeys)
- Common domain v1 schema (shared types across all import journeys)
- IMPv2 domain v1 schema (live animals specific types)
- IMPv2 NotificationCreated event schema (draft notification creation)
- IMPv2 NotificationSubmitted event schema (notification submission)
- Schema validation script with comprehensive test coverage
- Sample event validation script with naming convention enforcement
- Complete sample events for IMPv2 created and submitted
- Document type restriction pattern using allOf composition

### Design Decisions
- **Schema naming convention**: Journey-prefixed naming (e.g., `impv2-v1`, `common-v1`) for clarity and scalability
- **Event schema naming**: Journey-specific event schemas (e.g., `impv2-event-created-v1`) to explicitly indicate journey ownership
- **Type safety pattern**: Inline document type restriction at point-of-use rather than pre-categorized discriminated unions
  - Common layer remains journey-agnostic with single DocumentType enum
  - Journey schemas restrict to valid subset using allOf composition
  - Provides schema-enforced type safety without artificial categorization
  - Example: VeterinaryInformation.accompanyingDocuments restricts to animal-relevant document types only
- **No facade re-exports**: Event schemas reference common types directly for clear ownership and reduced boilerplate

### Technical Details
- JSON Schema draft-07 specification
- 4-layer architecture: Infrastructure → Common → Journey → Event
- Flat file structure (no directories) - sufficient for current scale
- All schemas include $id URLs for AJV registry resolution
- Complete event samples required (not just data payloads)

### Validation
- All schemas validated against draft-07 metaschema
- Cross-reference resolution verified
- Sample events validated against their respective schemas
- Naming convention: `{journey}-notification-{event}-v{version}.json`

[Unreleased]: https://github.com/DEFRA/trade-imports-schemas/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/DEFRA/trade-imports-schemas/releases/tag/v1.0.0
