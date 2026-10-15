import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { init, load, loadSync, tree, treeSync, xmlSync, xpathSync, closeSync, version, VERSION, XmlError } from "../src/index.js";

const entrypoint = new URL("../src/index.js", import.meta.url).href;

test("synchronous operations require explicit initialization", () => {
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import assert from "node:assert/strict";
    import { loadSync, xmlSync, treeSync, xpathSync, closeSync } from ${JSON.stringify(entrypoint)};
    for (const operation of [() => loadSync("<r/>"), () => xmlSync(1),
      () => treeSync(1), () => xpathSync(1, "/*"), () => closeSync(1)]) {
      assert.throws(operation, /await init/);
    }
  `], {encoding:"utf8",timeout:30000});
  assert.ifError(child.error);
  assert.equal(child.status, 0, child.stderr || child.stdout);
});

test("mixed-content snapshot preserves namespaces, attribute order and node kinds", async () => {
  await init();
  const id = loadSync('<p:r first="1" xmlns:p="urn:p" p:a="2">a<![CDATA[b]]><!--c--><?pi data?><p:e/>d</p:r>');
  try {
    const snapshot = treeSync(id);
    assert.equal(snapshot.kind,"element");
    assert.equal(snapshot.name,"p:r");
    assert.equal(snapshot.localName,"r");
    assert.equal(snapshot.prefix,"p");
    assert.equal(snapshot.namespaceURI,"urn:p");
    assert.deepEqual(snapshot.attributes,[["first","1"],["xmlns:p","urn:p"],["p:a","2"]]);
    assert.deepEqual(snapshot.children.map(n=>n.kind),["text","cdata","comment","pi","element","text"]);
    assert.deepEqual(snapshot.children[3],{kind:"pi",target:"pi",text:"data"});
    assert.equal(snapshot.children[4].namespaceURI,"urn:p");
    assert.equal(xpathSync(id,"count(//*)"),"2");
    assert.match(xmlSync(id),/<p:r/);
    assert.deepEqual(await tree(id),snapshot);
  } finally { closeSync(id); }
});

test("snapshot remains usable after document release and is detached", async () => {
  const id=await load('<r><a>original</a></r>');
  const snapshot=treeSync(id);
  snapshot.children[0].children[0].text="changed";
  assert.equal(treeSync(id).children[0].children[0].text,"original");
  closeSync(id);
  assert.equal(snapshot.children[0].children[0].text,"changed");
  assert.throws(()=>treeSync(id),XmlError);
});

test("JSON export preserves quotes, backslashes, controls and Unicode", async () => {
  await init();
  const id=loadSync('<r x="&quot;\\&#9;">&quot;\\&#10;α😀</r>');
  try {
    const snapshot=treeSync(id);
    assert.equal(snapshot.attributes[0][1],'"\\\t');
    assert.equal(snapshot.children[0].text,'"\\\nα😀');
  } finally { closeSync(id); }
});

test("empty nodes and namespace undeclarations remain visible", async () => {
  await init();
  const id=loadSync('<r xmlns="urn:r"><e xmlns=""/></r>');
  try {
    const snapshot=treeSync(id);
    assert.equal(snapshot.namespaceURI,"urn:r");
    assert.ok(snapshot.children[0].namespaceURI===null || snapshot.children[0].namespaceURI==="");
    assert.deepEqual(snapshot.children[0].attributes,[["xmlns",""]]);
    assert.deepEqual(snapshot.children[0].children,[]);
  } finally { closeSync(id); }
});

test("invalid handles and malformed input fail without consuming registry slots", async () => {
  await init();
  assert.throws(()=>treeSync(0),XmlError);
  assert.throws(()=>loadSync('<r><a></r>'),XmlError);
  for(let i=0;i<100;i++) {const id=loadSync('<r/>'); try {assert.equal(treeSync(id).name,'r');} finally {closeSync(id);}}
});

test("built engine version matches wrapper pin",async()=>{
  const pin=JSON.parse(readFileSync(new URL("../engine.json",import.meta.url),"utf8"));
  assert.equal(pin.version,VERSION);
  assert.equal(await version(),VERSION);
});


test("attribute snapshots support long namespace prefixes and distinct namespaces",async()=>{
  await init();
  const prefix="p".repeat(80);
  const id=loadSync(`<r xmlns:${prefix}="urn:long" xmlns:a="urn:a" xmlns:b="urn:b" ${prefix}:v="&quot;" a:v="one" b:v="two"/>`);
  try {
    const snapshot=treeSync(id);
    assert.deepEqual(snapshot.attributes.slice(3),[[`${prefix}:v`,'"'],["a:v","one"],["b:v","two"]]);
  } finally {closeSync(id);}
});

test("namespace declarations retain lexical entity references",async()=>{
  await init();
  const id=loadSync('<r xmlns:p="urn:a&amp;b"><p:c/></r>');
  try {assert.deepEqual(treeSync(id).attributes,[["xmlns:p","urn:a&amp;b"]]);}
  finally {closeSync(id);}
});


test("nested snapshots preserve all levels",async()=>{
  await init();
  const depth=128;
  const id=loadSync('<r>'.repeat(depth)+'leaf'+'</r>'.repeat(depth));
  try {
    let node=treeSync(id);
    for(let i=1;i<depth;i++){assert.equal(node.children.length,1);node=node.children[0];assert.equal(node.kind,'element');}
    assert.deepEqual(node.children,[{kind:'text',text:'leaf'}]);
  }finally{closeSync(id);}
});
