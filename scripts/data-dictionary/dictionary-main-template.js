#!/usr/bin/env node
/**
 * Per-profile configuration for the data-dictionary generator.
 *
 * Each entry names a profile (CLI argument) and provides:
 *
 *   profileSchema   - the JSON Schema to walk
 *   coreSchema      - the canonical core schema referenced via $ref
 *   profileContext  - the profile-level JSON-LD context (which inherits the
 *                     core context and D23B in turn)
 *   defraVocabulary - the Defra-side rdf:Property vocabulary that documents
 *                     Defra extensions and rebindings
 *   notesPath       - per-path narrative sidecar (optional - missing file
 *                     is treated as no notes)
 *   outputPath      - committed dictionary markdown destination
 *   title, intro    - lead lines of the generated markdown
 *   sections        - ordered list of payload-level tables. Each section has:
 *                       heading      - section heading text
 *                       payloadPath  - human-readable path shown after the
 *                                      heading
 *                       descend      - array of steps from the root Node to
 *                                      the table's parent Node; each step is
 *                                      { kind: "prop", name } or { kind: "items" }
 *                       intro        - section intro paragraph
 *
 * Add a profile by adding an entry. The generator reads its config by name
 * (positional arg) and runs the same pipeline for any profile.
 */

const GBN_AG = {
  profileSchema:   "schemas/profiles/imports/gb/gbn-ag-v1.schema.json",
  coreSchema:      "schemas/core/defra-unvtd-canonical-core-v1.schema.json",
  profileContext:  "schemas/contexts/defra-unvtd-gbn-ag-v1.context.jsonld",
  defraVocabulary: "schemas/contexts/defra-unvtd-profile-vocabulary.jsonld",
  outputPath:      "schemas/profiles/imports/gb/gbn-ag-data-dictionary.md",

  title: "GBN-AG data dictionary",
  intro: [
    "Maps every property in the GBN-AG live-animals pre-notification payload to a plain-English description.",
    "",
    "Descriptions come from the GBN-AG schema's own `description` fields (the live-animals domain), falling back to the UN/CEFACT D23B vocabulary (`uncefact.jsonld`) via the JSON-LD context chain where the schema is silent. The canonical UN/CEFACT meaning is always reachable as linked data from the property's IRI. Property names that resolve only to a Defra context - Defra extensions, profile-level slots - are listed in a separate section at the end with the context file that declares them.",
    "",
    "Sections follow the payload's natural structure: Document, Consignment, Consignment item, Trade line item, Trade product, Per-animal. Each row identifies its type; where the value reuses a shared shape (`TradeParty`, `LogisticsLocation`, `IncludedNote`, ...) the type cell carries the `$def` name."
  ].join("\n"),

  sections: [
    {
      heading: "Document",
      payloadPath: "exchangedDocument",
      descend: [{ kind: "prop", name: "exchangedDocument" }],
      intro: "Carried at the top of every GBN-AG payload. Identifies the pre-notification, who issued it, what authentication and reference documents accompany it. Fields such as functionCode are complementary to the event specification (see [state transitions](gbn-ag-state-transitions.md))."
    },
    {
      heading: "Consignment",
      payloadPath: "specifiedConsignment",
      descend: [{ kind: "prop", name: "specifiedConsignment" }],
      intro: "One consignment per payload. Carries the parties (consignor, consignee, delivery, importer, despatch, carrier), the transport movement(s), the regulatory procedure, the package count, and the destination."
    },
    {
      heading: "Consignment item",
      payloadPath: "specifiedConsignment.includedConsignmentItem[]",
      descend: [
        { kind: "prop", name: "specifiedConsignment" },
        { kind: "prop", name: "includedConsignmentItem" }, { kind: "items" }
      ],
      intro: "Groups trade line items. A live-animals consignment has one consignment item; the consignment item carries the trade lines."
    },
    {
      heading: "Trade line item",
      payloadPath: "specifiedConsignment.includedConsignmentItem[].includedTradeLineItem[]",
      descend: [
        { kind: "prop", name: "specifiedConsignment" },
        { kind: "prop", name: "includedConsignmentItem" }, { kind: "items" },
        { kind: "prop", name: "includedTradeLineItem" }, { kind: "items" }
      ],
      intro: "One line per species or commodity on the certificate. A line carries the trade product (species), the line quantity, and the per-animal notes."
    },
    {
      heading: "Trade product",
      payloadPath: "specifiedConsignment.includedConsignmentItem[].includedTradeLineItem[].specifiedTradeProduct[]",
      descend: [
        { kind: "prop", name: "specifiedConsignment" },
        { kind: "prop", name: "includedConsignmentItem" }, { kind: "items" },
        { kind: "prop", name: "includedTradeLineItem" }, { kind: "items" },
        { kind: "prop", name: "specifiedTradeProduct" }, { kind: "items" }
      ],
      intro: "One entry per species or commodity on the trade line. Carries the classification, type, common and scientific names, country of origin, and the per-animal instances."
    },
    {
      heading: "Per-animal",
      payloadPath: "specifiedConsignment...individualTradeProductInstance[]",
      descend: [
        { kind: "prop", name: "specifiedConsignment" },
        { kind: "prop", name: "includedConsignmentItem" }, { kind: "items" },
        { kind: "prop", name: "includedTradeLineItem" }, { kind: "items" },
        { kind: "prop", name: "specifiedTradeProduct" }, { kind: "items" },
        { kind: "prop", name: "individualTradeProductInstance" }, { kind: "items" }
      ],
      intro: "One entry per individual animal on the trade line. Carries the animal's identifier(s) and, where the commodity calls for it, the per-animal permanent address."
    }
  ]
};

export const profiles = {
  "gbn-ag": GBN_AG
  // Future: "intra": { ... }, "ched": { ... }, "docom": { ... }, "gbn-p": { ... }
};
