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
