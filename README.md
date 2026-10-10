# leptris

XML for JavaScript at [libleptris](https://github.com/leptris/leptris)
speed — the engine compiled to WebAssembly (ES module, no fallback).

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

The same model as [teptris-wasm](https://github.com/leptris/teptris-wasm)
and [yeptris-wasm](https://github.com/leptris/yeptris-wasm): a
contained C bridge (`src/leptris_wasm.c`) over the engine, compiled by
`build.sh` (emcc) from a sibling engine checkout, surfaced as an ES
module with TypeScript typings (`src/index.d.ts`).

## Build and test

```sh
ENGINESRC=../leptris/src ./build.sh   # emcc; any Emscripten ≥ 3
node --test test/test.mjs
```

`utf8proc` and `iconv` are compiled out (the engine's
`LEPTRIS_ENABLE_*` defaults): input is validated UTF-8 and the
encoding table covers UTF-8 only. Documents cap at the bridge's
registry size (64 live documents).

## Status

Published to npm as **`leptris`** (tag-triggered CI build). Source
lives at [leptris/leptris-wasm](https://github.com/leptris/leptris-wasm).
