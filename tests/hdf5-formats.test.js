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
async function mantidFile(app, name, {shape, longNames=["[H,0,0]", "[0,K,0]", "[0,0,L]"], cell=[4, 4, 6, 90, 90, 90], mask=null, edgeRange=null}){
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
      // Mantid computes edges as lo + i*step in float32; edgeRange=[lo, hi] mimics that.
      const f = Math.fround;
      const edges = edgeRange
        ? Float32Array.from({length:n + 1}, (_, i) => f(edgeRange[0] + f(i * f((edgeRange[1] - edgeRange[0]) / n))))
        : Array.from({length:n + 1}, (_, i) => -1 + 0.5 * i - 0.25);
      const ds = data.create_dataset({name:`D${axis}`, data:edges, shape:[n + 1], dtype:edgeRange ? "<f" : "<d"});
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

test("Mantid UB without cell parameters gives Bq = 2 pi UB^T; HKL grids drop the sample rotation", async () => {
  const app = loadApp();
  const shape = [3, 2, 2];
  // UB = U B with U a 30 degree rotation about z and B = diag(1/4, 1/4, 1/6).
  const c = Math.cos(Math.PI / 6), s = Math.sin(Math.PI / 6);
  const UB = [[c / 4, -s / 4, 0], [s / 4, c / 4, 0], [0, 0, 1 / 6]];
  const file = await h5File(app, "ub_only.nxs", f => {
    const ws = f.create_group("MDHistoWorkspace");
    const data = ws.create_group("data");
    const signal = data.create_dataset({name:"signal", data:cOrderValues([2, 2, 3]), shape:[2, 2, 3], dtype:"<d"});
    signal.create_attribute("axes", "D2:D1:D0");
    shape.forEach((n, axis) => {
      const ds = data.create_dataset({name:`D${axis}`, data:Array.from({length:n + 1}, (_, i) => i - 0.5), shape:[n + 1], dtype:"<d"});
      ds.create_attribute("long_name", ["[H,0,0]", "[0,K,0]", "[0,0,L]"][axis]);
      ds.create_attribute("units", "r.l.u.");
    });
    const lattice = ws.create_group("experiment0").create_group("sample").create_group("oriented_lattice");
    lattice.create_dataset({name:"UB", data:UB.flat(), shape:[3, 3], dtype:"<d"});
  });
  const t = 2 * Math.PI;
  // The conversion itself keeps the rotation.
  const raw = app.context.ubToBq(UB);
  const q0 = app.hklToQ(1, 0, 0, raw);
  [t * c / 4, t * s / 4, 0].forEach((v, i) => assertClose(q0[i], v, 1e-12, `raw Q(1,0,0) component ${i}`));
  // An HKL grid shows Q in the crystal frame: a* along x, |Q| unchanged.
  const res = await app.parseFile(file);
  const q = app.hklToQ(1, 0, 0, res.Bq);
  [t / 4, 0, 0].forEach((v, i) => assertClose(q[i], v, 1e-12, `Q(1,0,0) component ${i}`));
  assertClose(Math.hypot(...app.hklToQ(1, 2, 1, res.Bq)), Math.hypot(...app.hklToQ(1, 2, 1, raw)), 1e-12, "|Q(1,2,1)|");
  const q001 = app.hklToQ(0, 0, 1, res.Bq);
  assertClose(Math.hypot(...q001), t / 6, 1e-12, "|Q(0,0,1)|");
  [4, 4, 6, 90, 90, 90].forEach((v, i) => assertClose(res.cellDeg[i], v, 1e-9, `cell ${i}`));
  assert.match(res.geometryNote, /rotation of 30 deg dropped/);
});

test("unified export saves the shown region with a shifted corner", async () => {
  const app = loadApp();
  const shape = [6, 5, 4];
  const source = await unifiedExportFile(app, "full_unified.h5", {
    dims:shape, corner:[-1, -1, 0], vectors:DIAGONAL,
    values:cOrderValues(shape), cell:[4, 4, 6, 90, 90, 90], axesType:"hkl"
  });
  const res = await app.parseFile(source);
  const ranges = [[1, 4], [2, 3], [0, 2]];
  const spec = app.unifiedExportSpec(res, ranges);
  assert.deepEqual(Array.from(spec.dims), [4, 2, 3]);
  const h5 = await app.ensureH5wasm();
  const bytes = app.context.UnifiedH5.writeData(h5, spec);
  const back = await app.parseFile(new File([bytes], "cropped_unified.h5", {lastModified:0}));
  assertValues(back, [4, 2, 3], (i, j, k) => code(i + 1, j + 2, k));
  assert.deepEqual(Array.from(back.h), [-0.5, 0, 0.5, 1]);
  assert.deepEqual(Array.from(back.k), [0, 0.5]);
  assert.equal(spec.creationMethod, "3DSView unified data export");
});

test("unified export keeps the source experiment type and derives a missing cell", async () => {
  const app = loadApp();
  const shape = [3, 3, 3];
  const res = await app.parseFile(await unifiedExportFile(app, "measured_unified.h5", {
    dims:shape, corner:[0, 0, 0], vectors:DIAGONAL, values:cOrderValues(shape),
    cell:[4, 4, 6, 90, 90, 90], axesType:"hkl", experiment:"experimental"
  }));
  assert.equal(app.unifiedExportSpec(res).experiment, "experimental");
  const mantid = await app.parseFile(await mantidFile(app, "mdhisto.nxs", {shape:[3, 2, 2]}));
  assert.equal(app.unifiedExportSpec(mantid).experiment, "experimental");
  // A basis without cell parameters (e.g. a calculator JSON) still yields the real cell.
  delete mantid.cellDeg;
  const cell = app.unifiedExportSpec(mantid).cell;
  [4, 4, 6, 90, 90, 90].forEach((v, i) => assertClose(cell[i], v, 1e-9, `cell ${i}`));
});

test("unified structure types_names separated by ';' are read", async () => {
  const app = loadApp();
  const file = await h5File(app, "structure.h5", f => {
    const d = f.create_group("entry").create_group("data");
    d.create_dataset({name:"number_of_atoms", data:[4], shape:[1], dtype:"<i"});
    d.create_dataset({name:"unit_cell_lengths", data:[5, 5, 5], shape:[3], dtype:"<d"});
    d.create_dataset({name:"unit_cell_angles", data:[90, 90, 90], shape:[3], dtype:"<d"});
    d.create_dataset({name:"unit_cells", data:[1, 1, 1], shape:[3], dtype:"<i"});
    d.create_dataset({name:"atom_position", data:new Float64Array(12), shape:[4, 3], dtype:"<d"});
    d.create_dataset({name:"atom_type", data:[1, 2, 3, 4], shape:[4], dtype:"<i"});
    d.create_dataset({name:"types_names", data:"O;H;N;H"});
  });
  const h5 = await app.ensureH5wasm();
  const structure = app.context.UnifiedH5.readStructure(h5, new Uint8Array(await file.arrayBuffer()), file.name);
  assert.deepEqual(Array.from(structure.elements), ["O", "H", "N", "H"]);
});

test("float32 Mantid bin edges still give regular axes for export", async () => {
  const app = loadApp();
  const res = await app.parseFile(await mantidFile(app, "float32_edges.nxs", {shape:[501, 3, 41], edgeRange:[-8, 8]}));
  assert.ok(res.axes.h.uniform, "H axis counts as regular");
  const spec = app.unifiedExportSpec(res);
  assertClose(spec.vectors[0][0], 16 / 501, 1e-6, "H step");
});

test("files that cannot be opened as HDF5 fail with a clear message", async () => {
  const app = loadApp();
  await assert.rejects(app.parseFile(new File(["null"], "broken.h5", {lastModified:0})), /could not be opened as an HDF5 file/);
});

test("shown-volume limits read back from 9-decimal fields keep the end points", async () => {
  const app = loadApp();
  // Bin centres of the PMN Mantid L axis: the end points have more than 9 decimals.
  const axis = Float64Array.from({length:41}, (_, i) => -1.9512194991111755 + i * (1.9512193202972412 + 1.9512194991111755) / 40);
  const shown = [axis[0], axis[40]].map(v => Number(v.toFixed(9)));
  assert.deepEqual(Array.from(app.context.gridRangeForLimits(axis, shown[0], shown[1])), [0, 40]);
});

test("parent cell from an .rmc6f header is the supercell over its dimensions", async () => {
  const app = loadApp();
  const header = [
    "(Version 6f format configuration file)",
    "Number of atoms:                     320000",
    "Supercell dimensions:                40  40  20",
    "Cell (Ang/deg):   162.085480  162.085480  121.4   90.000000   90.000000   120.000000",
    "Lattice vectors (Ang):",
    "  162.085480 0 0", "  0 162.085480 0", "  0 0 121.4",
    "Atoms:"
  ].join("\n");
  const got = await app.context.structureFileCell(new File([header], "PMN_300k.rmc6f"));
  [4.052137, 4.052137, 6.07, 90, 90, 120].forEach((v, i) => assertClose(got.cell[i], v, 1e-9, `cell ${i}`));
  assert.deepEqual(Array.from(got.supercell), [40, 40, 20]);
  // Without a Cell line the lattice vectors are used.
  const vectorsOnly = header.replace(/^Cell .*$/m, "");
  const again = await app.context.structureFileCell(new File([vectorsOnly], "vectors.rmc6f"));
  [4.052137, 4.052137, 6.07, 90, 90, 90].forEach((v, i) => assertClose(again.cell[i], v, 1e-6, `cell from vectors ${i}`));
});

test("parent cell from a unified structure file is used directly", async () => {
  const app = loadApp();
  const file = await h5File(app, "structure.h5", f => {
    const d = f.create_group("entry").create_group("data");
    d.create_dataset({name:"number_of_atoms", data:[2], shape:[1], dtype:"<i"});
    d.create_dataset({name:"unit_cell_lengths", data:[5.64, 5.64, 5.64], shape:[3], dtype:"<d"});
    d.create_dataset({name:"unit_cell_angles", data:[90, 90, 90], shape:[3], dtype:"<d"});
    d.create_dataset({name:"unit_cells", data:[2, 2, 2], shape:[3], dtype:"<i"});
    d.create_dataset({name:"atom_position", data:new Float64Array(6), shape:[2, 3], dtype:"<d"});
    d.create_dataset({name:"atom_type", data:[1, 2], shape:[2], dtype:"<i"});
    d.create_dataset({name:"types_names", data:"Na;Cl"});
  });
  const got = await app.context.structureFileCell(file);
  [5.64, 5.64, 5.64, 90, 90, 90].forEach((v, i) => assertClose(got.cell[i], v, 1e-12, `cell ${i}`));
  assert.deepEqual(Array.from(got.supercell), [2, 2, 2]);
});

test("the W_MATRIX log gives the projection axes exactly", async () => {
  const app = loadApp();
  const shape = [3, 2, 2], third = 1 / 3;
  // W_MATRIX is row-major with the projection axes as its columns.
  const W = [[third, third, 0], [third, -third, 0], [0, 0, 1]];
  const file = await h5File(app, "projected.nxs", f => {
    const ws = f.create_group("MDHistoWorkspace");
    const data = ws.create_group("data");
    const signal = data.create_dataset({name:"signal", data:cOrderValues([2, 2, 3]), shape:[2, 2, 3], dtype:"<d"});
    signal.create_attribute("axes", "D2:D1:D0");
    shape.forEach((n, axis) => {
      const ds = data.create_dataset({name:`D${axis}`, data:Array.from({length:n + 1}, (_, i) => i - 0.5), shape:[n + 1], dtype:"<d"});
      ds.create_attribute("long_name", ["[0.333H,0.333H,0]", "[0.333K,-0.333K,0]", "[0,0,L]"][axis]);
      ds.create_attribute("units", "r.l.u.");
    });
    ws.create_group("experiment0").create_group("logs").create_group("W_MATRIX").create_dataset({name:"value", data:W.flat(), shape:[9], dtype:"<d"});
  });
  const res = await app.parseFile(file);
  assert.deepEqual(Array.from(res.projectionW, row => Array.from(row)), [[third, third, 0], [third, -third, 0], [0, 0, 1]]);
  assert.deepEqual(Array.from(res.hklAxisLabels), ["[0.333H,0.333H,0]", "[0.333K,-0.333K,0]", "[0,0,L]"]);
});

// A unified export with /entry/process added the way 3DSConvert writes it:
// program, date and a recipe NXnote with a readable step list.
async function processedUnifiedFile(app, name, spec, description){
  const h5 = await app.ensureH5wasm();
  const tmp = `/tmp_processed_${Date.now()}_${Math.random().toString(36).slice(2)}.h5`;
  h5.FS.writeFile(tmp, app.context.UnifiedH5.writeData(h5, spec));
  const f = new h5.File(tmp, "a");
  try{
    const p = f.get("entry").create_group("process");
    p.create_attribute("NX_class", "NXprocess");
    p.create_dataset({name:"program", data:"3DSConvert"});
    p.create_dataset({name:"date", data:"2026-09-29T06:15:29.070Z"});
    const note = p.create_group("recipe");
    note.create_attribute("NX_class", "NXnote");
    note.create_dataset({name:"type", data:"application/json"});
    note.create_dataset({name:"description", data:description});
    note.create_dataset({name:"data", data:JSON.stringify({version:1, steps:[{op:"symmetrize", laue:"m-3m"}, {op:"deltaPdf"}]})});
    f.flush();
  }finally{
    f.close();
  }
  const bytes = h5.FS.readFile(tmp);
  h5.FS.unlink(tmp);
  return new File([bytes], name, {lastModified:0});
}

test("processing recorded in /entry/process is read with the data", async () => {
  const app = loadApp();
  const shape = [3, 4, 5];
  const spec = {dims:shape, corner:[-1, -1, 0], vectors:DIAGONAL, values:cOrderValues(shape), cell:[4, 4, 4, 90, 90, 90], axesType:"hkl"};
  const steps = ["1. symmetrize with Laue group m-3m (average)", "2. 3D-ΔPDF by FFT on the CPU (float64)"];
  const res = await app.parseFile(await processedUnifiedFile(app, "processed_unified.h5", spec, steps.join("\n")));
  assertValues(res, shape);
  assert.equal(res.process.program, "3DSConvert");
  assert.equal(res.process.date.slice(0, 10), "2026-09-29");
  assert.deepEqual(Array.from(res.process.steps), steps);
  const plain = await app.parseFile(await unifiedExportFile(app, "plain_unified.h5", spec));
  assert.equal(plain.process, undefined, "files without /entry/process have none");
});

// A 4-D Mantid workspace, dimensions D0..D3 stored [D3][D2][D1][D0]; the
// voxel value is code() of the indices along the dimensions longer than one.
async function mantid4d(app, name, lengths, longNames=["[H,0,0]", "DeltaE", "[0,K,0]", "[0,0,L]"]){
  return h5File(app, name, f => {
    const data = f.create_group("MDHistoWorkspace").create_group("data");
    const [L0, L1, L2, L3] = lengths, disk = new Float64Array(L0 * L1 * L2 * L3);
    const kept = [0, 1, 2, 3].filter(d => lengths[d] > 1);
    for(let i3=0;i3<L3;i3++) for(let i2=0;i2<L2;i2++) for(let i1=0;i1<L1;i1++) for(let i0=0;i0<L0;i0++){
      const at = [i0, i1, i2, i3], idx = kept.map(d => at[d]);
      disk[((i3 * L2 + i2) * L1 + i1) * L0 + i0] = code(idx[0] || 0, idx[1] || 0, idx[2] || 0);
    }
    const signal = data.create_dataset({name:"signal", data:disk, shape:[L3, L2, L1, L0], dtype:"<d"});
    signal.create_attribute("axes", "D3:D2:D1:D0");
    lengths.forEach((n, d) => {
      const ds = data.create_dataset({name:`D${d}`, data:Array.from({length:n + 1}, (_, i) => -1 + 0.5 * i - 0.25), shape:[n + 1], dtype:"<d"});
      ds.create_attribute("long_name", longNames[d]);
      ds.create_attribute("units", longNames[d] === "DeltaE" ? "meV" : "r.l.u.");
      ds.create_attribute("frame", longNames[d] === "DeltaE" ? "General Frame" : "HKL");
    });
    const lattice = f.get("MDHistoWorkspace").create_group("experiment0").create_group("sample").create_group("oriented_lattice");
    ["a", "b", "c", "alpha", "beta", "gamma"].forEach((key, i) => lattice.create_dataset({name:`unit_cell_${key}`, data:[[4, 4, 6, 90, 90, 90][i]], shape:[1], dtype:"<d"}));
  });
}

test("a 4-D Mantid workspace with one integrated dimension reads as 3-D", async () => {
  const app = loadApp();
  const last = await app.parseFile(await mantid4d(app, "integrated_last.nxs", [5, 3, 4, 1], ["[H,0,0]", "[0,K,0]", "[0,0,L]", "DeltaE"]));
  assertValues(last, [5, 3, 4]);
  assert.match(last.readerNote, /single-bin D3 was dropped/);
  const middle = await app.parseFile(await mantid4d(app, "integrated_middle.nxs", [5, 1, 3, 4]));
  assertValues(middle, [5, 3, 4]);
  assert.deepEqual(Array.from(app.nativeAxisLabels(middle)), ["H", "K", "L"], "D0, D2 and D3 are H, K and L");
  assert.deepEqual(Array.from(middle.l), [-1, -0.5, 0, 0.5], "L comes from the D3 edges");
  await assert.rejects(async () => app.parseFile(await mantid4d(app, "two_extra.nxs", [5, 2, 3, 4])), /4 dimensions, 4 of them/);
});
