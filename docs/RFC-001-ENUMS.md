# Schema Constraints

## documentStatusCode: Per-Profile Enum Constraints

### Background

INTRA and CHED certificates share a single core schema
(`defra-unvtd-canonical-core-v1.schema.json`). The `documentStatusCode` field is
defined there as an unconstrained `string`. The valid status codes differ by
certificate type — CHED supports 15 codes (including authorisation-specific ones
such as `97`, `146`, `124`, `35`, `99`, `122`, `68`) while INTRA supports only 8.

The applicable codes for each type are listed at the bottom of this document.

---

### Issue 1: The core schema cannot express per-type enum constraints

The core schema is shared. It cannot enumerate the INTRA set or the CHED set
without accepting values that are invalid for the other type.

JSON Schema 2020-12 does support this through profile-level narrowing. Each
profile schema uses `allOf` to extend the core, and can add constraints on
properties within that `allOf` block — the same pattern already used for
`documentTypeCode` (CHED constrains it to `"636"`; INTRA to `["666", "856"]`).

Two approaches are viable at the schema level:

**Option A — `enum` array** (enforces + documents valid values):
```json
"documentStatusCode": {
  "enum": ["47", "1", "42", "70", "41", "55", "64", "44"]
}
```

**Option B — `oneOf` with `const` + `title`** (enforces + documents values with
human-readable labels, standard JSON Schema annotation approach):
```json
"documentStatusCode": {
  "oneOf": [
    { "const": "47", "title": "Draft" },
    { "const": "1",  "title": "New" },
    { "const": "42", "title": "In progress" },
    ...
  ]
}
```

Both enforce valid values at the JSON Schema validation boundary and surface the
allowed values in OpenAPI documentation tooling (Swagger UI, Scalar, etc.).

---

### Issue 2: Typed language code generation (e.g. .NET)

JSON Schema's `allOf` + property narrowing is a validation concept. It does not
map cleanly to OOP class hierarchies. Code generators (NSwag, OpenAPI Generator,
NJsonSchema) interpret `allOf` as inheritance, but C# does not support covariant
property type overriding — a base class property typed as `string` cannot be
redeclared as an enum in a subclass.

In practice, generators will either:
- Ignore the profile-level enum and emit `string` (losing type safety), or
- Produce broken or duplicated classes attempting to merge the `allOf` members.

---

### Issue 3: Two schemas pushes the problem to consumers

The natural response to Issue 2 is to expose separate `IntraCertificate` and
`ChedCertificate` schemas (via `oneOf` + discriminator on `$type` in OpenAPI).
This is correct modelling, but it does not eliminate the problem — it moves it.
Any strongly-typed consumer must still branch on `$type` to determine which type
they hold, and therefore which status codes are valid. The branching is inherent
to the domain; the schema choice determines only where it surfaces.

---

### High-Level Proposals

| # | Approach | Schema enforcement | .NET type safety | Consumer complexity |
|---|----------|--------------------|------------------|---------------------|
| 1 | Keep `string` in core, no profile constraint | None | Low (string) | Low — but runtime surprises |
| 2 | Profile-level `enum` or `oneOf` constraint | At validation boundary | Low (string in generated code) | Low — single schema, validated at ingress |
| 3 | Separate OpenAPI schemas with `oneOf` + discriminator | Per-type | High (separate typed classes) | Higher — consumer must handle both types |
| 4 | Application-layer validation only | None in schema | Low (string) | Low — constraints in code, not schema |

**Recommended direction:** Option 2. Add the per-type `oneOf` constraint in each
profile schema. This documents valid values in the schema (visible in tooling),
enforces them at the API boundary via JSON Schema validation, and keeps the
OpenAPI surface as a single schema. .NET consumers receive `string` from code
generators, which is acceptable — profile-level status code correctness is a
domain validation concern, not a type-system concern.

Option 3 (separate schemas) is the most correct model if consumers need compile-time
type safety per certificate type, but the added complexity is only justified if
there is a concrete requirement for it.

---

## INTRA Status Codes

| StatusCode | UN/Cefact description        | TRACES Description |
|------------|------------------------------|--------------------|
| 47         | Draft version                | Draft              |
| 1          | To be done                   | New                |
| 42         | Approval pending             | In progress        |
| 70         | Issued                       | Validated          |
| 41         | Rejected                     | Rejected           |
| 55         | Extracted                    | Deleted            |
| 64         | Order or request cancelled   | Cancelled          |
| 44         | Replaced                     | Replaced           |


## CHED Status Codes

| StatusCode           | UN/Cefact description        | TRACES Description                     | Final status | Requires subsequent CHED | Can be replaced | Can be cancelled |  A  |  P  |  PP |  D  |  N  |
|----------------------|------------------------------|----------------------------------------|:------------:|:------------------------:|:---------------:|:----------------:|:---:|:---:|:---:|:---:|:---:|
| 47                   | Draft version                | Draft                                  |      NO      |            NO            |       YES       |        YES       | YES | YES | YES | YES | YES |
| 1                    | To be done                   | New                                    |      NO      |            NO            |       YES       |        YES       | YES | YES | YES | YES | YES |
| 42                   | Approval pending             | In progress                            |      NO      |            NO            |       YES       |        YES       | YES | YES | YES | YES | YES |
| 97                   | Pending                      | Authorized for onward transportation   |      YES     |           YES            |       YES       |        YES       |  NO |  NO | YES | YES | YES |
| 146                  | Transhipped                  | Authorized for transhipment            |      YES     |           YES            |       YES       |        YES       |  NO | YES | YES |  NO |  NO |
| 124                  | For transfer                 | Authorized for transfer to             |      YES     |           YES            |       YES       |        YES       |  NO |  NO | YES | YES | YES |
| 35                   | Forwarded to destination     | Authorized for onward travel           |      YES     |           YES            |       YES       |        YES       | YES |  NO |  NO |  NO |  NO |
| 99                   | Transferred out              | Authorized for transit                 |      YES     |            NO            |       YES       |        YES       | YES | YES | YES | YES | YES |
| 41                   | Rejected                     | Rejected                               |      YES     |            NO            |       YES       |        NO        | YES | YES | YES | YES | YES |
| 122                  | Partial                      | Partially rejected                     |      YES     |            NO            |        NO       |        NO        | YES | YES | YES | YES | YES |
| 70                   | Issued                       | Validated                              |      YES     |            NO            |       YES       |        YES       | YES | YES | YES | YES | YES |
| 55                   | Extracted                    | Deleted                                |      YES     |            NO            |        NO       |        NO        | YES | YES | YES | YES | YES |
| 64                   | Order or request cancelled   | Cancelled                              |      YES     |            NO            |        NO       |        NO        | YES | YES | YES | YES | YES |
| 44                   | Replaced                     | Replaced                               |      YES     |            NO            |        NO       |        NO        | YES | YES | YES | YES | YES |
| 68 (temporarily 70)  | Split                        | Split                                  |      YES     |           YES            |        NO       |        NO        | YES | YES | YES | YES | YES |
