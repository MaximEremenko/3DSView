"use strict";
// Loads the viewer's inline script (plus its local js/ helpers) into a Node
// vm context so the file loaders can be exercised without a browser.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");

// Functions reachable from tests. The inline script declares them at top
// level, so an appended statement inside the same script can collect them.
const EXPORTS = [
  "parseFile", "parseTextData", "parseNexusFile", "finalizeResult",
  "idx3", "pointAtIndex", "nativeAxisLabels", "renderAxisLabels",
  "useBasisToQ", "hklToQ", "basisFromCell", "ensureH5wasm", "unifiedExportSpec",
  "applyManualCell", "restoreFileCell", "swapFirstAndLastAxes"
];

function appScriptSource(options){
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const marker = "<script>\nconst PLOTLY_CDN";
  const start = html.indexOf(marker);
  if(start < 0) throw new Error("Main inline script not found in index.html.");
  const end = html.indexOf("</script>", start);
  let src = html.slice(start + "<script>".length, end);
  // The page wires the DOM at the end; tests only need the functions.
  src = src.replace(/\nbind\(\);\s*$/, "\n");
  if(options.streamThreshold !== undefined){
    const before = src;
    src = src.replace(/const STREAM_TEXT_THRESHOLD = [^;]+;/, `const STREAM_TEXT_THRESHOLD = ${Number(options.streamThreshold)};`);
    if(src === before) throw new Error("STREAM_TEXT_THRESHOLD declaration not found.");
  }
  const available = EXPORTS.map(name => `typeof ${name} === "function" ? ${name} : undefined`);
  src += `\n;globalThis.__app = {state, ${EXPORTS.map((name, i) => `${name}: ${available[i]}`).join(", ")}};\n`;
  return src;
}

function fakeElement(){
  return {value:"", disabled:false, textContent:"", style:{}, classList:{toggle(){}, add(){}, remove(){}}, setAttribute(){}, getAttribute(){ return null; }};
}

function createContext(){
  const ctx = {
    console, TextDecoder, TextEncoder, URL, Blob, File, WebAssembly,
    setTimeout, clearTimeout, performance, crypto, structuredClone,
    navigator:{hardwareConcurrency:2},
    requestAnimationFrame:cb => setTimeout(cb, 0),
    document:{
      // Individual tests can register fake controls here, e.g. coordMode.
      elements:{},
      getElementById(id){ return this.elements[id] || null; },
      documentElement:{getAttribute(){ return null; }, setAttribute(){}, removeAttribute(){}},
      createElement(){ return fakeElement(); }
    }
  };
  ctx.window = ctx;
  ctx.self = ctx;
  ctx.globalThis = ctx;
  return vm.createContext(ctx);
}

function runFile(ctx, relPath){
  const file = path.join(ROOT, relPath);
  vm.runInContext(fs.readFileSync(file, "utf8"), ctx, {filename:file});
}

// options.streamThreshold lowers the byte size above which text files take
// the streaming parsers, so small fixtures can exercise those paths.
function loadApp(options={}){
  const ctx = createContext();
  runFile(ctx, "js/unified_hdf5.js");
  if(fs.existsSync(path.join(ROOT, "js/h5wasm.js"))) runFile(ctx, "js/h5wasm.js");
  vm.runInContext(appScriptSource(options), ctx, {filename:path.join(ROOT, "index.html")});
  const app = ctx.__app;
  app.context = ctx;
  app.setControl = (id, props) => { ctx.document.elements[id] = Object.assign(fakeElement(), props); };
  return app;
}

function textFile(name, text){
  return new File([text], name, {lastModified:0});
}

// Builds an HDF5 file in h5wasm's in-memory filesystem and returns it as a
// browser-style File. build(file, h5) receives an h5wasm File opened for writing.
async function h5File(app, name, build){
  const h5 = await app.ensureH5wasm();
  const tmp = `/tmp_fixture_${Date.now()}_${Math.random().toString(36).slice(2)}.h5`;
  const f = new h5.File(tmp, "w");
  try{
    build(f, h5);
    f.flush();
  }finally{
    f.close();
  }
  const bytes = h5.FS.readFile(tmp);
  h5.FS.unlink(tmp);
  return new File([bytes], name, {lastModified:0});
}

// Value at logical index (i,j,k) of a parsed result.
function valueAt(res, i, j, k){
  return res.I[(i * res.shape[1] + j) * res.shape[2] + k];
}

module.exports = {ROOT, loadApp, textFile, h5File, valueAt};
