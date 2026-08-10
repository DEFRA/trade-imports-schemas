#!/usr/bin/env node
/**
 * Coherence check: structure (JSON Schema) vs semantics (JSON-LD).
 *
 * Every payload property is described three times in this repo:
 *   - its SHAPE in JSON Schema       ($ref to a $def, or a scalar `type`)
 *   - its MEANING in the context     (@id IRI + @type coercion)
 *   - its MEANING in the vocabulary  (rdfs:comment, domainIncludes, rangeIncludes)
 *
 * The three are joined only by a hand-spelled property name and by naming
 * convention. The other validators never load the vocabulary, so three drift
 * modes pass every gate silently: spelling drift, undocumented minted terms,
 * and value-type drift. This script asserts they stay coherent.
 *
 * SCOPE - what this does and does NOT check:
 *
 *   Value-type coherence (C3/C4/C5) runs ONLY over Defra-authored terms
 *   (context bindings with a `defraUnvtdProfile:` prefix). For the core
 *   properties inherited from UN/CEFACT, the "meaning" is whatever the upstream
 *   D23B vocabulary says, and the Defra JSON Schema deliberately renames and
 *   simplifies it (e.g. schema $def `TradeParty` for D23B `uncefact:Party`,
 *   schema scalar `string` for a D23B `uncefact:UNCLxxxxCode` class). Those are
 *   intentional divergences, not drift - comparing them produces noise, not
 *   signal. The coherence Defra owns, and can keep consistent, is between its
 *   own schema and its own semantic statements; that is the only thing checked.
 *
 *   Name coverage (C1/C2) and minted-term documentation (C6) span every Defra
 *   context term and every schema property, since those are all Defra-owned.
 *
 * Reuses the committed data-dictionary loaders verbatim and mirrors how
 * scripts/build-data-dictionary.js wires them.
 *
 * Usage:
 *   node scripts/check-coherence.js [profile]      (or: npm run validate-coherence)
 *     <profile>  one registered profile key, or omit to run all of them.
 *
 * Exit code: 1 if any ERROR finding, 0 if only WARNs.
 *
 * Checks (Standard tier):
 *   C1 ERROR  Defra context term has no matching schema property (orphan term)
 *   C2 WARN   schema property has no JSON-LD binding (minus structural sub-fields)
 *   C3 ERROR  Defra term: schema shape vs Defra-vocab rangeIncludes disagree
 *   C4 ERROR  Defra term: schema shape vs context @type disagree
 *   C5 ERROR  Defra term: Defra-vocab rangeIncludes vs context @type disagree
 *   C6 ERROR  defraUnvtdProfile: context term has no documented vocabulary entry
 */

import { realpathSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";

import { ensureRemoteJson } from "./lib/vendor.js";
import { walkSchema } from "./data-dictionary/schema-walker.js";
import { buildContextResolver } from "./data-dictionary/context-resolver.js";
import { buildVocabularyLookup } from "./data-dictionary/vocabulary-lookup.js";
import { profiles } from "./data-dictionary/dictionary-main-template.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolvePath(__dirname, "..");

const VENDOR_DIR = resolvePath(REPO, "build/vendor/uncefact");
const D23B_CONTEXT_VENDORED = resolvePath(VENDOR_DIR, "unece-context-D23B.jsonld");
const VOCAB_VENDORED = resolvePath(VENDOR_DIR, "uncefact.jsonld");

const D23B_CONTEXT_URL = "https://vocabulary.uncefact.org/unece-context-D23B.jsonld";
const VOCAB_URL = "https://service.unece.org/trade/uncefact/vocabulary/uncefact.jsonld";

// ---------------------------------------------------------------------------
// Exception map. Intentional name divergences, so the checks do not cry wolf.
// A Defra $def whose name deliberately differs from its UN/CEFACT class lives
// here ($def name -> expected vocab range class local-name). Only consulted for
// Defra-extension object properties; the current minted set matches directly,
// so this is seeded for the day a minted term reuses a renamed shape.
// ---------------------------------------------------------------------------
const DEF_TO_CLASS = {
  tradeProductInstance: "ProductInstance"
};

// Schema sub-fields that legitimately carry no Defra JSON-LD binding (they are
// components of composite types, bound by D23B or intentionally unbound). Used
// only to keep C2 (warn-only) signal meaningful.
const C2_EXEMPT = new Set([
  "content", "urlId", "typeCode", "schemeId", "schemeName", "schemeAgencyName",
  "lineOne", "lineTwo", "lineThree", "cityName", "postcodeCode", "countryId",
  "countryName", "countrySubDivisionName", "countrySubDivisionId", "unitCode"
]);

const SCALAR_XSD = {
  boolean: "xsd:boolean",
  integer: "xsd:integer",
  number: "xsd:decimal",
  string: "xsd:string"
};

// ---------------------------------------------------------------------------
// Pure helpers (exported for unit testing)
// ---------------------------------------------------------------------------
export function localName(iri) {
  if (!iri) return null;
  const cut = Math.max(iri.lastIndexOf(":"), iri.lastIndexOf("/"), iri.lastIndexOf("#"));
  return cut >= 0 ? iri.slice(cut + 1) : iri;
}

export function eqLocal(a, b) {
  if (!a || !b) return false;
  return localName(String(a)).toLowerCase() === localName(String(b)).toLowerCase();
}

export function isXsd(iri) {
  return !!iri && (/^xsd:/.test(iri) || iri.includes("XMLSchema#"));
}

export function isHttpUrl(iri) {
  return !!iri && /^https?:\/\//.test(iri);
}

// Classify a property Node's structural value-type.
export function classify(node) {
  if (!node) return { kind: "unknown" };
  if (node.codelistConst) return { kind: "codelist", url: node.codelistConst };
  if (node.schemaDef) return { kind: "object", defName: node.schemaDef };
  if (node.type === "array" && node.items) {
    if (node.items.schemaDef) return { kind: "array-object", defName: node.items.schemaDef };
    if (node.items.type && SCALAR_XSD[node.items.type]) {
      return { kind: "array-scalar", xsd: SCALAR_XSD[node.items.type] };
    }
    return { kind: "array-other" };
  }
  if (node.type && SCALAR_XSD[node.type]) return { kind: "scalar", xsd: SCALAR_XSD[node.type] };
  if (node.type === "object") return { kind: "inline-object" };
  if (node.type === "oneOf") return { kind: "oneof" };
  return { kind: "unknown", type: node.type };
}

// ---------------------------------------------------------------------------
// Per-profile check. Pushes findings into `findings`; returns small stats.
// ---------------------------------------------------------------------------
export function checkProfile(profileName, profile, findings) {
  const tree = walkSchema({
    profilePath: resolvePath(REPO, profile.profileSchema),
    corePath: resolvePath(REPO, profile.coreSchema)
  });
  const ctx = buildContextResolver({
    profileContextPath: resolvePath(REPO, profile.profileContext),
    vendoredD23BContextPath: D23B_CONTEXT_VENDORED
  });
  const vocab = buildVocabularyLookup({
    vocabularyPaths: [VOCAB_VENDORED, resolvePath(REPO, profile.defraVocabulary)]
  });

  // Enumerate every property the schema actually exposes by a full depth-first
  // walk of the (finite) property tree, descending THROUGH $def children so
  // properties added by inline allOf narrowings at a use site are captured.
  // name -> [{ enclosingDef, structural }]
  const occByName = new Map();
  const record = (name, enclosingDef, structural) => {
    if (!occByName.has(name)) occByName.set(name, []);
    occByName.get(name).push({ enclosingDef, structural });
  };
  const dfs = (node, enclosingDef) => {
    if (!node || !node.properties) return;
    for (const [propName, child] of node.properties) {
      record(propName, enclosingDef, classify(child));
      const target = child.type === "array" && child.items ? child.items : child;
      const nextDef = target.schemaDef || enclosingDef;
      if (target.properties && target.properties.size > 0) dfs(target, nextDef);
    }
  };
  dfs(tree.root, "(root)");
  const propNames = new Set(occByName.keys());

  // Defra-authored context terms (exclude the vendored D23B layer).
  const defraTerms = new Map(); // name -> { declaredIn, rawId }
  for (const layer of ctx.layers) {
    if (layer.path.includes("build/vendor")) continue;
    for (const [name, t] of layer.terms) {
      if (!defraTerms.has(name)) defraTerms.set(name, { declaredIn: t.declaredIn, rawId: t.rawId });
    }
  }

  const add = (severity, check, propName, enclosingDef, message) =>
    findings.push({ profile: profileName, severity, check, propName, enclosingDef, message });

  // --- C1: orphan context term ------------------------------------------
  // Skip UpperCamelCase terms: those bind a class/type (e.g.
  // LogisticsTransportMovement -> unece:TransportMovement), not a property.
  for (const [name, t] of defraTerms) {
    if (/^[A-Z]/.test(name)) continue;
    if (!propNames.has(name)) {
      add("ERROR", "C1", name, t.declaredIn,
        `context term "${name}" (${t.rawId}) maps no schema property - orphan term or renamed property`);
    }
  }

  // --- C6: minted term must be documented -------------------------------
  for (const [name] of defraTerms) {
    const r = ctx.resolve(name);
    if (!r || !r.defraExtension) continue; // unece:/uncefact: terms documented in D23B
    const entry = vocab.lookup(r.iri);
    if (!entry || !entry.rdfsComment) {
      add("ERROR", "C6", name, r.declaredIn,
        `minted term "${name}" (${r.rawId}) has no vocabulary entry with an rdfs:comment`);
    }
  }

  // --- C2 (warn-only): schema property with no JSON-LD binding -----------
  for (const name of propNames) {
    if (name.startsWith("$") || C2_EXEMPT.has(name)) continue;
    if (!ctx.resolve(name)) {
      add("WARN", "C2", name, "(any)",
        `schema property "${name}" has no JSON-LD binding - it carries no machine meaning`);
    }
  }

  // --- C3 + C4 + C5: value-type coherence, Defra-authored terms only -----
  for (const [name] of defraTerms) {
    const r = ctx.resolve(name);
    if (!r || !r.defraExtension) continue;

    const occs = occByName.get(name) || [];
    if (!occs.length) continue; // absence already reported by C1

    const atType = r.type;
    const entry = vocab.lookup(r.iri);
    const range = entry ? entry.rangeIncludes : null;

    // De-dup by structural kind+target so a multi-site term reports once.
    const seenKinds = new Set();
    for (const occ of occs) {
      const s = occ.structural;
      const sig = `${s.kind}|${s.defName || s.xsd || ""}`;
      if (seenKinds.has(sig)) continue;
      seenKinds.add(sig);

      // Effective kind: a string whose documented range is a codelist URL is a
      // codelist, not a plain string (e.g. notificationStatusCode).
      let kind = s.kind;
      if (kind === "scalar" && s.xsd === "xsd:string" && isHttpUrl(range)) kind = "codelist";
      const where = `${occ.enclosingDef}.${name}`;

      // C3: structure vs vocab rangeIncludes
      if (range) {
        if (kind === "object" || kind === "array-object") {
          const ok = eqLocal(s.defName, range) ||
            (DEF_TO_CLASS[s.defName] && eqLocal(DEF_TO_CLASS[s.defName], range));
          if (!ok) {
            add("ERROR", "C3", name, occ.enclosingDef,
              `value shape vs meaning: schema $ref -> $def "${s.defName}" but vocab rangeIncludes "${range}" (${where})`);
          }
        } else if (kind === "scalar" || kind === "array-scalar") {
          if (!eqLocal(range, s.xsd)) {
            add("ERROR", "C3", name, occ.enclosingDef,
              `value type vs meaning: schema scalar ${s.xsd} but vocab rangeIncludes "${range}" (${where})`);
          }
        } else if (kind === "codelist") {
          if (!isHttpUrl(range) && !isXsd(range)) {
            add("ERROR", "C3", name, occ.enclosingDef,
              `codelist value but vocab rangeIncludes is a class "${range}" (${where})`);
          }
        }
      }

      // C4: structure vs context @type
      if (kind === "object" || kind === "array-object") {
        if (atType && atType !== "@id") {
          add("ERROR", "C4", name, occ.enclosingDef,
            `object value but context @type is "${atType}" (expected @id) (${where})`);
        } else if (!atType) {
          add("WARN", "C4", name, occ.enclosingDef,
            `object value but context declares no @type @id - value will not be read as a link (${where})`);
        }
      } else if (kind === "scalar" || kind === "array-scalar") {
        if (atType && !eqLocal(atType, s.xsd)) {
          add("ERROR", "C4", name, occ.enclosingDef,
            `scalar ${s.xsd} but context @type is "${atType}" (${where})`);
        }
      } else if (kind === "codelist") {
        if (atType === "@id") {
          add("ERROR", "C4", name, occ.enclosingDef,
            `codelist string but context @type is @id - the code would be read as a link (${where})`);
        }
      }

      // C5: vocab rangeIncludes vs context @type (backstop)
      if (range && atType) {
        if (isXsd(range)) {
          if (!eqLocal(range, atType)) {
            add("ERROR", "C5", name, occ.enclosingDef,
              `vocab rangeIncludes "${range}" but context @type "${atType}" (${where})`);
          }
        } else if (isHttpUrl(range)) {
          if (atType === "@id") {
            add("ERROR", "C5", name, occ.enclosingDef,
              `vocab rangeIncludes is a codelist URL but context @type is @id (${where})`);
          }
        } else if (atType !== "@id") {
          add("ERROR", "C5", name, occ.enclosingDef,
            `vocab rangeIncludes class "${range}" but context @type "${atType}" (expected @id) (${where})`);
        }
      }
    }
  }

  return { occCount: occByName.size, defraTermCount: defraTerms.size, defCount: tree.defs.size };
}

function dedupe(findings) {
  const seen = new Set();
  const out = [];
  for (const f of findings) {
    const key = `${f.profile}|${f.severity}|${f.check}|${f.propName}|${f.enclosingDef}|${f.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}

// Vendor deps, run the checks for the named profiles, return deduped findings.
export async function runChecks(names) {
  await ensureRemoteJson(D23B_CONTEXT_URL, D23B_CONTEXT_VENDORED, "D23B context");
  await ensureRemoteJson(VOCAB_URL, VOCAB_VENDORED, "D23B vocabulary");

  const findings = [];
  const stats = [];
  for (const name of names) {
    stats.push({ name, ...checkProfile(name, profiles[name], findings) });
  }
  return { findings: dedupe(findings), stats };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
async function main() {
  const arg = process.argv[2];
  if (arg && !profiles[arg]) {
    console.error(`Unknown profile: ${arg}`);
    console.error(`Known profiles: ${Object.keys(profiles).join(", ")}`);
    process.exit(2);
  }
  const names = arg ? [arg] : Object.keys(profiles);

  const { findings, stats } = await runChecks(names);
  for (const s of stats) {
    console.log(`Checked ${s.name}: ${s.occCount} distinct properties, ${s.defCount} $defs, ${s.defraTermCount} Defra context terms`);
  }

  const errors = findings.filter(f => f.severity === "ERROR");
  const warns = findings.filter(f => f.severity === "WARN");
  const print = (list, badge) => {
    for (const f of list) console.log(`  ${badge} [${f.check}] ${f.profile} :: ${f.message}`);
  };

  console.log("=".repeat(70));
  if (errors.length) {
    console.log(`ERRORS (${errors.length}):`);
    print(errors, "x");
  }
  if (warns.length) {
    console.log(`WARNINGS (${warns.length}):`);
    print(warns, "!");
  }
  if (!errors.length && !warns.length) console.log("Coherent: no findings.");
  console.log("=".repeat(70));
  console.log(`${errors.length} error(s), ${warns.length} warning(s)`);

  process.exit(errors.length ? 1 : 0);
}

// Run only when executed directly, not when imported by the test.
const invokedDirectly = process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch(err => {
    console.error("Unexpected error:", err.stack || err.message || err);
    process.exit(1);
  });
}
