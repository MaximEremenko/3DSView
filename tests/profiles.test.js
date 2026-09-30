"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {loadApp} = require("./harness");
const {assertClose} = require("./fixtures");

const axis = (n, lo, step) => Array.from({length:n}, (_, i) => lo + i * step);

function volume(app, {h, k, l, meta={}, value}){
  const shape = [h.length, k.length, l.length];
  const values = new Float64Array(shape[0] * shape[1] * shape[2]);
  let p = 0;
  for(let i=0;i<shape[0];i++) for(let j=0;j<shape[1];j++) for(let q=0;q<shape[2];q++) values[p++] = value(h[i], k[j], l[q]);
  const res = app.context.makeVolumeResult("volume.h5", shape, h, k, l, values, "test", "hkl", null, 0, meta);
  app.state.res = res;
  return res;
}

const lin = (h, k, l) => 2 * h + 3 * k + l + 10;
// Whether any triangle of a mesh ({i, j, k}) uses vertex v.
const usesVertex = (mesh, v) => mesh.i.some((a, n) => a === v || mesh.j[n] === v || mesh.k[n] === v);

test("a line cut averages the voxels along the line, bin by bin", () => {
  const app = loadApp();
  const ax = axis(5, -1, 0.5);
  const res = volume(app, {h:ax, k:ax, l:ax, value:lin});
  const cut = app.context.lineCutProfile(res, [-1.25, 0, 0], [1.25, 0, 0], {width:0.1, thickness:0.1, normal:[0, 0, 1], bins:5});
  assert.equal(cut.bins, 5);
  Array.from(cut.y).forEach((v, b) => assertClose(v, 2 * (-1 + 0.5 * b) + 10, 1e-12, `bin ${b}`));
  assert.deepEqual(Array.from(cut.n), [1, 1, 1, 1, 1]);
  assertClose(cut.length, 2.5, 1e-12, "length in r.l.u.");
  assert.deepEqual(Array.from(cut.native[2]), [0, 0, 0], "bin centre coordinates");
});

test("a wider band averages across the line; a cylinder cut has no normal", () => {
  const app = loadApp();
  const ax = axis(5, -1, 0.5);
  const res = volume(app, {h:ax, k:ax, l:ax, value:lin});
  const band = app.context.lineCutProfile(res, [-1.25, 0, 0], [1.25, 0, 0], {width:1.1, thickness:0.1, normal:[0, 0, 1], bins:5});
  assert.deepEqual(Array.from(band.n), [3, 3, 3, 3, 3], "k = -0.5, 0, 0.5 in the band");
  Array.from(band.y).forEach((v, b) => assertClose(v, 2 * (-1 + 0.5 * b) + 10, 1e-12, `band bin ${b}`));
  const tube = app.context.lineCutProfile(res, [-1.25, 0, 0], [1.25, 0, 0], {width:1.1, bins:5});
  assert.deepEqual(Array.from(tube.n), [5, 5, 5, 5, 5], "the axis and four neighbours at 0.5");
  assert.equal(tube.thickness, null);
});

test("cut lengths follow the reciprocal metric", () => {
  const app = loadApp();
  const ax = axis(5, -1, 0.5), s = 2 * Math.PI / 4;
  const res = volume(app, {h:ax, k:ax, l:ax, value:lin, meta:{Bq:[[s, 0, 0], [0, s, 0], [0, 0, s]]}});
  const cut = app.context.lineCutProfile(res, [-1, 0, 0], [1, 0, 0], {width:0.05, thickness:0.05, normal:[0, 0, 1]});
  assertClose(cut.length, 2 * s, 1e-12, "length in inverse angstrom");
  assertClose(cut.step, 0.5 * s, 1e-12, "grid step in inverse angstrom");
});

test("by default a cut has one bin per voxel along the axis it crosses fastest", () => {
  const app = loadApp();
  // L is three times coarser than H and K.
  const res = volume(app, {h:axis(13, -1.5, 0.25), k:axis(13, -1.5, 0.25), l:axis(5, -1.5, 0.75), value:lin});
  const alongL = app.context.lineCutProfile(res, [0, 0, -1.5], [0, 0, 1.5], {width:0.5, thickness:0.5, normal:[1, 0, 0]});
  assert.equal(alongL.bins, 8, "a floor of eight bins over four L steps");
  const longL = app.context.lineCutProfile(volume(app, {h:axis(5, -0.5, 0.25), k:axis(5, -0.5, 0.25), l:axis(21, -7.5, 0.75), value:lin}), [0, 0, -7.5], [0, 0, 7.5], {width:0.5, thickness:0.5, normal:[1, 0, 0]});
  assert.equal(longL.bins, 20, "one bin per L step");
  assert.ok(Array.from(longL.n).every(n => n > 0), "no bin is empty");
  const alongH = app.context.lineCutProfile(res, [-1.5, 0, 0], [1.5, 0, 0], {width:0.3, thickness:0.3, normal:[0, 0, 1]});
  assert.equal(alongH.bins, 12, "one bin per H step");
});

test("the model and sigma come along with a cut", () => {
  const app = loadApp();
  const ax = axis(5, -1, 0.5);
  const res = volume(app, {h:ax, k:ax, l:ax, value:lin});
  res.sigma = new Float64Array(res.I.length).fill(0.2);
  const model = {values:Float64Array.from(res.I, v => v / 2), scale:2, offset:0};
  const cut = app.context.lineCutProfile(res, [-1.25, 0, 0], [1.25, 0, 0], {width:1.1, thickness:0.1, normal:[0, 0, 1], bins:5, model});
  Array.from(cut.ym).forEach((v, b) => assertClose(v, cut.y[b], 1e-12, `model bin ${b}`));
  Array.from(cut.ys).forEach((v, b) => assertClose(v, 0.2 / Math.sqrt(3), 1e-12, `sigma of the mean, bin ${b}`));
});

test("a |Q| profile averages shells and gives R per shell", () => {
  const app = loadApp();
  const ax = axis(9, -2, 0.5);
  const res = volume(app, {h:ax, k:ax, l:ax, value:(h, k, l) => 1 + h * h + k * k + l * l});
  const model = {values:Float64Array.from(res.I, v => 1.1 * v), scale:1, offset:0};
  const prof = app.context.radialProfile(res, {bins:8, model});
  assert.equal(prof.bins, 8);
  assert.equal(Array.from(prof.n).reduce((a, b) => a + b, 0), 9 * 9 * 9);
  assertClose(prof.y[0], 1, 1e-12, "the origin shell");
  const withR = Array.from(prof.R).filter(Number.isFinite);
  assert.ok(withR.length >= 3, "R where shells are well filled");
  for(const r of withR) assertClose(r, 0.1, 1e-12, "R per shell");
  assert.ok(Number.isNaN(prof.R[0]), "the one-voxel origin shell gets no R");
  // Values grow with |Q|.
  const means = Array.from(prof.y).filter(Number.isFinite);
  assert.ok(means.every((v, i) => i === 0 || v > means[i - 1]), "shell means increase");
});

test("native coordinates between grid points", () => {
  const app = loadApp();
  // An uneven axis that no regular lattice holds, so it is kept as read.
  const res = volume(app, {h:[0, 1, 1 + Math.SQRT2], k:axis(3, 0, 1), l:axis(3, 0, 1), value:lin});
  assert.equal(res.shape[0], 3);
  const p = app.context.nativeAtFraction(res, [1.5, 0.25, 2]);
  assertClose(p[0], 1 + Math.SQRT2 / 2, 1e-12, "between uneven points");
  assertClose(p[1], 0.25, 1e-12, "regular axis");
  assertClose(p[2], 2, 1e-12, "last point");
});

test("thick axis slices average the neighbouring slices, leaving empty voxels out", () => {
  const app = loadApp();
  const ax = axis(5, -1, 0.5);
  const res = volume(app, {h:ax, k:ax, l:ax, value:lin});
  res.I[(2 * 5 + 2) * 5 + 1] = NaN;   // (0, 0, -0.5) is empty
  const thin = app.context.buildAxisSlice(res, "l", 2, 1e6, false, 0);
  const thick = app.context.buildAxisSlice(res, "l", 2, 1e6, false, 1);
  assert.equal(thick.thickness, 1);
  assert.match(thick.plane, /±1 slice/);
  const cell = (sl, i, j) => sl.d[i * sl.cols + j];
  assertClose(cell(thin, 3, 4), lin(0.5, 1, 0), 1e-12, "single slice");
  assertClose(cell(thick, 3, 4), lin(0.5, 1, 0), 1e-12, "mean of l = -0.5, 0, 0.5 of a linear function");
  assertClose(cell(thick, 2, 2), (lin(0, 0, 0) + lin(0, 0, 0.5)) / 2, 1e-12, "the empty voxel stays out");
  let n = 0;
  app.context.axisSliceVoxels(res, thick)(() => n++);
  assert.equal(n, 3 * 25, "the agreement covers the three slices");
});

test("the cutaway block has a cut face, a cap and four walls, with holes where data are missing", () => {
  const app = loadApp();
  const ax = axis(5, -1, 0.5);
  const res = volume(app, {h:ax, k:ax, l:ax, value:lin});
  res.I[(2 * 5 + 2) * 5 + 2] = NaN;   // the centre of the cut face at l = 0
  const sl = {type:"axis", fixedAxis:2, fixedIndex:2};
  const below = app.context.cutawayMesh(res, sl, "linear", {keep:"below"});
  assert.equal(below.faces, 6);
  // Every grid point of the faces is a vertex: cut face 25, cap 25, four walls of 3 x 5.
  assert.equal(below.x.length, 25 + 25 + 4 * 15);
  const hole = below.custom.findIndex(c => c[0] === 0 && c[1] === 0 && c[2] === 0);
  assert.ok(hole >= 0 && !usesVertex(below, hole), "the empty voxel leaves a hole in the cut face");
  assert.ok(below.custom.every(c => c[2] <= 0 + 1e-12), "the block stays below the cut");
  assert.ok(below.i.length > 0);
  const above = app.context.cutawayMesh(res, sl, "linear", {keep:"above"});
  assert.ok(above.custom.every(c => c[2] >= -1e-12), "the other side");
  const top = app.context.cutawayMesh(res, {type:"axis", fixedAxis:2, fixedIndex:4}, "linear", {keep:"above"});
  assert.equal(top.faces, 1, "at the end of the range only the cut face is left");
});

test("the cut-away cube follows the data where its faces are empty, and shows its cut planes as they are", () => {
  const app = loadApp();
  const ax = axis(5, -1, 0.5);
  const res = volume(app, {h:ax, k:ax, l:ax, value:lin});
  res.I[0] = NaN;                       // the corner at h, k, l = -1, on three outer faces
  res.I[(2 * 5 + 3) * 5 + 3] = NaN;     // h, k, l = 0, 0.5, 0.5, on the cut plane h = 0
  const m = app.context.cubeMesh(res, "linear", [2, 2, 2]);
  // Per axis: the far face, the near face as an L of two rectangles, and the cut face.
  assert.equal(m.faces, 12);
  assert.equal(m.x.length, 3 * (25 + 15 + 9 + 9), "every grid point of the faces is a vertex");
  const at = (h, k, l) => m.custom.findIndex(c => c[0] === h && c[1] === k && c[2] === l);
  assert.ok(at(-1, -1, -1) < 0, "no vertex stays on the empty corner");
  for(const p of [[-0.5, -1, -1], [-1, -0.5, -1], [-1, -1, -0.5]]){
    const v = at(...p);
    assert.ok(v >= 0 && usesVertex(m, v), `each outer face recedes one voxel there, to ${p}`);
  }
  const inside = at(0, 0.5, 0.5);
  assert.ok(inside >= 0 && !usesVertex(m, inside), "the cut plane keeps its hole");
  assert.ok(m.custom.every(c => !(c[0] > 0 && c[1] > 0 && c[2] > 0)), "nothing beyond the cut shows");
  // Behind the removed corner a face recedes no further than the cut: in a
  // column holding data only at h = -0.5, past a cut at h = -1, it finds none.
  const hollow = volume(app, {h:ax, k:ax, l:ax, value:lin});
  for(let i=0;i<5;i++) hollow.I[(i * 5 + 4) * 5 + 4] = i === 1 ? 1 : NaN;
  const cutBig = app.context.cubeMesh(hollow, "linear", [0, 0, 0]);
  assert.ok(cutBig.custom.findIndex(c => c[0] === -0.5 && c[1] === 1 && c[2] === 1) < 0, "the far face does not reach past the cut");
  // With nothing cut, the six faces are whole.
  assert.equal(app.context.cubeMesh(res, "linear", [4, 4, 4]).faces, 6);
});

test("lattice directions and rotations for the camera", () => {
  const app = loadApp();
  const ax = axis(3, -0.5, 0.5), s = 2 * Math.PI / 4;
  const res = volume(app, {h:ax, k:ax, l:ax, value:lin, meta:{Bq:[[s, 0, 0], [0, s, 0], [0, 0, 2 * Math.PI / 6]]}});
  const {recip, direct} = app.context.latticeDirections(res);
  assertClose(recip[2][2], 2 * Math.PI / 6, 1e-12, "c* along z");
  assertClose(app.context.dot(direct[0], recip[1]), 0, 1e-12, "a is square to b*");
  const r = app.context.rotateAbout([1, 0, 0], [0, 0, 1], Math.PI / 2);
  [0, 1, 0].forEach((v, i) => assertClose(r[i], v, 1e-12, `rotated ${i}`));
});

test("|Q| shells follow Mantid's Rebin rules", () => {
  const app = loadApp();
  const edges = (text, opts) => Array.from(app.context.rebinEdges(text, opts)).map(v => Number(v.toFixed(10)));
  assert.deepEqual(edges("", {qmin:0, qmax:0.3, step:0.1}), [0, 0.1, 0.2, 0.3]);
  // The last shell of a range is 0.25 to 1.25 steps wide.
  assert.deepEqual(edges("0.3", {qmin:0, qmax:1, step:0.1}), [0, 0.3, 0.6, 0.9, 1]);
  assert.deepEqual(edges("0.45", {qmin:0, qmax:1, step:0.1}), [0, 0.45, 1]);
  // Ranges with their own steps.
  assert.deepEqual(edges("0.5, 0.25, 1, 0.5, 2", {qmin:0, qmax:9, step:0.1}), [0.5, 0.75, 1, 1.5, 2]);
  // A negative step: each edge 10 % above the one before.
  const log = app.context.rebinEdges("-0.1", {qmin:1, qmax:2, step:0.1});
  for(let b=1;b<log.length - 1;b++) assertClose(log[b] / log[b - 1], 1.1, 1e-12, `ratio ${b}`);
  assert.equal(log[log.length - 1], 2);
  assert.throws(() => app.context.rebinEdges("-0.1", {qmin:0, qmax:2, step:0}), /Q min above 0/);
  assert.throws(() => app.context.rebinEdges("0.5, 0.1", {qmin:0, qmax:2, step:0.1}), /Rebin parameters/);
});

test("I(Q) keeps its level where voxels are missing, and reports the coverage", () => {
  const app = loadApp();
  const ax = axis(41, -2, 0.1);
  const f = q => 1 + q * q;
  const res = volume(app, {h:ax, k:ax, l:ax, value:(h, k, l) => f(Math.hypot(h, k, l))});
  const full = app.context.radialProfile(res, {rebin:"0.1", qmax:1.8});
  assert.equal(full.sub, 2, "voxels are split in 2 x 2 x 2");
  for(let b=2;b<full.bins;b++){
    const exact = (full.edges[b] + full.edges[b + 1]) / 2;
    assert.ok(Math.abs(full.y[b] / f(exact) - 1) < 0.02, `shell ${b}: ${full.y[b]} against ${f(exact)}`);
    assert.ok(Math.abs(full.cov[b] - 1) < 0.05, `coverage of shell ${b}: ${full.cov[b]}`);
  }
  // Take away 40 % of the voxels: the level stays, the coverage drops.
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for(let v=0;v<res.I.length;v++) if(rand() < 0.4) res.I[v] = NaN;
  const holes = app.context.radialProfile(res, {rebin:"0.1", qmax:1.8});
  for(let b=4;b<holes.bins;b++){
    assert.ok(Math.abs(holes.y[b] / full.y[b] - 1) < 0.03, `level of shell ${b}`);
    assert.ok(Math.abs(holes.cov[b] - 0.6) < 0.08, `coverage of shell ${b}: ${holes.cov[b]}`);
  }
});

test("I(Q) carries σ, the cells of a voxel counting as one measurement", () => {
  const app = loadApp();
  const ax = axis(9, -2, 0.5);
  const res = volume(app, {h:ax, k:ax, l:ax, value:() => 5});
  res.sigma = new Float64Array(res.I.length).fill(0.2);
  const prof = app.context.radialProfile(res, {bins:4});
  for(let b=0;b<prof.bins;b++) assertClose(prof.ys[b], 0.2 / Math.sqrt(prof.n[b]), 1e-12, `σ of shell ${b}`);
  const split = app.context.radialProfile(res, {rebin:"0.5"});
  // A voxel shared by shells adds its share to each: σ = √(Σf²σ²)/Σf, at most
  // σ/√(Σf) as shares are at most 1.
  for(let b=0;b<split.bins;b++){
    assert.ok(Number.isFinite(split.ys[b]) && split.ys[b] > 0, `σ of shell ${b}`);
    assert.ok(split.ys[b] <= 0.2 / Math.sqrt(split.n[b]) + 1e-12, `σ of shell ${b} within its bound`);
  }
});
