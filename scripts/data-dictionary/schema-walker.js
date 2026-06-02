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
 *   - "../../../core/...#/$defs/X"    - sibling file under schemas/
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

// Flatten allOf/oneOf/anyOf/$ref into a single { properties, items, type,
// description, required, oneOfBranches, schemaDef } record. Properties from
// sibling allOf branches that share a key get merged (the later one wins on
// scalar conflicts, deep keys union). schemaDef is set when the node started
// from a $ref; downstream callers use it to decide whether to inline or
// reference.
function flatten(node, profile, core, depth = 0, seenRefs = new Set()) {
  if (!node || typeof node !== "object" || depth > DEPTH_LIMIT) {
    return { type: null, properties: {}, items: null, required: [], description: null, oneOfBranches: null, schemaDef: null };
  }

  // $ref - follow once, mark schemaDef.
  // The OUTER node's `description` (when the property carries its own
  // narrowed description alongside `$ref`) takes priority over the $def's
  // description: it speaks to this slot specifically, not to every reuse of
  // the type.
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

  // A property with const is a fixed-value slot. Surface the const so the
  // dictionary can render it. Infer "string" type when missing.
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

  // allOf - merge each branch into out. When two branches contribute a
  // property with the same key, wrap them together so the next flatten() pass
  // merges both shapes - critical for profile schemas that overlay a $ref
  // (e.g. CertificatePayload) with additional narrowings on the same key
  // (e.g. exchangedDocument). Last-wins would silently drop the $ref'd shape.
  if (Array.isArray(node.allOf)) {
    for (const branch of node.allOf) {
      const inner = flatten(branch, profile, core, depth + 1, seenRefs);
      if (inner.type) out.type = inner.type;
      for (const [k, v] of Object.entries(inner.properties)) {
        if (out.properties[k]) {
          out.properties[k] = { allOf: [out.properties[k], v] };
        } else {
          out.properties[k] = v;
        }
      }
      if (inner.items) {
        out.items = out.items ? { allOf: [out.items, inner.items] } : inner.items;
      }
      for (const r of inner.required) {
        if (!out.required.includes(r)) out.required.push(r);
      }
      // Last-wins on description: a profile narrowing (a later allOf branch)
      // overrides the core/$ref description for that slot. Shape is still merged
      // via the allOf-wrap above, so this only swaps the human description.
      if (inner.description) out.description = inner.description;
      if (inner.schemaDef && !out.schemaDef) out.schemaDef = inner.schemaDef;
      if (inner.constValue !== null && inner.constValue !== undefined && out.constValue === null) {
        out.constValue = inner.constValue;
      }
      // Item-count constraints from an allOf branch: take the more restrictive
      // bound (higher minimum, lower maximum), so a profile narrowing on top
      // of a permissive core wins.
      if (typeof inner.minItems === "number") {
        out.minItems = out.minItems === null ? inner.minItems : Math.max(out.minItems, inner.minItems);
      }
      if (typeof inner.maxItems === "number") {
        out.maxItems = out.maxItems === null ? inner.maxItems : Math.min(out.maxItems, inner.maxItems);
      }
    }
  }

  // oneOf - record branches at the leaf level; for compound-shape slots
  // (e.g. oneOf [string, array of strings] on partyTypeCode, or oneOf
  // [single object, array of object] on mainCarriageLogisticsTransportMovement)
  // we surface both branch types as informational, plus merge their properties
  // and items into out where applicable
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
      // Merge properties (useful when oneOf branches all describe object alternatives)
      for (const [k, v] of Object.entries(inner.properties)) {
        if (!out.properties[k]) out.properties[k] = v;
      }
      if (inner.items && !out.items) out.items = inner.items;
    }
    out.oneOfBranches = branches;
    // If exactly one branch has a clear type, use it as the slot's type
    const types = [...new Set(branches.map(b => b.type).filter(Boolean))];
    if (types.length === 1) out.type = out.type || types[0];
    else if (types.length > 1) out.type = "oneOf";
  }

  // anyOf - rarely used here; treat like oneOf (just merge for property visibility)
  if (Array.isArray(node.anyOf)) {
    for (const branch of node.anyOf) {
      const inner = flatten(branch, profile, core, depth + 1, seenRefs);
      for (const [k, v] of Object.entries(inner.properties)) {
        if (!out.properties[k]) out.properties[k] = v;
      }
    }
  }

  // if/then - informational only; we surface "conditional shape" as a note but
  // do not expand "then" branches into the main property tree to avoid implying
  // they are always present
  if (node.then && typeof node.then === "object") {
    const inner = flatten(node.then, profile, core, depth + 1, seenRefs);
    // Mark the slot as having a conditional shape via description suffix; do
    // NOT merge then-branch properties into out
    if (inner.description || Object.keys(inner.properties).length > 0) {
      const note = "Carries an additional conditional clause when applicable.";
      out.description = out.description ? `${out.description} ${note}` : note;
    }
  }

  return out;
}

// Build a Node from a flattened schema record at a given path.
// requiredFromParent: list of property names the parent has marked required.
// trackDef: function called for every $def encountered so the caller can
// build the cross-cutting types inventory.
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

  // Recurse into properties
  if (depth < DEPTH_LIMIT) {
    for (const [propName, propSchema] of Object.entries(flat.properties || {})) {
      const propFlat = flatten(propSchema, profile, core, depth + 1);
      const childPath = path ? `${path}.${propName}` : propName;
      const child = buildNode(propFlat, propName, childPath, flat.required, profile, core, trackDef, depth + 1);
      // Lift sibling urlId const onto the parent (e.g. identifier carries a sibling urlId const naming the codelist)
      if (propName === "urlId" && propFlat.codelistConst) {
        node.codelistConst = node.codelistConst || propFlat.codelistConst;
      }
      node.properties.set(propName, child);
    }
  }

  // Recurse into items
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

  // Root: start from the profile (which has its own top-level allOf composing core's CertificatePayload + profile narrowings)
  const rootFlat = flatten(profile, profile, core, 0);
  const rootNode = buildNode(rootFlat, "(root)", "", [], profile, core, trackDef, 0);

  // Walk each referenced $def into its own Node so cross-cutting types can be documented
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
