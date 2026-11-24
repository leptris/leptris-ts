import { test } from "node:test";
import assert from "node:assert/strict";
import {
  load,
  close,
  loadSync,
  closeSync,
  init,
  schematronCompile,
  schematronCompileSync,
  schematronValid,
  schematronValidSync,
  schematronValidate,
  schematronValidateSync,
  schematronErrorSync,
  schematronCloseSync,
  SchematronError,
} from "../src/index.js";

const SCHEMA = `<schema xmlns='http://purl.oclc.org/dsdl/schematron'
 queryBinding='xslt'>
  <pattern id='p1'>
    <rule context='item'>
      <assert test='@price > 0' role='fatal'>price must be positive</assert>
      <report test='@price > 100'>price is high</report>
    </rule>
    <rule context='catalog'>
      <assert test='count(item) > 0'>catalog needs items</assert>
    </rule>
  </pattern>
</schema>`;

const GOOD_DOC = `<catalog><item price='5'>a</item><item price='120'>b</item></catalog>`;
const BAD_DOC = `<catalog><item price='-3'>a</item></catalog>`;

const SCHEMA_PHASED = `<schema xmlns='http://purl.oclc.org/dsdl/schematron'
 queryBinding='xslt'>
  <phase id='quick'><active pattern='p1'/></phase>
  <pattern id='p1'><rule context='a'>
    <assert test='@v'>a needs v</assert></rule></pattern>
  <pattern id='p2'><rule context='b'>
    <assert test='@w'>b needs w</assert></rule></pattern>
</schema>`;

test("schematron: valid document passes, SVRL has no failed-assert", async () => {
  const sch = await schematronCompile(SCHEMA);
  try {
    const doc = await load(GOOD_DOC);
    try {
      assert.equal(await schematronValid(sch, doc), true);
      const svrl = await schematronValidate(sch, doc);
      assert.ok(svrl.includes("schematron-output"));
      assert.ok(!svrl.includes("failed-assert"));
      assert.ok(svrl.includes("successful-report"));
      assert.ok(svrl.includes("price is high"));
    } finally {
      await close(doc);
    }
  } finally {
    schematronCloseSync(sch);
  }
});

test("schematron: failed assert fails validity and lands in the SVRL", async () => {
  const sch = await schematronCompile(SCHEMA);
  try {
    const doc = await load(BAD_DOC);
    try {
      assert.equal(await schematronValid(sch, doc), false);
      const svrl = await schematronValidate(sch, doc);
      assert.ok(svrl.includes("failed-assert"));
      assert.ok(svrl.includes("price must be positive"));
      assert.ok(svrl.includes("@price &gt; 0") || svrl.includes("@price > 0"));
    } finally {
      await close(doc);
    }
    assert.equal(schematronErrorSync(sch), null);
  } finally {
    schematronCloseSync(sch);
  }
});

test("schematron: phase selection limits the active patterns", async () => {
  // default compile: every pattern active -> <a v='1'/><b/> still fails p2
  const all = await schematronCompile(SCHEMA_PHASED);
  try {
    const doc = await load("<root><a v='1'/><b/></root>");
    try {
      assert.equal(await schematronValid(all, doc), false);
    } finally {
      await close(doc);
    }
  } finally {
    schematronCloseSync(all);
  }
  // quick phase: only p1 fires -> the same document validates
  const quick = await schematronCompile(SCHEMA_PHASED, "quick");
  try {
    const doc = await load("<root><a v='1'/><b/></root>");
    try {
      assert.equal(await schematronValid(quick, doc), true);
    } finally {
      await close(doc);
    }
  } finally {
    schematronCloseSync(quick);
  }
});

test("schematron: bad schema throws SchematronError", async () => {
  await assert.rejects(
    () => schematronCompile("<not-schematron/>"),
    (e) => e instanceof SchematronError);
});

test("schematron: an unknown phase excludes every pattern (engine semantic)", async () => {
  // The engine activates only the patterns a selected phase lists;
  // a phase id nothing lists deactivates ALL of them (validity =
  // zero failed asserts). The binding must pass the phase through,
  // not second-guess it — a broken marshalling would leak patterns
  // in and flip this verdict.
  const noPhase = await schematronCompile(SCHEMA_PHASED, "no-such-phase");
  try {
    const doc = await load("<root><a/><b/></root>");
    try {
      assert.equal(await schematronValid(noPhase, doc), true);
    } finally {
      await close(doc);
    }
  } finally {
    schematronCloseSync(noPhase);
  }
});

test("schematron: sync twins after await init()", async () => {
  await init();
  const sch = schematronCompileSync(SCHEMA);
  try {
    const doc = loadSync(BAD_DOC);
    try {
      assert.equal(schematronValidSync(sch, doc), false);
      const svrl = schematronValidateSync(sch, doc);
      assert.ok(typeof svrl === "string" && svrl.includes("failed-assert"));
    } finally {
      closeSync(doc);
    }
  } finally {
    schematronCloseSync(sch);
  }
});

test("schematron: operations on a closed schema id throw SchematronError", async () => {
  await init();
  const sch = schematronCompileSync(SCHEMA);
  schematronCloseSync(sch);
  const doc = loadSync(GOOD_DOC);
  try {
    assert.throws(
      () => schematronValidSync(sch, doc),
      (e) => e instanceof SchematronError);
  } finally {
    closeSync(doc);
  }
});
