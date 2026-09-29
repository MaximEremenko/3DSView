"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {loadApp, h5File} = require("./harness");
const {code, assertClose} = require("./fixtures");

const axis = (n, lo, step) => Array.from({length:n}, (_, i) => lo + i * step);

function volume(app, {h, k, l, coordKind="hkl", meta={}}){
  const shape = [h.length, k.length, l.length];
  const values = new Float64Array(shape[0] * shape[1] * shape[2]).map((_, i) => code(i % 7, i % 5, i % 3));
  return app.context.makeVolumeResult("volume.h5", shape, h, k, l, values, "test", coordKind, null, 0, meta);
}

// The PMN Mantid file's reciprocal basis: cubic to float32 rounding.
const NOISY_CUBIC = [
  [1.5521405528715275, 0, 0],
  [3.063304278602134e-8, 1.552140529311362, 0],
  [2.3066963869709236e-8, -5.366229568006501e-8, 1.5521405614440225]
];

test("a reciprocal basis within rounding of cubic becomes exactly cubic", () => {
  const app = loadApp();
  const ax = axis(5, -1, 0.5);
  const res = app.context.cleanFileGeometry(volume(app, {h:ax, k:ax, l:ax, meta:{Bq:NOISY_CUBIC}}));
  const a = res.Bq[0][0];
  for(let i=0;i<3;i++) for(let j=0;j<3;j++) assert.equal(res.Bq[i][j], i === j ? a : 0, `Bq[${i}][${j}]`);
  assertClose(a, 1.55214054, 1e-7, "a*");
  assert.deepEqual(Array.from(res.cellDeg.slice(3)), [90, 90, 90]);
  assert.equal(res.cellDeg[0], res.cellDeg[1]);
  assert.equal(res.cellDeg[1], res.cellDeg[2]);
  assert.match(res.geometryNote, /cubic metric made exact/);
  assert.match(res.geometryNote, /rounding\) dropped/);
});

test("float32 axis values are set to exact steps, so the zero plane is 0", () => {
  const app = loadApp();
  const f32 = Array.from({length:41}, (_, i) => Math.fround(-1.9512195 + i * 0.09756098));
  const ax = axis(5, -1, 0.5);
  const res = app.context.cleanFileGeometry(volume(app, {h:ax, k:ax, l:f32}));
  assert.equal(res.l[20], 0, "L = 0 plane");
  const step = res.l[1] - res.l[0];
  for(let i=1;i<41;i++) assertClose(res.l[i] - res.l[i - 1], step, 1e-12, `step ${i}`);
  assertClose(res.l[40], f32[40], 1e-6, "end point kept");
  assert.match(res.geometryNote, /one axis set to exact steps/);
});

test("exact text axes and cells that are not nearly ideal are left alone", () => {
  const app = loadApp();
  const ax = axis(7, -1.5, 0.25);
  const cell = app.basisFromCell([4, 4.01, 6, 90, 90, 90], true);
  const res = app.context.cleanFileGeometry(volume(app, {h:ax, k:ax, l:ax, meta:{Bq:cell.Bq}}));
  assert.equal(res.geometryNote, undefined);
  assert.deepEqual(Array.from(res.h), ax);
  assert.equal(res.Bq, cell.Bq, "basis object untouched");
  const offset = volume(app, {h:axis(5, 0.05, 0.1).map(Math.fround), k:ax, l:ax});
  assert.equal(app.context.cleanFileGeometry(offset).geometryNote, undefined, "an axis that does not pass through 0 is kept");
});

test("a Q grid keeps a real sample rotation while its lattice is cleaned", () => {
  const app = loadApp();
  const th = 20 * Math.PI / 180, c = Math.cos(th), s = Math.sin(th);
  const R = [[c, s, 0], [-s, c, 0], [0, 0, 1]];
  const rotated = NOISY_CUBIC.map(row => app.context.mul(row, R));
  const ax = axis(5, -1, 0.5);
  const res = app.context.cleanFileGeometry(volume(app, {h:ax, k:ax, l:ax, coordKind:"q", meta:{Bq:rotated}}));
  assert.match(res.geometryNote, /sample rotation of 20 deg kept/);
  const a = Math.hypot(...res.Bq[0]);
  for(let i=0;i<3;i++) assertClose(Math.hypot(...res.Bq[i]), a, 1e-15, `|row ${i}|`);
  assertClose(res.Bq[0][1] / res.Bq[0][0], Math.tan(th), 1e-12, "rotation angle");
  assertClose(app.context.dot(res.Bq[0], res.Bq[1]), 0, 1e-15, "rows orthogonal");
});

test("projected axes are cleaned in the plain HKL frame", () => {
  const app = loadApp();
  const W = [[1, 1, 0], [-1, 1, 0], [0, 0, 1]];
  const ax = axis(5, -1, 0.5);
  const projected = W.map(row => app.context.mul(row, NOISY_CUBIC));
  const res = app.context.cleanFileGeometry(volume(app, {h:ax, k:ax, l:ax, meta:{Bq:projected, projectionW:W}}));
  const plain = app.context.unprojectedBq(res);
  for(let i=0;i<3;i++) for(let j=0;j<3;j++) if(i !== j) assert.equal(plain[i][j], 0, `plain Bq[${i}][${j}]`);
  assert.equal(plain[0][0], plain[2][2]);
});

test("a Mantid file loads with a clean basis and a zero plane at L = 0", async () => {
  const app = loadApp();
  const [n0, n1, n2] = [5, 5, 5];
  // Bin edges in float32, as Mantid writes them; centres come out slightly off.
  const edges = n => Array.from({length:n + 1}, (_, i) => Math.fround(-0.6 + i * 0.24));
  const UB = [[1 / 4.0484, 0, 0], [4e-9, 1 / 4.0484, 0], [-3e-9, 2e-9, 1 / 4.04840002]];
  const file = await h5File(app, "noisy.nxs", f => {
    const ws = f.create_group("MDHistoWorkspace");
    const data = ws.create_group("data");
    const signal = data.create_dataset({name:"signal", data:new Float64Array(n0 * n1 * n2).map((_, i) => i), shape:[n2, n1, n0], dtype:"<d"});
    signal.create_attribute("axes", "D2:D1:D0");
    [n0, n1, n2].forEach((n, a) => {
      const d = data.create_dataset({name:`D${a}`, data:edges(n), shape:[n + 1], dtype:"<f"});
      d.create_attribute("long_name", ["[H,0,0]", "[0,K,0]", "[0,0,L]"][a]);
    });
    ws.create_group("experiment0").create_group("sample").create_group("oriented_lattice").create_dataset({name:"UB", data:UB.flat(), shape:[3, 3], dtype:"<d"});
  });
  const res = await app.parseFile(file);
  for(const key of ["h", "k", "l"]) assert.equal(res[key][2], 0, `${key} = 0 plane`);
  assert.equal(res.Bq[1][0], 0);
  assert.equal(res.Bq[2][1], 0);
  assert.equal(res.Bq[0][0], res.Bq[2][2]);
  assert.match(res.geometryNote, /3 axes set to exact steps/);
});
