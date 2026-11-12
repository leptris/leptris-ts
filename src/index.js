// leptris — XML for JavaScript at libleptris speed.
//
// ES module over the wasm bridge: parse, serialize, XPath string
// evaluation. Documents live in the wasm registry addressed by an
// integer id; load/close bracket their lifetime.

export const VERSION = "1.9.418";

export class XmlError extends Error {
  constructor(message, line, column) {
    super(message);
    this.name = "XmlError";
    this.line = line;
    this.column = column;
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
