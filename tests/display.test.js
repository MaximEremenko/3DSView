"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {loadApp} = require("./harness");

test("reversed colormaps mirror their stops", () => {
  const app = loadApp();
  app.setControl("colorMap", {value:"rdbu"});
  app.setControl("colorReverse", {checked:false});
  const forward = app.context.activeColorStops();
  app.setControl("colorReverse", {checked:true});
  const reversed = app.context.activeColorStops();
  assert.equal(reversed.length, forward.length);
  assert.deepEqual(Array.from(reversed[0][1]), Array.from(forward[forward.length - 1][1]));
  assert.equal(reversed[0][0], 0);
  for(let i=1;i<reversed.length;i++) assert.ok(reversed[i][0] > reversed[i - 1][0], "stops stay ascending");
});

test("histogram quantiles clip outliers such as Bragg peaks", () => {
  const app = loadApp();
  const values = new Float64Array(10000);
  for(let i=0;i<values.length;i++) values[i] = (i % 100) / 100;   // diffuse 0..0.99
  values[5] = 500; values[6] = 800;                                // two Bragg peaks
  const hist = app.context.valueHistogram(values, 0, 800);
  const hi = app.context.histogramQuantile(hist, 0.995);
  assert.ok(hi < 2, `99.5th percentile ignores the peaks (got ${hi})`);
  assert.equal(app.context.histogramQuantile(hist, 1), 800);
});

test("auto levels use the percentile range and can be symmetric about 0", () => {
  const app = loadApp();
  app.setControl("levelMode", {value:"slice"});
  app.setControl("levelClip", {value:"p99"});
  app.setControl("levelSymmetric", {checked:false});
  const values = new Float64Array(20001);
  for(let i=0;i<values.length;i++) values[i] = -2 + 5 * i / 20000;  // -2 .. 3
  values[0] = -100;                                                 // outlier
  const stats = {values, min:-100, max:3, hist:app.context.valueHistogram(values, -100, 3)};
  const plain = app.context.displayLevels(stats, "linear");
  assert.equal(plain.rawMin, -100, "colour bar keeps the full range");
  assert.ok(plain.min > -2.1 && plain.max < 3, `window ${plain.min}..${plain.max} is clipped`);
  app.setControl("levelSymmetric", {checked:true});
  const sym = app.context.displayLevels(stats, "linear");
  assert.ok(Math.abs(sym.min + sym.max) < 1e-12, "symmetric window");
  assert.ok(sym.max >= Math.abs(plain.min) && sym.max >= plain.max);
});

const {textFile} = require("./harness");
const {indexedText} = require("./fixtures");

async function volumeWithZeros(app){
  const shape = [4, 3, 2];
  const value = (i, j, k) => (i === 0 ? 0 : 1 + i + 10 * j + 100 * k);   // first H plane = no data
  const text = indexedText(shape, (i, j, k) => [i * 0.1, j * 0.1, k * 0.1], value);
  return app.parseFile(textFile("coverage_d3d.dat", text));
}

test("treating 0 as no data hides zeros, keeps them out of stats and restores them", async () => {
  const app = loadApp();
  const res = await volumeWithZeros(app);
  assert.equal(res.rawMin, 0);
  const masked = app.context.setZeroMask(res, true);
  assert.equal(masked, 6);
  assert.ok(Number.isNaN(res.I[0]), "zero became empty");
  assert.equal(res.rawMin, 2, "value range ignores the hidden zeros");
  assert.equal(res.filled, 18);
  app.context.setZeroMask(res, false);
  assert.equal(res.I[0], 0, "zeros come back");
  assert.equal(res.rawMin, 0);
});

test("hidden zeros are exported and cached as zeros", async () => {
  const app = loadApp();
  const res = await volumeWithZeros(app);
  app.context.setZeroMask(res, true);
  const spec = app.unifiedExportSpec(res, [[0, 3], [0, 2], [0, 1]]);
  assert.equal(spec.values[0], 0);
  const base = app.context.cacheBaseFromResult(res);
  assert.equal(base.I[0], 0);
  assert.ok(Number.isNaN(res.I[0]), "the shown volume keeps its mask");
});

test("swapping H/L keeps the zero mask aligned with the data", async () => {
  const app = loadApp();
  const res = await volumeWithZeros(app);
  // Make H and L sizes equal so the swap is allowed: use a 2x3x2 crop of the data.
  res.shape = [2, 3, 2];
  res.I = res.I.slice(0, 12);
  res.h = res.h.slice(0, 2);
  app.context.setZeroMask(res, true);
  app.transposeFirstAndLastAxes(res);
  app.context.setZeroMask(res, false);
  for(let n=0;n<res.I.length;n++) assert.ok(Number.isFinite(res.I[n]), `voxel ${n} restored after the swap`);
});

test("the map readout reports the voxel under the cursor, with Q and d", async () => {
  const app = loadApp();
  const shape = [5, 4, 3];
  const code = (i, j, k) => 1 + i + 10 * j + 100 * k;
  const lines = ["# h k l intensity"];
  for(let i=0;i<5;i++) for(let j=0;j<4;j++) for(let k=0;k<3;k++) lines.push(`${-1 + 0.5 * i} ${0.25 * j} ${k} ${code(i, j, k)}`);
  const res = await app.parseFile(textFile("calc.dat", lines.join("\n")));
  res.Bq = [[2 * Math.PI / 4, 0, 0], [0, 2 * Math.PI / 4, 0], [0, 0, 2 * Math.PI / 4]];   // cubic a = 4
  app.state.res = app.finalizeResult(res);
  const ctx = app.context;
  const sl = ctx.buildAxisSlice(app.state.res, "l", 1, 1e6, false);
  const layout = ctx.slice2dLayout(sl, 900, 600);
  app.state.lastSlice = {slice:sl, layout};
  // Voxel H[2] = 0, K[3] = 0.75 on the L[1] = 1 slice; aim slightly off-centre.
  const [X, Y] = layout.toCanvas(res.k[3] - 0.05, res.h[2] + 0.1);
  const r = ctx.sliceReadout({x:X, y:Y});
  assert.deepEqual(Array.from(r.index), [2, 3, 1]);
  assert.equal(r.value, code(2, 3, 1));
  assert.deepEqual(Array.from(r.native), [0, 0.75, 1]);
  const q = Math.hypot(...r.q);
  assert.ok(Math.abs(q - 2 * Math.PI / 4 * Math.hypot(0.75, 1)) < 1e-12);
  // Outside the slice there is nothing to report.
  const [Xo, Yo] = layout.toCanvas(res.k[3] + 2, res.h[2]);
  assert.equal(ctx.sliceReadout({x:Xo, y:Yo}), null);
});

test("slice CSV carries native coordinates, Q and the value", async () => {
  const app = loadApp();
  const lines = ["# h k l intensity"];
  for(let i=0;i<3;i++) for(let j=0;j<2;j++) for(let k=0;k<2;k++) lines.push(`${i} ${j} ${k} ${1 + i + 10 * j + 100 * k}`);
  const res = await app.parseFile(textFile("calc.dat", lines.join("\n")));
  res.Bq = [[2 * Math.PI / 5, 0, 0], [0, 2 * Math.PI / 5, 0], [0, 0, 2 * Math.PI / 5]];
  app.state.res = app.finalizeResult(res);
  const sl = app.context.buildAxisSlice(app.state.res, "l", 1, 1e6, true);
  const rows = app.context.sliceCsv(sl).split("\n");
  assert.equal(rows[0], "h,k,l,qx,qy,qz,intensity");
  const first = rows[1].split(",").map(Number);
  assert.deepEqual(first.slice(0, 3), [0, 0, 1]);
  assert.ok(Math.abs(first[5] - 2 * Math.PI / 5) < 1e-12, "qz of L = 1");
  assert.equal(first[6], 101);
  assert.equal(rows.length, 1 + 6);
});
