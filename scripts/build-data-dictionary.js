#!/usr/bin/env node
/**
 * Build a data dictionary for a named profile.
 *
 * Usage:
 *   node scripts/build-data-dictionary.js <profile>
 *
 *   <profile>   profile key registered in scripts/lib/dictionary-main-template.js.
 *               Currently: gbn-ag.
 *
 * Behaviour:
 *   1. Ensure the vendored UN/CEFACT D23B context and vocabulary are cached
 *      under build/vendor/uncefact/ (fetched on first run).
 *   2. Walk the profile's JSON Schema (resolving $ref into the core schema)
 *      to a tree of property nodes plus a $defs inventory.
 *   3. Build a JSON-LD context resolver across the profile context, the
 *      Defra core context, and the vendored D23B context.
 *   4. Index the UN/CEFACT vocabulary plus the Defra-side vocabulary by IRI.
 *   5. Load the per-path narrative sidecar (optional).
 *   6. Emit the markdown to the profile's output path.
 *
 * Idempotent: running twice in succession produces a byte-identical file.
 */

import { readFile, writeFile, access } from "node:fs/promises";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";

import { ensureRemoteJson } from "./lib/vendor.js";
import { walkSchema } from "./data-dictionary/schema-walker.js";
import { buildContextResolver } from "./data-dictionary/context-resolver.js";
import { buildVocabularyLookup } from "./data-dictionary/vocabulary-lookup.js";
import { emitMarkdown } from "./data-dictionary/dictionary-markdown.js";
import { profiles } from "./data-dictionary/dictionary-main-template.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolvePath(__dirname, "..");

const VENDOR_DIR = resolvePath(REPO, "build/vendor/uncefact");
const D23B_CONTEXT_VENDORED = resolvePath(VENDOR_DIR, "unece-context-D23B.jsonld");
const VOCAB_VENDORED = resolvePath(VENDOR_DIR, "uncefact.jsonld");

const D23B_CONTEXT_URL = "https://vocabulary.uncefact.org/unece-context-D23B.jsonld";
const VOCAB_URL = "https://service.unece.org/trade/uncefact/vocabulary/uncefact.jsonld";

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const profileName = process.argv[2];
  if (!profileName) {
    console.error("Usage: node scripts/build-data-dictionary.js <profile>");
    console.error(`Known profiles: ${Object.keys(profiles).join(", ")}`);
    process.exit(2);
  }
  const profile = profiles[profileName];
  if (!profile) {
    console.error(`Unknown profile: ${profileName}`);
    console.error(`Known profiles: ${Object.keys(profiles).join(", ")}`);
    process.exit(2);
  }

  console.log(`Building data dictionary for profile: ${profileName}`);
  console.log("=".repeat(70));

  await ensureRemoteJson(D23B_CONTEXT_URL, D23B_CONTEXT_VENDORED, "D23B context");
  await ensureRemoteJson(VOCAB_URL, VOCAB_VENDORED, "D23B vocabulary");

  const profileSchemaPath = resolvePath(REPO, profile.profileSchema);
  const coreSchemaPath = resolvePath(REPO, profile.coreSchema);
  const profileContextPath = resolvePath(REPO, profile.profileContext);
  const defraVocabPath = resolvePath(REPO, profile.defraVocabulary);
  const notesPath = profile.notesPath ? resolvePath(REPO, profile.notesPath) : null;
  const outputPath = resolvePath(REPO, profile.outputPath);

  process.stdout.write("  Walking schema ... ");
  const tree = walkSchema({ profilePath: profileSchemaPath, corePath: coreSchemaPath });
  console.log(`${tree.root.properties.size} top-level properties, ${tree.defs.size} cross-cutting types`);

  process.stdout.write("  Loading JSON-LD context chain ... ");
  const contextResolver = buildContextResolver({
    profileContextPath,
    vendoredD23BContextPath: D23B_CONTEXT_VENDORED
  });
  console.log(`${contextResolver.layers.length} layers`);

  process.stdout.write("  Indexing vocabulary (D23B + Defra) ... ");
  const vocabLookup = buildVocabularyLookup({
    vocabularyPaths: [VOCAB_VENDORED, defraVocabPath]
  });
  console.log(`${vocabLookup.size} entries`);

  let notes = new Map();
  if (notesPath && await fileExists(notesPath)) {
    const sidecar = JSON.parse(await readFile(notesPath, "utf8"));
    for (const [path, entry] of Object.entries(sidecar)) {
      if (path.startsWith("$")) continue;
      notes.set(path, entry);
    }
    console.log(`  Loaded ${notes.size} narrative notes from sidecar`);
  } else {
    console.log("  No narrative sidecar present (optional)");
  }

  process.stdout.write("  Emitting markdown ... ");
  const markdown = emitMarkdown({ tree, contextResolver, vocabLookup, notes, profile });
  const trailing = markdown.endsWith("\n") ? "" : "\n";
  await writeFile(outputPath, markdown + trailing, "utf8");
  console.log(`wrote ${profile.outputPath}`);

  console.log("=".repeat(70));
  console.log("Done.");
}

main().catch(err => {
  console.error("Unexpected error:", err.stack || err.message || err);
  process.exit(1);
});
