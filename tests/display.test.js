"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {loadApp} = require("./harness");

test("reversed colormaps mirror their stops", () => {
  const app = loadApp();
  app.setControl("colorMap", {value:"rdbu"});
  app.setControl("colorReverse", {checked:false});
  const forward = app.context.activeColorStops();
  app.setControl("colorReverse", {checked:true});
  const reversed = app.context.activeColorStops();
  assert.equal(reversed.length, forward.length);
  assert.deepEqual(Array.from(reversed[0][1]), Array.from(forward[forward.length - 1][1]));
  assert.equal(reversed[0][0], 0);
  for(let i=1;i<reversed.length;i++) assert.ok(reversed[i][0] > reversed[i - 1][0], "stops stay ascending");
});

test("histogram quantiles clip outliers such as Bragg peaks", () => {
  const app = loadApp();
  const values = new Float64Array(10000);
  for(let i=0;i<values.length;i++) values[i] = (i % 100) / 100;   // diffuse 0..0.99
  values[5] = 500; values[6] = 800;                                // two Bragg peaks
  const hist = app.context.valueHistogram(values, 0, 800);
  const hi = app.context.histogramQuantile(hist, 0.995);
  assert.ok(hi < 2, `99.5th percentile ignores the peaks (got ${hi})`);
  assert.equal(app.context.histogramQuantile(hist, 1), 800);
});

test("auto levels use the percentile range and can be symmetric about 0", () => {
  const app = loadApp();
  app.setControl("levelMode", {value:"slice"});
  app.setControl("levelClip", {value:"p99"});
  app.setControl("levelSymmetric", {checked:false});
  const values = new Float64Array(20001);
  for(let i=0;i<values.length;i++) values[i] = -2 + 5 * i / 20000;  // -2 .. 3
  values[0] = -100;                                                 // outlier
  const stats = {values, min:-100, max:3, hist:app.context.valueHistogram(values, -100, 3)};
  const plain = app.context.displayLevels(stats, "linear");
  assert.equal(plain.rawMin, -100, "colour bar keeps the full range");
  assert.ok(plain.min > -2.1 && plain.max < 3, `window ${plain.min}..${plain.max} is clipped`);
  app.setControl("levelSymmetric", {checked:true});
  const sym = app.context.displayLevels(stats, "linear");
  assert.ok(Math.abs(sym.min + sym.max) < 1e-12, "symmetric window");
  assert.ok(sym.max >= Math.abs(plain.min) && sym.max >= plain.max);
});
