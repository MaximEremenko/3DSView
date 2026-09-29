"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {loadApp, textFile} = require("./harness");
const {code, cOrderValues, assertValues, assertClose} = require("./fixtures");

// Unified /entry/data file with an optional skewed grid and a cell.
async function unifiedVolume(app, {shape=[4, 3, 5], vectors=[[0.5, 0, 0], [0, 0.5, 0], [0, 0, 0.25]], cell=[4, 4, 6, 90, 90, 90]}={}){
  const h5 = await app.ensureH5wasm();
  const bytes = app.context.UnifiedH5.writeData(h5, {dims:shape, corner:[-1, -1, 0], vectors, values:cOrderValues(shape), cell, axesType:"hkl"});
  const res = await app.parseFile(new File([bytes], "volume_unified.h5", {lastModified:0}));
  app.state.res = res;
  return res;
}

function textOf(chunks){
  return Array.from(chunks).join("");
}

function assertSameGeometry(app, a, b, tol=1e-9){
  for(const [i, j, k] of [[0, 0, 0], [a.shape[0] - 1, 0, 0], [0, a.shape[1] - 1, 0], [0, 0, a.shape[2] - 1], [1, 2, 3].map((v, n) => Math.min(v, a.shape[n] - 1))]){
    const p = app.pointAtIndex(a, i, j, k), q = app.pointAtIndex(b, i, j, k);
    for(let c=0;c<3;c++) assertClose(q[c], p[c], tol, `coordinate ${c} at ${i},${j},${k}`);
  }
}

test("Yell 1.0 export round-trips values and skewed step vectors", async () => {
  const app = loadApp();
  const vectors = [[0.5, 0.5, 0], [0, 0.5, 0], [0, 0, 0.25]];
  const res = await unifiedVolume(app, {vectors, cell:[4, 4, 6, 90, 90, 120]});
  const h5 = await app.ensureH5wasm();
  const bytes = app.context.writeYellBytes(h5, app.unifiedExportSpec(res), false);
  const back = await app.parseFile(new File([bytes], "export_yell.h5", {lastModified:0}));
  assert.match(back.format, /Yell/);
  assertValues(back, [4, 3, 5]);
  assertSameGeometry(app, res, back);
  assertClose(back.cellDeg[5], 120, 1e-9, "gamma");
});

test("RMCProfile .dat export writes Cartesian Q that converts back to the same HKL", async () => {
  const app = loadApp();
  const cell = [4, 4, 6, 90, 90, 120];
  const res = await unifiedVolume(app, {cell});
  const text = textOf(app.context.oldDatChunks(app.unifiedExportSpec(res), res));
  const lines = text.trim().split("\n");
  assert.equal(lines[0], `${4 * 3 * 5} 1`);
  assert.equal(lines.length, 1 + 60);
  const back = await app.parseFile(textFile("export_d3d.dat", text));
  assert.equal(back.coordKind, "q");
  assertValues(back, [4, 3, 5]);
  app.convertQGridToHkl(back, cell);
  app.finalizeResult(back);
  assertSameGeometry(app, res, back, 1e-6);
});

test("Scatty VTK export needs an axis-aligned Q grid and round-trips values", async () => {
  const app = loadApp();
  const res = await unifiedVolume(app, {cell:[4, 5, 6, 90, 90, 90]});
  const text = textOf(app.context.vtkChunks(app.unifiedExportSpec(res), res));
  assert.match(text, /^# vtk DataFile Version 2\.0\n/);
  const back = await app.parseFile(textFile("export.vtk", text));
  assertValues(back, [4, 3, 5]);
  assertClose(back.h[1] - back.h[0], 0.5 * 2 * Math.PI / 4, 1e-9, "Q step along a*");
  const hex = await unifiedVolume(app, {cell:[4, 4, 6, 90, 90, 120]});
  assert.throws(() => textOf(app.context.vtkChunks(app.unifiedExportSpec(hex), hex)), /not aligned/);
});

test("Gaussian cube export lists the grid in Q with l fastest", async () => {
  const app = loadApp();
  const res = await unifiedVolume(app, {cell:[4, 4, 6, 90, 90, 90]});
  res.Bq = app.basisFromCell([4, 4, 6, 90, 90, 90], true).Bq;
  const lines = textOf(app.context.cubeChunks(app.unifiedExportSpec(res), res)).trim().split("\n");
  assert.equal(lines[2].trim().split(/\s+/)[0], "0");
  assert.deepEqual(lines.slice(3, 6).map(l => Number(l.trim().split(/\s+/)[0])), [4, 3, 5]);
  assertClose(Number(lines[3].trim().split(/\s+/)[1]), 0.5 * 2 * Math.PI / 4, 1e-9, "H step in Q");
  const values = lines.slice(6).join(" ").trim().split(/\s+/).map(Number);
  assert.equal(values.length, 60);
  assert.deepEqual(values.slice(0, 3), [code(0, 0, 0), code(0, 0, 1), code(0, 0, 2)]);
});

test("JSON export round-trips values, empty voxels, the grid and the coordinate kind", async () => {
  const app = loadApp();
  const vectors = [[0.5, 0.5, 0], [0, 0.5, 0], [0, 0, 0.25]];
  const res = await unifiedVolume(app, {vectors});
  res.I[5] = NaN;
  const json = app.context.volumeJson(app.unifiedExportSpec(res), res);
  const back = await app.parseFile(textFile("export.json", json));
  assert.equal(back.coordKind, "hkl");
  assert.ok(Number.isNaN(back.I[5]), "empty voxel stays empty");
  back.I[5] = res.I[5] = code(0, 1, 0);
  assertValues(back, [4, 3, 5], (i, j, k) => (i === 0 && j === 1 && k === 0 ? code(0, 1, 0) : code(i, j, k)));
  assertSameGeometry(app, res, back);
});

test("JSON export of data without a cell does not invent a basis", async () => {
  const app = loadApp();
  const lines = ["# h k l intensity"];
  for(let i=0;i<3;i++) for(let j=0;j<2;j++) for(let k=0;k<2;k++) lines.push(`${i} ${j} ${k} ${code(i, j, k)}`);
  const res = await app.parseFile(textFile("calc.dat", lines.join("\n")));
  app.state.res = res;
  const back = await app.parseFile(textFile("nocell.json", app.context.volumeJson(app.unifiedExportSpec(res), res)));
  assert.equal(back.Bq, undefined);
  assert.equal(back.cellDeg, undefined);
});

test("Q exports follow projected HKL axes, in the RMCProfile frame for the cube too", () => {
  const app = loadApp();
  const cell = [4, 4, 6, 90, 90, 120];
  const W = [[1, 1, 0], [-1, 1, 0], [0, 0, 1]];   // [H,H,0], [-K,K,0], [0,0,L]
  const ax = n => Array.from({length:n}, (_, i) => -1 + 0.5 * i);
  const res = app.context.makeVolumeResult("projected.nxs", [5, 5, 3], ax(5), ax(5), ax(3), new Float64Array(75).fill(1), "test", "hkl", null, 0, {projectionW:W, cellDeg:cell});
  res.Bq = app.context.projectedBq(app.basisFromCell(cell, true).Bq, res);
  const spec = app.unifiedExportSpec(res), rmc = app.context.rmcCartesianFrame(cell).Bq;
  const q = app.context.rmcQMapping(res, spec)([1, 0, 0]), want = app.context.mul([1, 1, 0], rmc);
  for(let c=0;c<3;c++) assertClose(q[c], want[c], 1e-12, `Q of (1, 0, 0) on [H,H,0] axes, component ${c}`);
  const lines = textOf(app.context.cubeChunks(spec, res)).split("\n");
  const step = lines[3].trim().split(/\s+/).slice(1).map(Number), wantStep = app.context.mul([0.5, 0.5, 0], rmc);
  for(let c=0;c<3;c++) assertClose(step[c], wantStep[c], 1e-9, `cube step along [H,H,0], component ${c}`);
});

test("a Q grid in a rotated sample frame is written in the RMCProfile frame", () => {
  const app = loadApp();
  const cell = [4, 5, 6, 90, 90, 90], rmc = app.context.rmcCartesianFrame(cell).Bq;
  const t = 0.3, U = [[Math.cos(t), Math.sin(t), 0], [-Math.sin(t), Math.cos(t), 0], [0, 0, 1]];
  const Bq = rmc.map(row => app.context.mul(row, U));   // q = hkl·B·U
  const ax = n => Array.from({length:n}, (_, i) => -0.5 + 0.25 * i);
  const res = app.context.makeVolumeResult("rotated_q.nxs", [5, 5, 5], ax(5), ax(5), ax(5), new Float64Array(125).fill(1), "test", "q", null, 0, {Bq, cellDeg:cell});
  const toQ = app.context.rmcQMapping(res, app.unifiedExportSpec(res));
  const hkl = [1, 2, 3], got = toQ(app.context.mul(hkl, Bq)), want = app.context.mul(hkl, rmc);
  for(let c=0;c<3;c++) assertClose(got[c], want[c], 1e-12, `component ${c}`);
  const plain = app.context.makeVolumeResult("plain_q.dat", [5, 5, 5], ax(5), ax(5), ax(5), new Float64Array(125).fill(1), "test", "q");
  assert.deepEqual(app.context.rmcQMapping(plain, app.unifiedExportSpec(plain))([0.1, 0.2, 0.3]), [0.1, 0.2, 0.3], "Q without a cell is written as stored");
});
