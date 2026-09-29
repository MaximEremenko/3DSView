"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {loadApp, h5File} = require("./harness");
const {cOrderValues, fortranOrderValues, assertValues, assertClose} = require("./fixtures");

function assertStep(app, res, axis, expected){
  const unit = [0, 0, 0];
  unit[axis] = 1;
  const p0 = app.pointAtIndex(res, 0, 0, 0), p1 = app.pointAtIndex(res, unit[0], unit[1], unit[2]);
  for(let c=0;c<3;c++) assertClose(p1[c] - p0[c], expected[c], 1e-12, `axis ${axis} step component ${c}`);
}

// /scattering/data as written by the DiffuseDevelopers Python writer
// (C order [H,K,L], step_vectors[comp][axis]) or by 3DSConvert/Fortran
// writers ([L,K,H], H fastest, step_vectors[axis][comp]).
async function scatteringFile(app, name, {shape, order, vectors, attrs={}, dictionary=null, axisDatasets=true, entry=false}){
  const [nh, nk, nl] = shape;
  const corner = [-1, -1, 0];
  return h5File(app, name, f => {
    if(dictionary) f.create_attribute("audit_conform_dict_name", dictionary);
    const g = f.create_group("scattering").create_group("data");
    g.create_attribute("NX_class", "NXdata");
    g.create_attribute("signal", "data");
    g.create_attribute("axes", ["h", "k", "l"], [3], "S1");
    g.create_attribute("space", "reciprocal");
    for(const [key, value] of Object.entries(attrs)) g.create_attribute(key, value, [], "<i");
    const c = order === "c";
    g.create_dataset({name:"data", data:c ? cOrderValues(shape) : fortranOrderValues(shape), shape:c ? [nh, nk, nl] : [nl, nk, nh], dtype:"<d"});
    g.create_dataset({name:"lower_limits", data:corner, shape:[3], dtype:"<d"});
    const sv = new Float64Array(9);
    for(let axis=0;axis<3;axis++) for(let comp=0;comp<3;comp++) sv[c ? comp * 3 + axis : axis * 3 + comp] = vectors[axis][comp];
    g.create_dataset({name:"step_vectors", data:sv, shape:[3, 3], dtype:"<d"});
    if(axisDatasets){
      ["h", "k", "l"].forEach((axisName, axis) => {
        const n = shape[axis];
        g.create_dataset({name:axisName, data:Array.from({length:n}, (_, i) => corner[axis] + i * vectors[axis][axis]), shape:[n], dtype:"<d"});
      });
    }
    g.create_dataset({name:"unit_cell_lengths", data:[4, 4, 4], shape:[3], dtype:"<d"});
    g.create_dataset({name:"unit_cell_angles", data:[90, 90, 90], shape:[3], dtype:"<d"});
    if(entry){
      // 3DSConvert also writes the /entry/data layout: C order [nh,nk,nl].
      const e = f.create_group("entry").create_group("data");
      const iv = new Float64Array(9);
      for(let axis=0;axis<3;axis++) for(let comp=0;comp<3;comp++) iv[comp * 3 + axis] = vectors[axis][comp];
      e.create_dataset({name:"data_values", data:cOrderValues(shape), shape, dtype:"<d"});
      e.create_dataset({name:"data_dimension", data:Int32Array.from(shape), shape:[3], dtype:"<i"});
      e.create_dataset({name:"data_corner", data:corner, shape:[3], dtype:"<d"});
      e.create_dataset({name:"data_increment_vector", data:iv, shape:[3, 3], dtype:"<d"});
    }
  });
}

const DIAGONAL = [[0.5, 0, 0], [0, 0.5, 0], [0, 0, 0.25]];
const SKEWED = [[0.5, 0.5, 0], [0, 0.5, 0], [0, 0, 0.25]];

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

test("unified /entry/data keeps H and L apart when their sizes match", async () => {
  const app = loadApp();
  const shape = [4, 3, 4];
  const file = await unifiedExportFile(app, "equal_hl_unified.h5", {
    dims:shape, corner:[-1, -1, 0], vectors:DIAGONAL,
    values:cOrderValues(shape), cell:[4, 4, 4, 90, 90, 90], axesType:"hkl"
  });
  assertValues(await app.parseFile(file), shape);
});

test("unified /entry/data increment vectors keep their axis orientation", async () => {
  const app = loadApp();
  const shape = [3, 4, 5];
  const file = await unifiedExportFile(app, "skewed_unified.h5", {
    dims:shape, corner:[-1, -1, 0], vectors:SKEWED,
    values:cOrderValues(shape), cell:[4, 4, 4, 90, 90, 90], axesType:"hkl"
  });
  const res = await app.parseFile(file);
  assertValues(res, shape);
  for(let axis=0;axis<3;axis++) assertStep(app, res, axis, SKEWED[axis]);
});

test("/scattering/data with NeXus h_indices is read as [H,K,L]", async () => {
  const app = loadApp();
  const shape = [4, 3, 4];
  const file = await scatteringFile(app, "spec_layout.nx5.h5", {
    shape, order:"c", vectors:DIAGONAL, attrs:{h_indices:0, k_indices:1, l_indices:2}
  });
  const res = await app.parseFile(file);
  assertValues(res, shape);
  assert.equal(res.axisOrderAmbiguous, false);
});

test("/scattering/data from the Python writer is recognised by its axis lengths", async () => {
  const app = loadApp();
  const shape = [3, 4, 5];
  const file = await scatteringFile(app, "python_writer.h5", {
    shape, order:"c", vectors:SKEWED, attrs:{indices_abs:0, indices_ord:1, indices_top:2}, dictionary:"Disorder scattering"
  });
  const res = await app.parseFile(file);
  assertValues(res, shape);
  for(let axis=0;axis<3;axis++) assertStep(app, res, axis, SKEWED[axis]);
});

test("/scattering/data from 3DSConvert ([L,K,H]) keeps its layout and step vectors", async () => {
  const app = loadApp();
  const shape = [3, 4, 5];
  const file = await scatteringFile(app, "converter_layout.h5", {
    shape, order:"fortran", vectors:SKEWED, attrs:{indices_abs:0, indices_ord:1, indices_top:2}, dictionary:"Disorder unified data"
  });
  const res = await app.parseFile(file);
  assertValues(res, shape);
  for(let axis=0;axis<3;axis++) assertStep(app, res, axis, SKEWED[axis]);
});

test("ambiguous cubic /scattering/data defaults to [L,K,H] and can be transposed", async () => {
  const app = loadApp();
  const shape = [4, 3, 4];
  const file = await scatteringFile(app, "ambiguous.h5", {shape, order:"c", vectors:DIAGONAL, dictionary:"Disorder scattering"});
  const res = await app.parseFile(file);
  assert.equal(res.axisOrderAmbiguous, true);
  // Read with the 3DSConvert/Fortran assumption, a C-order file comes out transposed.
  assert.equal(res.I[(0 * 3 + 0) * 4 + 1], cOrderValues(shape)[(1 * 3 + 0) * 4 + 0]);
  app.transposeFirstAndLastAxes(res);
  assertValues(res, shape);
});

test("cubic 3DSConvert file with both layouts is read from /entry/data", async () => {
  const app = loadApp();
  const shape = [4, 3, 4];
  const file = await scatteringFile(app, "converter_both.h5", {
    shape, order:"fortran", vectors:DIAGONAL, attrs:{indices_abs:0, indices_ord:1, indices_top:2},
    dictionary:"Disorder unified data", entry:true
  });
  const res = await app.parseFile(file);
  assertValues(res, shape);
  assert.ok(!res.axisOrderAmbiguous);
  assert.match(res.format, /RMCProfile\/DiffuseCode unified HDF5/);
});
