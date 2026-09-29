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
  // Cut face 25 - 1 hole, cap 25, four walls of 3 x 5 cells.
  assert.equal(below.x.length, 24 + 25 + 4 * 15);
  assert.ok(!below.custom.some(c => c[0] === 0 && c[1] === 0 && c[2] === 0), "the empty voxel leaves a hole");
  assert.ok(below.custom.every(c => c[2] <= 0 + 1e-12), "the block stays below the cut");
  assert.ok(below.i.length > 0);
  const above = app.context.cutawayMesh(res, sl, "linear", {keep:"above"});
  assert.ok(above.custom.every(c => c[2] >= -1e-12), "the other side");
  const top = app.context.cutawayMesh(res, {type:"axis", fixedAxis:2, fixedIndex:4}, "linear", {keep:"above"});
  assert.equal(top.faces, 1, "at the end of the range only the cut face is left");
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
