// leptris — XML for JavaScript at libleptris speed.
//
// ES module over the wasm bridge: parse, serialize, XPath string
// evaluation. Documents live in the wasm registry addressed by an
// integer id; load/close bracket their lifetime.

export const VERSION = "1.9.359";

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
  return xmlSync(id);
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
  return xpathSync(id, expr);
}

/** Evaluate XPath synchronously after awaiting init(). */
export function xpathSync(id, expr) {
  requireInitialized();
  const buf = enc(expr);
  try {
    const ptr = theMod._leptris_wasm_xpath(id, buf);
    if (!ptr) return null;
    return readStr(ptr, true);
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
