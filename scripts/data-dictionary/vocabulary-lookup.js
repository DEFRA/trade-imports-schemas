#!/usr/bin/env node
/**
 * Index the UN/CEFACT vocabulary file (uncefact.jsonld) by `@id` and answer
 * lookups against expanded IRIs.
 *
 * The vocabulary file is RDF expressed as JSON-LD. It has an `@context` and an
 * `@graph` of class and property definitions. Each property entry looks like:
 *
 *   {
 *     "@id": "uncefact:importerParty",
 *     "@type": "rdf:Property",
 *     "rdfs:comment": "The party who imports this supply chain consignment.",
 *     "rdfs:label": "importerParty",
 *     "schema:domainIncludes": { "@id": "uncefact:Consignment" },
 *     "schema:rangeIncludes": { "@id": "uncefact:Party" },
 *     "uncefact:cefactElementMetadata": [
 *       {
 *         "@id": "cefact:SupplyChain_Consignment.Importer.Trade_Party",
 *         "@type": "uncefact:AssociationBIE",
 *         "uncefact:cefactUNId": "cefact:UN01004217"
 *       }
 *     ]
 *   }
 *
 * The lookup helper accepts either a prefixed name (`uncefact:importerParty`)
 * or a fully expanded IRI; it normalises both to the prefixed form before
 * indexing because the vocabulary file uses prefixed `@id`s natively.
 */

import { readFileSync } from "node:fs";

const UNECE_PREFIX_URL = "https://vocabulary.uncefact.org/";

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

// Normalise an IRI to its prefixed form against the vocabulary file's
// prefix map (which lives in the @context of the vocabulary file). The
// vocabulary file uses `uncefact:` and `cefact:` prefixes natively.
function normaliseToPrefixed(iri, vocabPrefixMap) {
  if (!iri) return null;
  // If already prefixed (no scheme), return as is
  if (!/^https?:\/\//.test(iri)) return iri;
  for (const [prefix, base] of Object.entries(vocabPrefixMap)) {
    if (iri.startsWith(base)) {
      return `${prefix}:${iri.slice(base.length)}`;
    }
  }
  // Not matched: return raw URI (which won't index against the vocabulary file)
  return iri;
}

function extractValue(node) {
  if (!node) return null;
  if (typeof node === "string") return node;
  if (Array.isArray(node)) {
    // Pick first; rdfs:comment is sometimes language-tagged as an array
    return extractValue(node[0]);
  }
  if (typeof node === "object") {
    if (typeof node["@value"] === "string") return node["@value"];
    if (typeof node["@id"] === "string") return node["@id"];
  }
  return null;
}

function extractIdRef(node) {
  if (!node) return null;
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return extractIdRef(node[0]);
  if (typeof node === "object" && typeof node["@id"] === "string") return node["@id"];
  return null;
}

function extractCefactUNId(entry) {
  const metadata = entry["uncefact:cefactElementMetadata"];
  if (!Array.isArray(metadata)) return null;
  // Prefer the BSP entry where present
  const bsp = metadata.find(m => extractValue(m["uncefact:cefactBusinessProcess"]) === "Buy-Ship-Pay");
  const pick = bsp || metadata[0];
  return extractValue(pick["uncefact:cefactUNId"]);
}

export function buildVocabularyLookup({ vocabularyPaths }) {
  // Load every vocabulary file and merge into one index keyed by @id (which
  // each vocab uses in prefixed form natively, e.g. `uncefact:importerParty`
  // and `defraUnvtdProfile:permanentLocation`). Later files override earlier
  // ones on key collision, so pass D23B first and Defra-side overrides last
  // if you want Defra wording to win - in this iteration the two namespaces
  // (uncefact: and defraUnvtdProfile:) do not collide.
  const paths = Array.isArray(vocabularyPaths) ? vocabularyPaths : [vocabularyPaths];

  const vocabPrefixMap = {};
  const index = new Map();

  for (const path of paths) {
    const doc = loadJson(path);
    const ctx = doc["@context"] || {};
    for (const [k, v] of Object.entries(ctx)) {
      if (typeof v === "string") vocabPrefixMap[k] = v;
    }
    if (Array.isArray(doc["@graph"])) {
      for (const entry of doc["@graph"]) {
        if (!entry || typeof entry !== "object") continue;
        const id = entry["@id"];
        if (typeof id !== "string") continue;
        index.set(id, entry);
      }
    }
  }

  // Ensure the unece prefix is present even when a vocab file declares only a
  // slight variant (some vocab files use `uncefact` alone)
  if (!vocabPrefixMap.unece) vocabPrefixMap.unece = UNECE_PREFIX_URL;

  function lookup(iri) {
    const prefixed = normaliseToPrefixed(iri, vocabPrefixMap);
    let entry = index.get(prefixed);
    // Cross-prefix fallback: our local context uses `unece:` while the
    // upstream vocabulary uses `uncefact:` (both resolve to the same base).
    if (!entry && prefixed && prefixed.startsWith("unece:")) {
      const fallback = `uncefact:${prefixed.slice("unece:".length)}`;
      entry = index.get(fallback);
    }
    if (!entry && prefixed && prefixed.startsWith("uncefact:")) {
      const fallback = `unece:${prefixed.slice("uncefact:".length)}`;
      entry = index.get(fallback);
    }
    if (!entry) return null;

    return {
      iri: entry["@id"],
      type: extractIdRef(entry["@type"]),
      rdfsComment: extractValue(entry["rdfs:comment"]),
      rdfsLabel: extractValue(entry["rdfs:label"]),
      domainIncludes: extractIdRef(entry["schema:domainIncludes"]),
      rangeIncludes: extractIdRef(entry["schema:rangeIncludes"]),
      cefactUNId: extractCefactUNId(entry)
    };
  }

  return { lookup, vocabPrefixMap, size: index.size };
}
