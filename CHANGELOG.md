# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- `gbn-ag-event-notification-edited-v1` schema at
  `schemas/profiles/imports/gb/events/gbn-ag-event-notification-edited-v1.schema.json`.
  Emitted when a GBN-AG notification is saved without a lifecycle transition (EUDPA-303).
  Composed with `event-envelope-v1` via `allOf`; `eventType` pinned to
  `uk.gov.defra.trade.imports.animals.NotificationEdited`; `aggregateType` pinned to
  `Notification`; `subType` pinned to `GBN-AG`. Requires consignment-level `originCountry`
  and at least one `applicableClassification`; `notificationStatusCode` is intentionally
  left open (fires across the full lifecycle, not just DRAFT).

- Worked sample at
  `samples/imports/gb/gbn-ag/json/events/gbn-ag-event-notification-edited-v1.json`.
  Represents a partially-complete notification (origin country and one commodity
  classification present, all other fields absent) to demonstrate the optional-by-default
  rule.

### Fixed

- `schemas/profiles/imports/messaging/event-envelope-v1.schema.json`: declared
  `publishedAt` as a required `date-time` property. The backend
  (`OutboxPublishService`) always serialises `publishedAt` onto the wire, but the
  envelope had `"additionalProperties": false` without declaring the field, causing
  every published event to silently fail validation. Required on the wire; the outbox
  entity's `publishedAt` column remains nullable (load-bearing for the unpublished-row
  partial index and the poller query).

- All seven existing `gbn-ag-event-*` samples updated to include `publishedAt` so they
  validate against the corrected envelope.
