"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {loadApp} = require("./harness");
const {code, assertClose} = require("./fixtures");

const axis = (n, lo, step) => Array.from({length:n}, (_, i) => lo + i * step);

function volume(app, {name="volume.h5", h, k, l, coordKind="hkl", meta={}, value=(x, y, z) => code(x, y, z)}){
  const shape = [h.length, k.length, l.length];
  const values = new Float64Array(shape[0] * shape[1] * shape[2]);
  let p = 0;
  for(let i=0;i<shape[0];i++) for(let j=0;j<shape[1];j++) for(let q=0;q<shape[2];q++) values[p++] = value(h[i], k[j], l[q]);
  return app.context.makeVolumeResult(name, shape, h, k, l, values, "test", coordKind, null, 0, meta);
}

const at = (res, i, j, k) => (i * res.shape[1] + j) * res.shape[2] + k;
const f = (h, k, l) => 100 + 7 * h + 3 * k * k + 11 * l + h * l;   // not Friedel symmetric
const fe = (h, k, l) => 100 + 3 * h * h + 5 * k * k + 2 * l * l + h * k;   // Friedel symmetric

test("a comparison on the same grid is taken voxel for voxel", () => {
  const app = loadApp();
  const ax = axis(5, -1, 0.5);
  const data = volume(app, {h:ax, k:ax, l:ax});
  const calc = volume(app, {h:ax, k:ax, l:ax, value:f});
  const a = app.context.alignComparison(data, calc);
  assert.equal(a.identity, true);
  assert.equal(a.missing, 0);
  for(let v=0;v<calc.I.length;v+=7) assert.equal(a.values[v], calc.I[v]);
});

test("a shifted, smaller comparison grid is matched by coordinates", () => {
  const app = loadApp();
  const ax = axis(5, -1, 0.5);
  const data = volume(app, {h:ax, k:ax, l:ax});
  const calc = volume(app, {h:axis(3, -0.5, 0.5), k:ax, l:ax, value:f});
  const a = app.context.alignComparison(data, calc, {friedel:false});
  assert.equal(a.identity, false);
  assertClose(a.values[at(data, 2, 3, 1)], f(0, 0.5, -0.5), 1e-12, "matched voxel");
  assert.ok(Number.isNaN(a.values[at(data, 0, 2, 2)]), "h = -1 lies outside the comparison");
  assert.equal(a.missing, 2 * 5 * 5);
});

test("Friedel pairs complete a half-space calculation", () => {
  const app = loadApp();
  const ax = axis(5, -1, 0.5);
  const data = volume(app, {h:ax, k:ax, l:ax});
  const calc = volume(app, {h:ax, k:ax, l:axis(3, 0, 0.5), value:fe});
  const a = app.context.alignComparison(data, calc, {friedel:true});
  assert.equal(a.missing, 0);
  assert.equal(a.mirrored, 5 * 5 * 2);
  // (0.5, -1, -0.5) takes the value at (-0.5, 1, 0.5).
  assertClose(a.values[at(data, 3, 0, 1)], fe(-0.5, 1, 0.5), 1e-12, "Friedel mate");
  assertClose(a.values[at(data, 3, 0, 1)], fe(0.5, -1, -0.5), 1e-12, "same as I(Q) for a Friedel-symmetric function");
});

test("interpolation fills a finer data grid from a coarse comparison", () => {
  const app = loadApp();
  const lin = (h, k, l) => 2 * h - 3 * k + 0.5 * l + 10;
  const data = volume(app, {h:axis(5, -1, 0.5), k:axis(5, -1, 0.5), l:axis(5, -1, 0.5)});
  const calc = volume(app, {h:axis(3, -1, 1), k:axis(3, -1, 1), l:axis(3, -1, 1), value:lin});
  const exact = app.context.alignComparison(data, calc, {friedel:false});
  assert.ok(Number.isNaN(exact.values[at(data, 1, 2, 2)]), "no grid point at h = -0.5 without interpolation");
  const a = app.context.alignComparison(data, calc, {friedel:false, interpolate:true});
  assert.equal(a.missing, 0);
  assertClose(a.values[at(data, 1, 3, 4)], lin(-0.5, 0.5, 1), 1e-12, "trilinear value");
});

test("an HKL data grid meets a Q comparison through its cell", () => {
  const app = loadApp();
  const ax = axis(5, -1, 0.5), s = 2 * Math.PI / 4;
  const Bq = [[s, 0, 0], [0, s, 0], [0, 0, s]];
  const data = volume(app, {h:ax, k:ax, l:ax, meta:{Bq}});
  const q = ax.map(v => v * s);
  const calc = volume(app, {h:q, k:q, l:q, coordKind:"q", value:(x, y, z) => f(x / s, y / s, z / s)});
  const a = app.context.alignComparison(data, calc);
  assert.equal(a.missing, 0);
  assertClose(a.values[at(data, 4, 1, 3)], f(1, -0.5, 0.5), 1e-9, "same point in HKL and Q");
  const bare = volume(app, {h:ax, k:ax, l:ax});
  assert.throws(() => app.context.alignComparison(bare, calc), /unit cell/);
});

test("least squares recovers the scale and offset of the comparison", () => {
  const app = loadApp();
  const ax = axis(5, -1, 0.5);
  const calc = volume(app, {h:ax, k:ax, l:ax, value:f});
  const data = volume(app, {h:ax, k:ax, l:ax, value:(h, k, l) => 2.5 * f(h, k, l) + 0.3});
  data.I[7] = NaN;   // a voxel without data stays out
  const aligned = app.context.alignComparison(data, calc).values;
  const both = app.context.fitComparison(data, aligned, {mode:"scale+offset"});
  assertClose(both.scale, 2.5, 1e-10, "scale");
  assertClose(both.offset, 0.3, 1e-8, "offset");
  assert.equal(both.n, 124);
  assertClose(both.R, 0, 1e-12, "R of a perfect fit");
  const only = app.context.fitComparison(data, aligned, {mode:"scale"});
  assertClose(only.offset, 0, 0, "no offset");
  assert.ok(only.R > 0, "scale alone cannot absorb the offset");
  const header = app.context.fitComparison(data, aligned, {mode:"header", header:{scale:2.5, offset:0.3}});
  assertClose(header.R, 0, 1e-12, "header scale");
  assert.throws(() => app.context.fitComparison(data, aligned, {mode:"header", header:{scale:null}}), /header/);
});

test("weights of 1/sigma^2 favour the precise voxels", () => {
  const app = loadApp();
  const ax = axis(3, -0.5, 0.5);
  const calc = volume(app, {h:ax, k:ax, l:ax, value:() => 1});
  const data = volume(app, {h:ax, k:ax, l:ax, value:() => 2});
  data.I[0] = 10;
  data.sigma = new Float64Array(data.I.length).fill(0.1);
  data.sigma[0] = 1000;
  const aligned = app.context.alignComparison(data, calc).values;
  const plain = app.context.fitComparison(data, aligned, {mode:"scale"});
  const weighted = app.context.fitComparison(data, aligned, {mode:"scale", weighted:true});
  assert.ok(plain.scale > 2.2, "the outlier pulls the plain fit");
  assertClose(weighted.scale, 2, 1e-4, "weighted fit");
  assert.ok(Number.isFinite(weighted.chi2));
});

test("agreement figures and the voxels of an axis slice", () => {
  const app = loadApp();
  const ax = axis(3, -0.5, 0.5);
  const data = volume(app, {h:ax, k:ax, l:ax, value:() => 2});
  const aligned = new Float64Array(data.I.length).fill(1);
  const a = app.context.comparisonAgreement(data, aligned, 1, 0);
  assertClose(a.R, 0.5, 1e-12, "R = sum|2-1| / sum|2|");
  assertClose(a.wR, 0.5, 1e-12, "wR");
  app.state.res = data;
  const seen = [];
  app.context.axisSliceVoxels(data, {type:"axis", fixedAxis:2, fixedIndex:1})(v => seen.push(v));
  assert.equal(seen.length, 9);
  assert.ok(seen.every(v => v % 3 === 1), "every voxel has l index 1");
});

test("run files pair the experiment with its calculation", () => {
  const app = loadApp();
  const file = name => new File(["x"], name);
  const files = ["YSZ_rmc_01.dat", "YSZ_rmc_01.rmc6f", "YSZ_rmc_01_diffuse3d.dat", "YSZ_rmc_01_diffuse3d_calc.dat",
    "YSZ_rmc_01_diffuse3d_aver_amp_calc.dat", "YSZ_rmc_01_diffuse3d_aver_interf_calc.dat", "chi2.dat", "plot_intensity.py"].map(file);
  const plan = app.context.planFileSet(files);
  assert.equal(plan.exp.name, "YSZ_rmc_01_diffuse3d.dat");
  assert.equal(plan.calc.name, "YSZ_rmc_01_diffuse3d_calc.dat");
  assert.deepEqual(Array.from(plan.amplitudes, f => f.name).sort(), ["YSZ_rmc_01_diffuse3d_aver_amp_calc.dat", "YSZ_rmc_01_diffuse3d_aver_interf_calc.dat"]);
  assert.equal(plan.structure.name, "YSZ_rmc_01.rmc6f");
  const alone = app.context.planFileSet([file("pmn_calc.dat"), file("notes.txt")]);
  assert.equal(alone.exp, null);
  assert.equal(alone.calc.name, "pmn_calc.dat");
});

test("a control grid holds one value everywhere", () => {
  const app = loadApp();
  const ax = axis(3, -0.5, 0.5);
  assert.equal(app.context.isControlGrid(volume(app, {h:ax, k:ax, l:ax, value:() => 1})), true);
  assert.equal(app.context.isControlGrid(volume(app, {h:ax, k:ax, l:ax})), false);
});

test("the comparison views follow the fit", () => {
  const app = loadApp();
  const ax = axis(3, -0.5, 0.5);
  const calc = volume(app, {h:ax, k:ax, l:ax, value:f});
  const data = volume(app, {h:ax, k:ax, l:ax, value:(h, k, l) => 3 * f(h, k, l) - 1});
  app.state.res = data;
  app.state.cmpAligned = app.context.alignComparison(data, calc).values;
  app.state.cmpFor = data;
  app.state.cmpFit = app.context.fitComparison(data, app.state.cmpAligned);
  const model = app.context.buildView("cmp"), diff = app.context.buildView("diff");
  for(const v of [0, 5, 13, 26]){
    assertClose(model.I[v], data.I[v], 1e-9, `scaled comparison at ${v}`);
    assertClose(diff.I[v], 0, 1e-9, `difference at ${v}`);
  }
  assert.equal(model.levelsFrom, data, "the scaled comparison shares the data's levels");
  assert.equal(diff.levelsFrom, null);
  assert.equal(diff.fileTag, "_diff");
});
