"use strict";
// Opt-in checks against real data files on the developer's machine:
//   REAL_DATA=1 npm test
// Each test is skipped when its file is not present.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {loadApp, valueAt} = require("./harness");
const {assertClose} = require("./fixtures");

const enabled = process.env.REAL_DATA === "1";

function realFile(p){
  if(!enabled || !fs.existsSync(p)) return null;
  return new File([fs.readFileSync(p)], path.basename(p), {lastModified:0});
}

function realTest(name, p, fn){
  const exists = enabled && fs.existsSync(p);
  test(name, {skip:exists ? false : enabled ? `missing ${p}` : "set REAL_DATA=1"}, () => fn(realFile(p)));
}

const CUAU = "D:/Projects/3DS_Plotter/Diffuse_developer_shared/Example_toy_models/ASChallenge/Challenge_AS1_CuAu/diffuse_intensity.nx5";

realTest("CuAu challenge .nx5 loads as C-order [H,K,L]", CUAU, async file => {
  const app = loadApp();
  const res = await app.parseFile(file);
  assert.deepEqual(Array.from(res.shape), [100, 100, 100]);
  assert.equal(res.axisOrderAmbiguous, false);
  assertClose(res.h[0], -5, 1e-12, "first h");
  assertClose(res.h[1], -4.9, 1e-12, "second h");
  // Reference values read with h5py as data[h][k][l].
  const expected = [
    [[0, 0, 1], 2438001166.7429175], [[1, 0, 0], 2303610596.100039],
    [[99, 50, 3], 12641491172.61598], [[3, 50, 99], 11423608760.526615],
    [[10, 20, 30], 13271624204.293167]
  ];
  for(const [[i, j, k], v] of expected) assertClose(valueAt(res, i, j, k), v, 1e-3, `value at ${i},${j},${k}`);
});
