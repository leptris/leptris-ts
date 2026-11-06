import test from "node:test";
import assert from "node:assert/strict";
import * as lw from "../src/index.js";

test("write face: create/set/attach round-trips through the shim", async () => {
  await lw.init();
  const id = lw.loadSync("<catalog/>");
  try {
    const root = lw.createElementSync(id, "catalog");
    lw.setRootSync(id, root);
    lw.setAttributeSync(root, "version", "2");

    const item = lw.createElementSync(id, "item");
    lw.setAttributeSync(item, "id", "7");
    const name = lw.createElementSync(id, "name");
    const t = lw.createTextSync(id, "alpha");
    lw.appendChildSync(name, t);
    lw.appendChildSync(item, name);
    lw.appendChildSync(root, item);

    const out = lw.xmlSync(id);
    assert.match(out, /<catalog version="2">/);
    assert.match(out, /<item id="7"><name>alpha<\/name><\/item>/);
  } finally {
    lw.closeSync(id);
  }
});

test("write face: foreign-node attach adopts by copy", async () => {
  await lw.init();
  const a = lw.loadSync("<a/>");
  const b = lw.loadSync("<b/>");
  try {
    const ra = lw.createElementSync(a, "ra");
    lw.setRootSync(a, ra);
    const shared = lw.createElementSync(b, "shared");  // foreign: doc b
    const installed = lw.appendChildSync(ra, shared);
    assert.notStrictEqual(installed, shared, "foreign attach installs a copy");
    const out = lw.xmlSync(a);
    assert.match(out, /<shared\/>/);
  } finally {
    lw.closeSync(a);
    lw.closeSync(b);
  }
});
