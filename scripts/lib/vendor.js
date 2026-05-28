#!/usr/bin/env node
/**
 * Fetch-and-cache helper for external JSON / JSON-LD resources we depend on
 * at build time. Used by validate-schemas, validate-samples, and
 * build-data-dictionary so the same caching semantics apply everywhere.
 *
 * Cached files land under build/vendor/. The directory is gitignored; CI and
 * fresh clones re-fetch on first use. The fetch only fires when the cached
 * file is absent.
 */

import { readFile, writeFile, mkdir, access } from 'node:fs/promises'
import { dirname } from 'node:path'

export async function fileExists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

export async function ensureRemoteJson(url, targetPath, label) {
  if (!(await fileExists(targetPath))) {
    process.stdout.write(`  Fetching ${label} ... `)
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} fetching ${url}`)
    }
    const body = await response.text()
    await mkdir(dirname(targetPath), { recursive: true })
    await writeFile(targetPath, body)
    console.log('cached')
  }
  return JSON.parse(await readFile(targetPath, 'utf-8'))
}
