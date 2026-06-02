---
name: editorial
description: Editorial review and writing process for documents that humans will read - PR descriptions, READMEs, design docs, commit bodies, RFCs. Recursively drills from surface text to essence by asking what we're trying to say and why; includes a style guide of mechanical rules. Use when the user asks to review, sharpen, edit, or write a doc.
---

Follow this process when asked to review, write, or sharpen a doc. Interrogate every sentence until what remains is what we meant. Mechanical conventions live in the style guide at the bottom - apply as you go.

## Contents

- **Process** - steps 1 to 9.
- **Output behaviour**.
- **Style guide**.

## 1. Frame the reader

Decide who is reading this cold:

- Role and context.
- Concepts they already hold.
- Concepts that need first-use introduction.
- What action they need to take (approve, replicate, decide).
- Never assume the reader is a machine or has any visibility of the intermediate material used to generate an output

This frame is the lens for every later decision. Assume your audience is a cold reader.

## 2. Drill from surface to essence

For each section, paragraph, sentence, recursively ask:

- **What am I trying to say?**
- **Why am I saying it?**
- **Is this the real reason, or a surface gloss?**

When the question feels answered, ask once more. The first answer is usually the framing, the second is the substance, the third is the core.

**Worked example B.** A statement is written "adds typeCode + urlId (D23B unece:typeCode)":

- *Why is this a question?* What am I trying to say? Why would a reader care? Does my reader know about typeCodes, or D23B? 
- *What should have been written*: Vet handling and inspection regimes differ for live animals vs semen vs embryos vs ova. The CN commodity code does not always discriminate form, the urlId is added to the typeCode so we can tell the difference. UN/CEFACT uses these properties within the TradeProduct to convey this information.

**Worked example.** An open question started as "is `private_transporter_approval_number` a real Defra scheme?". Drilling:

- *Why is this a question?* We used the name in samples without registering it.
- *Why does that matter?* Consumers can't dereference an unregistered scheme name.
- *Why is there no way?* No mechanism exists for Defra-side scheme IDs that aren't in TRACES.
- *Other examples?* `cph_number`, `bcp_reference`, per-animal identifier types.

The surface question was about one scheme. The real question was the codelist mechanism.

## 3. Hunt jargon and opaque labels

Internal labels mean nothing to a cold reader. Watch for:

- Phase names, path names, ticket codes ("Path A / Path B", "Phase 2").
- Pattern names without explanation ("by-reference attachment pattern").
- Tag names where the tag was just invented (`schemeId: foo` where `foo` does not exist anywhere).
- Acronyms or product names used before first introduction.

For each, replace with substance or introduce on first use.

## 4. Verifiability check

Don't cite what a reader can't verify - gitignored files, local-only data, named schemes that don't exist. If a claim depends on inaccessible data, restate it inline as a standalone fact ("Some commodities are measured in weight") instead of citing the source ("Defra refdata says X").

## 5. Honesty on open questions

Before listing a question as open, ask: could a grep or read answer it?

- If yes - do it; bring back the answer.
- If partly - lead with the finding, propose a position, narrow what remains open.

## 6. Anti-circularity

If a change's source and its justification are the same authority, the "why" is empty. "TIG naming alignment" when TIG owns the schema is a tautology. Trace to the real why: canonical vocabulary, source data, or use case.

## 7. Decoration cull

For each sentence, ask: would removing this confuse the reader? If no, cut.

Common decoration:

- Line counts and refactor narrative ("370 lines, down from 770").
- Pattern-matching observations ("matches the pattern X uses").
- Self-congratulation ("All N schemas compile").
- Restating what property names already say.
- Section intros that repeat the heading.

## 8. Structural pass

- Related items with the same shape → table.
- Short unrelated items → bullets.
- Don't comma-cram a paragraph that wants to be enumerated.
- Headings name what's below concretely ("Extensions to existing types"), not generically ("Overview").

## 9. Concrete over abstract

When something feels hand-wavy, paste the JSON, name the property, give the actual scheme ID.

## Output behaviour

- Non-trivial restructures (whole sections, reordering, framing shifts) - describe before editing.
- Tightening passes (cuts, swaps, jargon replacement) - just edit and summarise.
- After substantive edits, re-read with the reader frame from step 1.

---

## Style guide

Mechanical rules. Apply without thinking.

### Punctuation

- No em-dashes. Use a plain hyphen `-` (with a space on each side for a sentence break).
- Plain `"` and `'` quotes, not curly variants.

### Code identifiers

- Backticks around every property name, scheme ID, code value, file path, type name, JSON Schema keyword. Examples: `partyTypeCode`, `cph_number`, `H87`, `samples/imports/...`, `TradeParty`, `oneOf`.

### Lists and enumerations

- Related items with the same shape → table.
- Short unrelated items → bullets.
- Don't comma-cram.

### Section headings

- Name what's below concretely.
- Prefer "**Bold lead-in**" paragraphs over deeper heading levels.

### Schema `$def` names vs property names

- A `$def` name lives in the schema; it's invisible in a JSON instance.
- A property name appears in instance data and is what the reader will grep for.
- When both matter, name both: `gbnAgTradeProduct` `$def` (property: `specifiedTradeProduct[]`).
- Never substitute one for the other.

### Acronyms and domain terms

- Introduce on first use. TRACES, TIG, IPAFFS, CHED-A, UNTDID 1001, BSP, BCP, CPH - none are self-explanatory cold.
- Internal labels (Path A, Phase 2) are banned. Describe in domain terms.

### Code examples

- JSON with `//` comments → unmarked code fence ``` ``` ``` (a ```` ```json ```` fence trips linters).
- Pure JSON → ```` ```json ```` is fine.

### References

- Don't reference files that are gitignored. If context is needed, provide an inline summary.

### Tone

- Statements, not pronouncements ("X retains `schemeId`", not "Each is justified by real TRACES data carrying schemeId").
- Factual, not personality-driven.
- No self-congratulation.