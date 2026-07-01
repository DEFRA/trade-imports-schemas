# GBN-AG V4 data update runbook

How to re-align the GBN-AG schema with a new version of the Defra "Live Animals
Data Fields - V4" specification: pull the page, convert it, see what changed,
decide what the schema needs, apply it, and regenerate the downstream views.

The deterministic steps are zero-dependency Node scripts in
`scripts/gbn-ag-data-import/`. The analysis and application steps are run by a
human with an AI assistant, using the two prompts in this document. The baseline
that diffs compare against ships with the scripts, so the workflow runs on a
fresh clone.

## When to run this

When the V4 specification page has a new version, or when you want to confirm the
schema is still aligned with the current version.

## Prerequisites

- Node 18+.
- Confluence credentials in the environment for the fetch step only:
  `CONFLUENCE_URL`, `CONFLUENCE_USERNAME`, `CONFLUENCE_API_TOKEN`. The examples
  below load them from a local, untracked `.env` via `node --env-file=.env`.
- The committed baseline at `scripts/gbn-ag-data-import/data/live-animals-table.json`
  (the last-aligned state). It is already present; the diff reads it automatically.

All run artefacts are written under `scripts/gbn-ag-data-import/data/scratch/`,
which is gitignored. The committed inputs in `scripts/gbn-ag-data-import/data/`
(the baseline and the PIMS files) are the only data that ships.

## The pipeline

```
   Confluence page
        | 1 fetch                                  [script]
        v
   page XHTML + version sidecar
        | 2 convert                                [script]
        v
   table JSON (next)
        | 3 diff vs baseline                       [script]
        v
   delta (JSON + markdown)
        | 4 analyse  -> change list                [AI + human]
        | 5 apply    -> schema + sample edits       [AI + human]
        |            -> 6 regenerate data dictionary [script]
        |            -> 7 regenerate PIMS mapping     [human + script]
        | 8 validate                               [script]
        v
   9 review + promote baseline                     [human + script]
```

## Steps

### 1. Fetch the page (script)

```bash
node --env-file=.env scripts/gbn-ag-data-import/fetch-confluence-page.mjs 6497338582 \
  -o scripts/gbn-ag-data-import/data/scratch/live-animals-v4.xhtml \
  -m scripts/gbn-ag-data-import/data/scratch/live-animals-v4.meta.json
```

Writes the page's storage-format XHTML and a sidecar recording its version number
and timestamp.

### 2. Convert to a table (script)

```bash
node scripts/gbn-ag-data-import/convert-live-animals-table.mjs \
  scripts/gbn-ag-data-import/data/scratch/live-animals-v4.xhtml \
  scripts/gbn-ag-data-import/data/scratch/live-animals-v4.meta.json
```

Produces `data/scratch/live-animals-table.next.json` - all three page sections in
a stable, diff-able shape. The converter aborts with a non-zero exit and writes no
output if the page structure is not what it expects, so an unannounced change to
the page format is a loud failure rather than a silent misparse.

### 3. Diff against the baseline (script)

```bash
node scripts/gbn-ag-data-import/diff-live-animals-table.mjs
```

Compares the committed baseline against the freshly converted table and writes
`data/scratch/live-animals-delta.json` and `.md` - rows added, removed, or changed
per section, plus warnings (for example two rows that share a field label). It
never writes the baseline.

### 4. Analyse the delta (AI + human)

Run the **Analyse prompt** (below) with the AI assistant, giving it the delta and
the current schema. It returns a list of the changes the schema actually needs,
with the noise stripped out, and stops for your decision on anything ambiguous.
Review and confirm the change list before applying anything.

### 5. Apply the change list (AI + human)

Run the **Apply prompt** (below) with the confirmed change list. It edits the
schema, adds or extends a worked example, and then runs steps 6, 7, and 8.

### 6. Regenerate the data dictionary (script)

```bash
npm run build-dictionary:gbn-ag
```

The data dictionary is a generated view of the schema, so any schema change makes
it stale until this is run.

### 7. Regenerate the PIMS mapping (human + script)

For any new or changed field, add or update its entry in
`scripts/gbn-ag-data-import/data/portal-pims-answers.json` (matching the field to
its PIMS counterpart is a judgement call), then:

```bash
npm run build-pims-mapping:gbn-ag
```

Optionally check coverage against the PIMS draft:

```bash
node scripts/gbn-ag-data-import/pims-coverage-report.js
```

### 8. Validate (script)

```bash
npm run validate-schemas && npm run validate-samples && node scripts/check-coherence.js
```

Schemas must compile, every sample must validate, and the coherence check must
report no errors. Stop and fix on any failure.

### 9. Review and promote the baseline (human + script)

Once the edits are reviewed and validation is green, advance the baseline so the
next run diffs against the now-accepted state:

```bash
node scripts/gbn-ag-data-import/diff-live-animals-table.mjs --promote
```

`--promote` is the only command that writes the baseline. Until it is run, fetch,
convert, and diff have no effect on the baseline, so a run can always be inspected
before it is accepted.

## The prompts

These are the reusable instructions for the analysis and application steps. Paste
the relevant one to the AI assistant along with the delta or the change list.

### Analyse prompt

```
You are aligning the GBN-AG schema with a new version of the Live Animals Data
Fields specification. Inputs: the delta markdown from the diff step, and the
current schema under schemas/.

Produce a precise list of the changes the SCHEMA needs - nothing more.

Only three properties of a field affect the schema:
  1. whether the field exists (added or removed);
  2. its type;
  3. how it applies to the commodity - per animal vs per consignment, and at
     which level (notification, consignment, commodity line, individual animal).

Everything else in the delta is noise for the schema and must be discarded:
  - commodity-list and codelist edits are reference data (codelist properties are
    open strings, so reference-data changes do not change the schema);
  - conditions, validation wording, and mandatory/optional flips are description
    prose (profile schemas carry no conditional logic) - EXCEPT a conditions change
    that asserts a different cardinality or level than a documented structural rule
    (e.g. "a different X per animal" when the rule is one X per consignment). That is
    not prose; carry it to the verdict step as a candidate;
  - approval/sign-off and source/provenance columns are governance, not contract.

The "how it applies" dimension is not held in a single column. Read the level
indicator together with the conditions prose and use judgement: a keyword match
over the conditions text over-flags (validation text that mentions "the
consignment" is not, by itself, a per-animal vs per-consignment change).

Treat every field the V4 specification carries as data the schema must model. Do
not withhold or soften a verdict because a field "might be display-only", derived,
or not stored - assume it is payload, model it, and raise any residual doubt at the
human review gate, not in the verdict.

For each surviving candidate, cross-check the actual schema, the core building
blocks, and the JSON-LD context, and assign a verdict:
  - NEW PROPERTY: no existing property carries this meaning. Commit to it. An
    additive, profile-local, optional field with an obvious home is a NEW PROPERTY
    even when the exact key spelling is still open - note the spelling as a minor
    sub-question, do not downgrade the verdict for it. Propose a key aligned to the
    UN/CEFACT D23B vocabulary (drop the Type suffix), the level it sits at, and its
    JSON-LD binding. Do not route the field into a semantically wrong existing slot
    (for example an issued-identifier array for a human-given name) to dodge adding
    a property; a slot is only a home if its meaning matches.
  - NO-OP: an existing property already carries this exact meaning. Say where.
  - NEEDS A DECISION: reserve this for a change that contradicts a documented
    structural rule, carries a breaking change or shared-core blast radius, or has
    a genuinely ambiguous placement with materially different downstream
    consequences. An unchanged level/applies-at value does not downgrade a semantic
    contradiction with a documented rule - the conflict itself is the trigger, even
    if no column moved. You MUST output such an item as a decision block with 2-3
    options and trade-offs and STOP without choosing; do not resolve it by your own
    judgement, and do not demote it to a "confirm later" aside. Do not use this
    verdict as a hedge for a clean additive field.

Output a change list: per item, the verdict, the exact schema location
(distinguishing a $def name from a property name), the type, whether it is
additive/optional, and any shared-core blast radius. Account for every delta item,
and explicitly address any warning the diff raised (for example a duplicate
row-key, which usually means one field documented in two ways) rather than letting
it vanish into the noise. Then wait for confirmation.
```

### Apply prompt

```
You have a human-confirmed change list. Apply it to the schema, following the
repo authoring rules:
  - Codelist-bearing properties are open strings; the list is named by a sibling
    urlId/schemeId, never an enum.
  - Profile schemas carry no if/then/else or dependentSchemas; conditional and
    cross-field rules go in the property description prose.
  - Property names follow the UN/CEFACT D23B composite names with the Type suffix
    dropped; never conflate a $def name with a property name.
  - Prefer extending the canonical core building blocks; flag any change that
    touches the shared core, because it affects every profile.
  - Descriptions are concept-first, plain English, and impartial; no reference to
    the source document version or to internal review.

Then:
  1. Edit the schema for each confirmed change (new property plus its JSON-LD
     context binding, or the agreed narrowing).
  2. Add or extend a worked example so the new field is exercised; keep it valid.
  3. Regenerate the data dictionary:  npm run build-dictionary:gbn-ag
  4. For any new or changed field, reconcile its entry in
     data/portal-pims-answers.json, then:  npm run build-pims-mapping:gbn-ag
  5. Validate:  npm run validate-schemas && npm run validate-samples
     && node scripts/check-coherence.js

Stop on any validation failure and report it. Do not advance the baseline -
promotion is a separate human action.
```

## Human decision points

Three points are deliberately human, not automated:
- the change list (step 4) - confirm what the schema needs before any edit;
- the edits and the PIMS reconciliation (steps 5 and 7) - reviewed before trust;
- promotion (step 9) - the baseline advances only on an explicit command.

## Scripts and data

| File (`scripts/gbn-ag-data-import/`) | Role | Type |
| --- | --- | --- |
| `fetch-confluence-page.mjs` | pull a Confluence page's XHTML + version sidecar | script (reusable) |
| `convert-live-animals-table.mjs` | XHTML -> table JSON; loud-fails on unknown structure | script |
| `lib/confluence-xhtml.mjs` | XHTML text helpers used by the converter | library |
| `diff-live-animals-table.mjs` | baseline vs next -> delta; `--promote` advances the baseline | script |
| `build-pims-data-mapping.js` | answers + table -> `pims-data-mapping.md` | script |
| `pims-coverage-report.js` | report PIMS-draft coverage (diagnostic) | script |

The data dictionary is generated by `scripts/build-data-dictionary.js`
(`npm run build-dictionary:gbn-ag`) and is shared with the other profiles.

Data layout under `scripts/gbn-ag-data-import/data/`:

| Path | Committed? | What |
| --- | --- | --- |
| `live-animals-table.json` | yes | the baseline (last-aligned state) |
| `portal-pims-answers.json` | yes | the reconciled PIMS field mappings |
| `portal-pims-table.json` | yes | the PIMS draft source |
| `scratch/` | no (gitignored) | per-run artefacts: page XHTML, sidecar, next table, delta |
