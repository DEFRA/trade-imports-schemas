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
 */

import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import { fileExists } from './vendor.js'

async function loadJson(path) {
  return JSON.parse(await readFile(path, 'utf-8'))
}

export async function contextIncludesOfficial(contextValue, baseDir, officialUrl) {
  if (!contextValue) return false

  if (typeof contextValue === 'string') {
    if (contextValue === officialUrl) return true
    if (contextValue.startsWith('http://') || contextValue.startsWith('https://')) {
      return false
    }
    const resolved = resolve(baseDir, contextValue)
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
