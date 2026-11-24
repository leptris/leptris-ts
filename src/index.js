// leptris — XML for JavaScript at libleptris speed.
//
// ES module over the wasm bridge: parse, serialize, XPath string
// evaluation. Documents live in the wasm registry addressed by an
// integer id; load/close bracket their lifetime.

export const VERSION = "1.9.441";

export class XmlError extends Error {
  constructor(message, line, column) {
    super(message);
    this.name = "XmlError";
    this.line = line;
    this.column = column;
  }
}

/** Schema compilation/validation failure (XSD face). */
export class XsdError extends XmlError {
  constructor(message, line, column) {
    super(message, line, column);
    this.name = "XsdError";
  }
}

/** Schema compilation/validation failure (Schematron face). */
export class SchematronError extends XmlError {
  constructor(message, line, column) {
    super(message, line, column);
    this.name = "SchematronError";
  }
}

let theMod = null;
let initPromise = null;

/** Load (and cache) the wasm module. */
export async function init() {
  if (theMod) return theMod;
  if (!initPromise) {
    initPromise = (async () => {
      const factory = (await import("../dist/leptris.mjs")).default;
      theMod = await factory();
      return theMod;
    })().catch((error) => {
      initPromise = null;
      throw error;
    });
  }
  return initPromise;
}

function requireInitialized() {
  if (!theMod) throw new Error("Call and await init() before using synchronous XML operations");
}

function enc(s) {
  const bytes = new TextEncoder().encode(s);
  const buf = theMod._malloc(bytes.length + 1);
  if (!buf) throw new XmlError("allocation failed", 0, 0);
  theMod.HEAPU8.set(bytes, buf);
  theMod.HEAPU8[buf + bytes.length] = 0;
  return buf;
}

function readStr(ptr, free) {
  try {
    return theMod.UTF8ToString(ptr);
  } finally {
    if (free) theMod._leptris_wasm_free_str(ptr);
  }
}

/** The engine's version string. */
export async function version() {
  await init();
  return readStr(theMod._leptris_wasm_version(), false);
}

/** Parse XML. Malformed input throws XmlError (line/column when
 * the parser reports them). Returns the document id. */
export async function load(xml) {
  await init();
  return loadSync(xml);
}

/** Parse synchronously after awaiting init(). */
export function loadSync(xml) {
  requireInitialized();
  const bytes = new TextEncoder().encode(xml);
  const buf = theMod._malloc(bytes.length + 1);
  if (!buf) throw new XmlError("allocation failed", 0, 0);
  theMod.HEAPU8.set(bytes, buf);
  theMod.HEAPU8[buf + bytes.length] = 0;
  try {
    const id = theMod._leptris_wasm_load(buf, bytes.length);
    if (id) return id;
  } finally {
    theMod._free(buf);
  }
  const msg =
    readStr(theMod._leptris_wasm_last_error(), false) ||
    "parse failed";
  const pos = theMod._malloc(8);
  if (!pos) throw new XmlError("allocation failed", 0, 0);
  try {
    theMod._leptris_wasm_last_error_position(pos, pos + 4);
    throw new XmlError(
      msg,
      theMod.HEAP32[pos >> 2],
      theMod.HEAP32[(pos + 4) >> 2]);
  } finally {
    theMod._free(pos);
  }
}

/** Serialize a document to XML (the engine's canonical emit). */
export async function xml(id) {
  await init();
  const ptr = theMod._leptris_wasm_xml(id);
  if (!ptr) throw new XmlError("serialization failed", 0, 0);
  return readStr(ptr, true);
}

/** Serialize synchronously after awaiting init(). */
export function xmlSync(id) {
  requireInitialized();
  const ptr = theMod._leptris_wasm_xml(id);
  if (!ptr) throw new XmlError("serialization failed", 0, 0);
  return readStr(ptr, true);
}

/** Evaluate an XPath; nodesets yield the first node's string
 * value, atomics yield their string form. NULL result = null. */
export async function xpath(id, expr) {
  await init();
  const buf = enc(expr);
  try {
    const ptr = theMod._leptris_wasm_xpath(id, buf);
    if (!ptr) return null;
    return readStr(ptr, true);
  } finally {
    theMod._free(buf);
  }
}

/** Full XPath result shape: {kind, string, boolean, number, nodes}.
 * kind is the engine enum (0 nodeset, 1 boolean, 2 number, 3 string,
 * 4 function item); nodes rows are {name, value, kind} in document
 * order for nodeset results. */
export async function xpathFull(id, expr) {
  await init();
  const buf = enc(expr);
  try {
    const ptr = theMod._leptris_wasm_xpath_full(id, buf);
    if (!ptr) return null;
    return JSON.parse(readStr(ptr, true));
  } finally {
    theMod._free(buf);
  }
}

/** Release a document. */
export async function close(id) {
  await init();
  closeSync(id);
}

/** Release a document synchronously after awaiting init(). */
export function closeSync(id) {
  requireInitialized();
  theMod._leptris_wasm_close(id);
}

/** Return a detached snapshot of the document element and descendants. */
export async function tree(id) {
  await init();
  return treeSync(id);
}

/** Return the same snapshot synchronously after awaiting init(). */
export function treeSync(id) {
  requireInitialized();
  const ptr = theMod._leptris_wasm_tree(id);
  if (!ptr) throw new XmlError("tree export failed", 0, 0);
  return JSON.parse(readStr(ptr, true));
}

/* ---- write face: create/set/attach (leptris-ts) -------------------
 * Node handles are opaque engine addresses (uint32); serialization
 * reads them back through the document registry. Synchronous after
 * await init(); the async twins delegate. */

function requireDoc(id) {
  requireInitialized();
  if (!Number.isInteger(id) || id < 1) {
    throw new XmlError("invalid document id", 0, 0);
  }
}

/** Create a detached element owned by `id`'s document. Returns the
 * node handle (opaque address) for appendChild/setAttribute. */
export function createElementSync(id, name) {
  requireDoc(id);
  const cname = enc(name);
  try {
    const addr = theMod._leptris_wasm_create_element(id, cname);
    if (!addr) throw new XmlError(readStr(theMod._leptris_wasm_last_error(), false) || "create_element failed", 0, 0);
    return addr;
  } finally {
    theMod._free(cname);
  }
}

/** Create a detached text node owned by `id`'s document. */
export function createTextSync(id, text) {
  requireDoc(id);
  const ctext = enc(text);
  try {
    const addr = theMod._leptris_wasm_create_text(id, ctext);
    if (!addr) throw new XmlError(readStr(theMod._leptris_wasm_last_error(), false) || "create_text failed", 0, 0);
    return addr;
  } finally {
    theMod._free(ctext);
  }
}

/** Set (or replace) an attribute on the element at `elem`. */
export function setAttributeSync(elem, name, value) {
  requireInitialized();
  if (!elem) throw new XmlError("invalid node handle", 0, 0);
  const cname = enc(name);
  const cvalue = enc(value);
  try {
    const st = theMod._leptris_wasm_set_attribute(elem, cname, cvalue);
    if (st !== 0) throw new XmlError("set_attribute failed (status " + st + ")", 0, 0);
  } finally {
    theMod._free(cname);
    theMod._free(cvalue);
  }
}

/** Append `child` under `parent`. Returns the EFFECTIVE installed
 * handle — a foreign-node attach is adopted by copy, so keep the
 * returned handle for later calls. */
export function appendChildSync(parent, child) {
  requireInitialized();
  if (!parent || !child) throw new XmlError("invalid node handle", 0, 0);
  const installedBuf = theMod._malloc(4);
  if (!installedBuf) throw new XmlError("allocation failed", 0, 0);
  try {
    const st = theMod._leptris_wasm_add_child(parent, child, installedBuf);
    if (st !== 0) throw new XmlError("add_child failed (status " + st + ")", 0, 0);
    return theMod.HEAPU8[installedBuf] |
           (theMod.HEAPU8[installedBuf + 1] << 8) |
           (theMod.HEAPU8[installedBuf + 2] << 16) |
           (theMod.HEAPU8[installedBuf + 3] << 24) >>> 0;
  } finally {
    theMod._free(installedBuf);
  }
}

/** Set the document's root element (attaches a detached element). */
export function setRootSync(id, elem) {
  requireDoc(id);
  if (!elem) throw new XmlError("invalid node handle", 0, 0);
  const st = theMod._leptris_wasm_set_root(id, elem);
  if (st !== 0) throw new XmlError("set_root failed (status " + st + ")", 0, 0);
}

export async function createElement(id, name) {
  await init();
  return createElementSync(id, name);
}
export async function createText(id, text) {
  await init();
  return createTextSync(id, text);
}
export async function setAttribute(elem, name, value) {
  await init();
  return setAttributeSync(elem, name, value);
}
export async function appendChild(parent, child) {
  await init();
  return appendChildSync(parent, child);
}
export async function setRoot(id, elem) {
  await init();
  return setRootSync(id, elem);
}

/* ---- validation faces: XSD 1.1 + ISO Schematron (leptris-ts#92) ----
 * Schemas live in their own wasm registries addressed by integer
 * ids (0 = failure), mirroring the document registry; instances are
 * documents already loaded with load(). Synchronous after await
 * init(); the async twins delegate. */

/** Encode to a NUL-terminated heap buffer, returning {buf, len}
 * (len excludes the terminator). Caller frees buf. */
function encBytes(s) {
  const bytes = new TextEncoder().encode(s);
  const buf = theMod._malloc(bytes.length + 1);
  if (!buf) throw new XmlError("allocation failed", 0, 0);
  theMod.HEAPU8.set(bytes, buf);
  theMod.HEAPU8[buf + bytes.length] = 0;
  return { buf, len: bytes.length };
}

function lastErrorMessage(fallback) {
  return readStr(theMod._leptris_wasm_last_error(), false) || fallback;
}

/** Compile an XSD schema (engine's 1.1/1.0 selection is the
 * schema's own @version). Throws XsdError on a malformed schema
 * (engine detail included) — the error-carrying handle is freed
 * before throwing. Returns the schema id for the other xsd* faces. */
export function xsdCompileSync(schema) {
  requireInitialized();
  const { buf, len } = encBytes(schema);
  try {
    const id = theMod._leptris_wasm_xsd_compile(buf, len);
    if (!id) throw new XsdError(lastErrorMessage("xsd compile failed"), 0, 0);
    const err = theMod._leptris_wasm_xsd_error(id);
    if (err) {
      const detail = readStr(err, true);
      theMod._leptris_wasm_xsd_close(id);
      throw new XsdError("XSD schema invalid: " + detail, 0, 0);
    }
    return id;
  } finally {
    theMod._free(buf);
  }
}

/** Free a compiled schema. Using the id afterwards throws XsdError
 * on the validating faces. */
export function xsdCloseSync(id) {
  requireInitialized();
  theMod._leptris_wasm_xsd_close(id);
}

/** Validate a loaded document against the schema. Throws XsdError
 * when either id is stale (status -1). */
export function xsdValidateSync(schemaId, docId) {
  requireInitialized();
  const st = theMod._leptris_wasm_xsd_validate(schemaId, docId);
  if (st === -1) {
    throw new XsdError(
      "xsd_validate: invalid schema or document id", 0, 0);
  }
  return st === 1;
}

/** Structured findings of the LAST xsdValidateSync call on this
 * schema: [{kind, component, line, column, message}] — empty when
 * the document was valid (the next validate replaces them). */
export function xsdErrorReportSync(schemaId) {
  requireInitialized();
  const ptr = theMod._leptris_wasm_xsd_error_report(schemaId);
  if (!ptr) {
    throw new XsdError("xsd error report failed (invalid schema id)", 0, 0);
  }
  return JSON.parse(readStr(ptr, true));
}

/** The schema's effective XSD version: "1.1" (root @version="1.1")
 * or "1.0". */
export function xsdVersionSync(schemaId) {
  requireInitialized();
  const ptr = theMod._leptris_wasm_xsd_version(schemaId);
  if (!ptr) throw new XsdError("invalid schema id", 0, 0);
  return readStr(ptr, true);
}

/** Top-level schema declarations compiled (0 is valid). */
export function xsdDeclarationCountSync(schemaId) {
  requireInitialized();
  const count = theMod._leptris_wasm_xsd_declaration_count(schemaId);
  if (count === -1) throw new XsdError("invalid schema id", 0, 0);
  return count;
}

/** Validate `lexical` against a built-in datatype ("xs:NAME"
 * spelling). Returns true/false, or null when the name is not in
 * the engine's built-in table. */
export function xsdBuiltinValidSync(builtin, lexical) {
  requireInitialized();
  const cb = enc(builtin);
  const cl = enc(lexical);
  try {
    const rc = theMod._leptris_wasm_xsd_builtin_valid(cb, cl);
    return rc === -1 ? null : rc === 1;
  } finally {
    theMod._free(cb);
    theMod._free(cl);
  }
}

/** Validate `lexical` against a user simpleType compiled into the
 * schema, by local name (restriction chains check every hop).
 * Returns true/false, or null when the schema has no such type. */
export function xsdSimpleValidSync(schemaId, typeName, lexical) {
  requireInitialized();
  const ct = enc(typeName);
  const cl = enc(lexical);
  try {
    const rc = theMod._leptris_wasm_xsd_simple_valid(schemaId, ct, cl);
    return rc === -1 ? null : rc === 1;
  } finally {
    theMod._free(ct);
    theMod._free(cl);
  }
}

/** Compile an ISO Schematron schema. `phase` (optional) selects the
 * active patterns; an unknown phase id excludes every pattern (the
 * engine's semantic — validity is then vacuously true). Throws
 * SchematronError with the engine's detail on failure. */
export function schematronCompileSync(schema, phase) {
  requireInitialized();
  const { buf, len } = encBytes(schema);
  const pbuf = phase != null ? enc(phase) : 0;
  try {
    const id =
      theMod._leptris_wasm_schematron_compile(buf, len, pbuf || 0);
    if (!id) {
      throw new SchematronError(
        lastErrorMessage("schematron compile failed"), 0, 0);
    }
    return id;
  } finally {
    theMod._free(buf);
    if (pbuf) theMod._free(pbuf);
  }
}

/** Free a compiled Schematron schema. */
export function schematronCloseSync(id) {
  requireInitialized();
  theMod._leptris_wasm_schematron_close(id);
}

/** Schema-level error detail, or null when there is none. */
export function schematronErrorSync(id) {
  requireInitialized();
  const ptr = theMod._leptris_wasm_schematron_error(id);
  if (!ptr) return null;
  return readStr(ptr, true);
}

/** Validity = zero failed asserts (successful reports do not
 * invalidate). Throws SchematronError when either id is stale. */
export function schematronValidSync(schId, docId) {
  requireInitialized();
  const st = theMod._leptris_wasm_schematron_valid(schId, docId);
  if (st === -1) {
    throw new SchematronError(
      "schematron_valid: invalid schema or document id", 0, 0);
  }
  return st === 1;
}

/** The full SVRL report (svrl:schematron-output with failed-assert
 * / successful-report entries) as serialized XML, or null when the
 * engine produced no report. Parse it with load() to query it. */
export function schematronValidateSync(schId, docId) {
  requireInitialized();
  const ptr = theMod._leptris_wasm_schematron_validate(schId, docId);
  if (!ptr) return null;
  return readStr(ptr, true);
}

export async function xsdCompile(schema) {
  await init();
  return xsdCompileSync(schema);
}
export async function xsdValidate(schemaId, docId) {
  await init();
  return xsdValidateSync(schemaId, docId);
}
export async function xsdErrorReport(schemaId) {
  await init();
  return xsdErrorReportSync(schemaId);
}
export async function xsdVersion(schemaId) {
  await init();
  return xsdVersionSync(schemaId);
}
export async function xsdClose(schemaId) {
  await init();
  return xsdCloseSync(schemaId);
}
export async function xsdDeclarationCount(schemaId) {
  await init();
  return xsdDeclarationCountSync(schemaId);
}
export async function xsdBuiltinValid(builtin, lexical) {
  await init();
  return xsdBuiltinValidSync(builtin, lexical);
}
export async function xsdSimpleValid(schemaId, typeName, lexical) {
  await init();
  return xsdSimpleValidSync(schemaId, typeName, lexical);
}
export async function schematronCompile(schema, phase) {
  await init();
  return schematronCompileSync(schema, phase);
}
export async function schematronClose(schemaId) {
  await init();
  return schematronCloseSync(schemaId);
}
export async function schematronError(schemaId) {
  await init();
  return schematronErrorSync(schemaId);
}
export async function schematronValid(schId, docId) {
  await init();
  return schematronValidSync(schId, docId);
}
export async function schematronValidate(schId, docId) {
  await init();
  return schematronValidateSync(schId, docId);
}
