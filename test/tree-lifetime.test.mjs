import { test } from "node:test";
import assert from "node:assert/strict";
import factory from "../dist/leptris.mjs";

for (const queryNamespace of [false, true]) {
  test(`inherited namespace snapshots survive reuse${queryNamespace ? " after namespace XPath and serialization" : ""}`, async () => {
    // A fresh module fixes the allocator's initial state. Namespace resolution
    // must not create an uninitialized attribute journal on plain descendants.
    const mod = await factory();
    for (let i = 0; i < 40; i++) {
      const count = (i % 20) + 1;
      const input = `<r xmlns="urn:r">${"<a>text</a>".repeat(count)}</r>`;
      const bytes = new TextEncoder().encode(input);
      const buffer = mod._malloc(bytes.length + 1);
      assert.ok(buffer);
      mod.HEAPU8.set(bytes, buffer);
      mod.HEAPU8[buffer + bytes.length] = 0;
      let id;
      try {
        id = mod._leptris_wasm_load(buffer, bytes.length);
      } finally {
        mod._free(buffer);
      }
      assert.ok(id);
      try {
        if (queryNamespace) {
          const expression = new TextEncoder().encode("namespace-uri(/*/*)");
          const expr = mod._malloc(expression.length + 1);
          assert.ok(expr);
          mod.HEAPU8.set(expression, expr);
          mod.HEAPU8[expr + expression.length] = 0;
          let value;
          try {
            value = mod._leptris_wasm_xpath(id, expr);
          } finally {
            mod._free(expr);
          }
          assert.ok(value);
          try {
            assert.equal(mod.UTF8ToString(value), "urn:r");
          } finally {
            mod._leptris_wasm_free_str(value);
          }
          const serialized = mod._leptris_wasm_xml(id);
          assert.ok(serialized);
          mod._leptris_wasm_free_str(serialized);
        }
        const result = mod._leptris_wasm_tree(id);
        assert.ok(result, `snapshot ${i}`);
        let tree;
        try {
          tree = JSON.parse(mod.UTF8ToString(result));
        } finally {
          mod._leptris_wasm_free_str(result);
        }
        assert.equal(tree.namespaceURI, "urn:r");
        assert.equal(tree.children.length, count);
        for (const child of tree.children) {
          assert.equal(child.namespaceURI, "urn:r");
          assert.deepEqual(child.attributes, []);
          assert.deepEqual(child.children, [{ kind: "text", text: "text" }]);
        }
      } finally {
        mod._leptris_wasm_close(id);
      }
    }
  });
}
