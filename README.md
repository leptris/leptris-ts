# leptris

XML for JavaScript at [libleptris](https://github.com/leptris/leptris)
speed — the engine compiled to WebAssembly (ES module, no fallback).

```sh
npm install leptris
```

```js
import { load, xml, xpath, close } from "leptris";

const doc = await load('<catalog><item id="1">Hello</item></catalog>');
const out = await xml(doc);            // canonical XML emit
const v = await xpath(doc, "//item[1]"); // "Hello"
const n = await xpath(doc, "count(//item)"); // "1"
await close(doc);
```

- `load(xml)` — parse; malformed input throws `XmlError` with
  `line`/`column` when the parser reports them.
- `xml(doc)` — the engine's canonical serialization.
- `xpath(doc, expr)` — XPath 1.0; nodesets yield the first node's
  string value, atomics their string form.
- `close(doc)` — release the document.
- `version()` — the engine's version string.

The same model as [teptris-ts](https://github.com/leptris/teptris-ts)
and [yeptris-wasm](https://github.com/leptris/yeptris-wasm): a
contained C bridge (`src/leptris_wasm.c`) over the engine, compiled by
`build.sh` (emcc) from a sibling engine checkout, surfaced as an ES
module with TypeScript typings (`src/index.d.ts`).

## Build and test

```sh
ENGINESRC=../leptris/src ./build.sh   # emcc; any Emscripten ≥ 3
npm test
```

`utf8proc` and `iconv` are compiled out (the engine's
`LEPTRIS_ENABLE_*` defaults): input is validated UTF-8 and the
encoding table covers UTF-8 only. Documents cap at the bridge's
registry size (64 live documents).

## Status

Published to npm as **`leptris`** (tag-triggered CI build). Source
lives at [leptris/leptris-ts](https://github.com/leptris/leptris-ts).

## Structured XML access

`tree(doc)` returns a detached snapshot of the document element and its
children. Element snapshots contain `name` (qualified), `localName`, `prefix`,
`namespaceURI`, ordered `attributes` pairs and ordered `children`. Attributes
include the element's own `xmlns` declarations in source order. Ordinary attribute
values are decoded by the engine; namespace declaration values retain their
original lexical spelling (including entity references). `namespaceURI` reports
the engine's resolved namespace value. Child kinds are
`element`, `text`, `cdata`, `comment`, `pi` and `entity`. Document-level prolog
and epilog nodes are outside this root snapshot. Unsupported engine node kinds
cause an error rather than being silently omitted. Snapshots remain valid after
`close(doc)` and editing them does not mutate the document.

After initialization, synchronous operations are also available:

```js
import { init, loadSync, treeSync, closeSync } from "leptris";

await init();
const doc = loadSync('<root xmlns="urn:example"><item>x</item></root>');
try {
  const root = treeSync(doc);
  console.log(root.namespaceURI, root.children[0].localName);
} finally {
  closeSync(doc);
}
```

`loadSync`, `treeSync` and `closeSync` require a successful `await init()`
first; they throw before initialization. Async `load`, `tree` and `close`
remain available. Concurrent first calls share initialization. Always release
documents in `finally`: the registry supports at most 64 live documents.
TypeScript exposes snapshots as read-only views of detached data.

## Validation: XSD and Schematron

Schemas compile once into their own registry (16 live schemas) and
validate any number of loaded documents. Every face has a `Sync`
twin (after `await init()`).

```js
import { load, close, xsdCompile, xsdValidate, xsdErrorReportSync,
         xsdCloseSync, schematronCompile, schematronValid,
         schematronValidate, schematronCloseSync } from "leptris";

// XSD — 1.1 semantics apply when the schema root carries
// @version="1.1" (the engine's own selection).
const schema = await xsdCompile(`<xs:schema .../>`);
const doc = await load("<order>...</order>");
if (!(await xsdValidate(schema, doc))) {
  for (const f of xsdErrorReportSync(schema))   // findings of the
    console.log(f.kind, f.line, f.message);     // LAST validate call
}
await close(doc);
xsdCloseSync(schema);

// Schematron — validity = zero failed asserts; the SVRL report
// comes back as XML (parse it with load() to query).
const sch = await schematronCompile(schemaText /* , phase */);
if (!(await schematronValid(sch, doc))) {
  const svrl = await schematronValidate(sch, doc); // or null
}
schematronCloseSync(sch);
```

Failures surface as `XsdError` / `SchematronError` (both extend
`XmlError`): malformed schemas throw at compile with the engine's
detail; stale schema or document ids throw on the validating faces.
`xsdBuiltinValid("xs:date", s)` / `xsdSimpleValid(id, name, s)`
check lexical values without a document, returning `null` for an
unknown type name.
