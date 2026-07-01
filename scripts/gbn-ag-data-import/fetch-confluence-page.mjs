#!/usr/bin/env node
// Pull a Confluence Cloud page's storage-format XHTML body.
// Zero npm deps; Node 18+ built-in fetch. Single file, drop into any project.
//
// Env vars (all required):
//   CONFLUENCE_URL        e.g. https://eaflood.atlassian.net
//   CONFLUENCE_USERNAME   Atlassian account email
//   CONFLUENCE_API_TOKEN  Atlassian API token

import { writeFile } from 'node:fs/promises'
import { stderr, stdout, env, argv, exit } from 'node:process'

const USAGE = `Usage: fetch-confluence-page.mjs <id-or-url> [-o <path>] [-m <path>] [-t]

Args:
  id-or-url             Numeric page ID, or a /wiki/spaces/<SPACE>/pages/<ID>/... URL.

Options:
  -o, --output <path>   Write XHTML body to <path> instead of stdout.
  -m, --meta <path>     Write a sidecar JSON file describing the page
                        (page_id, page_title, space, version, version_when, url).
  -t, --title-stderr    Print page title to stderr (does not pollute stdout).
  -h, --help            Print this message.

Env vars (all required):
  CONFLUENCE_URL        e.g. https://eaflood.atlassian.net
  CONFLUENCE_USERNAME   Atlassian account email
  CONFLUENCE_API_TOKEN  Atlassian API token

Examples:
  fetch-confluence-page.mjs 6525093960 > page.xml
  fetch-confluence-page.mjs 'https://eaflood.atlassian.net/wiki/spaces/EUDP/pages/6525093960/Foo' -o page.xml
  fetch-confluence-page.mjs 6497338582 -o page.xml -m page.meta.json   # XHTML + version sidecar
  fetch-confluence-page.mjs 6525093960 -t > page.xml   # title printed to stderr
`

function die (code, msg) {
  stderr.write(msg.endsWith('\n') ? msg : msg + '\n')
  exit(code)
}

function parseArgs (raw) {
  const opts = { input: null, output: null, meta: null, titleStderr: false }
  for (let i = 0; i < raw.length; i++) {
    const a = raw[i]
    if (a === '-h' || a === '--help') { stderr.write(USAGE); exit(0) }
    else if (a === '-o' || a === '--output') opts.output = raw[++i]
    else if (a === '-m' || a === '--meta') opts.meta = raw[++i]
    else if (a === '-t' || a === '--title-stderr') opts.titleStderr = true
    else if (a.startsWith('-')) die(2, `Unknown option: ${a}\n\n${USAGE}`)
    else if (opts.input === null) opts.input = a
    else die(2, `Unexpected extra argument: ${a}\n\n${USAGE}`)
  }
  if (!opts.input) die(2, USAGE)
  if (opts.output === undefined) die(2, `Missing value for -o\n\n${USAGE}`)
  if (opts.meta === undefined) die(2, `Missing value for -m\n\n${USAGE}`)
  return opts
}

function extractPageId (input) {
  if (/^\d+$/.test(input)) return input
  const m = input.match(/\/wiki\/spaces\/[^/]+\/pages\/(\d+)(?:[/?#]|$)/)
  if (m) return m[1]
  die(2, `Input must be a numeric page ID or a /wiki/spaces/<SPACE>/pages/<ID>/... URL.\nGot: ${input}`)
}

function requireEnv (name) {
  const v = env[name]
  if (!v || !v.trim()) die(2, `${name} not set`)
  return v.trim()
}

async function main () {
  const opts = parseArgs(argv.slice(2))
  const pageId = extractPageId(opts.input)

  const base = requireEnv('CONFLUENCE_URL').replace(/\/+$/, '')
  const username = requireEnv('CONFLUENCE_USERNAME')
  const apiToken = requireEnv('CONFLUENCE_API_TOKEN')

  const authHeader = 'Basic ' + Buffer.from(`${username}:${apiToken}`).toString('base64')
  const url = `${base}/wiki/rest/api/content/${pageId}?expand=body.storage,version,space`

  let res
  try {
    res = await fetch(url, { headers: { Authorization: authHeader, Accept: 'application/json' } })
  } catch (err) {
    die(1, `Network failure fetching page ${pageId}: ${err.message}`)
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    die(1, `HTTP ${res.status} fetching page ${pageId}\n${body.slice(0, 500)}`)
  }

  let json
  try { json = await res.json() } catch (err) {
    die(1, `Page ${pageId}: response was not valid JSON (${err.message})`)
  }

  const xhtml = json?.body?.storage?.value
  if (typeof xhtml !== 'string') {
    die(1, `Page ${pageId}: response has no body.storage.value`)
  }

  if (opts.titleStderr) stderr.write(`title: ${json.title}\n`)

  if (opts.output) {
    await writeFile(opts.output, xhtml, 'utf8')
  } else {
    stdout.write(xhtml)
  }

  if (opts.meta) {
    const version = json?.version?.number
    const versionWhen = json?.version?.when
    if (typeof version !== 'number' || typeof versionWhen !== 'string') {
      die(1, `Page ${pageId}: response has no version.number/version.when; refusing to write --meta sidecar`)
    }
    const space = json?.space?.key
    const meta = {
      page_id: pageId,
      page_title: json.title,
      space,
      version,
      version_when: versionWhen,
      url: `${base}/wiki/spaces/${space}/pages/${pageId}`
    }
    await writeFile(opts.meta, JSON.stringify(meta, null, 2), 'utf8')
  }
}

main().catch((err) => die(1, `Unexpected error: ${err.stack || err.message || err}`))
