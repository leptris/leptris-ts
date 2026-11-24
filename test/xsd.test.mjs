import { test } from "node:test";
import assert from "node:assert/strict";
import {
  load,
  close,
  loadSync,
  closeSync,
  init,
  xsdCompile,
  xsdCompileSync,
  xsdValidate,
  xsdValidateSync,
  xsdErrorReportSync,
  xsdVersion,
  xsdVersionSync,
  xsdDeclarationCountSync,
  xsdBuiltinValid,
  xsdBuiltinValidSync,
  xsdSimpleValidSync,
  xsdCloseSync,
  XsdError,
} from "../src/index.js";

const SCHEMA = `<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="catalog">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="item" maxOccurs="unbounded">
          <xs:complexType>
            <xs:simpleContent>
              <xs:extension base="xs:string">
                <xs:attribute name="id" type="xs:int" use="required"/>
              </xs:extension>
            </xs:simpleContent>
          </xs:complexType>
        </xs:element>
      </xs:sequence>
      <xs:attribute name="id" type="xs:string" use="required"/>
    </xs:complexType>
  </xs:element>
</xs:schema>`;

const GOOD_DOC = `<catalog id="c1"><item id="1">Hello</item></catalog>`;
const BAD_DOC = `<catalog id="c1"><item id="notanint">Hello</item></catalog>`;
const SCHEMA_11 = `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" version="1.1">
  <xs:element name="e" type="xs:string"/>
</xs:schema>`;

test("xsd: compile and validate a valid instance", async () => {
  const schema = await xsdCompile(SCHEMA);
  try {
    const doc = await load(GOOD_DOC);
    try {
      assert.equal(await xsdValidate(schema, doc), true);
    } finally {
      await close(doc);
    }
  } finally {
    xsdCloseSync(schema);
  }
});

test("xsd: invalid instance returns false with a structured report", async () => {
  const schema = await xsdCompile(SCHEMA);
  try {
    const doc = await load(BAD_DOC);
    try {
      assert.equal(await xsdValidate(schema, doc), false);
      const report = xsdErrorReportSync(schema);
      assert.ok(report.length >= 1, "at least one finding");
      const row = report[0];
      assert.equal(typeof row.kind, "string");
      assert.ok(row.kind.length > 0);
      assert.equal(typeof row.message, "string");
      assert.ok(row.message.length > 0);
      assert.equal(typeof row.line, "number");
      assert.equal(typeof row.column, "number");
      // component names the declaring schema component or null
      assert.ok("component" in row);
    } finally {
      await close(doc);
    }
    // a fresh validate on a good doc replaces the findings
    const good = await load(GOOD_DOC);
    try {
      assert.equal(await xsdValidate(schema, good), true);
      assert.deepEqual(xsdErrorReportSync(schema), []);
    } finally {
      await close(good);
    }
  } finally {
    xsdCloseSync(schema);
  }
});

test("xsd: required attribute missing is reported", async () => {
  const schema = await xsdCompile(SCHEMA);
  try {
    const doc = await load("<catalog><item id='2'>x</item></catalog>");
    try {
      assert.equal(await xsdValidate(schema, doc), false);
      assert.ok(
        xsdErrorReportSync(schema).some((r) => r.message.includes("id")));
    } finally {
      await close(doc);
    }
  } finally {
    xsdCloseSync(schema);
  }
});

test("xsd: effective version reports 1.1 and 1.0", async () => {
  const v11 = await xsdCompile(SCHEMA_11);
  try {
    assert.equal(await xsdVersion(v11), "1.1");
    assert.equal(xsdVersionSync(v11), "1.1");
  } finally {
    xsdCloseSync(v11);
  }
  const v10 = await xsdCompile(SCHEMA);
  try {
    assert.equal(xsdVersionSync(v10), "1.0");
  } finally {
    xsdCloseSync(v10);
  }
});

test("xsd: declaration count", async () => {
  const schema = await xsdCompile(SCHEMA);
  try {
    assert.equal(typeof xsdDeclarationCountSync(schema), "number");
    assert.ok(xsdDeclarationCountSync(schema) >= 1);
  } finally {
    xsdCloseSync(schema);
  }
});

test("xsd: builtin lexical validation (true/false/unknown)", async () => {
  assert.equal(await xsdBuiltinValid("xs:int", "42"), true);
  assert.equal(xsdBuiltinValidSync("xs:int", "abc"), false);
  assert.equal(xsdBuiltinValidSync("xs:date", "2026-11-24"), true);
  assert.equal(xsdBuiltinValidSync("xs:no_such_type", "1"), null);
});

test("xsd: user simpleType validation with facets", async () => {
  const schema = await xsdCompile(
    `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
       <xs:simpleType name="nonEmpty">
         <xs:restriction base="xs:string">
           <xs:minLength value="1"/>
         </xs:restriction>
       </xs:simpleType>
       <xs:element name="r" type="nonEmpty"/>
     </xs:schema>`);
  try {
    assert.equal(xsdSimpleValidSync(schema, "nonEmpty", "ok"), true);
    assert.equal(xsdSimpleValidSync(schema, "nonEmpty", ""), false);
    assert.equal(xsdSimpleValidSync(schema, "unknownType", "x"), null);
  } finally {
    xsdCloseSync(schema);
  }
});

test("xsd: invalid schema throws XsdError with engine detail", async () => {
  await assert.rejects(
    () => xsdCompile("<not-a-schema/>"),
    (e) => e instanceof XsdError && e.message.length > 0);
});

test("xsd: sync twins after await init()", async () => {
  await init();
  const schema = xsdCompileSync(SCHEMA);
  try {
    const doc = loadSync(GOOD_DOC);
    try {
      assert.equal(xsdValidateSync(schema, doc), true);
    } finally {
      closeSync(doc);
    }
  } finally {
    xsdCloseSync(schema);
  }
});

test("xsd: operations on a closed schema id throw XsdError", async () => {
  await init();
  const schema = xsdCompileSync(SCHEMA);
  xsdCloseSync(schema);
  assert.throws(
    () => xsdValidateSync(schema, 1),
    (e) => e instanceof XsdError);
});

test("xsd: validate against a bad document id throws XsdError", async () => {
  await init();
  const schema = xsdCompileSync(SCHEMA);
  try {
    assert.throws(
      () => xsdValidateSync(schema, 999),
      (e) => e instanceof XsdError);
  } finally {
    xsdCloseSync(schema);
  }
});

test("xsd: the schema registry cycles slots across compile/close rounds", async () => {
  await init();
  // More rounds than LW_MAX_SCHEMAS (16): every compile must land on
  // a freshly closed slot and stay fully functional.
  for (let i = 0; i < 40; i++) {
    const schema = xsdCompileSync(SCHEMA_11);
    try {
      assert.equal(xsdVersionSync(schema), "1.1");
      assert.ok(xsdDeclarationCountSync(schema) >= 1);
    } finally {
      xsdCloseSync(schema);
    }
  }
});
