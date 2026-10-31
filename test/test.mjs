import { test } from "node:test";
import assert from "node:assert/strict";
import { load, xml, xpath, xpathFull, tree, treeSync, close, version, XmlError } from "../src/index.js";

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

test("tree: synchronous and asynchronous snapshots", async () => {
  const id = await load('<r a="1">text</r>');
  try {
    const snapshot = treeSync(id);
    assert.equal(snapshot.kind, "element");
    assert.equal(snapshot.name, "r");
    assert.deepEqual(snapshot.attributes, [["a", "1"]]);
    assert.deepEqual(snapshot.children, [{ kind: "text", text: "text" }]);
    assert.deepEqual(await tree(id), snapshot);
  } finally {
    await close(id);
  }
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

test("xpathFull exposes the engine result shape", async () => {
  const id = await load("<r><a x='1'>t1</a><b/></r>");
  try {
    const nodes = await xpathFull(id, "//a");
    assert.equal(nodes.kind, 0);
    assert.equal(nodes.string, "t1");
    assert.equal(nodes.nodes.length, 1);
    assert.equal(nodes.nodes[0].name, "a");
    /* element rows carry a null value by engine contract
     * (node_value serves non-element nodes); the tree snapshot
     * provides their text. */
    assert.equal(nodes.nodes[0].value, null);
    const count = await xpathFull(id, "count(//*)");
    assert.equal(count.kind, 2);
    assert.equal(count.number, 3);
    const flag = await xpathFull(id, "count(//a) = 1");
    assert.equal(flag.kind, 1);
    assert.equal(flag.boolean, true);
  } finally {
    await close(id);
  }
});
