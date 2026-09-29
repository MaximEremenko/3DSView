"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {loadApp} = require("./harness");
const {assertClose} = require("./fixtures");

test("the FFT goes forward and back, and matches a direct transform", async () => {
  const app = loadApp();
  const dims = [12, 10, 14], n = dims[0] * dims[1] * dims[2];
  const re = new Float64Array(n).map((_, i) => Math.sin(i * 0.37) + 0.1 * (i % 7));
  const im = new Float64Array(n).map((_, i) => Math.cos(i * 0.11));
  const re0 = re.slice(), im0 = im.slice();
  await app.context.fft3(re, im, dims);
  await app.context.fft3(re, im, dims, true);
  for(let i=0;i<n;i+=97){ assertClose(re[i], re0[i], 1e-10, `re ${i}`); assertClose(im[i], im0[i], 1e-10, `im ${i}`); }
  // One line of 21 points (3 x 7) against the sum.
  const line = Float64Array.from({length:21}, (_, t) => Math.exp(-0.1 * t) * Math.cos(t));
  const lr = line.slice(), li = new Float64Array(21);
  app.context.fftAxis(lr, li, [1, 1, 21], 2);
  for(const q of [0, 1, 5, 20]){
    let sr = 0, si = 0;
    for(let t=0;t<21;t++){ sr += line[t] * Math.cos(2 * Math.PI * q * t / 21); si -= line[t] * Math.sin(2 * Math.PI * q * t / 21); }
    assertClose(lr[q], sr, 1e-10, `X(${q}) re`);
    assertClose(li[q], si, 1e-10, `X(${q}) im`);
  }
  assert.equal(app.context.smoothSize(139), 140);
  assert.equal(app.context.smoothSize(501), 504);
});

// A cell with A at 0 and at (0, 1/4, 0) and B at (1/2, 0, 0): the A-B vectors
// include (1/2, 0, 0), the A-A ones (0, 1/4, 0). The intensity holds one
// cosine for each, so each pair's filter must give back its own term.
function crystal(app){
  const ax = Array.from({length:40}, (_, i) => -2 + 0.1 * i);
  const values = new Float64Array(40 ** 3);
  let p = 0;
  for(const h of ax) for(const k of ax) for(let l=0;l<40;l++) values[p++] = Math.cos(Math.PI * h) + Math.cos(0.5 * Math.PI * k);
  const res = app.context.makeVolumeResult("pairs.h5", [40, 40, 40], ax, ax, ax, values, "test", "hkl", null, 0, {cellDeg:[4, 4, 4, 90, 90, 90]});
  const st = {cell:[4, 4, 4, 90, 90, 90], atoms:[
    {element:"A", frac:[0, 0, 0], occupancy:1}, {element:"A", frac:[0, 0.25, 0], occupancy:1}, {element:"B", frac:[0.5, 0, 0], occupancy:1}]};
  return {res, st, ax};
}

test("the element filter keeps the scattering of the chosen pairs' vectors", async () => {
  const app = loadApp();
  const {res, st, ax} = crystal(app);
  app.state.res = res;
  const vectors = pair => app.context.interatomicVectors(st).filter(v => v.pair === pair).map(v => v.d);
  const ab = await app.context.elementFilter(res, vectors("A–B"), {cellDeg:st.cell, radius:0.3});
  assert.equal(ab.how, "fft");
  const aa = await app.context.elementFilter(res, vectors("A–A"), {cellDeg:st.cell, radius:0.3});
  for(const [i, j, k] of [[0, 0, 0], [7, 13, 21], [25, 3, 39], [39, 39, 0]]){
    const v = (i * 40 + j) * 40 + k;
    assertClose(ab.K[v], Math.cos(Math.PI * ax[i]), 1e-9, `A–B at ${i},${j},${k}`);
    assertClose(aa.K[v], Math.cos(0.5 * Math.PI * ax[j]), 1e-9, `A–A at ${i},${j},${k}`);
  }
});

test("a real-space map is masked about the chosen vectors", async () => {
  const app = loadApp();
  const ax = Array.from({length:20}, (_, i) => -1 + 0.1 * i);
  const res = app.context.makeVolumeResult("map.h5", [20, 20, 20], ax, ax, ax, new Float64Array(8000).fill(1), "test", "uvw", null, 0,
    {dataKind:{code:"delta_pdf", label:"3D-ΔPDF", source:"test"}, cellDeg:[4, 4, 4, 90, 90, 90]});
  app.state.res = res;
  const st = {cell:[4, 4, 4, 90, 90, 90], atoms:[{element:"A", frac:[0, 0, 0], occupancy:1}, {element:"B", frac:[0.5, 0, 0], occupancy:1}]};
  const vectors = app.context.interatomicVectors(st).filter(v => v.pair === "A–B").map(v => v.d);
  const out = await app.context.elementFilter(res, vectors, {cellDeg:st.cell, radius:0.2});
  assert.equal(out.how, "real");
  // u = ±1/2 with v and w on -1 or 0: eight grid points, nothing between.
  assert.equal(out.K.reduce((s, x) => s + x, 0), 8);
});

test("the origin stays out unless kept", async () => {
  const app = loadApp();
  const ax = Array.from({length:20}, (_, i) => -1 + 0.1 * i);
  const res = app.context.makeVolumeResult("map.h5", [20, 20, 20], ax, ax, ax, new Float64Array(8000).fill(1), "test", "uvw", null, 0,
    {dataKind:{code:"delta_pdf", label:"3D-ΔPDF", source:"test"}, cellDeg:[4, 4, 4, 90, 90, 90]});
  app.state.res = res;
  const self = [[0, 0, 0]];
  const out = await app.context.elementFilter(res, self, {cellDeg:[4, 4, 4, 90, 90, 90], radius:0.2});
  const kept = await app.context.elementFilter(res, self, {cellDeg:[4, 4, 4, 90, 90, 90], radius:0.2, keepOrigin:true});
  const at0 = (10 * 20 + 10) * 20 + 10;
  assert.equal(out.K[at0], 0, "r = 0 left out");
  assert.equal(kept.K[at0], 1, "r = 0 kept");
  assert.equal(out.K.reduce((s, x) => s + x, 0), 7, "the lattice points -1 and 0 on each axis, less the origin");
});
