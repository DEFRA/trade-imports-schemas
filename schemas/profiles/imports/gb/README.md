# GBN-AG profile

GBN-AG (GB Notification for Animals and Germinals) is the pre-notification an importer submits before live animals or germinal products (semen, embryos, ova) arrive in Great Britain. This directory holds the payload schema, the events raised as a notification moves through its lifecycle, and the documentation for both.

The payload schema derives from the canonical core's `CertificatePayload` (`schemas/core/defra-unvtd-canonical-core-v1.schema.json`). Property names follow UN/CEFACT Buy-Ship-Pay (BSP) D23B; the JSON-LD context `schemas/contexts/defra-unvtd-gbn-ag-v1.context.jsonld` maps them to D23B vocabulary IRIs.

## Contents

| Path | What it is |
|---|---|
| `gbn-ag-v1.schema.json` | The GBN-AG payload: one notification, from the document header down to individual animals. |
| [`gbn-ag-data-dictionary.md`](gbn-ag-data-dictionary.md) | Every payload property with its type, whether it is required, and a plain-English description. Generated - see below. |
| `events/` | One schema per lifecycle event. |
| [`gbn-ag-state-transitions.md`](gbn-ag-state-transitions.md) | The notification lifecycle: states, the event each transition emits, and where event identity, event order and document state are carried. |
| `pims/` | Versioned schemas for the GBN-AG event as published to PIMS, a downstream consumer. |
| [`pims-data-mapping.md`](pims-data-mapping.md) | Maps each field of the Defra "Live Animals Data Fields - V4" specification to its schema path and to the PIMS team's draft mapping. Maintained by hand. |
| [`gbn-ag-v4-data-update-runbook.md`](gbn-ag-v4-data-update-runbook.md) | How to re-align the schema when the V4 specification changes. |

Samples live under `samples/imports/gb/gbn-ag/json/`: worked payload examples at the top level, one sample per event in `events/`, and one per PIMS version in `pims/`.

## Data dictionary

[`gbn-ag-data-dictionary.md`](gbn-ag-data-dictionary.md) is the reference for what each payload property means. It is generated, so edit the schema rather than the dictionary.

```bash
npm run build-dictionary:gbn-ag
```

The generator, `scripts/build-data-dictionary.js`, works through these steps:

1. Walks `gbn-ag-v1.schema.json`, following `$ref`s into the canonical core, to list every property with its type and whether it is required.
2. Takes each description from the schema's own `description` field. Where the schema has none, it resolves the property name through the JSON-LD context chain (GBN-AG context, Defra core context, D23B context) and uses the UN/CEFACT D23B vocabulary definition.
3. Lists property names declared only in a Defra context, rather than in D23B, in a closing section that names the declaring context file.

The D23B context and vocabulary are downloaded from `https://vocabulary.uncefact.org/` into `build/vendor/uncefact/` on first run, so the first run needs network access. The section layout and introductions are configured in `scripts/data-dictionary/dictionary-main-template.js`. Running the generator twice produces an identical file.

Run it after every change to `gbn-ag-v1.schema.json` or the canonical core; the dictionary is stale until you do.

## Events

Each lifecycle event has its own schema in `events/`, named `gbn-ag-event-notification-<event>-v1.schema.json`, with a matching sample in `samples/imports/gb/gbn-ag/json/events/`. [`gbn-ag-state-transitions.md`](gbn-ag-state-transitions.md) documents which transition emits which event.

Every event schema extends the shared envelope, `schemas/profiles/imports/messaging/event-envelope-v1.schema.json`. What sits in the envelope's `data` depends on the stage:

| Events | `data` carries |
|---|---|
| `NotificationCreated`, `NotificationDeleted` (draft stage) | A partial payload: the notification `identifier` and `notificationStatusCode`, plus, on created, the origin country and at least one commodity classification. Built from `gbn-ag-v1.schema.json`'s `$defs`. |
| `NotificationSubmitted`, `NotificationAmendmentRequested`, `NotificationSubmissionAmended`, `NotificationAmendmentCancelled`, `NotificationSubmissionDeleted` | The full payload, validated against `gbn-ag-v1.schema.json`, with the event's required `notificationStatusCode` and `versionId` values. |

`events/` also holds `NotificationEdited`, which is internal to the Import Notification Service (INS) and not available to consumers outside it. See [Internal event: `NotificationEdited`](gbn-ag-state-transitions.md#internal-event-notificationedited).

The envelope's `eventType` is shared with other journeys' events, so consumers identify a GBN-AG event by the `(eventType, subType)` pair, with `subType` `GBN-AG`. See the [imports README](../README.md).

## Versioning

A GBN-AG event carries several values that look like version numbers. Each tracks something different.

| Value | Where it sits | What it tracks |
|---|---|---|
| `versionId` | `data.exchangedDocument` | Revision number of the notification document. Absent while the notification is a draft, `1` on first submission, and incremented each time an amendment is re-submitted. |
| `aggregateVersion` | Envelope | Position of the event in the notification's event stream. Increases by one with every event, whatever its type, including `NotificationEdited`. Consumers outside INS do not receive `NotificationEdited`, so they see gaps in the sequence. Use it for ordering, not as a count of events received. |
| `metadata.schemaVersion` | Envelope | Structural version of the event schema the message conforms to, written `MAJOR.MINOR.PATCH`. |
| `metadata.schemaUri` | Envelope | Location of that event schema in this repository. |
| `$model` | `data` | Fixed value `defra/certificate-internal/1`. It is a `const` in `gbn-ag-v1.schema.json` and in each draft-stage event schema, so every GBN-AG payload carries the same value. |

`versionId` and `aggregateVersion` move independently. Re-opening a submitted notification for amendment emits a new event, so `aggregateVersion` goes up, but `versionId` stays the same until the amendment is re-submitted. The transitions table in [`gbn-ag-state-transitions.md`](gbn-ag-state-transitions.md) shows the `versionId` for each event.

`metadata.schemaVersion` and `metadata.schemaUri` describe the event schema as a whole, not `gbn-ag-v1.schema.json` on its own.

**Version numbers in file names.** Schema file names carry the major version (`-v1`). A breaking change produces a new file (`-v2`) alongside the old one, which stays until consumers have migrated. The samples for the `-v1` event schemas carry `schemaVersion` `1.0.0`.

**PIMS consumer schemas.** The schemas in `pims/` carry the full version in the file name (`gbn-ag-pims-v0.2.0.schema.json`), and their samples carry the matching `schemaVersion` (`0.2.0`). Each PIMS version is a separate file, minted independently of changes to `gbn-ag-v1.schema.json`. Earlier versions remain for consumers pinned to them.
