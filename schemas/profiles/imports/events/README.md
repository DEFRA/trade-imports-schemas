# Certificate events (sketch for review)

ADR-EUDP-002 envelope events for **TRACES-sourced certificates** (CHED, INTRA/ITAHC, DOCOM) aimed at BTMS, INS retrieve fan-out, and TDS (data lake).

These are **not** a copy of the GBN-AG `Notification*` lifecycle catalogue. TRACES owns certificate lifecycle; Defra systems mainly **observe** snapshots. Status stays on the document (`documentStatusCode` / profile fields). `eventType` names the emission fact.

## Catalogue (v1 sketch)

| Schema | Profile `data` | `aggregateType` | `subType` | `eventType` |
|--------|----------------|-----------------|-----------|-------------|
| [`international/events/ched-event-certificate-updated-v1.schema.json`](../international/events/ched-event-certificate-updated-v1.schema.json) | `defra-unvtd-profile-ched-v1` | `Certificate` | `CHEDA` \| `CHEDP` \| `CHEDPP` \| `CHEDD` | `uk.gov.defra.trade.imports.traces.CertificateUpdated` |
| [`eu/events/intra-event-certificate-updated-v1.schema.json`](../eu/events/intra-event-certificate-updated-v1.schema.json) | `defra-unvtd-profile-intra-v1` | `Certificate` | `INTRA` | same |
| [`eu/events/docom-event-certificate-updated-v1.schema.json`](../eu/events/docom-event-certificate-updated-v1.schema.json) | `defra-unvtd-profile-docom-v1` | `Certificate` | `DOCOM` | same |

`aggregateId` form: `Imports.Certificate.${subType}.${referenceNumber}` (certificate reference from `data.exchangedDocument.identifier`).

## Explicitly out of scope (for now)

- **`CertificateRetrieved`** — same fat `data`; only add if TDS/audit must distinguish REST retrieve from change-feed update.
- **`CertificateSubmitted`** — add when UK write-path via Gateway is a real publisher.
- **GBN-AG-style `NotificationCreated` / `Submitted` / amend / delete** — keep for UK-owned notification journeys under `profiles/imports/gb/events/`.

## Samples

- `samples/imports/international/ched/json/events/ched-event-certificate-updated-v1.json` (wraps existing CHEDPP sample)
- `samples/imports/eu/intra/json/events/intra-event-certificate-updated-v1.json` (wraps existing INTRA sample)
- `samples/imports/eu/docom/json/events/docom-event-certificate-updated-v1.json` (**illustrative** minimal DOCOM — no full profile sample in-repo yet)

## Open questions for review

1. Is a single `CertificateUpdated` enough for TDS, or do we also need `CertificateRetrieved` on every successful gateway retrieve?
2. Confirm FQN namespace `uk.gov.defra.trade.imports.traces.*` (vs `…eudp…` / producer-specific).
3. Should CHED `subType` ever be a single `CHED` with type only inside `data`, or keep the four-way enum (preferred — matches BTMS topic filtering)?
4. When UK journeys later emit **Notification** events for CHED-linked UK supplements, those stay on `aggregateType: Notification` with journey `subType` — separate from these Certificate events.

## Align with

- [ADR-EUDP-002](https://github.com/DEFRA/trade-imports-documentation/blob/main/docs/systems/EUDP/Architecture%20and%20Development/ADR/ADR-EUDP-002-outbox-event-specification.md)
- TIG SO §4.1.10 aggregate / `subType` mapping
- GBN-AG composition pattern under `gb/events/`
