#!/usr/bin/env node
/**
 * Emit a data dictionary as markdown from the schema-walker tree, the
 * context-resolver, the vocabulary-lookup, and a profile config.
 *
 * The emitter is profile-agnostic. The caller passes a config that names the
 * payload-level sections (heading, descend path from the root Node, intro),
 * the document title, and the document intro. Per-profile specifics (which
 * payload paths, what to call each section) live in dictionary-main-template.js.
 *
 * Anchor each row at a payload path so a reader holding a sample JSON can
 * align rows with values they see in the data.
 */

function fmtType(node) {
  if (!node) return "-";
  if (node.oneOfBranches && node.oneOfBranches.length > 0) {
    const branchTypes = [...new Set(node.oneOfBranches.map(b => b.type).filter(Boolean))];
    if (branchTypes.length > 0) return branchTypes.join(" \\| ");
  }
  if (node.type === "array" && node.items) {
    const itemType = node.items.type === "object" && node.items.schemaDef
      ? `\`${node.items.schemaDef}\``
      : (node.items.type || "object");
    return `array of ${itemType}`;
  }
  if (node.type === "object" && node.schemaDef) {
    return `\`${node.schemaDef}\``;
  }
  return node.type || (node.schemaDef ? `\`${node.schemaDef}\`` : "-");
}

function fmtRequired(node) {
  const base = node.required ? "yes" : "no";
  // Item-count constraints are only meaningful when the slot is array-shaped.
  const isArray = node.type === "array" || !!node.items;
  if (!isArray) return base;
  const min = node.minItems;
  const max = node.maxItems;
  let constraint = null;
  if (typeof min === "number" && typeof max === "number") {
    constraint = min === max ? `exactly ${min}` : `${min} to ${max}`;
  } else if (typeof min === "number") {
    constraint = `at least ${min}`;
  } else if (typeof max === "number") {
    constraint = `up to ${max}`;
  }
  return constraint ? `${base} (${constraint})` : base;
}

function pickCodelist(node) {
  if (node.codelistConst) return node.codelistConst;
  if (node.items && node.items.codelistConst) return node.items.codelistConst;
  return null;
}

function escapeCell(s) {
  if (s == null) return "";
  return String(s).replace(/\|/g, "\\|").replace(/\n+/g, " ").trim();
}

function pickDescription(propNode, contextResolver, vocabLookup) {
  // Priority (schema-first: the profile's own description is the domain answer,
  // the UN/CEFACT vocab is the generic fallback when the schema says nothing):
  //   1. JSON Schema description on the property node (gbn-ag domain text)
  //   2. For arrays: JSON Schema description on items (often a gbnAg $def description)
  //   3. rdfs:comment via JSON-LD context lookup (D23B OR Defra vocab) - the
  //      generic UN/CEFACT answer, reachable as linked data from the IRI
  //   4. Defra-declared placeholder (the binding exists but no vocab entry yet)
  //   5. null (caller renders "-")
  if (propNode.description) return propNode.description;
  if (propNode.items && propNode.items.description) return propNode.items.description;
  const resolved = contextResolver.resolve(propNode.name);
  if (resolved) {
    const vocab = vocabLookup.lookup(resolved.iri);
    if (vocab && vocab.rdfsComment) return vocab.rdfsComment;
  }
  if (resolved && resolved.defraExtension) {
    return `(Defra-declared in \`${resolved.declaredIn}\` - no vocabulary entry yet; add rdfs:comment in defra-unvtd-profile-vocabulary.jsonld)`;
  }
  return null;
}

function pickRowDescription(propNode, contextResolver, vocabLookup, notes) {
  const desc = pickDescription(propNode, contextResolver, vocabLookup);
  let composed = desc || null;

  // Prepend "Fixed value: ..." when the schema constrains the property to a
  // fixed value (e.g. `$model: const "defra/certificate-internal/1"`).
  if (propNode.constValue !== null && propNode.constValue !== undefined) {
    const fixed = `Fixed value: \`${propNode.constValue}\`.`;
    composed = composed ? `${fixed} ${composed}` : fixed;
  }

  // Append codelist URL inline. Most rows do not carry a codelist; for the
  // ones that do, dropping the column and folding the URL into the
  // description keeps the table tight.
  const codelist = pickCodelist(propNode);
  if (codelist) {
    const codelistText = `Codelist: \`${codelist}\`.`;
    composed = composed ? `${composed} ${codelistText}` : codelistText;
  }

  // Append per-path narrative note. Additive (sits alongside the canonical
  // description, not in place of it). Use <br><br> separation; GitHub-
  // flavored markdown renders these as line breaks inside table cells.
  const note = notes && notes.get(propNode.path);
  if (note && note.narrative) {
    const noteText = `<br><br>**Note:** ${escapeCell(note.narrative)}`;
    composed = composed ? `${composed}${noteText}` : `**Note:** ${escapeCell(note.narrative)}`;
  }

  return composed || "-";
}

function emitPropertyTable(parentNode, contextResolver, vocabLookup, notes) {
  if (!parentNode || !(parentNode.properties instanceof Map) || parentNode.properties.size === 0) {
    return "";
  }
  const lines = [
    "| Property | Type | Required | Description |",
    "|---|---|---|---|"
  ];
  // Use the Map's natural insertion order, which matches the order the
  // schema-walker visited properties in - i.e. the source order in the JSON
  // Schema. This keeps related groups together (e.g. the four signatory
  // authentication slots, which the schema declares contiguously) instead of
  // scattering them alphabetically.
  for (const [name, node] of parentNode.properties.entries()) {
    const desc = pickRowDescription(node, contextResolver, vocabLookup, notes);
    lines.push(
      `| \`${name}\` | ${escapeCell(fmtType(node))} | ${escapeCell(fmtRequired(node))} | ${escapeCell(desc)} |`
    );
  }
  return lines.join("\n");
}

// Walk an ordered list of descend steps from the root Node down to the
// section's target Node. Each step is either { kind: "prop", name } or
// { kind: "items" }. Returns null if any step fails (the calling section
// then emits a "_Not present_" placeholder).
function descend(rootNode, steps) {
  let cursor = rootNode;
  for (const step of steps) {
    if (!cursor) return null;
    if (step.kind === "prop") {
      if (!(cursor.properties instanceof Map)) return null;
      cursor = cursor.properties.get(step.name);
    } else if (step.kind === "items") {
      cursor = cursor.items;
    } else {
      return null;
    }
  }
  return cursor;
}

function emitSection(sectionDef, rootNode, contextResolver, vocabLookup, notes) {
  const target = descend(rootNode, sectionDef.descend || []);
  const headingLine = `## ${sectionDef.heading} (\`${sectionDef.payloadPath}\`)`;
  if (!target) return `${headingLine}\n\n_Not present at this path in the schema._\n`;
  const table = emitPropertyTable(target, contextResolver, vocabLookup, notes);
  return `${headingLine}\n\n${sectionDef.intro}\n\n${table}\n`;
}

function emitDefraExtensions(rootNode, defs, contextResolver, localContextFiles) {
  // Enumerate every distinct property name encountered anywhere in the tree.
  const seen = new Set();
  function walk(node) {
    if (!node) return;
    if (node.name) seen.add(node.name);
    if (node.properties instanceof Map) {
      for (const child of node.properties.values()) {
        walk(child);
      }
    }
    if (node.items) walk(node.items);
  }
  walk(rootNode);
  for (const defNode of defs.values()) {
    walk(defNode);
  }

  // "Defra-declared" = the property's binding lives in one of our local
  // context files (not in the vendored D23B context). Two sub-kinds:
  //
  //   - re-binding: rawId begins with `unece:` - we declare a TRACES-aligned
  //     alias (e.g. bare `importer`) for a canonical D23B term
  //     (`unece:importerParty`).
  //
  //   - new term: rawId begins with `defraUnvtdProfile:` - a Defra-only
  //     concept with no D23B equivalent (e.g. `isOrHasUnweanedAnimals`).
  const localFilesSet = new Set(localContextFiles);

  const aliasRows = [];
  const extensionRows = [];
  for (const name of [...seen].sort()) {
    const resolved = contextResolver.resolve(name);
    if (!resolved) continue;
    if (!localFilesSet.has(resolved.declaredIn)) continue;
    const declared = `\`${resolved.declaredIn}\``;
    if (resolved.rawId && resolved.rawId.startsWith("unece:")) {
      aliasRows.push(`| \`${name}\` | ${declared} | Re-binds to canonical \`${resolved.rawId}\` |`);
    } else {
      extensionRows.push(`| \`${name}\` | ${declared} | Defra concept; no D23B equivalent |`);
    }
  }

  const parts = [];
  parts.push("## Defra-declared property names");
  parts.push("");
  parts.push("Property names declared in one of the local Defra JSON-LD context files rather than inherited from the D23B context. Two kinds: re-bindings (a bare TRACES-aligned name aliased to a canonical D23B IRI) and Defra concepts (no D23B equivalent).");
  parts.push("");
  if (extensionRows.length > 0) {
    parts.push("### Defra concepts (no D23B equivalent)");
    parts.push("");
    parts.push("| Property | Declared in | Notes |");
    parts.push("|---|---|---|");
    parts.push(...extensionRows);
    parts.push("");
  }
  if (aliasRows.length > 0) {
    parts.push("### TRACES-aligned aliases (re-bind to canonical D23B IRI)");
    parts.push("");
    parts.push("| Property | Declared in | Notes |");
    parts.push("|---|---|---|");
    parts.push(...aliasRows);
    parts.push("");
  }
  if (extensionRows.length === 0 && aliasRows.length === 0) {
    parts.push("_No Defra-declared property names detected._");
    parts.push("");
  }
  return parts.join("\n");
}

export function emitMarkdown({ tree, contextResolver, vocabLookup, notes, profile }) {
  const rootNode = tree.root;
  const defs = tree.defs;
  const notesMap = notes instanceof Map ? notes : new Map();

  const parts = [];

  parts.push(`# ${profile.title}`);
  parts.push("");
  parts.push(profile.intro);
  parts.push("");

  parts.push("## Top-level payload structure");
  parts.push("");
  parts.push("The root of the payload is a `CertificatePayload`. Top-level properties:");
  parts.push("");
  parts.push(emitPropertyTable(rootNode, contextResolver, vocabLookup, notesMap));
  parts.push("");

  for (const section of profile.sections) {
    parts.push(emitSection(section, rootNode, contextResolver, vocabLookup, notesMap));
  }

  const localContextFiles = profile.localContextFiles || [
    "defra-unvtd-gbn-ag-v1.context.jsonld",
    "defra-unvtd-core-v1.context.jsonld"
  ];
  parts.push(emitDefraExtensions(rootNode, defs, contextResolver, localContextFiles));

  parts.push("");
  parts.push("## Generation");
  parts.push("");
  parts.push(`Generated from \`${profile.profileSchema}\` and the UN/CEFACT D23B vocabulary at \`https://vocabulary.uncefact.org/\`. Do not edit by hand - regenerate from the source schema.`);
  parts.push("");

  return parts.join("\n");
}
