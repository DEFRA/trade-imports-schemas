// Confluence storage-format XHTML helpers.
//
// Adapted (per stories.md invariant I3) from workspace/scripts/extract-data-elements.js,
// which exports nothing, so its helpers were not importable. readTd and slugify
// are verbatim; stripToText is improved in two ways the live-animals page needs
// and the v133 round-trip proved necessary (see story 02 delivery notes):
//
//   1. Full HTML-entity decoding. The original decoded only six entities, leaving
//      e.g. "&uuml;" raw in output. This decodes named (with an explicit table),
//      decimal, and hex character references. "&ndash;" decodes to an en-dash
//      (U+2013) to match how the page authors it ("Animal Identifier - X" labels).
//   2. Inline vs block tags. The original replaced every tag with a space, which
//      injected spurious spaces before punctuation ("Notification ."). Here only
//      block-level boundaries (<br>, </p>, </li>, </tr>, </div>, </h1-6>) become
//      line breaks; inline tags (<a>, <code>, <strong>, ...) are removed without
//      a space.
//
// Note (I3): stripToText strips <ri:user .../> and converts <time datetime="...">
// to its date value. The live-animals main section carries neither, but callers
// parsing the auxiliary "Common Attributes" section must intercept those before
// flattening - see story 03.

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ndash: '–', mdash: '—',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  hellip: '…',
  uuml: 'ü', ouml: 'ö', auml: 'ä',
  Uuml: 'Ü', Ouml: 'Ö', Auml: 'Ä', szlig: 'ß',
  eacute: 'é', egrave: 'è', agrave: 'à'
}

// Single-pass by design: decodes each reference once. Confluence storage format
// is not double-encoded, and stripToText calls this exactly once, so re-decoding
// of e.g. "&amp;lt;" is intentionally not handled.
function decodeEntities (s) {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#([0-9]+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-zA-Z][a-zA-Z0-9]*);/g, (m, n) =>
      Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, n) ? NAMED_ENTITIES[n] : m)
}

// Strip xhtml to plain text while preserving only the structural line breaks
// authored as <br/>, </p>, </li>, </tr>, </div> or a closing heading. Literal
// whitespace from source-file formatting is collapsed to single spaces.
export function stripToText (html) {
  const withBreaks = html
    // Preserve <time datetime="..."/> as its date value before the tag stripper.
    .replace(/<time\b[^>]*\bdatetime="([^"]+)"[^>]*\/?>/g, '$1')
    .replace(/<br\s*\/?\s*>/g, '\x01')
    .replace(/<\/(?:p|li|tr|div|h[1-6])\s*>/g, '\x01')
    .replace(/<ri:user\b[^>]*\/>/g, '')
    .replace(/<[^>]+>/g, '')
  return decodeEntities(withBreaks)
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\x01\s*/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

// Parse the next <td>...</td> from a position. Hand-rolled because the cell
// contents include nested <p>/<ul>/<code>/<a>/<ac:*> elements and we cannot
// rely on a regex to handle the nesting.
export function readTd (row, start) {
  const openMatch = row.slice(start).match(/<td\b[^>]*>/)
  if (!openMatch) return null
  const openStart = start + openMatch.index
  const contentStart = openStart + openMatch[0].length
  const closeIdx = row.indexOf('</td>', contentStart)
  if (closeIdx < 0) return null
  return {
    content: row.slice(contentStart, closeIdx),
    end: closeIdx + '</td>'.length
  }
}

// Lowercase, collapse non-alphanumeric runs to a single separator, strip
// leading/trailing separators. Separator defaults to "-" (original behaviour);
// pass "_" to produce the baseline's underscore-style keys.
export function slugify (text, sep = '-') {
  const e = sep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // escape sep for the trim regex
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, sep)
    .replace(new RegExp(`^${e}+|${e}+$`, 'g'), '')
}
