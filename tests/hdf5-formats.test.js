"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {loadApp, h5File} = require("./harness");
const {code, cOrderValues, fortranOrderValues, assertValues, assertClose} = require("./fixtures");

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

test("HDF5 files are recognised by signature, whatever their extension", async () => {
  const app = loadApp();
  const shape = [3, 4, 5];
  for(const name of ["challenge.nx5", "discus_output"]){
    const file = await scatteringFile(app, name, {shape, order:"c", vectors:DIAGONAL, attrs:{h_indices:0, k_indices:1, l_indices:2}});
    assertValues(await app.parseFile(file), shape);
  }
});

// Mantid SaveMD layout: signal stored [D2][D1][D0] with axes "D2:D1:D0",
// D0-D2 holding bin edges with long_name such as "[H,0,0]".
async function mantidFile(app, name, {shape, longNames=["[H,0,0]", "[0,K,0]", "[0,0,L]"], cell=[4, 4, 6, 90, 90, 90], mask=null}){
  const [n0, n1, n2] = shape;
  return h5File(app, name, f => {
    const ws = f.create_group("MDHistoWorkspace");
    const data = ws.create_group("data");
    const disk = new Float64Array(n0 * n1 * n2);
    let p = 0;
    for(let k=0;k<n2;k++) for(let j=0;j<n1;j++) for(let i=0;i<n0;i++) disk[p++] = code(i, j, k);
    const signal = data.create_dataset({name:"signal", data:disk, shape:[n2, n1, n0], dtype:"<d"});
    signal.create_attribute("axes", "D2:D1:D0");
    signal.create_attribute("signal", 1, [], "<i");
    shape.forEach((n, axis) => {
      const edges = Array.from({length:n + 1}, (_, i) => -1 + 0.5 * i - 0.25);
      const ds = data.create_dataset({name:`D${axis}`, data:edges, shape:[n + 1], dtype:"<d"});
      ds.create_attribute("long_name", longNames[axis]);
      ds.create_attribute("units", "r.l.u.");
      ds.create_attribute("frame", "HKL");
    });
    if(mask){
      const m = new Int32Array(n0 * n1 * n2);
      for(const [i, j, k] of mask) m[(k * n1 + j) * n0 + i] = 1;
      data.create_dataset({name:"mask", data:m, shape:[n2, n1, n0], dtype:"<i"});
    }
    const lattice = ws.create_group("experiment0").create_group("sample").create_group("oriented_lattice");
    ["a", "b", "c", "alpha", "beta", "gamma"].forEach((key, i) => {
      lattice.create_dataset({name:`unit_cell_${key}`, data:[cell[i]], shape:[1], dtype:"<d"});
    });
  });
}

test("Mantid MDHisto [D2][D1][D0] signal is put back in H,K,L order", async () => {
  const app = loadApp();
  const shape = [5, 3, 4];
  const res = await app.parseFile(await mantidFile(app, "mdhisto.nxs", {shape}));
  assertValues(res, shape);
  assert.deepEqual(Array.from(app.nativeAxisLabels(res)), ["H", "K", "L"]);
  assert.deepEqual(Array.from(res.h), [-1, -0.5, 0, 0.5, 1]);
  // The L axis maps onto c* of the tetragonal cell (|c*| = 2 pi / 6).
  const q = app.hklToQ(0, 0, 1, res.Bq);
  assertClose(Math.hypot(q[0], q[1], q[2]), 2 * Math.PI / 6, 1e-12, "|Q(0,0,1)|");
});

test("Mantid projection axes keep their names and Q geometry", async () => {
  const app = loadApp();
  const shape = [3, 3, 2];
  const res = await app.parseFile(await mantidFile(app, "projection.nxs", {
    shape, longNames:["[H,H,0]", "[-K,K,0]", "[0,0,L]"], cell:[4, 4, 4, 90, 90, 90]
  }));
  assertValues(res, shape);
  assert.deepEqual(Array.from(app.nativeAxisLabels(res)), ["[H,H,0]", "[-K,K,0]", "[0,0,L]"]);
  const q = app.hklToQ(1, 0, 0, res.Bq);
  const s = 2 * Math.PI / 4;
  [s, s, 0].forEach((v, c) => assertClose(Math.abs(q[c]), Math.abs(v), 1e-12, `Q component ${c}`));
  assertClose(Math.hypot(q[0], q[1], q[2]), s * Math.SQRT2, 1e-12, "|Q| of one [H,H,0] step");
});

test("Mantid mask hides masked voxels", async () => {
  const app = loadApp();
  const shape = [3, 2, 2];
  const res = await app.parseFile(await mantidFile(app, "masked.nxs", {shape, mask:[[2, 1, 0]]}));
  assert.ok(Number.isNaN(res.I[(2 * 2 + 1) * 2 + 0]), "masked voxel is NaN");
  assert.equal(res.maskedVoxels, 1);
  assert.equal(res.I[(1 * 2 + 1) * 2 + 0], code(1, 1, 0));
});
