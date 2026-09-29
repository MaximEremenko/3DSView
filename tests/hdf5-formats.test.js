"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {loadApp, h5File} = require("./harness");
const {cOrderValues, assertValues, assertClose} = require("./fixtures");

// Writes an /entry/data file with the shared helper that 3DSView and
// 3DSCalculator use for their unified HDF5 exports.
async function unifiedExportFile(app, name, spec){
  const h5 = await app.ensureH5wasm();
  const bytes = app.context.UnifiedH5.writeData(h5, spec);
  return new File([bytes], name, {lastModified:0});
}

test("unified /entry/data export round-trips a non-cubic grid", async () => {
  const app = loadApp();
  const shape = [3, 4, 5];
  const file = await unifiedExportFile(app, "roundtrip_unified.h5", {
    dims:shape, corner:[-1, -1, 0], vectors:[[0.5, 0, 0], [0, 0.5, 0], [0, 0, 0.25]],
    values:cOrderValues(shape), cell:[4, 4, 4, 90, 90, 90], axesType:"hkl"
  });
  const res = await app.parseFile(file);
  assertValues(res, shape);
  assert.equal(res.coordKind, "hkl");
  assert.deepEqual(Array.from(res.h), [-1, -0.5, 0]);
  assert.deepEqual(Array.from(res.l), [0, 0.25, 0.5, 0.75, 1]);
  assertClose(res.cellDeg[0], 4);
});

test("Yell 1.0 /data is read in C order", async () => {
  const app = loadApp();
  const shape = [4, 3, 2];
  const file = await h5File(app, "model_yell.h5", f => {
    f.create_dataset({name:"format", data:"Yell 1.0"});
    f.create_dataset({name:"data", data:cOrderValues(shape), shape, dtype:"<d"});
    f.create_dataset({name:"lower_limits", data:[-1, -1, -0.5], shape:[3], dtype:"<d"});
    f.create_dataset({name:"step_sizes", data:[0.5, 1, 1], shape:[3], dtype:"<d"});
    f.create_dataset({name:"unit_cell", data:[5, 5, 7, 90, 90, 120], shape:[6], dtype:"<d"});
    f.create_dataset({name:"is_direct", data:[0], shape:[1], dtype:"<i"});
  });
  const res = await app.parseFile(file);
  assertValues(res, shape);
  assert.equal(res.coordKind, "hkl");
  assert.deepEqual(Array.from(res.h), [-1, -0.5, 0, 0.5]);
  assertClose(res.cellDeg[5], 120, 1e-9, "gamma");
});
