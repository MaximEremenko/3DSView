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

test("mean +- 3 sigma and IQR fences give display windows from the distribution", () => {
  const app = loadApp();
  const values = Float64Array.from({length:1001}, (_, i) => i / 1000);   // uniform on [0, 1]
  const hist = app.context.valueHistogram(values, 0, 1, 2000, v => v);
  const [lo, hi] = app.context.spreadWindow(hist, "sigma3");
  const sd = Math.sqrt(1 / 12);
  assert.ok(Math.abs(lo - (0.5 - 3 * sd)) < 2e-3 && Math.abs(hi - (0.5 + 3 * sd)) < 2e-3, `sigma window ${lo}, ${hi}`);
  const [f1, f2] = app.context.spreadWindow(hist, "iqr");
  assert.ok(Math.abs(f1 - (0.25 - 0.75)) < 2e-3 && Math.abs(f2 - (0.75 + 0.75)) < 2e-3, `IQR fences ${f1}, ${f2}`);
  assert.equal(app.context.spreadWindow(hist, "p99"), null);
});

test("files open on the slice at 0, or in the middle when the axis misses 0", () => {
  const app = loadApp();
  const axes = (lo, n, step) => Float64Array.from({length:n}, (_, i) => lo + i * step);
  const res = {h:axes(-2, 9, 0.5), k:axes(-1.75, 8, 0.5), l:axes(1, 5, 1)};
  assert.equal(app.context.indexNearestZero(res, 0), 4, "an odd axis centred on 0");
  assert.equal(app.context.indexNearestZero(res, 1), 3, "an even axis: 0 falls between -0.25 and 0.25, the first is kept");
  assert.equal(app.context.indexNearestZero(res, 2), 2, "an axis from 1 to 5 opens in the middle");
  const pdf = {h:axes(-0.5, 10, 0.1), k:axes(-0.5, 10, 0.1), l:axes(-0.5, 10, 0.1)};
  assert.equal(app.context.indexNearestZero(pdf, 2), 5, "r = 0 of a map with its origin at index floor(N/2)");
});

test("file-info ranges of a u, v, w map drawn through its cell are labelled X, Y, Z", () => {
  const app = loadApp();
  const ax = Array.from({length:5}, (_, i) => -1 + 0.5 * i);
  const meta = {dataKind:{code:"delta_pdf", label:"3D-ΔPDF", source:"test"}};
  const bare = app.context.makeVolumeResult("map.h5", [5, 5, 5], ax, ax, ax, new Float64Array(125), "test", "uvw", null, 0, meta);
  assert.deepEqual(Array.from(app.context.metaAxisLabels(bare)), ["U", "V", "W"]);
  const withCell = app.context.makeVolumeResult("map.h5", [5, 5, 5], ax, ax, ax, new Float64Array(125), "test", "uvw", null, 0,
    {...meta, cellDeg:[5.64, 5.64, 5.64, 90, 90, 90], Bp:[[5.64, 0, 0], [0, 5.64, 0], [0, 0, 5.64]]});
  app.state.res = withCell;
  const b = app.context.plotBounds(withCell);
  assert.ok(Math.abs(b.max[0] - 5.64) < 1e-9, "the ranges are in angstrom");
  assert.deepEqual(Array.from(app.context.metaAxisLabels(withCell)), ["X", "Y", "Z"]);
});

const {assertClose} = require("./fixtures");

test("coordinates round to their axis's precision and still pick their grid points", () => {
  const app = loadApp();
  // A float32 grid from -8 to 8 in steps of 0.05, as Mantid bin centres come.
  const noisy = Float64Array.from({length:321}, (_, i) => Math.fround(-8 + 0.05 * i) - 4.92e-7);
  assert.equal(app.context.fmtAxis(noisy[0], noisy), "-8");
  assert.equal(app.context.fmtAxis(noisy[1], noisy), "-7.95");
  assert.equal(app.context.fmtAxis(noisy[320], noisy), "8");
  // A crop typed from the rounded fields keeps both end points.
  const lo = Number(app.context.fmtAxis(noisy[120], noisy)), hi = Number(app.context.fmtAxis(noisy[200], noisy));
  assert.deepEqual([lo, hi], [-2, 2]);
  assert.deepEqual(Array.from(app.context.gridRangeForLimits(noisy, lo, hi)), [120, 200]);
  assert.equal(app.context.fmtAxis(1.23456, [0, 1, 2]), "1.2", "unit steps keep one decimal");
  assert.equal(app.context.fmtLevel(12345.678901), "12345.7");
  assert.equal(app.context.fmtLevel(0.000123456789), "0.000123457");
});

test("a typed centre reads as three numbers", () => {
  const app = loadApp();
  assert.deepEqual(Array.from(app.context.parseTriple("0.4, 0, 0")), [0.4, 0, 0]);
  assert.deepEqual(Array.from(app.context.parseTriple("(0.4 0 -1.5)")), [0.4, 0, -1.5]);
  assert.deepEqual(Array.from(app.context.parseTriple("[1; 2; 3]")), [1, 2, 3]);
  assert.throws(() => app.context.parseTriple("0.4, 0"), /three numbers/);
  assert.throws(() => app.context.parseTriple("a, b, c"), /three numbers/);
});

test("the plotted resolution gives the points and spacing a slice is drawn with", () => {
  const app = loadApp();
  const ax = Array.from({length:321}, (_, i) => -8 + 0.05 * i);
  const res = app.context.makeVolumeResult("big.h5", [321, 321, 3], ax, ax, [-0.05, 0, 0.05], new Float64Array(321 * 321 * 3), "test", "hkl");
  app.state.res = res;
  const full = app.context.sliceSampling(app.context.buildAxisSlice(res, "l", 1, 1500000, false, 0));
  assert.deepEqual([full.cols, full.rows, full.full], [321, 321, true]);
  assertClose(full.dx, 0.05, 1e-12);
  assert.match(app.context.samplingText(full, " r.l.u."), /^321 x 321 \([HK] x [HK]\), every data point; Δ[HK] 0\.05, Δ[HK] 0\.05 r\.l\.u\.$/);
  // The 3-D slice plane is capped at 180 x 180 cells: every second point here.
  const thin = app.context.sliceSampling(app.context.buildAxisSlice(res, "l", 1, 180 * 180, false, 0));
  assert.deepEqual([thin.cols, thin.rows, thin.full], [161, 161, false]);
  assertClose(thin.dx, 0.1, 1e-12);
  assert.match(app.context.samplingText(thin, ""), /sampled from 321 x 321; Δ[HK] 0\.1/);
  assert.equal(app.context.samplingText(null, ""), "not drawn yet");
});

test("the asinh scale softens by the median of the positive values", () => {
  const app = loadApp();
  const ax = [0, 1, 2, 3];
  const values = Float64Array.from({length:64}, (_, i) => (i % 4 === 0 ? -5 : i));   // positives 1..63 without the multiples of 4
  const res = app.context.makeVolumeResult("wide.h5", [4, 4, 4], ax, ax, ax, values, "test", "hkl");
  app.state.res = res;
  const positives = Array.from(values).filter(v => v > 0).sort((a, b) => a - b);
  const median = positives[positives.length >> 1];
  assert.equal(app.context.asinhAutoSoftening(res), median);
  app.context.syncAsinh();
  assertClose(app.context.transformedValue(10, "asinh"), Math.asinh(10 / median), 1e-12);
  assertClose(app.context.transformedValue(-5, "asinh"), -Math.asinh(5 / median), 1e-12, "negative values keep their sign");
  assertClose(res.global.asinh.min, Math.asinh(-5 / median), 1e-12, "whole-volume bounds on the asinh scale");
  assertClose(res.global.asinh.max, Math.asinh(63 / median), 1e-12);
});

test("thick slices count the voxels they average", () => {
  const app = loadApp();
  const ax = [0, 1, 2, 3, 4];
  const values = new Float64Array(125).fill(1);
  values[(2 * 5 + 2) * 5 + 1] = NaN;   // one empty voxel in the column at H = 2, K = 2
  const res = app.context.makeVolumeResult("thick.h5", [5, 5, 5], ax, ax, ax, values, "test", "hkl");
  assert.equal(app.context.thickCount(res, 2, 2, 2, 2, 0, 4, 1), 2, "L = 1..3 around L = 2, one of them empty");
  assert.equal(app.context.thickCount(res, 2, 0, 2, 2, 0, 4, 1), 1, "clipped at the lower end: L = 0..1");
  assert.equal(app.context.thickCount(res, 2, 2, 0, 0, 0, 4, 2), 5);
});

test("the three linked slices share one point, one index per axis", () => {
  const app = loadApp();
  const ax = Array.from({length:9}, (_, i) => -2 + 0.5 * i);
  const res = app.context.makeVolumeResult("tri.h5", [9, 9, 9], ax, ax, ax, new Float64Array(729).fill(1), "test", "hkl");
  app.state.res = res;
  app.setControl("axis", {value:"l"});
  app.setControl("idx", {value:"6"});
  assert.equal(app.context.triIndexFor("l"), 6, "the framed panel follows the slider");
  assert.equal(app.context.triIndexFor("h"), 4, "another axis opens at 0");
  app.state.axisIndex.k = 2;
  assert.equal(app.context.triIndexFor("k"), 2, "a remembered index is kept");
  app.state.axisIndex.k = 40;
  assert.equal(app.context.triIndexFor("k"), 8, "and kept inside the grid");
});

test("isosurface samples sit about the origin and average their blocks", () => {
  const app = loadApp();
  const ax = Array.from({length:11}, (_, i) => -5 + i);                       // 0 at index 5
  const values = Float64Array.from({length:11 ** 3}, (_, p) => p % 11);      // the value is the l index
  const res = app.context.makeVolumeResult("iso.h5", [11, 11, 11], ax, ax, ax, values, "test", "hkl");
  const ranges = [[0, 10], [0, 10], [0, 10]];
  assert.deepEqual(Array.from(app.context.volumePicks(res, ranges, [3, 3, 3])[0]), [2, 5, 8], "the origin is a sample");
  assert.deepEqual(Array.from(app.context.volumePicks(res, ranges, [1, 1, 1])[2]).length, 11, "stride 1 keeps every point");
  const mean = app.context.blockMeanSampler(res, ranges, [3, 3, 3]);
  assert.equal(mean(5, 5, 5), 5, "the block l = 4..6 averages to 5");
  assert.equal(mean(5, 5, 0), 0.5, "blocks stop at the edge: l = 0..1");
  res.I[(5 * 11 + 5) * 11 + 4] = NaN;
  assertClose(app.context.blockMeanSampler(res, ranges, [3, 3, 3])(5, 5, 5), (9 * (4 + 5 + 6) - 4) / 26, 1e-12, "empty voxels stay out");
});

test("files named in the page address", () => {
  const app = loadApp();
  const want = app.context.urlParamFiles("?url=data/run.nxs&compare=data%2Frun_calc.dat&structure=");
  assert.equal(want.url, "data/run.nxs");
  assert.equal(want.compare, "data/run_calc.dat");
  assert.equal(want.structure, null, "an empty value is no file");
  assert.equal(app.context.urlParamFiles("").url, null);
});

test("typed levels stay as typed, also beyond the data; dragged ones stay on the bar", () => {
  const app = loadApp();
  const ax = [0, 1, 2];
  const res = app.context.makeVolumeResult("levels.h5", [3, 3, 3], ax, ax, ax, Float64Array.from({length:27}, (_, i) => i / 26 * 10), "test", "hkl");   // 0 .. 10
  app.state.res = res;
  for(const [id, value] of [["levelMode", "global"], ["levelMin", "-5"], ["levelMax", "50"], ["scale", "linear"]]) app.setControl(id, {value});
  const fields = app.context.document.elements;
  const typed = app.context.setDisplayLevelsFromBounds(-5, 50, {rawMin:0, rawMax:10}, {exact:true});
  assert.deepEqual([typed.min, typed.max], [-5, 50]);
  assert.equal(fields.levelMode.value, "manual");
  assert.deepEqual([fields.levelMin.value, fields.levelMax.value], ["-5", "50"], "the fields keep what was typed");
  const shown = app.context.displayLevels({min:0, max:10}, "linear");
  assert.deepEqual([shown.min, shown.max, shown.rawMin, shown.rawMax], [-5, 50, -5, 50], "the bar's range grows to hold them");
  fields.levelMax.value = "7.123456789";
  assert.equal(app.context.displayLevels({min:0, max:10}, "linear").max, 7.123456789, "no rounding of typed values");
  const dragged = app.context.setDisplayLevelsFromBounds(-5, 50, {rawMin:0, rawMax:10});
  assert.deepEqual([dragged.min, dragged.max], [0, 10], "a drag stays within the bar");
});

test("level fields are data values on every display scale", () => {
  const app = loadApp();
  const ax = [0, 1, 2];
  const res = app.context.makeVolumeResult("wide.h5", [3, 3, 3], ax, ax, ax, Float64Array.from({length:27}, (_, i) => i * 12), "test", "hkl");   // 0 .. 312
  app.state.res = res;
  for(const [id, value] of [["levelMode", "manual"], ["levelMin", "0"], ["levelMax", "300"], ["scale", "log1p"]]) app.setControl(id, {value});
  const shown = app.context.displayLevels({min:0, max:2.5}, "log1p");
  assertClose(shown.max, Math.log10(301), 1e-12, "a typed intensity of 300 is log10(301) on the map");
  for(const mode of ["linear", "sqrt", "log", "log1p", "asinh"]){
    const v = 42.5;
    assertClose(app.context.levelToData(app.context.transformedValue(v, mode), mode), v, 1e-9, `${mode} round trip`);
  }
  app.setControl("levelMode", {value:"global"});
  const dragged = app.context.setDisplayLevelsFromBounds(Math.log10(11), Math.log10(101), {rawMin:0, rawMax:3});
  assertClose(dragged.max, Math.log10(101), 1e-12);
  assert.equal(app.context.document.elements.levelMax.value, "100", "a dragged level is written as an intensity");
});

test("plane maps are sampled at the data step unless set by hand", () => {
  const app = loadApp();
  const ax = Array.from({length:65}, (_, i) => -8 + 0.25 * i);   // step 0.25
  const res = app.context.makeVolumeResult("planes.h5", [65, 3, 3], ax, [0, 1, 2], [0, 1, 2], new Float64Array(65 * 9), "test", "hkl");
  app.state.ui = {mapQuality:"data"};
  assert.equal(app.context.planeMapPoints(res, 20, "pRes"), 81, "20 r.l.u. at the 0.25 step");
  app.state.ui.mapQuality = "double";
  assert.equal(app.context.planeMapPoints(res, 20, "pRes"), 161);
  app.state.ui.mapQuality = "custom";
  app.setControl("pRes", {value:"300"});
  assert.equal(app.context.planeMapPoints(res, 20, "pRes"), 300);
});

test("levels in the fields read like the colour bar's when large or small", () => {
  const app = loadApp();
  assert.equal(app.context.fmtLevel(4087770000), "4.08777e9");
  assert.equal(app.context.fmtLevel(3.82813e10), "3.82813e10");
  assert.equal(app.context.fmtLevel(1e10), "1e10");
  assert.equal(app.context.fmtLevel(-2.5e-7), "-2.5e-7");
  assert.equal(Number(app.context.fmtLevel(4087770000)), 4087770000, "the field still reads as the number");
  assert.equal(app.context.fmtLevel(0), "0");
});

test("file-info ranges use the data's own axes, as the map does", () => {
  const app = loadApp();
  const ax = Array.from({length:5}, (_, i) => -1 + 0.5 * i);
  const res = app.context.makeVolumeResult("cell.h5", [5, 5, 5], ax, ax, ax, new Float64Array(125), "test", "hkl");
  app.state.res = res;
  const ranges = app.context.fileAxisRanges(res);
  assert.deepEqual(Array.from(ranges, g => g.label), ["H", "K", "L"]);
  assert.deepEqual(Array.from(ranges, g => [g.min, g.max]), [[-1, 1], [-1, 1], [-1, 1]]);
});

test("a normal plane with a slab averages across it", () => {
  const app = loadApp();
  const ax = [-2, -1, 0, 1, 2];
  const values = new Float64Array(125);
  // The value is l squared everywhere.
  let p = 0;
  for(let i=0;i<5;i++) for(let j=0;j<5;j++) for(const l of ax) values[p++] = l * l;
  const res = app.context.makeVolumeResult("slab.h5", [5, 5, 5], ax, ax, ax, values, "test", "hkl");
  app.state.res = res;
  app.state.plane = {normal:[0, 0, 1], normalUnit:[0, 0, 1], origin:[0, 0, 0], center:[0, 0, 0], slider:[0], sliderIndex:0};
  for(const [id, value] of [["sliceMode", "plane"], ["pScale", "1"], ["slabWidth", "0"], ["slabN", "3"]]) app.setControl(id, {value});
  // 33 points over the side of 4 put the middle one on the centre.
  const mid = sl => sl.d[16 * sl.cols + 16];
  const thin = app.context.currentSlice(33, undefined, false);
  assert.equal(thin.type, "plane");
  assertClose(mid(thin), 0, 1e-12, "a thin plane through l = 0");
  app.setControl("slabWidth", {value:"1"});
  const slab = app.context.currentSlice(33, undefined, false);
  assert.equal(slab.type, "avgvol");
  assertClose(mid(slab), 2 / 3, 1e-12, "the mean of l = -1, 0 and 1");
  app.setControl("slabWidth", {value:""});
  assert.equal(app.context.slabHalfWidth(), 0, "an empty slab is a thin plane");
});
