#!/usr/bin/env node
/**
 * Resolve a payload property name to its JSON-LD IRI by walking the local
 * context chain (GBN-AG profile context -> Defra core context -> D23B context).
 *
 * Inputs: file paths for each context layer.
 * Output: a resolver { resolve(propertyName) -> { iri, prefix, defraExtension, declaredIn } | null }.
 *
 * Layered semantics: a property's IRI is whichever layer first defines it.
 * If a layer overrides an inherited mapping, the overriding layer's IRI wins.
 * Properties not declared in any layer return null - the markdown emitter
 * treats those as "no JSON-LD binding" (typically profile-level extensions
 * declared in JSON Schema but not in any context).
 *
 * Prefix detection: a term mapped to `unece:foo` is considered D23B-canonical;
 * a term mapped to `defraUnvtdProfile:foo` (or its inherited equivalent) is a
 * Defra extension. The `declaredIn` field carries the bare context-file name
 * the binding was found in, so the dictionary can cite it.
 */

import { readFileSync } from "node:fs";
import { basename, dirname, resolve as resolvePath } from "node:path";

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

// Returns a Map<propertyName, {iri, prefix, declaredIn}> for a single context
// file. If the context file inherits other contexts via string entries, those
// references are returned separately for the caller to recurse into.
function parseContextFile(path) {
  const ctx = loadJson(path);
  const entries = ctx["@context"];
  if (!Array.isArray(entries) && typeof entries !== "object") {
    return { terms: new Map(), inheritedRefs: [], prefixMap: {} };
  }
  const list = Array.isArray(entries) ? entries : [entries];

  const terms = new Map();
  const inheritedRefs = [];
  const prefixMap = {};

  for (const entry of list) {
    if (typeof entry === "string") {
      // Inherited context (either an external URL or a local relative path)
      inheritedRefs.push(entry);
      continue;
    }
    if (typeof entry !== "object" || entry === null) continue;

    // Collect prefix declarations (string -> string entries)
    for (const [k, v] of Object.entries(entry)) {
      if (typeof v === "string") {
        if (!k.startsWith("@")) {
          prefixMap[k] = v;
        }
      }
    }

    // Collect term definitions (string -> object entries with @id)
    for (const [name, value] of Object.entries(entry)) {
      if (typeof value !== "object" || value === null) continue;
      if (!value["@id"]) continue;
      terms.set(name, {
        rawId: value["@id"],
        type: value["@type"] || null,
        container: value["@container"] || null,
        declaredIn: basename(path)
      });
    }
  }

  return { terms, inheritedRefs, prefixMap };
}

function expandIri(rawId, prefixMap, inheritedPrefixMap) {
  const colonIdx = rawId.indexOf(":");
  if (colonIdx < 0) return rawId;
  if (rawId.startsWith("http://") || rawId.startsWith("https://")) return rawId;
  const prefix = rawId.slice(0, colonIdx);
  const local = rawId.slice(colonIdx + 1);
  const expansion = prefixMap[prefix] || inheritedPrefixMap[prefix];
  if (!expansion) return rawId;
  return expansion + local;
}

function classifyPrefix(rawId) {
  const colonIdx = rawId.indexOf(":");
  if (colonIdx < 0) return null;
  return rawId.slice(0, colonIdx);
}

export function buildContextResolver({ profileContextPath, vendoredD23BContextPath }) {
  // Walk profileContextPath, follow inherited refs locally (relative paths);
  // skip external HTTP refs that the D23B vendored file already covers.
  const visited = new Set();
  const layers = [];

  function visit(path) {
    const absolutePath = resolvePath(path);
    if (visited.has(absolutePath)) return;
    visited.add(absolutePath);

    const parsed = parseContextFile(absolutePath);
    layers.push({ path: absolutePath, ...parsed });

    for (const ref of parsed.inheritedRefs) {
      if (ref.startsWith("http://") || ref.startsWith("https://")) {
        // External D23B reference; substitute the vendored file
        if (ref.endsWith("unece-context-D23B.jsonld") && vendoredD23BContextPath) {
          visit(vendoredD23BContextPath);
        }
        continue;
      }
      // Relative path - resolve against the current file's directory
      const inheritedPath = resolvePath(dirname(absolutePath), ref);
      visit(inheritedPath);
    }
  }

  visit(profileContextPath);

  // Compose prefixMap from all layers (later layer wins on collision, which
  // doesn't actually happen with the current Defra contexts because they all
  // share the unece + defraUnvtdProfile prefixes)
  const composedPrefixMap = {};
  for (const layer of layers) {
    Object.assign(composedPrefixMap, layer.prefixMap);
  }

  function resolve(propertyName) {
    for (const layer of layers) {
      if (layer.terms.has(propertyName)) {
        const t = layer.terms.get(propertyName);
        const prefix = classifyPrefix(t.rawId);
        const iri = expandIri(t.rawId, composedPrefixMap, composedPrefixMap);
        const defraExtension = prefix !== "unece" && prefix !== "uncefact";
        return {
          iri,
          rawId: t.rawId,
          prefix,
          defraExtension,
          declaredIn: t.declaredIn,
          type: t.type,
          container: t.container
        };
      }
    }
    return null;
  }

  return { resolve, layers, prefixMap: composedPrefixMap };
}
