import { test } from "node:test";
import assert from "node:assert/strict";
import { load, xml, xpath, close, version, XmlError } from "../src/index.js";

const DOC = `<?xml version="1.0"?>
<catalog id="c1">
  <item id="1">Hello</item>
  <item id="2" kind="x">World</item>
</catalog>`;

test("round trip: parse then serialize", async () => {
  const id = await load(DOC);
  const out = await xml(id);
  assert.match(out, /<catalog id="c1">/);
  assert.match(out, /<item id="1">Hello<\/item>/);
  assert.match(out, /<\/catalog>/);
  await close(id);
});

test("xpath: string values and counts", async () => {
  const id = await load(DOC);
  assert.equal(await xpath(id, "string(/catalog/@id)"), "c1");
  assert.equal(await xpath(id, "//item[1]"), "Hello");
  assert.equal(await xpath(id, "count(//item)"), "2");
  assert.equal(await xpath(id, "//item[@kind]/@id"), "2");
  await close(id);
});

test("malformed input throws XmlError with position", async () => {
  await assert.rejects(
    () => load("<r><a></r>"),
    (e) => e instanceof XmlError && typeof e.message === "string");
});

test("empty and self-closing shapes", async () => {
  const id = await load("<r/>");
  assert.equal(await xml(id), "<r/>");
  await close(id);
});

test("version", async () => {
  assert.match(await version(), /^1\./);
});
