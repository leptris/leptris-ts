import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

function runFreshModule(script) {
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", script],
    { encoding: "utf8", timeout: 30_000 });
  assert.ifError(child.error);
  assert.equal(child.status, 0, child.stderr || child.stdout);
}

const entrypoint = new URL("../src/index.js", import.meta.url).href;

test("concurrent first loads share one WASM document registry", () => {
  runFreshModule(`
    import assert from "node:assert/strict";
    import { init, load, xml, close } from ${JSON.stringify(entrypoint)};

    const [first, second] = await Promise.all([
      load("<a>A</a>"),
      load("<b>B</b>"),
    ]);
    try {
      assert.notEqual(first, second);
      assert.equal(await xml(first), "<a>A</a>");
      assert.equal(await xml(second), "<b>B</b>");
      const [left, right] = await Promise.all([init(), init()]);
      assert.equal(left, right);
    } finally {
      await close(first);
      await close(second);
    }
  `);
});

test("initialization can retry after a failed module load", () => {
  const distribution = new URL("../dist/", import.meta.url).href;
  runFreshModule(`
    import assert from "node:assert/strict";
    import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
    import { tmpdir } from "node:os";
    import { join } from "node:path";
    import { pathToFileURL } from "node:url";

    const directory = await mkdtemp(join(tmpdir(), "leptris-init-"));
    try {
      await mkdir(join(directory, "src"));
      const target = join(directory, "src", "index.mjs");
      await cp(new URL(${JSON.stringify(entrypoint)}), target);
      const { init, load, xml, close } = await import(pathToFileURL(target).href);
      await assert.rejects(init(), { code: "ERR_MODULE_NOT_FOUND" });
      await cp(new URL(${JSON.stringify(distribution)}), join(directory, "dist"),
        { recursive: true });
      await init();
      const id = await load("<retry/>");
      try {
        assert.equal(await xml(id), "<retry/>");
      } finally {
        await close(id);
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  `);
});
