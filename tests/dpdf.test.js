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
  const res = app.context.makeVolumeResult("diffuse.h5", shape, h, k, l, values, "test", "hkl", null, 0, meta);
  app.state.res = res;
  return res;
}

const isInt = v => Math.abs(v - Math.round(v)) < 1e-9;

test("lattice centring decides which reflections are allowed", () => {
  const app = loadApp(), allows = app.context.centringAllows;
  const R = Object.fromEntries(["P", "I", "F", "C", "A", "B", "R"].map(c => [c, (h, k, l) => allows(c, h, k, l)]));
  assert.equal(R.F(1, 1, 1), true);
  assert.equal(R.F(2, 0, 0), true);
  assert.equal(R.F(1, 0, 0), false);
  assert.equal(R.I(1, 1, 0), true);
  assert.equal(R.I(1, 0, 0), false);
  assert.equal(R.C(1, 1, 3), true);
  assert.equal(R.R(1, 0, 1), true);
  assert.equal(R.R(1, 0, 0), false);
  assert.equal(R.F(-1, 1, -3), true, "negative indices");
});

test("allowed reflections inside the grid", () => {
  const app = loadApp();
  const ax = axis(9, -2, 0.5);
  const res = volume(app, {h:ax, k:ax, l:ax, value:() => 1});
  assert.equal(app.context.braggPositions(res, "P").length, 125);
  assert.equal(app.context.braggPositions(res, "F").length, 27 + 8, "all even or all odd");
});

test("Bragg removal takes the peaks and keeps the diffuse signal around them", () => {
  const app = loadApp();
  const ax = axis(9, -2, 0.5);
  const res = volume(app, {h:ax, k:ax, l:ax, value:(h, k, l) => (isInt(h) && isInt(k) && isInt(l) ? 100 : 1 + 0.01 * (h + k + l))});
  const out = app.context.removeBragg(res, res.I, {centring:"P", radius:0.6, fence:1.5});
  assert.equal(out.reflections, 125);
  assert.equal(out.removed, 125, "only the peak voxels");
  for(let v=0;v<res.I.length;v++){
    if(res.I[v] === 100) assert.ok(Number.isNaN(out.I[v]), "peak removed");
    else assert.equal(out.I[v], res.I[v], "diffuse kept");
  }
  const whole = app.context.removeBragg(res, res.I, {centring:"F", radius:0.3, fence:0});
  assert.equal(whole.reflections, 35);
  assert.equal(whole.removed, 35, "a sphere smaller than a step holds only the peak voxel");
  const inner = app.context.removeBragg(res, res.I, {centring:"F", radius:0.3, fence:0, inner:0.6});
  assert.ok(inner.removed > whole.removed, "the inner sphere around Q = 0 goes too");
});

test("gaps fill from their neighbours; data keep their values", () => {
  const app = loadApp();
  const ax = axis(9, -2, 0.5);
  const lin = (h, k, l) => 3 + h - 2 * k + 0.5 * l;
  const res = volume(app, {h:ax, k:ax, l:ax, value:lin});
  const I = Float64Array.from(res.I), centre = (4 * 9 + 4) * 9 + 4;
  I[centre] = NaN;
  const out = app.context.fillGaps(res, I, {sigma:0.6});
  assert.equal(out.filled, 1);
  assertClose(out.I[centre], lin(0, 0, 0), 1e-9, "a linear field fills exactly from symmetric neighbours");
  assert.equal(out.I[0], res.I[0], "data unchanged");
});

test("the transform of a Friedel pair of peaks is a cosine on the dual grid", async () => {
  const app = loadApp();
  const ax = axis(5, -2, 1);
  const res = volume(app, {h:ax, k:ax, l:ax, value:(h, k, l) => (Math.abs(h) === 1 && k === 0 && l === 0 ? 1 : 0)});
  const pdf = await app.context.deltaPdfVolume(res, res.I, {window:"none"});
  assert.deepEqual(Array.from(pdf.dims), [5, 5, 5], "2 x 2 + 1 points, already a product of small primes");
  assertClose(pdf.D[0][0], 1 / 5, 1e-12, "u step 1/(N dh)");
  assertClose(pdf.origin[0], -0.4, 1e-12, "centred on r = 0");
  const at = (a, b, c) => pdf.values[(a * 5 + b) * 5 + c];
  // P(u) = 2 cos(2 pi u) / 125 at u = (a - 2) / 5, for every v and w.
  for(const a of [0, 1, 2, 3, 4]) assertClose(at(a, 2, 2), 2 * Math.cos(2 * Math.PI * (a - 2) / 5) / 125, 1e-6, `u index ${a}`);
  assertClose(at(2, 0, 4), at(2, 2, 2), 1e-6, "no variation along v and w");
  const result = app.context.deltaPdfResult(res, pdf);
  assert.equal(result.coordKind, "uvw");
  assert.equal(app.context.isRealSpaceData(result), true);
  assert.match(result.file, /_dpdf$/);
});

test("the transform needs Q = 0 on the grid and reciprocal data", async () => {
  const app = loadApp();
  const res = volume(app, {h:axis(5, -1.75, 0.5), k:axis(5, -1, 0.5), l:axis(5, -1, 0.5), value:() => 1});
  await assert.rejects(app.context.deltaPdfVolume(res, res.I), /Q = 0/);
});


test("the mixed-radix FFT matches a direct transform", () => {
  const app = loadApp();
  for(const n of [6, 7, 12, 15, 35, 60]){
    const re = new Float32Array(n), im = new Float32Array(n);
    for(let t=0;t<n;t++){ re[t] = Math.sin(0.7 * t) + 0.3 * t; im[t] = Math.cos(1.3 * t); }
    const x = Array.from(re), y = Array.from(im);
    app.context.fftAxis(re, im, [n, 1, 1], 0);
    for(const k of [0, 1, Math.floor(n / 2), n - 1]){
      let sr = 0, si = 0;
      for(let t=0;t<n;t++){ const a = -2 * Math.PI * k * t / n; sr += x[t] * Math.cos(a) - y[t] * Math.sin(a); si += x[t] * Math.sin(a) + y[t] * Math.cos(a); }
      assertClose(re[k], sr, 1e-3 * n, `n=${n} Re X[${k}]`);
      assertClose(im[k], si, 1e-3 * n, `n=${n} Im X[${k}]`);
    }
  }
  assert.equal(app.context.smoothSize(301), 315);
  assert.equal(app.context.smoothSize(299), 300);
});

test("the transform uses the shown volume and bins to fit", async () => {
  const app = loadApp();
  const ax = Array.from({length:9}, (_, i) => -2 + 0.5 * i);
  const res = volume(app, {h:ax, k:ax, l:ax, value:() => 1});
  const cropped = await app.context.deltaPdfVolume(res, res.I, {window:"none", ranges:[[2, 6], [0, 8], [0, 8]]});
  assert.deepEqual(Array.from(cropped.dims), [5, 9, 9], "only +-2 steps along H are shown");
});
