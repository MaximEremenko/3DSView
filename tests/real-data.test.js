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

const PMN_NXS = "E:/Projects/PMN_PT_diffuse_scripts/PMN_x0p0_300K_cc_m-3m.nxs";

realTest("PMN Mantid MDHisto loads in H,K,L order with bin-centre axes", PMN_NXS, async file => {
  const app = loadApp();
  const res = await app.parseFile(file);
  assert.deepEqual(Array.from(res.shape), [501, 501, 41]);
  assert.deepEqual(Array.from(app.nativeAxisLabels(res)), ["H", "K", "L"]);
  assertClose(res.h[0], -7.984031915664673, 1e-9, "first H centre");
  assertClose(res.l[0], -1.9512194991111755, 1e-9, "first L centre");
  assertClose(res.cellDeg[0], 4.048077537537062, 1e-9, "a");
  // Reference values read with h5py as signal[l][k][h].
  const expected = [
    [[100, 250, 20], 0.04558469758943384], [[420, 300, 5], 0.040506363357832816],
    [[250, 100, 30], 0.11756924952297079], [[250, 200, 20], 0.052338511320624816],
    [[160, 260, 35], 0.02334252235854931]
  ];
  for(const [[i, j, k], v] of expected) assertClose(valueAt(res, i, j, k), v, 1e-12, `value at ${i},${j},${k}`);
});

const PMN_HALVES = "D:/Projects/3DS_Plotter/pmn_300k_x-ray_152x152x76(halves)_norm-back.dat";

realTest("PMN (halves) block grid is padded onto its regular lattice", PMN_HALVES, async file => {
  // 135 MB, so this goes through the streamed ordered parser.
  const app = loadApp();
  const res = await app.parseFile(file);
  assert.deepEqual(Array.from(res.gapPadding.from), [152, 152, 76]);
  assert.deepEqual(Array.from(res.shape), [300, 300, 139]);
  assert.ok(res.axes.h.uniform && res.axes.k.uniform && res.axes.l.uniform);
  const closest = (axis, x) => {
    let best = 0;
    for(let i=1;i<axis.length;i++) if(Math.abs(axis[i] - x) < Math.abs(axis[best] - x)) best = i;
    return best;
  };
  const nearest = (axis, x) => {
    const best = closest(axis, x);
    assertClose(axis[best], x, 1e-5, "lattice point");
    return best;
  };
  // Rows "i j k Qx Qy Qz I" copied from the file.
  const rows = [
    [-4.10905, -5.8147, 0.42641, 339.2082], [-4.03152, 0.46518, 1.12417, 418.1282],
    [-0.81406, -0.85282, 3.72141, 473.5607]
  ];
  for(const [x, y, z, v] of rows){
    assertClose(valueAt(res, nearest(res.h, x), nearest(res.k, y), nearest(res.l, z)), v, 1e-3, `value at Q=(${x},${y},${z})`);
  }
  // Between the first two H blocks there is no data.
  assert.ok(Number.isNaN(valueAt(res, closest(res.h, -4.8), 10, 10)));
});

const PMN_RMC6F = "E:/Projects/3DSCalculator/Examples/PMN_300k.rmc6f";

realTest("PMN .rmc6f gives the parent cell (supercell / 40)", PMN_RMC6F, async file => {
  const app = loadApp();
  const {cell, supercell} = await app.context.structureFileCell(file);
  assert.deepEqual(Array.from(supercell), [40, 40, 40]);
  [4.052137, 4.052137, 4.052137, 90, 90, 90].forEach((v, i) => assertClose(cell[i], v, 1e-6, `cell ${i}`));
});
