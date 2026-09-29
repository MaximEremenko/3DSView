"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {loadApp, textFile, h5File, valueAt} = require("./harness");
const {code, assertValues, assertClose} = require("./fixtures");

// "h k l I sigma" list with sigma = 0.1 * I.
function sigmaList(shape, value=code){
  const lines = [];
  for(let k=0;k<shape[2];k++) for(let j=0;j<shape[1];j++) for(let i=0;i<shape[0];i++){
    lines.push(`${-1.5 + 0.25 * i} ${-1 + 0.5 * j} ${0.1 * k} ${value(i, j, k)} ${0.1 * value(i, j, k)}`);
  }
  return lines.join("\n") + "\n";
}

for(const streamed of [false, true]){
  test(`sigma columns of h k l I sigma lists are kept (${streamed ? "streamed" : "in memory"})`, async () => {
    const app = loadApp(streamed ? {streamThreshold:0} : {});
    const shape = [6, 5, 4];
    const res = await app.parseFile(textFile("xtal_data_01.txt", sigmaList(shape)));
    assertValues(res, shape);
    assert.ok(res.sigma, "sigma volume present");
    assertClose(res.sigma[(2 * 5 + 3) * 4 + 1], 0.1 * code(2, 3, 1), 1e-12, "sigma value");
  });
}

test("Mantid errors_squared becomes sigma, in the same axis order as the signal", async () => {
  const app = loadApp();
  const [n0, n1, n2] = [4, 3, 2];
  const file = await h5File(app, "errors.nxs", f => {
    const data = f.create_group("MDHistoWorkspace").create_group("data");
    const signal = new Float64Array(n0 * n1 * n2), err2 = new Float64Array(n0 * n1 * n2);
    let p = 0;
    for(let k=0;k<n2;k++) for(let j=0;j<n1;j++) for(let i=0;i<n0;i++){ signal[p] = code(i, j, k); err2[p] = (0.5 * code(i, j, k)) ** 2; p++; }
    const ds = data.create_dataset({name:"signal", data:signal, shape:[n2, n1, n0], dtype:"<d"});
    ds.create_attribute("axes", "D2:D1:D0");
    data.create_dataset({name:"errors_squared", data:err2, shape:[n2, n1, n0], dtype:"<d"});
    [n0, n1, n2].forEach((n, axis) => {
      const d = data.create_dataset({name:`D${axis}`, data:Array.from({length:n + 1}, (_, i) => i - 0.5), shape:[n + 1], dtype:"<d"});
      d.create_attribute("long_name", ["[H,0,0]", "[0,K,0]", "[0,0,L]"][axis]);
    });
  });
  const res = await app.parseFile(file);
  assertValues(res, [n0, n1, n2]);
  for(const [i, j, k] of [[0, 0, 0], [3, 2, 1], [1, 2, 0]]) assertClose(res.sigma[(i * n1 + j) * n2 + k], 0.5 * code(i, j, k), 1e-12, `sigma at ${i},${j},${k}`);
});

test("sigma survives the H/L swap and the load cache", async () => {
  const app = loadApp();
  const shape = [4, 3, 4];
  const res = await app.parseFile(textFile("xtal_data_02.txt", sigmaList(shape)));
  app.transposeFirstAndLastAxes(res);
  assertClose(res.sigma[(0 * 3 + 0) * 4 + 1], 0.1 * res.I[(0 * 3 + 0) * 4 + 1], 1e-12, "sigma follows the swapped value");
  const base = app.context.cacheBaseFromResult(res);
  const restored = app.context.restoreCachedResult({base});
  assertClose(restored.sigma[5], res.sigma[5], 0, "cached sigma");
});

test("the sigma and I/sigma views derive from the data", async () => {
  const app = loadApp();
  const shape = [6, 5, 4];
  const res = await app.parseFile(textFile("xtal_data_03.txt", sigmaList(shape)));
  app.state.res = res;
  const snr = app.context.buildView("snr");
  assert.equal(snr.valueName, "I/σ");
  for(let n=0;n<snr.I.length;n++) assertClose(snr.I[n], 10, 1e-9, `I/sigma at ${n}`);
  const sigma = app.context.buildView("sigma");
  assertClose(valueAt(sigma, 2, 3, 1), 0.1 * code(2, 3, 1), 1e-12, "sigma view");
  assert.equal(app.context.buildView("data"), null);
});
