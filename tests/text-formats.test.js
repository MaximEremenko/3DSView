"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {loadApp, textFile} = require("./harness");
const {code, indexedText, assertValues} = require("./fixtures");

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
