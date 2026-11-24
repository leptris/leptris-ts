// leptris — TypeScript typings.
export const VERSION: string;

export class XmlError extends Error {
  name: "XmlError";
  line: number;
  column: number;
}

/** Load (and cache) the wasm module. */
export function init(): Promise<unknown>;

/** The engine's version string. */
export function version(): Promise<string>;

export class XsdError extends XmlError {
  name: "XsdError";
}
export class SchematronError extends XmlError {
  name: "SchematronError";
}

/** Parse XML. Malformed input throws XmlError with line/column.
 * Returns the document id. */
export function load(xml: string): Promise<number>;

/** Serialize a document to XML (the engine's canonical emit). */
export function xml(id: number): Promise<string>;

/** Serialize synchronously after awaiting init(). */
export function xmlSync(id: number): string;

/** Evaluate an XPath; nodesets yield the first node's string
 * value, atomics yield their string form. */
export function xpath(id: number, expr: string): Promise<string | null>;

/** Full XPath result shape (see index.js xpathFull). */
export function xpathFull(
  id: number,
  expr: string,
): Promise<{
  kind: number;
  string: string;
  boolean: boolean;
  number: number;
  nodes: { name: string | null; value: string | null; kind: number }[];
} | null>;

/** Release a document. */
export function close(id: number): Promise<void>;

/** Detached root snapshot; ordered attributes include local xmlns declarations.
 * Each attribute is [name, value, namespaceURI|null] — the third slot is the
 * RESOLVED namespace URI (null for declarations and unprefixed attributes),
 * so attribute classification matches element classification (ts#66). */
export interface XmlElement {
  readonly kind: "element";
  readonly name: string;
  readonly localName: string;
  readonly prefix: string | null;
  readonly namespaceURI: string | null;
  /** Ordinary values are engine-decoded; xmlns values retain lexical spelling. */
  readonly attributes: readonly (readonly [
    name: string,
    value: string,
    namespaceURI: string | null,
  ])[];
  readonly children: readonly XmlNode[];
}
export interface XmlText {
  readonly kind: "text" | "cdata" | "comment";
  readonly text: string;
}
export interface XmlInstruction {
  readonly kind: "pi";
  readonly target: string;
  readonly text: string;
}
export interface XmlEntityReference {
  readonly kind: "entity";
  readonly name: string;
}
export type XmlNode = XmlElement | XmlText | XmlInstruction | XmlEntityReference;

/** Document element only, not the prolog/epilog; valid after close(doc). */
export function tree(id: number): Promise<XmlElement>;
/** All Sync functions require one successful await init() first. */
export function loadSync(xml: string): number;
export function closeSync(id: number): void;
export function treeSync(id: number): XmlElement;

/* ---- write face: create/set/attach --------------------------------
 * Node handles are opaque engine addresses (numbers); serialize
 * through xml(id) after attaching. */
export function createElementSync(id: number, name: string): number;
export function createTextSync(id: number, text: string): number;
export function setAttributeSync(elem: number, name: string, value: string): void;
export function appendChildSync(parent: number, child: number): number;
export function setRootSync(id: number, elem: number): void;
export function createElement(id: number, name: string): Promise<number>;
export function createText(id: number, text: string): Promise<number>;
export function setAttribute(elem: number, name: string, value: string): Promise<void>;
export function appendChild(parent: number, child: number): Promise<number>;
export function setRoot(id: number, elem: number): Promise<void>;

/* ---- validation faces: XSD 1.1 + ISO Schematron --------------------
 * Schemas live in their own registries addressed by integer ids;
 * instances are documents already loaded with load(). All Sync
 * functions require one successful await init() first. */

/** Compile an XSD schema (effective 1.1/1.0 semantics come from the
 * schema root's @version). Throws XsdError on a malformed schema
 * (engine detail included). Returns the schema id. */
export function xsdCompileSync(schema: string): number;
export function xsdCompile(schema: string): Promise<number>;
/** Free a compiled schema; using the id afterwards throws XsdError
 * on the validating faces. */
export function xsdCloseSync(schemaId: number): void;
export function xsdClose(schemaId: number): Promise<void>;
/** Validate a loaded document. Throws XsdError when either id is
 * stale. */
export function xsdValidateSync(schemaId: number, docId: number): boolean;
export function xsdValidate(schemaId: number, docId: number): Promise<boolean>;
/** Findings of the LAST validate call on this schema (empty for a
 * valid document; the next validate replaces them). */
export interface XsdErrorRecord {
  kind: string | null;
  component: string | null;
  line: number;
  column: number;
  message: string | null;
}
export function xsdErrorReportSync(schemaId: number): XsdErrorRecord[];
export function xsdErrorReport(schemaId: number): Promise<XsdErrorRecord[]>;
/** The schema's effective XSD version: "1.1" or "1.0". */
export function xsdVersionSync(schemaId: number): string;
export function xsdVersion(schemaId: number): Promise<string>;
/** Top-level schema declarations compiled (0 is valid). */
export function xsdDeclarationCountSync(schemaId: number): number;
export function xsdDeclarationCount(schemaId: number): Promise<number>;
/** Validate a lexical value against a built-in datatype ("xs:NAME"
 * spelling); null when the name is not in the built-in table. */
export function xsdBuiltinValidSync(
  builtin: string,
  lexical: string,
): boolean | null;
export function xsdBuiltinValid(
  builtin: string,
  lexical: string,
): Promise<boolean | null>;
/** Validate a lexical value against a user simpleType by local
 * name; null when the schema has no such type. */
export function xsdSimpleValidSync(
  schemaId: number,
  typeName: string,
  lexical: string,
): boolean | null;
export function xsdSimpleValid(
  schemaId: number,
  typeName: string,
  lexical: string,
): Promise<boolean | null>;

/** Compile an ISO Schematron schema. `phase` optionally selects the
 * active patterns (an unknown phase id excludes every pattern — the
 * engine's semantic). Throws SchematronError on failure. */
export function schematronCompileSync(schema: string, phase?: string): number;
export function schematronCompile(
  schema: string,
  phase?: string,
): Promise<number>;
export function schematronCloseSync(schemaId: number): void;
export function schematronClose(schemaId: number): Promise<void>;
/** Schema-level error detail, or null when there is none. */
export function schematronErrorSync(schemaId: number): string | null;
export function schematronError(schemaId: number): Promise<string | null>;
/** Validity = zero failed asserts. Throws SchematronError when
 * either id is stale. */
export function schematronValidSync(schemaId: number, docId: number): boolean;
export function schematronValid(
  schemaId: number,
  docId: number,
): Promise<boolean>;
/** The SVRL report as serialized XML (parse it with load() to
 * query), or null when the engine produced no report. */
export function schematronValidateSync(
  schemaId: number,
  docId: number,
): string | null;
export function schematronValidate(
  schemaId: number,
  docId: number,
): Promise<string | null>;
