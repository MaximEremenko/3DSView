"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {loadApp} = require("./harness");
const {code, assertClose} = require("./fixtures");

const axis = (n, lo, step) => Array.from({length:n}, (_, i) => lo + i * step);

// An HKL (or other) volume with values code(i, j, k) on the given axes.
function volume(app, {name="volume.h5", h, k, l, coordKind="hkl", meta={}, value=code}){
  const shape = [h.length, k.length, l.length];
  const values = new Float64Array(shape[0] * shape[1] * shape[2]);
  let p = 0;
  for(let i=0;i<shape[0];i++) for(let j=0;j<shape[1];j++) for(let q=0;q<shape[2];q++) values[p++] = value(i, j, q);
  return app.context.makeVolumeResult(name, shape, h, k, l, values, "test", coordKind, null, 0, meta);
}

// Mean of the data over the images of voxel (i, j, k) that land on the grid.
function orbitMean(app, res, cls, i, j, k){
  // Each operator counts once, as in the average, so repeated images repeat.
  const hkl = [res.h[i], res.k[j], res.l[k]], values = [];
  for(const R of app.context.laueGroup(cls)){
    const p = app.context.mul(hkl, R);
    const idx = [res.h, res.k, res.l].map((ax, a) => Array.from(ax).findIndex(v => Math.abs(v - p[a]) < 1e-9));
    if(idx.some(v => v < 0)) continue;
    const v = res.I[(idx[0] * res.shape[1] + idx[1]) * res.shape[2] + idx[2]];
    if(Number.isFinite(v)) values.push(v);
  }
  return values.reduce((s, v) => s + v, 0) / values.length;
}

test("every Laue class closes into a group of the right order", () => {
  const app = loadApp();
  const orders = {"-1":2, "2/m_b":4, "2/m_c":4, "mmm":8, "4/m":8, "4/mmm":16, "-3":6, "-3m1":12, "-31m":12, "-3R":6, "-3mR":12, "6/m":12, "6/mmm":24, "m-3":24, "m-3m":48};
  for(const [cls, n] of Object.entries(orders)) assert.equal(app.context.laueGroup(cls).length, n, cls);
});

test("m-3m averages each voxel over its orbit on a cubic grid", async () => {
  const app = loadApp();
  const ax = axis(5, -1, 0.5);
  const res = volume(app, {h:ax, k:ax, l:ax});
  const out = await app.context.symmetrizeVolume(res, "m-3m", "average");
  assert.equal(out.used, 48);
  assert.equal(out.skipped, 0);
  const at = (i, j, k) => out.I[(i * 5 + j) * 5 + k];
  for(const [i, j, k] of [[3, 4, 1], [0, 2, 4], [2, 2, 2], [4, 4, 4]]){
    assertClose(at(i, j, k), orbitMean(app, res, "m-3m", i, j, k), 1e-9, `orbit mean at ${i},${j},${k}`);
  }
  // Symmetry-equivalent voxels agree: (0.5, 1, -0.5) ~ (1, -0.5, 0.5) ~ (-1, 0.5, 0.5).
  assertClose(at(3, 4, 1), at(4, 1, 3), 1e-12, "cyclic permutation");
  assertClose(at(3, 4, 1), at(0, 3, 3), 1e-12, "signed permutation");
});

test("fill mode keeps measured voxels and fills empty ones from their equivalents", async () => {
  const app = loadApp();
  const ax = axis(5, -1, 0.5);
  const res = volume(app, {h:ax, k:ax, l:ax});
  const hole = (4 * 5 + 3) * 5 + 2;             // (1, 0.5, 0)
  const measured = res.I[(1 * 5 + 2) * 5 + 0];  // (-0.5, 0, -1)
  res.I[hole] = NaN;
  const out = await app.context.symmetrizeVolume(res, "4/mmm", "fill");
  assert.equal(out.filled, 1);
  assert.equal(out.I[(1 * 5 + 2) * 5 + 0], measured, "measured voxel unchanged");
  assertClose(out.I[hole], orbitMean(app, res, "4/mmm", 4, 3, 2), 1e-9, "hole filled with the mean of its equivalents");
  assert.ok(Number.isNaN(res.I[hole]), "the data itself is not changed");
});

test("operators that do not map the grid onto itself are skipped", async () => {
  const app = loadApp();
  const hk = axis(5, -1, 0.5), l = axis(3, -1, 1);
  const res = volume(app, {h:hk, k:hk, l});
  const {total, skipped} = app.context.gridSymmetryMaps(res, "m-3m");
  // Only the operators that keep L along L (the 4/mmm subgroup) fit.
  assert.equal(total, 48);
  assert.equal(total - skipped, 16);
  const off = volume(app, {h:axis(5, -0.9, 0.5), k:hk, l:hk});
  assert.equal(app.context.gridSymmetryMaps(off, "mmm").skipped, 4, "a grid not centred on 0 loses the sign flips of its axis");
});

test("hexagonal classes work on HKL grids and need a cell for Q grids", async () => {
  const app = loadApp();
  const hk = axis(5, -1, 0.5), l = axis(3, -0.5, 0.5);
  const res = volume(app, {h:hk, k:hk, l});
  const maps = app.context.gridSymmetryMaps(res, "6/mmm");
  assert.equal(maps.total - maps.skipped, 24);
  const out = await app.context.symmetrizeVolume(res, "6/mmm", "average");
  // (0.5, 0, 0) ~ (0, -0.5, 0) under the threefold (k, -h-k, l) and the inversion.
  const at = (i, j, q) => out.I[(i * 5 + j) * 3 + q];
  assertClose(at(3, 2, 1), at(2, 1, 1), 1e-12, "threefold image");
  const q = volume(app, {h:hk, k:hk, l, coordKind:"q"});
  assert.throws(() => app.context.gridSymmetryMaps(q, "6/mmm"), /unit cell/);
  assert.equal(app.context.gridSymmetryMaps(q, "m-3").skipped, 0, "cubic classes work on Cartesian Q with a along x");
});

test("projected axes such as [H,H,0] get the operators in their own frame", () => {
  const app = loadApp();
  const ax = axis(5, -1, 0.5);
  const res = volume(app, {h:ax, k:ax, l:ax, meta:{projectionW:[[1, 1, 0], [-1, 1, 0], [0, 0, 1]]}});
  const {total, skipped} = app.context.gridSymmetryMaps(res, "4/mmm");
  assert.equal(total, 16);
  assert.equal(skipped, 0);
});

test("sigma of a symmetrized voxel is that of the mean", async () => {
  const app = loadApp();
  const ax = axis(3, -0.5, 0.5);
  const res = volume(app, {h:ax, k:ax, l:ax});
  res.sigma = new Float64Array(res.I.length).fill(0.3);
  const out = await app.context.symmetrizeVolume(res, "mmm", "average");
  const v = (2 * 3 + 2) * 3 + 2;  // (0.5, 0.5, 0.5): 8 distinct images
  assert.equal(out.count[v], 8);
  assertClose(out.sigma[v], 0.3 / Math.sqrt(8), 1e-12, "sigma of the mean of 8");
});

test("uneven grids are refused", () => {
  const app = loadApp();
  const res = volume(app, {h:[-1, -0.4, 0, 0.5, 1], k:axis(5, -1, 0.5), l:axis(5, -1, 0.5)});
  assert.throws(() => app.context.gridSymmetryMaps(res, "-1"), /regular grid/);
});

test("the Laue class is suggested from the file name or the cell", () => {
  const app = loadApp();
  const ax = axis(3, -0.5, 0.5);
  const s = app.context.suggestLaueClass;
  assert.equal(s(volume(app, {name:"PMN_x0p0_300K_cc_m-3m.nxs", h:ax, k:ax, l:ax})).cls, "m-3m");
  assert.equal(s(volume(app, {name:"CuAu_Fm-3m_sym.h5", h:ax, k:ax, l:ax})).cls, "m-3m");
  assert.equal(s(volume(app, {name:"tetra.h5", h:ax, k:ax, l:ax, meta:{cellDeg:[4, 4, 6, 90, 90, 90]}})).cls, "4/mmm");
  assert.equal(s(volume(app, {name:"hex.h5", h:ax, k:ax, l:ax, meta:{cellDeg:[3, 3, 5, 90, 90, 120]}})).cls, "6/mmm");
  assert.equal(s(volume(app, {name:"plain.h5", h:ax, k:ax, l:ax})).cls, "-1");
});

test("the deviation and equivalents views derive from the symmetrized result", async () => {
  const app = loadApp();
  const ax = axis(5, -1, 0.5);
  const res = volume(app, {h:ax, k:ax, l:ax});
  app.state.res = res;
  app.state.sym = await app.context.symmetrizeVolume(res, "m-3m", "average");
  const dev = app.context.buildView("symdev");
  const count = app.context.buildView("symcount");
  const sym = app.context.buildView("sym");
  assert.equal(dev.valueName, "Data − symmetrized");
  for(const v of [0, 17, 62, 124]){
    assertClose(dev.I[v], res.I[v] - app.state.sym.mean[v], 1e-12, `deviation at ${v}`);
    assert.equal(count.I[v], app.state.sym.count[v]);
  }
  assert.equal(count.I[62], 48, "the centre (0,0,0) is its own image 48 times");
  assert.equal(sym.columnName, "intensity_symmetrized");
  assert.equal(sym.fileTag, "_sym");
});

test("Laue symbols as reduction programs write them in file names", () => {
  const app = loadApp();
  const ax = axis(3, -0.5, 0.5);
  const s = name => app.context.suggestLaueClass(volume(app, {name, h:ax, k:ax, l:ax})).cls;
  assert.equal(s("CuAu_(h,k,0)_[0,0,l]_[-10,10]x3_201x201x201_4_mmm_cc.nxs"), "4/mmm");
  assert.equal(s("YSZ_[-8,8]x3_6_mmm.nxs"), "6/mmm");
  assert.equal(s("film_2_m_sub_bkg.nxs"), "2/m_b");
  assert.equal(s("calcite_-3m_r_cc.nxs"), "-3mR");
  assert.equal(s("PMN_x0p0_300K_cc_m-3m.nxs"), "m-3m");
});

test("typed generators close into the same group as the named class", () => {
  const app = loadApp();
  const key = m => Array.from(m, r => Array.from(r).join(",")).join(";");
  const ops = list => Array.from(list, key).sort();
  const named = ops(app.context.laueGroup("6/mmm"));
  const reciprocal = app.context.setCustomSymmetry("h+k,-h,l; k,h,l");
  assert.equal(reciprocal.length, 24);
  assert.deepEqual(ops(reciprocal), named, "the six-fold and a swap give 6/mmm");
  assert.deepEqual(ops(app.context.setCustomSymmetry("x-y,x,z; y,x,z")), named, "the same from real-space triplets");
  assert.equal(app.context.opTriplet([[0, -1, 0], [1, -1, 0], [0, 0, 1]]), "k,-h-k,l");
  assert.throws(() => app.context.setCustomSymmetry("h+k,k,l"), /more than 48/, "a shear never closes");
  assert.throws(() => app.context.setCustomSymmetry("0.5h,k,l"), /fractional/);
  assert.throws(() => app.context.setCustomSymmetry("2h,k,l"), /determinant 2/);
  assert.throws(() => app.context.setCustomSymmetry("h,y,z"), /either/);
});

test("the metric check flags operations that do not fit the cell", () => {
  const app = loadApp();
  const ax = [-1, 0, 1];
  const res = app.context.makeVolumeResult("tet.h5", [3, 3, 3], ax, ax, ax, new Float64Array(27).fill(1), "test", "hkl");
  res.Bq = app.basisFromCell([4, 4, 6, 90, 90, 90], true).Bq;
  assert.ok(app.context.symmetryMetricChange(res, "4/mmm") < 1e-9, "tetragonal operations keep a tetragonal metric");
  assert.ok(app.context.symmetryMetricChange(res, "m-3m") > 0.02, "cubic ones do not");
  const hex = app.context.makeVolumeResult("hex.h5", [3, 3, 3], ax, ax, ax, new Float64Array(27).fill(1), "test", "hkl");
  hex.Bq = app.basisFromCell([3, 3, 5, 90, 90, 120], true).Bq;
  assert.ok(app.context.symmetryMetricChange(hex, "6/mmm") < 1e-9);
  const direct = app.context.makeVolumeResult("map.h5", [3, 3, 3], ax, ax, ax, new Float64Array(27), "test", "uvw");
  assert.ok(Number.isNaN(app.context.symmetryMetricChange(direct, "6/mmm")), "no check without a reciprocal basis");
});

test("the edge mask takes measured voxels next to empty ones", () => {
  const app = loadApp();
  const ax = Array.from({length:7}, (_, i) => i - 3);
  const count = m => Array.from(m).reduce((s, v) => s + v, 0);
  const values = new Float64Array(343).fill(1);
  values[(3 * 7 + 3) * 7 + 3] = NaN;
  const res = app.context.makeVolumeResult("edge.h5", [7, 7, 7], ax, ax, ax, values, "test", "hkl");
  assert.equal(count(app.context.edgeMask(res, 1)), 26, "the 26 neighbours of the hole");
  assert.equal(count(app.context.edgeMask(res, 2)), 124, "a 5 x 5 x 5 box less the hole");
  assert.equal(count(app.context.edgeMask(res, 0)), 0);
  const full = app.context.makeVolumeResult("full.h5", [7, 7, 7], ax, ax, ax, new Float64Array(343).fill(1), "test", "hkl");
  assert.equal(count(app.context.edgeMask(full, 2)), 0, "the edge of the grid is not an edge of the data");
});

test("the outlier cut flags a spike among its symmetry equivalents", async () => {
  const app = loadApp();
  const ax = Array.from({length:7}, (_, i) => i - 3);
  const values = new Float64Array(343);
  for(let i=0;i<7;i++) for(let j=0;j<7;j++) for(let k=0;k<7;k++){
    const s = [ax[i], ax[j], ax[k]].map(Math.abs).sort();
    values[(i * 7 + j) * 7 + k] = 1 + s[0] + 10 * s[1] + 100 * s[2];   // unchanged by m-3m
  }
  const spike = (5 * 7 + 4) * 7 + 3;   // (2, 1, 0)
  values[spike] *= 50;
  const res = app.context.makeVolumeResult("spike.h5", [7, 7, 7], ax, ax, ax, values, "test", "hkl");
  res.Bq = app.basisFromCell([4, 4, 4, 90, 90, 90], true).Bq;
  const flagged = Array.from(await app.context.outlierMask(res, "m-3m", 5)).map((v, i) => (v ? i : -1)).filter(i => i >= 0);
  assert.deepEqual(flagged, [spike]);
  const skip = new Uint8Array(343);
  skip[spike] = 1;
  assert.equal(Array.from(await app.context.outlierMask(res, "m-3m", 5, skip)).filter(Boolean).length, 0, "voxels left out are not judged");
});
