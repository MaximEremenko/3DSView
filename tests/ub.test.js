"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {loadApp} = require("./harness");
const {assertClose} = require("./fixtures");

const axis = () => Array.from({length:5}, (_, i) => -2 + i);

// A 5 x 5 x 5 volume from -2 to 2, with its file geometry recorded as a
// load records it.
function volume(app, kind, meta={}){
  const ax = axis();
  const res = app.context.makeVolumeResult("ub.h5", [5, 5, 5], ax, ax, ax, new Float64Array(125).map((_, i) => i), "test", kind, null, 0, meta);
  app.state.res = res;
  app.state.sourceGeometry = app.context.snapshotGeometry(res);
  app.state.sourceBasis = app.context.snapshotCellBasis(res);
  return res;
}

const times = (app, A, B) => A.map(row => app.context.mul(row, B));
const assertVec = (got, want, tol, label) => want.forEach((v, c) => assertClose(got[c], v, tol, `${label}[${c}]`));

test("a UB matrix puts a Q grid on HKL through h = (2π UB)⁻¹ Q", () => {
  const app = loadApp();
  const res = volume(app, "q");
  // A cubic crystal with a = 2π Å turned 90° about z: Q = Rz(90°) h.
  const UB = app.context.rotationXYZ([0, 0, 90]).map(row => row.map(v => v / (2 * Math.PI)));
  assert.equal(app.context.indexWithUb(res, UB), "q");
  assert.equal(res.coordKind, "hkl");
  // The voxel at Q = (1, 0, 0), index (3, 2, 2), has h = Rz(-90°) Q = (0, -1, 0).
  const h = app.context.pointAtIndex(res, 3, 2, 2);
  assertVec(h, [0, -1, 0], 1e-12, "h");
  assertVec(app.context.mul(h, res.Bq), [1, 0, 0], 1e-12, "Q from HKL is the measured Q");
  [2 * Math.PI, 2 * Math.PI, 2 * Math.PI, 90, 90, 90].forEach((v, i) => assertClose(res.cellDeg[i], v, 1e-9, `cell ${i}`));
});

test("a corrected UB re-indexes an HKL grid, and each voxel keeps its Q", () => {
  const app = loadApp();
  const cell = [4, 4, 4, 90, 90, 90];
  const file = app.context.basisFromCell(cell, true);
  const res = volume(app, "hkl", {Bq:file.Bq, Bp:file.Bp, cellDeg:cell});
  const fileUB = app.context.bqToUb(file.Bq);
  const UB = times(app, app.context.rotationXYZ([0, 0, 2]), fileUB);
  const voxels = [[0, 0, 0], [4, 2, 2], [3, 1, 4]];
  const before = voxels.map(([i, j, k]) => app.context.mul(app.context.pointAtIndex(res, i, j, k), file.Bq));
  assert.equal(app.context.indexWithUb(res, UB), "reindexed");
  const Bq = app.context.ubToBq(UB);
  voxels.forEach(([i, j, k], n) => assertVec(app.context.mul(app.context.pointAtIndex(res, i, j, k), Bq), before[n], 1e-9, `voxel ${n} Q`));
  assert.ok(app.context.isSkewedGrid(res), "a turned UB turns the grid in HKL");
  // The file's own UB leaves the grid as it was, since each UB starts from the file.
  assert.equal(app.context.indexWithUb(res, fileUB), "reindexed");
  assertVec(app.context.pointAtIndex(res, 4, 2, 2), [2, 0, 0], 1e-12, "h");
  assert.equal(res.gridVectors, undefined, "plain axes again");
});

test("without a UB or cell of its own, an HKL grid keeps its HKL and takes the UB's lattice", () => {
  const app = loadApp();
  const res = volume(app, "hkl");
  const UB = [[0.25, 0, 0], [0, 0.25, 0], [0, 0, 0.2]];
  assert.equal(app.context.indexWithUb(res, UB), "lattice");
  assertVec(app.context.pointAtIndex(res, 4, 2, 2), [2, 0, 0], 1e-12, "h");
  [4, 4, 5, 90, 90, 90].forEach((v, i) => assertClose(res.cellDeg[i], v, 1e-9, `cell ${i}`));
});

test("loading keeps the file's UB with the rotation it drops", () => {
  const app = loadApp();
  const cell = [4, 4, 4, 90, 90, 90];
  const B = app.context.basisFromCell(cell, true).Bq;
  const fileUB = times(app, app.context.rotationXYZ([0, 0, 30]), app.context.bqToUb(B));
  const ax = axis();
  const res = app.context.makeVolumeResult("ub.h5", [5, 5, 5], ax, ax, ax, new Float64Array(125), "test", "hkl", null, 0,
    {Bq:app.context.ubToBq(fileUB), cellDeg:cell});
  app.context.cleanFileGeometry(res);
  B.forEach((row, i) => assertVec(res.Bq[i], row, 1e-9, `lattice row ${i}`));
  app.state.res = res;
  app.state.sourceGeometry = app.context.snapshotGeometry(res);
  app.state.sourceBasis = app.context.snapshotCellBasis(res);
  const shown = app.context.ubInUse(res);
  fileUB.forEach((row, i) => assertVec(shown[i], row, 1e-12, `UB row ${i}`));
});

test("a UB pasted as Mantid prints it reads row by row", () => {
  const app = loadApp();
  const UB = app.context.ubFromText("[[ 0.1  0.   0.  ]\n [ 0.   0.1  0.  ]\n [ 0.   0.   0.25]]");
  assert.deepEqual(Array.from(UB, row => Array.from(row)), [[0.1, 0, 0], [0, 0.1, 0], [0, 0, 0.25]]);
  assert.equal(app.context.ubFromText("1 2 3"), null);
});

test("the rotation helper turns about x, then y, then z", () => {
  const app = loadApp();
  const R = app.context.rotationXYZ([0, 0, 90]);
  [[0, -1, 0], [1, 0, 0], [0, 0, 1]].forEach((row, i) => assertVec(R[i], row, 1e-12, `Rz row ${i}`));
  // About x, which leaves x, then about z, which takes it onto y.
  const xz = app.context.rotationXYZ([90, 0, 90]);
  assertVec([0, 1, 2].map(i => xz[i][0]), [0, 1, 0], 1e-12, "R x");
});

test("a turned grid is resampled onto H, K, L axes through 0", async () => {
  const app = loadApp();
  const cell = [4, 4, 4, 90, 90, 90];
  const file = app.context.basisFromCell(cell, true);
  const ax = Array.from({length:21}, (_, i) => -2 + 0.2 * i);
  const values = new Float64Array(21 ** 3);
  let p = 0;
  for(const h of ax) for(const k of ax) for(const l of ax) values[p++] = h + 2 * k + 3 * l;
  const res = app.context.makeVolumeResult("turn.h5", [21, 21, 21], ax, ax, ax, values, "test", "hkl", null, 0, {Bq:file.Bq, Bp:file.Bp, cellDeg:cell});
  app.state.res = res;
  app.state.sourceGeometry = app.context.snapshotGeometry(res);
  app.state.sourceBasis = app.context.snapshotCellBasis(res);
  const UB = times(app, app.context.rotationXYZ([0, 0, 10]), app.context.bqToUb(file.Bq));
  app.context.indexWithUb(res, UB);
  assertClose(app.context.gridTurnDegrees(res), 10, 1e-9, "turned 10 degrees");
  const {result:g} = await app.context.resampleOnHklAxes(res);
  assertClose(g.h[1] - g.h[0], 0.2, 1e-12, "the file's step");
  [g.h[0], g.k[0], g.l[0]].forEach((v, c) => assertClose(v / 0.2, Math.round(v / 0.2), 1e-9, `axis ${c} passes through 0`));
  assert.ok(Array.isArray(g.ub), "the volume keeps its UB");
  // An inner point takes the value at its old HKL, h·Bq·Bq_file⁻¹; trilinear
  // sampling is exact for a linear field.
  const back = times(app, app.context.ubToBq(UB), app.context.inv3(file.Bq));
  const at = [2, -1, 3].map((d, c) => Math.floor(g.shape[c] / 2) + d);
  const pt = [g.h[at[0]], g.k[at[1]], g.l[at[2]]];
  const old = app.context.mul(pt, back);
  assertClose(g.I[(at[0] * g.shape[1] + at[1]) * g.shape[2] + at[2]], old[0] + 2 * old[1] + 3 * old[2], 1e-9, "value");
});
