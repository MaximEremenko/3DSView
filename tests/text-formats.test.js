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
