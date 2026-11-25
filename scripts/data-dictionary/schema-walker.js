#!/usr/bin/env node
/**
 * Walk a JSON Schema starting from a root file, producing a property tree
 * plus an inventory of every `$def` reached along the way. Resolves `$ref`
 * across files, merges `allOf` branches, surfaces `oneOf` alternatives.
 *
 * Designed for the GBN-AG profile schema, which composes the canonical
 * UNVTD core via `allOf` and references `$defs` from both files. The
 * resolver handles two `$ref` forms:
 *
 *   - "#/$defs/X"                     - same file
 *   - "defra-unvtd-canonical-core-v1.schema.json#/$defs/X" - the core, by its $id
 *
 * The cross-file form is resolved by matching the trailing
 * `#/$defs/<name>` against the core `$defs`. The walker never fetches
 * arbitrary URLs - only the two files passed in.
 *
 * Output shape:
 *
 *   {
 *     root: Node,                    // top-level structure of the profile
 *     defs: Map<string, Node>        // every $def reached, name -> Node
 *   }
 *
 * Where Node carries:
 *
 *   {
 *     name:           string|null     // property name (null on root / array items)
 *     path:           string          // dotted JSON path ("specifiedConsignment[].importer.identifier")
 *     type:           string|null     // "object" | "array" | "string" | "number" | "boolean" | "integer"
 *     description:    string|null
 *     required:       boolean         // computed from parent's required[]
 *     properties:     Map<string, Node>   // for objects
 *     items:          Node|null        // for arrays
 *     oneOfBranches:  Array<{type, description}>  // when slot has multiple shapes
 *     schemaDef:      string|null     // $def name this node came from (cross-cutting types)
 *     codelistConst:  string|null     // value of sibling urlId const, if constrained
 *   }
 */

import { readFileSync } from "node:fs";

const DEPTH_LIMIT = 25;

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function refDefName(ref) {
  const m = String(ref || "").match(/#\/\$defs\/([^/]+)$/);
  return m ? m[1] : null;
}

function resolveRef(ref, profile, core) {
  const name = refDefName(ref);
  if (!name) return null;
  if (profile.$defs && profile.$defs[name]) {
    return { schema: profile.$defs[name], defName: name, source: "profile" };
  }
  if (core.$defs && core.$defs[name]) {
    return { schema: core.$defs[name], defName: name, source: "core" };
  }
  return null;
}

function mergeBranchProperty(out, key, schema, excludedProperties) {
  if (schema === false) {
    delete out.properties[key];
    excludedProperties.add(key);
    return;
  }
  if (excludedProperties.has(key)) return;
  out.properties[key] = out.properties[key] ? { allOf: [out.properties[key], schema] } : schema;
}

function flatten(node, profile, core, depth = 0, seenRefs = new Set()) {
  if (!node || typeof node !== "object" || depth > DEPTH_LIMIT) {
    return { type: null, properties: {}, items: null, required: [], description: null, oneOfBranches: null, schemaDef: null };
  }

  if (node.$ref) {
    const resolved = resolveRef(node.$ref, profile, core);
    if (!resolved) {
      return { type: null, properties: {}, items: null, required: [], description: `(unresolved $ref ${node.$ref})`, oneOfBranches: null, schemaDef: null, constValue: null };
    }
    if (seenRefs.has(resolved.defName)) {
      return { type: null, properties: {}, items: null, required: [], description: null, oneOfBranches: null, schemaDef: resolved.defName, constValue: null };
    }
    const inner = flatten(resolved.schema, profile, core, depth + 1, new Set([...seenRefs, resolved.defName]));
    inner.schemaDef = resolved.defName;
    if (node.description) {
      inner.description = node.description;
    } else if (!inner.description && resolved.schema.description) {
      inner.description = resolved.schema.description;
    }
    return inner;
  }

  const out = {
    type: node.type || null,
    properties: {},
    items: null,
    required: Array.isArray(node.required) ? [...node.required] : [],
    description: node.description || null,
    oneOfBranches: null,
    schemaDef: null,
    codelistConst: null,
    constValue: null,
    minItems: typeof node.minItems === "number" ? node.minItems : null,
    maxItems: typeof node.maxItems === "number" ? node.maxItems : null
  };

  if (node.const !== undefined) {
    out.constValue = node.const;
    if (!out.type && typeof node.const === "string") out.type = "string";
  }

  if (node.properties) {
    for (const [k, v] of Object.entries(node.properties)) {
      out.properties[k] = v;
    }
  }
  if (node.items) {
    out.items = node.items;
  }
  if (node.const && (typeof node.const === "string") && /^https?:\/\//.test(node.const)) {
    out.codelistConst = node.const;
  }

  if (Array.isArray(node.allOf)) {
    const excludedProperties = new Set();
    for (const branch of node.allOf) {
      const inner = flatten(branch, profile, core, depth + 1, seenRefs);
      if (inner.type) out.type = inner.type;
      for (const [k, v] of Object.entries(inner.properties)) {
        mergeBranchProperty(out, k, v, excludedProperties);
      }
      if (inner.items) {
        out.items = out.items ? { allOf: [out.items, inner.items] } : inner.items;
      }
      for (const r of inner.required) {
        if (!out.required.includes(r)) out.required.push(r);
      }
      if (inner.description) out.description = inner.description;
      if (inner.schemaDef && !out.schemaDef) out.schemaDef = inner.schemaDef;
      if (inner.constValue !== null && inner.constValue !== undefined && out.constValue === null) {
        out.constValue = inner.constValue;
      }
      if (inner.codelistConst && !out.codelistConst) {
        out.codelistConst = inner.codelistConst;
      }
      if (typeof inner.minItems === "number") {
        out.minItems = out.minItems === null ? inner.minItems : Math.max(out.minItems, inner.minItems);
      }
      if (typeof inner.maxItems === "number") {
        out.maxItems = out.maxItems === null ? inner.maxItems : Math.min(out.maxItems, inner.maxItems);
      }
    }
  }

  if (Array.isArray(node.oneOf)) {
    const branches = [];
    for (const branch of node.oneOf) {
      const inner = flatten(branch, profile, core, depth + 1, seenRefs);
      branches.push({
        type: inner.type,
        description: inner.description,
        items: inner.items,
        schemaDef: inner.schemaDef,
        properties: inner.properties
      });
      for (const [k, v] of Object.entries(inner.properties)) {
        if (!out.properties[k]) out.properties[k] = v;
      }
      if (inner.items && !out.items) out.items = inner.items;
    }
    out.oneOfBranches = branches;
    const types = [...new Set(branches.map(b => b.type).filter(Boolean))];
    if (types.length === 1) out.type = out.type || types[0];
    else if (types.length > 1) out.type = "oneOf";
  }

  if (Array.isArray(node.anyOf)) {
    for (const branch of node.anyOf) {
      const inner = flatten(branch, profile, core, depth + 1, seenRefs);
      for (const [k, v] of Object.entries(inner.properties)) {
        if (!out.properties[k]) out.properties[k] = v;
      }
    }
  }

  if (node.then && typeof node.then === "object") {
    const inner = flatten(node.then, profile, core, depth + 1, seenRefs);
    if (inner.description || Object.keys(inner.properties).length > 0) {
      const note = "Carries an additional conditional clause when applicable.";
      out.description = out.description ? `${out.description} ${note}` : note;
    }
  }

  return out;
}

function buildNode(flat, name, path, requiredFromParent, profile, core, trackDef, depth = 0) {
  const required = requiredFromParent ? requiredFromParent.includes(name) : false;

  const node = {
    name: name || null,
    path,
    type: flat.type,
    description: flat.description,
    required,
    properties: new Map(),
    items: null,
    oneOfBranches: flat.oneOfBranches,
    schemaDef: flat.schemaDef,
    codelistConst: flat.codelistConst,
    constValue: flat.constValue,
    minItems: flat.minItems,
    maxItems: flat.maxItems
  };

  if (flat.schemaDef) {
    trackDef(flat.schemaDef);
  }

  if (depth < DEPTH_LIMIT) {
    for (const [propName, propSchema] of Object.entries(flat.properties || {})) {
      const propFlat = flatten(propSchema, profile, core, depth + 1);
      const childPath = path ? `${path}.${propName}` : propName;
      const child = buildNode(propFlat, propName, childPath, flat.required, profile, core, trackDef, depth + 1);
      if (propName === "urlId" && propFlat.codelistConst) {
        node.codelistConst = node.codelistConst || propFlat.codelistConst;
      }
      node.properties.set(propName, child);
    }
  }

  if (flat.items && depth < DEPTH_LIMIT) {
    const itemsFlat = flatten(flat.items, profile, core, depth + 1);
    const itemsPath = `${path}[]`;
    node.items = buildNode(itemsFlat, null, itemsPath, [], profile, core, trackDef, depth + 1);
  }

  return node;
}

export function walkSchema({ profilePath, corePath }) {
  const profile = loadJson(profilePath);
  const core = loadJson(corePath);

  const referencedDefs = new Set();
  const trackDef = (name) => referencedDefs.add(name);

  const rootFlat = flatten(profile, profile, core, 0);
  const rootNode = buildNode(rootFlat, "(root)", "", [], profile, core, trackDef, 0);

  const defNodes = new Map();
  const visitedDefs = new Set();
  const queue = [...referencedDefs];
  while (queue.length > 0) {
    const defName = queue.shift();
    if (visitedDefs.has(defName)) continue;
    visitedDefs.add(defName);

    const profileDef = profile.$defs && profile.$defs[defName];
    const coreDef = core.$defs && core.$defs[defName];
    const defSchema = profileDef || coreDef;
    if (!defSchema) continue;
    const defSource = profileDef ? "profile" : "core";

    const localTrack = (name) => {
      if (!visitedDefs.has(name)) queue.push(name);
    };
    const defFlat = flatten(defSchema, profile, core, 0);
    const defNode = buildNode(defFlat, defName, "", [], profile, core, localTrack, 0);
    defNode.source = defSource;
    defNodes.set(defName, defNode);
  }

  return { root: rootNode, defs: defNodes };
}
