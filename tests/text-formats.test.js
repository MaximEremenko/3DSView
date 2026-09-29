"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {loadApp, textFile, valueAt} = require("./harness");
const {code, indexedText, assertValues, assertClose} = require("./fixtures");

test("4-column h k l intensity text keeps axis order and values", async () => {
  const app = loadApp();
  const shape = [3, 4, 2];
  const lines = ["# h k l intensity"];
  for(let i=0;i<3;i++) for(let j=0;j<4;j++) for(let k=0;k<2;k++) lines.push(`${-1 + i * 0.5} ${j * 0.25} ${k} ${code(i, j, k)}`);
  const res = await app.parseFile(textFile("calc.dat", lines.join("\n")));
  assertValues(res, shape);
  assert.equal(res.coordKind, "hkl");
  assert.deepEqual(Array.from(res.h), [-1, -0.5, 0]);
  assert.deepEqual(Array.from(res.k), [0, 0.25, 0.5, 0.75]);
});

for(const streamed of [false, true]){
  test(`indexed RMCProfile text (${streamed ? "streamed" : "in memory"}) maps i j k to H K L`, async () => {
    const app = loadApp(streamed ? {streamThreshold:0} : {});
    const shape = [4, 3, 5];
    const q = 2 * Math.PI / 4;
    const text = indexedText(shape, (i, j, k) => [(i - 2) * 0.1 * q, (j - 1) * 0.1 * q, (k - 2) * 0.1 * q]);
    const res = await app.parseFile(textFile("sample_d3d.dat", text));
    assertValues(res, shape);
    assert.equal(res.coordKind, "q");
    assert.ok(Math.abs(res.h[1] - res.h[0] - 0.1 * q) < 1e-6);
  });
}

test("VTK structured points are read x fastest", async () => {
  const app = loadApp();
  const shape = [3, 2, 4];
  const vals = [];
  for(let k=0;k<4;k++) for(let j=0;j<2;j++) for(let i=0;i<3;i++) vals.push(code(i, j, k));
  const text = [
    "# vtk DataFile Version 3.0", "test", "ASCII", "DATASET STRUCTURED_POINTS",
    "DIMENSIONS 3 2 4", "ORIGIN -1 -0.5 0", "SPACING 0.5 1 0.25",
    `POINT_DATA ${vals.length}`, "SCALARS intensity float 1", "LOOKUP_TABLE default",
    vals.join(" ")
  ].join("\n");
  const res = await app.parseFile(textFile("scatty.vtk", text));
  assertValues(res, shape);
  assert.deepEqual(Array.from(res.l), [0, 0.25, 0.5, 0.75]);
});

test("JSON volume uses shape and axis arrays", async () => {
  const app = loadApp();
  const shape = [2, 3, 2];
  const intensity = [];
  for(let i=0;i<2;i++) for(let j=0;j<3;j++) for(let k=0;k<2;k++) intensity.push(code(i, j, k));
  const payload = {shape, intensity, hAxis:[0, 1], kAxis:[0, 0.5, 1], lAxis:[-1, 1]};
  const res = await app.parseFile(textFile("volume.json", JSON.stringify(payload)));
  assertValues(res, shape);
  assert.deepEqual(Array.from(res.k), [0, 0.5, 1]);
});

const cubicQ = (i, j, k) => [(i - 2) * 0.25, (j - 1) * 0.25, (k - 2) * 0.25];
const reIm = (i, j, k) => [3 * code(i, j, k) / 5, 4 * code(i, j, k) / 5];   // |A| = code

for(const streamed of [false, true]){
  const mode = streamed ? "streamed" : "in memory";
  const load = (name, text) => loadApp(streamed ? {streamThreshold:0} : {}).parseFile(textFile(name, text));

  test(`intensity files with two sections are not mistaken for amplitudes (${mode})`, async () => {
    const shape = [4, 3, 5];
    // "sample" contains "amp"; 10 columns are nsec=2 intensity rows.
    const res = await load("sample_300K.dat", indexedText(shape, cubicQ, code, {sections:2}));
    assertValues(res, shape);
    assert.doesNotMatch(res.format, /amplitude/);
  });

  test(`Re Im amplitude files are read as |A| by column count (${mode})`, async () => {
    const shape = [4, 3, 5];
    const res = await load("PMN_aver_interf_calc.dat", indexedText(shape, cubicQ, code, {header:false, amplitude:reIm}));
    assertValues(res, shape, (i, j, k) => Math.hypot(...reIm(i, j, k)));
    assert.match(res.format, /amplitude/);
  });

  test(`two-section amplitude files use the header section count (${mode})`, async () => {
    const shape = [4, 3, 5];
    const res = await load("model_total.dat", indexedText(shape, cubicQ, code, {sections:2, amplitude:reIm}));
    assertValues(res, shape, (i, j, k) => Math.hypot(...reIm(i, j, k)));
  });
}

// "h k l I sigma" rows (Scatty *_list.txt, Spinteract *_xtal_data), h fastest.
function hklSigmaList(shape, {twins=1}={}){
  const lines = [];
  for(let k=0;k<shape[2];k++) for(let j=0;j<shape[1];j++) for(let i=0;i<shape[0];i++){
    const hkl = [-1.5 + 0.25 * i, -1 + 0.5 * j, 0.1 * k];
    const triplets = [];
    for(let t=0;t<twins;t++) triplets.push(...(t ? [hkl[1], hkl[0], -hkl[2]] : hkl));
    lines.push(`${triplets.join(" ")} ${code(i, j, k)} ${0.1 * code(i, j, k)}`);
  }
  return lines.join("\n") + "\n";
}

for(const streamed of [false, true]){
  const mode = streamed ? "streamed" : "in memory";
  const load = (name, text) => loadApp(streamed ? {streamThreshold:0} : {}).parseFile(textFile(name, text));

  test(`h k l I sigma lists load as HKL volumes, not matrices (${mode})`, async () => {
    const shape = [6, 5, 4];
    const res = await load("MnO_xtal_data_01.txt", hklSigmaList(shape));
    assertValues(res, shape);
    assert.equal(res.coordKind, "hkl");
    assert.deepEqual(Array.from(res.h).slice(0, 3), [-1.5, -1.25, -1]);
  });

  test(`twinned h k l lists take I before sigma (${mode})`, async () => {
    const shape = [6, 5, 4];
    const res = await load("twins_xtal_data_01.txt", hklSigmaList(shape, {twins:2}));
    assertValues(res, shape);
  });
}

test("a plain 5-column numeric matrix still loads as a 2-D map", async () => {
  const app = loadApp();
  const rows = [];
  for(let r=0;r<12;r++) rows.push(Array.from({length:5}, (_, c) => (Math.sin(r * 7.1 + c * 3.3) * 100).toFixed(4)).join(" "));
  const res = await app.parseFile(textFile("image.txt", rows.join("\n")));
  assert.deepEqual(Array.from(res.shape), [12, 5, 1]);
  assert.match(res.format, /matrix/);
});

for(const streamed of [false, true]){
  const mode = streamed ? "streamed" : "in memory";
  test(`block grids with gaps are placed on their full lattice (${mode})`, async () => {
    const app = loadApp(streamed ? {streamThreshold:0} : {});
    // H: two blocks of 4 points (0..3 and 7..10 lattice steps), like the PMN
    // "(halves)" files; K and L are regular.
    const hPos = [0, 1, 2, 3, 7, 8, 9, 10];
    const step = 0.0387646;
    const shape = [hPos.length, 3, 2];
    const text = indexedText(shape, (i, j, k) => [-0.2 + hPos[i] * step, (j - 1) * step, k * step]);
    const res = await app.parseFile(textFile("pmn_x-ray_(halves)_norm-back.dat", text));
    assert.deepEqual(Array.from(res.shape), [11, 3, 2]);
    assert.ok(res.axes.h.uniform, "H axis is regular after padding");
    assertClose(res.h[1] - res.h[0], step, 1e-9, "H step");
    for(let i=0;i<hPos.length;i++) for(let j=0;j<3;j++) for(let k=0;k<2;k++){
      assert.equal(valueAt(res, hPos[i], j, k), code(i, j, k), `value at block point ${i}`);
    }
    for(const gap of [4, 5, 6]) assert.ok(Number.isNaN(valueAt(res, gap, 1, 1)), `gap ${gap} is empty`);
    assert.deepEqual(Array.from(res.gapPadding.from), [8, 3, 2]);
  });
}

// Hexagonal cell (a = 4, c = 6) in the RMCProfile Cartesian frame with a
// along x: Q = h a* + k b* + l c*, which is not axis-aligned.
const TWO_PI = 2 * Math.PI;
const A_STAR = [TWO_PI / 4, TWO_PI / 4 / Math.sqrt(3), 0];
const B_STAR = [0, 2 * TWO_PI / 4 / Math.sqrt(3), 0];
const C_STAR = [0, 0, TWO_PI / 6];
const hexHkl = (i, j, k) => [-1 + 0.25 * i, -1 + 0.25 * j, 0.5 * k];
const hexQ = (i, j, k) => {
  const [h, kk, l] = hexHkl(i, j, k);
  return [0, 1, 2].map(c => h * A_STAR[c] + kk * B_STAR[c] + l * C_STAR[c]);
};

for(const streamed of [false, true]){
  const mode = streamed ? "streamed" : "in memory";
  test(`skewed Q grids from non-orthogonal cells get affine grid vectors (${mode})`, async () => {
    const app = loadApp(streamed ? {streamThreshold:0} : {});
    const shape = [9, 7, 5];
    const res = await app.parseFile(textFile("hexagonal_d3d.dat", indexedText(shape, hexQ)));
    assertValues(res, shape);
    assert.ok(res.gridVectors, "grid vectors were fitted");
    for(const [i, j, k] of [[0, 0, 0], [8, 0, 0], [0, 6, 0], [3, 5, 4], [8, 6, 4]]){
      const p = app.pointAtIndex(res, i, j, k), q = hexQ(i, j, k);
      for(let c=0;c<3;c++) assertClose(p[c], q[c], 2e-6, `Q component ${c} at ${i},${j},${k}`);
    }
  });
}

test("axis-aligned indexed grids keep separable axes", async () => {
  const app = loadApp();
  const shape = [4, 3, 5];
  const res = await app.parseFile(textFile("cubic_d3d.dat", indexedText(shape, (i, j, k) => [i * 0.1, j * 0.1, k * 0.1])));
  assert.equal(res.gridVectors, undefined);
});

test("Q grids convert to HKL with the RMCProfile frame (a along x)", async () => {
  const app = loadApp();
  const shape = [9, 7, 5];
  const res = await app.parseFile(textFile("hexagonal_d3d.dat", indexedText(shape, hexQ)));
  app.convertQGridToHkl(res, [4, 4, 6, 90, 90, 120]);
  app.finalizeResult(res);
  assert.equal(res.coordKind, "hkl");
  for(const [i, j, k] of [[0, 0, 0], [8, 0, 0], [0, 6, 0], [3, 5, 4], [8, 6, 4]]){
    const hkl = app.pointAtIndex(res, i, j, k), expected = hexHkl(i, j, k);
    for(let c=0;c<3;c++) assertClose(hkl[c], expected[c], 1e-6, `hkl component ${c} at ${i},${j},${k}`);
    // Q shown through Bq reproduces the Cartesian Q stored in the file.
    const q = app.hklToQ(hkl[0], hkl[1], hkl[2], res.Bq), fileQ = hexQ(i, j, k);
    for(let c=0;c<3;c++) assertClose(q[c], fileQ[c], 1e-6, `Q component ${c} at ${i},${j},${k}`);
  }
  assertValues(res, shape);
});

test("orthogonal Q grids convert to separable HKL axes", async () => {
  const app = loadApp();
  const shape = [5, 4, 3];
  const dq = 0.05;
  const res = await app.parseFile(textFile("tetragonal_d3d.dat", indexedText(shape, (i, j, k) => [(i - 2) * dq, (j - 2) * dq, k * dq])));
  app.convertQGridToHkl(res, [4, 4, 6, 90, 90, 90]);
  app.finalizeResult(res);
  assert.equal(res.gridVectors, undefined);
  assertClose(res.h[1] - res.h[0], dq * 4 / (2 * Math.PI), 1e-9, "H step");
  assertClose(res.l[1] - res.l[0], dq * 6 / (2 * Math.PI), 1e-9, "L step");
});

test("Fortran numbers that lose the E of a three-digit exponent keep their row intact", () => {
  const app = loadApp();
  const t = app.context.tokenNumber;
  assert.equal(t("0.1234-101"), 0.1234e-101);
  assert.equal(t("-0.5+100"), -0.5e100);
  assert.equal(t("0.25D+01"), 2.5);
  assert.ok(Number.isNaN(t("abc")));
  assert.deepEqual(Array.from(app.context.parseNumbers("1 2 3 0.5E+01 0.1234-101")), [1, 2, 3, 5, 0.1234e-101]);
  // The parallel parser's worker carries its own copy.
  const worker = new Function("self", `${app.context.indexedWorkerSource()}\nreturn tokenNumber;`)({});
  assert.equal(worker("0.1234-101"), 0.1234e-101);
  assert.equal(worker("0.1234E-01"), 0.01234);
});
