# `gbn-ag-pims` v0.3.0 → v0.4.0 changes

v0.4.0 matches v0.3.0 except it does not define `exchangedDocument.issuer`. The live
animals journey no longer has a contact address page, so notifications carry no
consignment contact to map.

v0.1.0, v0.2.0 and v0.3.0 are unchanged and are still published alongside v0.4.0: each
event is sent once per version, and `metadata.schemaVersion` says which one a message is.

The schema is [`gbn-ag-pims-v0.4.0.schema.json`](gbn-ag-pims-v0.4.0.schema.json).

## Fields removed in v0.4.0

| PIMS schema path | Why |
|---|---|
| `exchangedDocument.issuer` | The contact address page is out of the live animals journey, so no consignment contact is stored and nothing populates issuer |

## Confirmation status

Not yet confirmed by PIMS.