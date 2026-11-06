#!/usr/bin/env node
/**
 * Walk a JSON-LD `@context` value (string URL, relative file path, object,
 * or array of any of those) and confirm the official UN/CEFACT D23B context
 * URL is reachable somewhere in the chain.
 *
 * Used by:
 *   - validate-schemas: for every `*.context.jsonld` in schemas/contexts/,
 *     confirm its chain reaches the official URL.
 *   - validate-samples: for every sample that declares `@context`, confirm
 *     the chain reaches the official URL.
 *
 * The official URL is passed in so the helper does not bake in a specific
 * version; both callers point at the D23B URL today and can update without
 * touching this file.
 *
 * A raw GitHub URL for this repository, at any ref, resolves to the file in the
 * working tree. The walk stays offline: it never fetches the URL, and so checks
 * the checkout rather than the content published at that ref.
 */

import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { fileExists } from './vendor.js'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const REPO_RAW_URL = /^https:\/\/raw\.githubusercontent\.com\/DEFRA\/trade-imports-schemas\/([^/]+)\/(.+)$/

async function loadJson(path) {
  return JSON.parse(await readFile(path, 'utf-8'))
}

/**
 * Split a raw GitHub URL for this repository into its ref and the absolute path
 * of the file in the working tree. Returns null for any other string.
 */
export function parseRepoRawUrl(value) {
  const match = REPO_RAW_URL.exec(value)
  return match ? { ref: match[1], absPath: resolve(REPO_ROOT, match[2]) } : null
}

export async function contextIncludesOfficial(contextValue, baseDir, officialUrl) {
  if (!contextValue) return false

  if (typeof contextValue === 'string') {
    if (contextValue === officialUrl) return true
    const repoFile = parseRepoRawUrl(contextValue)
    if (!repoFile && (contextValue.startsWith('http://') || contextValue.startsWith('https://'))) {
      return false
    }
    const resolved = repoFile ? repoFile.absPath : resolve(baseDir, contextValue)
    if (!(await fileExists(resolved))) return false
    const localCtx = await loadJson(resolved)
    return contextIncludesOfficial(localCtx['@context'], dirname(resolved), officialUrl)
  }

  if (Array.isArray(contextValue)) {
    for (const item of contextValue) {
      if (await contextIncludesOfficial(item, baseDir, officialUrl)) return true
    }
    return false
  }

  if (typeof contextValue === 'object') {
    if (contextValue['@context']) {
      return contextIncludesOfficial(contextValue['@context'], baseDir, officialUrl)
    }
    return false
  }

  return false
}
