# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 09/04/2026 WIP Proposal

### Added
- Event envelope v1 schema (generic event infrastructure for all journeys)
- Common domain v1 schema (shared types across all import journeys)
- IMPv2 Event domain v1 schema (live animals specific types)
- IMPv2 Event NotificationCreated schema (draft notification creation)
- IMPv2 Event NotificationSubmitted schema (notification submission)
- Sample events for IMPv2 created and submitted
- Document type restriction 

### Decisions
- **Schema naming convention**: Journey-prefixed naming (e.g., `impv2-v1`, `common-v1`) 
- **Event schema naming**: Journey-specific event schemas (e.g., `impv2-event-created-v1`) to indicate journey ownership
- **Type safety pattern**: Inline document type restriction at point-of-use
  - Common Event schema remains journey-agnostic with single DocumentType enum
  - Journey schemas restrict to valid subset(s) using allOf composition


[Unreleased]: https://github.com/DEFRA/trade-imports-schemas/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/DEFRA/trade-imports-schemas/releases/tag/v1.0.0
