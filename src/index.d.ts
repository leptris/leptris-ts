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

/** Parse XML. Malformed input throws XmlError with line/column.
 * Returns the document id. */
export function load(xml: string): Promise<number>;

/** Serialize a document to XML (the engine's canonical emit). */
export function xml(id: number): Promise<string>;

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

/** Detached root snapshot; ordered attributes include local xmlns declarations. */
export interface XmlElement {
  readonly kind: "element";
  readonly name: string;
  readonly localName: string;
  readonly prefix: string | null;
  readonly namespaceURI: string | null;
  /** Ordinary values are engine-decoded; xmlns values retain lexical spelling. */
  readonly attributes: readonly (readonly [name: string, value: string])[];
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
