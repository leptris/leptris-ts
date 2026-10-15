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
export function xmlSync(id: number): string;
export function xpathSync(id: number, expr: string): string | null;
export function closeSync(id: number): void;
export function treeSync(id: number): XmlElement;
